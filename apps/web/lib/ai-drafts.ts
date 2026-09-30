// The four kinds of help Claude gives a hub team: programme copy, lesson text (and its Hausa
// translation), quiz questions and grading feedback. Each builds a schema, instructions and a prompt,
// and a fixed "fake" draft for the test suite. Callers check the person's role first; nothing here
// saves anything.
//
// Schemas carry no length limits (structured outputs ignore most of them); lengths are enforced when
// the draft is trimmed here and again when the person saves.
import 'server-only';
import { z } from 'zod';
import { questionsFromPositions, type QuizQuestionInput } from '@talentral/domain';
import { draft, type DraftResult } from './ai';

const tag = (name: string, text: string | null | undefined) => `<${name}>\n${(text ?? '').trim() || '(none)'}\n</${name}>`;

const LESSON_FORMAT = `Format with this small Markdown subset only: a blank line between paragraphs, "# " or "## " headings, "- " bullet lists, "1. " numbered steps, **bold**, *italic*, \`code\` and [link text](https://...). No tables, images or HTML.`;

interface Who { tenantId: string; userId: string }

// ------------------------------------------------------------------------------------ programme

const ProgrammeDraft = z.object({
  summary: z.string().describe('One or two sentences, at most 300 characters, for the hub page listing.'),
  description: z.string().describe('The programme page text, in short paragraphs and bullet lists.'),
});
export type ProgrammeDraft = z.infer<typeof ProgrammeDraft>;

export async function draftProgramme(who: Who, p: { hub: string; title: string; eligibility: string | null; tracks: string[]; capacity: number | null; current: string | null; notes: string }): Promise<DraftResult<ProgrammeDraft>> {
  const r = await draft({
    ...who, kind: 'programme', schema: ProgrammeDraft, effort: 'medium',
    instructions: `Write the summary and description for a programme page that young people read before they apply. The description should cover what participants learn or do, who it is for, how it runs (length, schedule, where and how it is delivered) and what they leave with, using only what the notes say. Open with why it matters to the reader. Use short paragraphs, and bullet lists for what participants learn. Keep it under 350 words. Plain text with blank lines between paragraphs and "- " for bullets.`,
    prompt: [
      `Hub: ${p.hub}`, `Programme title: ${p.title}`,
      p.tracks.length ? `Tracks: ${p.tracks.join(', ')}` : '', p.capacity ? `Places: ${p.capacity}` : '',
      tag('eligibility', p.eligibility), tag('current_description', p.current), tag('notes', p.notes),
      'Draft the summary and description.',
    ].filter(Boolean).join('\n\n'),
    fake: () => ({
      summary: `${p.title} gives young people in Katsina practical, job-ready skills with mentors from ${p.hub}.`,
      description: `${p.title} is a hands-on programme run by ${p.hub}.\n\nWhat you will learn:\n- Practical skills you can use at work\n- How to present your work with confidence\n\nSessions run at the hub with mentors on hand.`,
    }),
  });
  return r.ok ? { ok: true, data: { summary: r.data.summary.trim().slice(0, 300), description: r.data.description.trim().slice(0, 8000) } } : r;
}

// ------------------------------------------------------------------------------------ lessons

const LessonDraft = z.object({ body: z.string().describe('The lesson text in the Markdown subset.') });
export type LessonDraft = z.infer<typeof LessonDraft>;

const KIND_BRIEF: Record<string, string> = {
  text: 'a reading lesson of 400 to 800 words: a short opening that says why it matters, the main ideas under headings with a worked example from Nigerian daily life or work, and a short "Try it" task at the end',
  video: 'short notes that go with a video: what to watch for, three to five key points, and one question to think about afterwards',
  audio: 'short notes that go with an audio lesson: what to listen for, three to five key points, and one question to think about afterwards',
  pdf: 'short notes that go with a PDF: what it covers, which parts matter most, and what to do after reading',
  quiz: 'a two or three sentence introduction to a quiz: what it checks, and a word of encouragement',
  assignment: 'clear assignment instructions: the task, what to hand in and in what form, numbered steps, and how the work will be judged',
  live: 'notes for a live class: what it covers, what to prepare, and what to bring',
};

