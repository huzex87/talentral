// Courses and lessons: labels, file limits, safe lesson formatting, video links and quiz rules.

export const LESSON_KINDS = {
  text: 'Reading', video: 'Video', audio: 'Audio', pdf: 'PDF', quiz: 'Quiz', assignment: 'Assignment',
} as const;
export type LessonKind = keyof typeof LESSON_KINDS;

export const QUESTION_KINDS = { single: 'One answer', multiple: 'Several answers', true_false: 'True or false' } as const;
export type QuestionKind = keyof typeof QUESTION_KINDS;

const MB = 1024 * 1024;
// What each lesson kind accepts as an uploaded file. Video is kept small enough to stream on 3G;
// longer videos belong on YouTube or Vimeo and are linked instead.
export const LESSON_FILES: Partial<Record<LessonKind, { types: string[]; maxBytes: number; label: string }>> = {
  pdf: { types: ['application/pdf'], maxBytes: 25 * MB, label: 'PDF, up to 25 MB' },
  audio: { types: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg'], maxBytes: 50 * MB, label: 'MP3, M4A or OGG, up to 50 MB' },
  video: { types: ['video/mp4', 'video/webm'], maxBytes: 200 * MB, label: 'MP4 or WebM, up to 200 MB' },
};

export const SUBMISSION_FILES = {
  types: ['application/pdf', 'image/jpeg', 'image/png', 'application/zip', 'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  maxBytes: 50 * MB,
  label: 'PDF, image, Word, PowerPoint, Excel or ZIP, up to 50 MB',
};

// ---------------------------------------------------------------- video links

// Turns a YouTube or Vimeo link into a privacy-friendly embed address; anything else is refused.
export function videoEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const id = (v: string | null | undefined) => (v && /^[\w-]{6,20}$/.test(v) ? v : null);
  if (host === 'youtu.be') { const v = id(url.pathname.slice(1)); return v ? `https://www.youtube-nocookie.com/embed/${v}` : null; }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = id(url.searchParams.get('v')) ?? id(url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]);
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const v = url.pathname.match(/(\d{6,12})/)?.[1];
    return v ? `https://player.vimeo.com/video/${v}?dnt=1` : null;
  }
  return null;
}

// ---------------------------------------------------------------- lesson text

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  // Links: only http(s), opened safely in a new tab.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, href: string) =>
    `<a href="${href.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`);
  return s;
}

// Lesson text written the simple way people write on WhatsApp or in Google Docs: blank lines
// between paragraphs, "# " headings, "- " or "1. " lists, **bold**, *italic*, `code` and
// [links](https://...). Everything is escaped first, so no HTML from the author reaches the page.
export function renderLessonText(src: string | null | undefined): string {
  if (!src?.trim()) return '';
  const out: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  let code: string[] | null = null;
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim().startsWith('```')) {
      if (code) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; } else { flushPara(); flushList(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); const level = heading[1]!.length + 1; out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`); continue; }
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    if (/^>\s?/.test(line)) { flushPara(); flushList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    flushList();
    para.push(line);
  }
  if (code) out.push(`<pre><code>${escapeHtml((code as string[]).join('\n'))}</code></pre>`);
  flushPara(); flushList();
  return out.join('\n');
}

// ---------------------------------------------------------------- quizzes

export interface QuizOption { id: string; text: string; text_ha?: string | null }
export interface QuizQuestionInput { kind: QuestionKind; prompt: string; prompt_ha?: string | null; options: QuizOption[]; correct: string[]; points: number; explanation?: string | null }

export function trueFalseOptions(): QuizOption[] {
  return [{ id: 'true', text: 'True', text_ha: 'Gaskiya' }, { id: 'false', text: 'False', text_ha: 'Ba gaskiya ba' }];
}

export function validateQuestion(q: QuizQuestionInput): string | null {
  if (q.prompt.trim().length < 2) return 'Write the question.';
  const options = q.options.filter((o) => o.text.trim());
  if (options.length < 2) return 'Give at least two answers.';
  if (options.length > 8) return 'Give at most eight answers.';
  const ids = new Set(options.map((o) => o.id));
  if (ids.size !== options.length) return 'Each answer needs its own id.';
  const correct = q.correct.filter((c) => ids.has(c));
  if (!correct.length) return 'Mark the right answer.';
  if (q.kind !== 'multiple' && correct.length !== 1) return 'Mark exactly one right answer.';
  if (!Number.isInteger(q.points) || q.points < 1 || q.points > 20) return 'Points must be a whole number from 1 to 20.';
  return null;
}

// Language fallback: the Hausa text when the learner reads Hausa and it exists, else English.
export function pick(en: string | null | undefined, ha: string | null | undefined, language: 'en' | 'ha'): { text: string; fallback: boolean } {
  if (language === 'ha' && ha?.trim()) return { text: ha, fallback: false };
  return { text: en ?? '', fallback: language === 'ha' };
}

export function formatBytes(b: number | null | undefined): string {
  if (!b) return '';
  return b < MB ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / MB).toFixed(b < 10 * MB ? 1 : 0)} MB`;
}