export async function draftLesson(who: Who, l: { course: string; module: string | null; title: string; kind: string; minutes: number | null; current: string | null; notes: string }): Promise<DraftResult<LessonDraft>> {
  const r = await draft({
    ...who, kind: 'lesson', schema: LessonDraft, effort: 'medium',
    instructions: `Write ${KIND_BRIEF[l.kind] ?? KIND_BRIEF.text}. Learners are young adults, often on a phone with patchy data, some reading English as a second language, so keep sentences short and explain any technical word the first time it appears. ${LESSON_FORMAT}`,
    prompt: [
      `Course: ${l.course}`, l.module ? `Module: ${l.module}` : '', `Lesson title: ${l.title}`, l.minutes ? `Time to complete: about ${l.minutes} minutes` : '',
      tag('current_text', l.current), tag('notes', l.notes),
      l.current?.trim() ? 'Improve and complete the current text, keeping what is right in it.' : 'Draft the lesson text.',
    ].filter(Boolean).join('\n\n'),
    fake: () => ({ body: `# ${l.title}\n\nThis lesson shows you why ${l.title.toLowerCase()} matters at work.\n\n## Key ideas\n\n- Start with the customer\n- Keep it simple\n\n## Try it\n\n1. Write down one example from your area.\n2. Share it with your group.` }),
  });
  return r.ok ? { ok: true, data: { body: r.data.body.trim().slice(0, 50_000) } } : r;
}

const Translation = z.object({
  title_ha: z.string().describe('The lesson title in Hausa.'),
  body_ha: z.string().describe('The lesson text in Hausa, keeping the same Markdown structure.'),
});
export type Translation = z.infer<typeof Translation>;

export async function translateLesson(who: Who, l: { title: string; body: string }): Promise<DraftResult<Translation>> {
  const r = await draft({
    ...who, kind: 'translation', schema: Translation, effort: 'high',
    instructions: `Translate lesson text from English into Hausa as it is written and spoken in Katsina and Kano: standard Hausa in Boko (Latin) script with the hooked letters ɓ, ɗ, ƙ and ƴ. Keep the meaning, the tone and the Markdown structure exactly (headings, lists, bold, links; translate link text but never the URLs). Keep widely used English technical terms, product names and code as they are, adding a short Hausa explanation in brackets the first time where it helps. Write amounts as ₦ figures. Do not add or drop content. The translation will be checked by a Hausa speaker before learners see it.`,
    prompt: `${tag('title', l.title)}\n\n${tag('lesson', l.body)}\n\nTranslate the title and the lesson into Hausa.`,
    fake: () => ({ title_ha: `${l.title} (Hausa)`, body_ha: `# Darasi\n\nWannan darasin zai nuna maka yadda ake aiki.\n\n- Fara da abokin ciniki\n- Ka sauƙaƙa abubuwa` }),
  });
  return r.ok ? { ok: true, data: { title_ha: r.data.title_ha.trim().slice(0, 160), body_ha: r.data.body_ha.trim().slice(0, 50_000) } } : r;
}

// ------------------------------------------------------------------------------------ quizzes

const QuizDraft = z.object({
  questions: z.array(z.object({
    kind: z.enum(['single', 'multiple', 'true_false']),
    prompt: z.string().describe('The question.'),
    options: z.array(z.string()).describe('Two to five answers. For true_false give exactly ["True", "False"].'),
    correct: z.array(z.number().int()).describe('Zero-based positions of the right answers in options. Exactly one unless kind is multiple.'),
    explanation: z.string().describe('One or two sentences shown after answering: why the right answer is right.'),
  })),
});

export type DraftQuestion = QuizQuestionInput;

export async function draftQuestions(who: Who, l: { course: string; title: string; intro: string | null; material: string; count: number; notes: string }): Promise<DraftResult<DraftQuestion[]>> {
  const r = await draft({
    ...who, kind: 'quiz', schema: QuizDraft, effort: 'medium',
    instructions: `Write multiple-choice quiz questions that check understanding of the course material, not memory of exact wording. Mix question kinds: mostly "single" (one right answer), some "multiple" (tick every right answer; say so in the question) and at most one "true_false". Give three or four answers for single and multiple questions, with wrong answers that are believable but clearly wrong to someone who understood. Avoid "all of the above", "none of the above" and trick wording. Keep each question under 30 words. Base every question on the material given; if it is thin, use the lesson titles and notes and stay with widely accepted basics.`,
    prompt: [
      `Course: ${l.course}`, `Quiz: ${l.title}`, tag('quiz_introduction', l.intro), tag('material', l.material.slice(0, 40_000)), tag('notes', l.notes),
      `Write ${l.count} questions.`,
    ].join('\n\n'),
    fake: (): z.infer<typeof QuizDraft> => ({
      questions: [
        { kind: 'single' as const, prompt: 'What should you do first when a customer complains?', options: ['Listen carefully', 'Argue your case', 'Ignore it'], correct: [0], explanation: 'Listening first shows respect and helps you find the real problem.' },
        { kind: 'multiple' as const, prompt: 'Which of these help a small business grow? Tick every right answer.', options: ['Keeping records', 'Knowing your customers', 'Guessing prices'], correct: [0, 1], explanation: 'Records and customer knowledge guide good decisions.' },
        { kind: 'true_false' as const, prompt: 'A budget helps you plan how to spend money.', options: ['True', 'False'], correct: [0], explanation: 'A budget is a plan for your money.' },
      ].slice(0, l.count),
    }),
  });
  if (!r.ok) return r;
  const questions = questionsFromPositions(r.data.questions).slice(0, l.count);
  return questions.length ? { ok: true, data: questions } : { ok: false, error: 'Claude’s questions did not pass the quiz checks. Try again, or add notes on what to ask about.' };
}

// ------------------------------------------------------------------------------------ feedback

const FeedbackDraft = z.object({
  feedback: z.string().describe('Overall feedback to the learner, 60 to 150 words.'),
  criteria: z.array(z.object({ id: z.string().describe('The criterion id, exactly as given.'), comment: z.string().describe('One or two sentences on this criterion.') })),
});
export type FeedbackDraft = z.infer<typeof FeedbackDraft>;

// Only the work itself goes to Claude: never the learner's name, email or reference. Claude writes
// comments, not marks; the grader chooses every score.
export async function draftFeedback(who: Who, s: { lesson: string; instructions: string | null; answer: string | null; link: string | null; file: boolean; rubric: { id: string; title: string; description: string | null; levels: { label: string; points: number }[] }[]; notes: string; resubmit: boolean }): Promise<DraftResult<FeedbackDraft>> {
  const rubric = s.rubric.map((c) => `- id ${c.id}: ${c.title}${c.description ? ` (${c.description})` : ''}. Levels: ${c.levels.map((l) => `${l.label} ${l.points}`).join(', ')}`).join('\n');
  const r = await draft({
    ...who, kind: 'feedback', schema: FeedbackDraft, effort: 'medium',
    instructions: `Draft feedback from a hub trainer to a learner on an assignment. Speak to the learner as "you". Be warm, specific and honest: start with something they did well, then the one or two most useful things to improve, each with a concrete next step, and end with encouragement. Refer to what is actually in their work. Do not give or suggest a score or a level; the trainer decides marks. If the trainer's notes are given, they are the trainer's judgement: follow them. ${s.resubmit ? 'The trainer is asking the learner to try again, so say clearly what to change before handing in again.' : ''} ${s.rubric.length ? 'Also write one or two sentences for each rubric criterion, using the criterion ids given.' : 'Return an empty criteria list.'} Write the feedback as plain text without Markdown.`,
    prompt: [
      `Assignment: ${s.lesson}`, tag('instructions', s.instructions), s.rubric.length ? `Rubric:\n${rubric}` : '',
      tag('work', s.answer), s.link ? `The learner also handed in a link (not opened): ${s.link}` : '', s.file ? 'The learner also attached a file, which you cannot see. Do not comment on its contents.' : '',
      tag('trainer_notes', s.notes), 'Draft the feedback.',
    ].filter(Boolean).join('\n\n'),
    fake: () => ({
      feedback: 'You explained your idea clearly and gave a real example from your area, which makes it easy to follow. To make it stronger, add numbers: how many customers, and what it would cost in Naira. Keep going, you are on the right track.',
      criteria: s.rubric.map((c) => ({ id: c.id, comment: `Good start on ${c.title.toLowerCase()}. Add one more example.` })),
    }),
  });
  if (!r.ok) return r;
  const ids = new Set(s.rubric.map((c) => c.id));
  return { ok: true, data: { feedback: r.data.feedback.trim().slice(0, 4000), criteria: r.data.criteria.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, comment: c.comment.trim().slice(0, 600) })) } };
}
