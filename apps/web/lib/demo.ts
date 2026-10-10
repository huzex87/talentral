import 'server-only';
// A demo academy for showing Talentral to partners: "iDICE CoE Katsina (Demo)", with three calls
// for applications, a finished cohort with certificates and job placements, a running cohort with
// a course, classes and grades, and an open call. Everything is invented and clearly labelled.
// Platform staff create it from /platform and delete it in one click when the meeting is over.
//
// Safety: demo learners use addresses at demo.invalid (a reserved domain; lib/mail.ts never sends
// to it) and phone numbers outside the Nigerian mobile ranges (lib/texts.ts never texts them). The
// optional demo learner is the only real address, and that person asked for it.
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { system } from '@talentral/db';
import { DEFAULT_RUBRIC, RECOMMENDED_FIELDS } from '@talentral/domain';
import { DEMO_SLUG, DEMO_EMAIL_DOMAIN } from './demo-ids';

export { DEMO_SLUG, DEMO_EMAIL_DOMAIN };
export const DEMO_NAME = 'iDICE CoE Katsina (Demo)';
const DEMO_NOTE = 'Talentral demo data. Delete from the platform console.';

// Deterministic randomness, so every demo looks the same.
function generator(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    weighted: <T,>(xs: readonly (readonly [T, number])[]) => {
      const total = xs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [x, w] of xs) { r -= w; if (r <= 0) return x; }
      return xs[xs.length - 1]![0];
    },
    normal: (mean: number, sd: number) => {
      const u = Math.max(next(), 1e-9), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

const FEMALE = ['Aisha', 'Fatima', 'Zainab', 'Hauwa', 'Maryam', 'Khadija', 'Amina', 'Hafsat', 'Rukayya', 'Safiya', 'Halima', 'Bilkisu', 'Hadiza', 'Sadiya', 'Nafisa', 'Asma’u', 'Ummi', 'Zulaihat', 'Jamila', 'Fiddausi', 'Salamatu', 'Hajara', 'Maimuna', 'Rahma'];
const MALE = ['Abubakar', 'Ibrahim', 'Musa', 'Yusuf', 'Sani', 'Usman', 'Abdullahi', 'Aliyu', 'Bashir', 'Kabir', 'Nura', 'Shamsuddeen', 'Mubarak', 'Umar', 'Haruna', 'Lawal', 'Sulaiman', 'Yahaya', 'Idris', 'Mustapha', 'Auwal', 'Jamilu', 'Anas', 'Faruk'];
const SURNAMES = ['Bello', 'Abdullahi', 'Musa', 'Sani', 'Lawal', 'Yusuf', 'Usman', 'Ibrahim', 'Aliyu', 'Garba', 'Danjuma', 'Mohammed', 'Bala', 'Shehu', 'Abubakar', 'Umar', 'Isah', 'Tukur', 'Kabir', 'Dikko', 'Dauda', 'Yakubu', 'Hassan', 'Ahmad'];
const STATES = [['Katsina', 72], ['Kano', 10], ['Kaduna', 6], ['Jigawa', 4], ['Zamfara', 3], ['Sokoto', 2], ['Kebbi', 2], ['Kwara', 1]] as const;
const LGAS = ['Katsina', 'Daura', 'Funtua', 'Malumfashi', 'Dutsin-Ma', 'Kankia', 'Bakori', 'Kafur', 'Mani', 'Musawa', 'Batagarawa', 'Rimi', 'Mashi', 'Faskari'];
const TRACKS = [['Software Development', 30], ['Data Analysis', 28], ['Digital Marketing', 24], ['UI/UX Design', 18]] as const;
const EDUCATION = [['Secondary (SSCE)', 22], ['OND / NCE', 30], ['HND / Bachelor\'s degree', 40], ['Postgraduate', 4], ['Other', 4]] as const;
const EMPLOYMENT = [['Unemployed', 55], ['Student', 20], ['Self-employed', 15], ['Employed part-time', 7], ['Employed full-time', 3]] as const;
const MOTIVATION = [
  'I want practical skills that help me find remote work and support my family.',
  'I have taught myself some basics online and I want structured training with mentors.',
  'I want to build a career in tech without leaving Katsina.',
  'I run a small business and want to use digital tools to grow it.',
  'I want to prove my skills to employers with real projects, not only a certificate.',
];
const SKILLS: Record<string, string[]> = {
  'Software Development': ['HTML', 'CSS', 'JavaScript', 'React', 'Git'],
  'Data Analysis': ['Excel', 'SQL', 'Power BI', 'Data cleaning', 'Python'],
  'Digital Marketing': ['Social media', 'Copywriting', 'SEO', 'Meta Ads', 'Canva'],
  'UI/UX Design': ['Figma', 'User research', 'Wireframing', 'Prototyping', 'Design systems'],
};
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SERIAL = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_CHARS = [...CODE];
const SERIAL_CHARS = [...SERIAL];

const day = 86_400_000;
const at = (days: number, hour = 10) => { const d = new Date(Date.now() + days * day); d.setUTCHours(hour - 1, 0, 0, 0); return d; };
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type Row = Record<string, unknown>;

export async function demoExists(): Promise<boolean> {
  const [r] = await system()<{ n: number }[]>`select count(*)::int as n from public.tenants where slug = ${DEMO_SLUG}`;
  return (r?.n ?? 0) > 0;
}

// Builds the demo academy. ownerId becomes its owner so the dashboard opens without a support
// session; learnerEmail (optional) is enrolled in the running cohort so the learner side can be
// shown by signing in with it.
export async function createDemoAcademy(ownerId: string, learnerEmail: string | null): Promise<{ learners: number }> {
  const g = generator(20261008);
  const sql = system();
  const hub = randomUUID();
  const rows: Record<string, Row[]> = { programmes: [], applications: [], cohorts: [], enrolments: [], class_sessions: [], attendance: [], assessments: [], assessment_results: [], certificates: [], users: [], passports: [], employers: [], job_roles: [], role_candidates: [], courses: [], course_modules: [], lessons: [], lesson_progress: [] };
  const usedNames = new Set<string>();
  let seq = 0;

  const person = () => {
    const female = g.next() < 0.47;
    let name = '';
    for (let i = 0; i < 20 && (!name || usedNames.has(name)); i++) name = `${g.pick(female ? FEMALE : MALE)} ${g.pick(SURNAMES)}`;
    usedNames.add(name);
    seq += 1;
    const handle = name.toLowerCase().replace(/[^a-z]+/g, '.');
    return {
      female, name, email: `${handle}.${seq}@${DEMO_EMAIL_DOMAIN}`,
      phone: `0000 ${String(100 + (seq % 900)).padStart(3, '0')} ${String(1000 + seq).slice(-4)}`,
    };
  };
  const answers = (female: boolean) => {
    const state = g.weighted(STATES);
    const born = new Date(Date.UTC(2026 - g.int(18, 34), g.int(0, 11), g.int(1, 28)));
    return {
      gender: female ? 'Female' : g.next() < 0.98 ? 'Male' : 'Prefer not to say',
      date_of_birth: isoDate(born), state_of_residence: state, lga: state === 'Katsina' ? g.pick(LGAS) : `${state} Municipal`,
      education: g.weighted(EDUCATION), employment_status: g.weighted(EMPLOYMENT), disability: g.next() < 0.05 ? 'Yes' : 'No', motivation: g.pick(MOTIVATION),
    };
  };
  const reference = (prefix: string) => `${prefix}-26-${Array.from({ length: 5 }, () => g.pick(CODE_CHARS)).join('')}`;

  // ---------------------------------------------------------------- calls for applications
  const calls = [
    { key: 'c1', slug: 'digital-skills-cohort-1', title: 'iDICE Digital Skills, Cohort 1', prefix: 'IDA', opens: -175, closes: -140, status: 'closed', applicants: 236, accepted: 60 },
    { key: 'c2', slug: 'digital-skills-cohort-2', title: 'iDICE Digital Skills, Cohort 2', prefix: 'IDB', opens: -80, closes: -50, status: 'closed', applicants: 312, accepted: 84 },
    { key: 'c3', slug: 'digital-skills-cohort-3', title: 'iDICE Digital Skills, Cohort 3', prefix: 'IDC', opens: -9, closes: 21, status: 'open', applicants: 118, accepted: 0 },
  ] as const;
  const programme: Record<string, string> = {};
  for (const c of calls) {
    programme[c.key] = randomUUID();
    rows.programmes!.push({
      id: programme[c.key], tenant_id: hub, slug: c.slug, title: c.title, status: c.status, reference_prefix: c.prefix,
      summary: 'Twelve weeks of hands-on digital skills training with mentors, real projects and a route to work.',
      description: 'Learn in-demand digital skills at the iDICE Centre of Excellence. Choose a track, attend practical classes twice a week, study on your phone between classes, build a portfolio of real projects and meet employers before you graduate. Classes run in English and Hausa.',
      eligibility: 'Aged 18 to 35, living in North-West Nigeria, with a smartphone and at least a secondary school certificate.',
      tracks: TRACKS.map(([t]) => t), form: RECOMMENDED_FIELDS, rubric: DEFAULT_RUBRIC,
      opens_at: at(c.opens), closes_at: at(c.closes, 23), capacity: c.key === 'c3' ? 90 : null,
    });
  }

  // ---------------------------------------------------------------- applicants
  type Applicant = { id: string; call: string; name: string; email: string; female: boolean; track: string; status: string; phone: string };
  const applicants: Applicant[] = [];
  for (const c of calls) {
    for (let i = 0; i < c.applicants; i++) {
      const p = person();
      const ans = answers(p.female);
      const track = g.weighted(TRACKS);
      let status: string;
      if (c.key === 'c3') status = g.weighted([['submitted', 70], ['under_review', 30], ['shortlisted', 18]]);
      else if (i < c.accepted) status = 'accepted';
      else status = g.weighted([['rejected', 84], ['declined', 4], ['withdrawn', 4]]);
      const id = randomUUID();
      const submitted = at(c.opens + g.int(0, c.closes - c.opens - 1 > 0 ? Math.min(c.closes, 0) - c.opens : 1), g.int(8, 22));
      applicants.push({ id, call: c.key, name: p.name, email: p.email, female: p.female, track, status, phone: p.phone });
      rows.applications!.push({
        id, tenant_id: hub, programme_id: programme[c.key], reference: reference(c.prefix), email: p.email, full_name: p.name, phone: p.phone,
        track, answers: ans, status, consent_at: submitted, submitted_at: submitted, updated_at: submitted,
      });
    }
  }

  // The demo learner joins the running cohort as one of its accepted applicants.
  if (learnerEmail) {
    const mine = applicants.find((a) => a.call === 'c2' && a.status === 'accepted')!;
    const [u] = await sql<{ full_name: string | null }[]>`select full_name from public.users where email = ${learnerEmail}`;
    mine.email = learnerEmail;
    mine.name = u?.full_name || 'Demo Learner';
    const row = rows.applications!.find((r) => r.id === mine.id)!;
    row.email = learnerEmail; row.full_name = mine.name;
  }

  // ---------------------------------------------------------------- a course for the running cohort
  const course = randomUUID();
  rows.courses!.push({ id: course, tenant_id: hub, programme_id: programme.c2, title: 'Digital Skills Foundations', status: 'published',
    summary: 'The shared foundation every track starts with: digital tools, online safety, problem solving and your first portfolio project.' });
  const modules = [
    ['Getting started with digital work', 'Farawa da aikin dijital', ['Welcome to the programme', 'Using your phone and laptop for work', 'Staying safe online']],
    ['Thinking like a problem solver', 'Tunani kamar mai warware matsala', ['Breaking a problem into steps', 'Working with data you can trust', 'Quiz: problem solving']],
    ['Your track: first skills', 'Hanyarka: gwaninta na farko', ['Tools of your track', 'Practice task: a small real project', 'Hand in: your first project']],
    ['Building your portfolio', 'Gina tarin aikinka', ['What employers look for', 'Writing about your work', 'Publishing your Talentral Passport']],
  ] as const;
  const lessonIds: string[] = [];
  modules.forEach(([title, title_ha, lessons], mi) => {
    const mod = randomUUID();
    rows.course_modules!.push({ id: mod, tenant_id: hub, course_id: course, title, title_ha, position: mi, unlock_after_days: mi * 14 });
    lessons.forEach((lt, li) => {
      const id = randomUUID();
      lessonIds.push(id);
      const kind = lt.startsWith('Quiz') ? 'quiz' : lt.startsWith('Hand in') ? 'assignment' : 'text';
      rows.lessons!.push({ id, tenant_id: hub, course_id: course, module_id: mod, kind, title: lt, position: li, minutes: kind === 'text' ? g.int(8, 20) : 30,
        body: kind === 'text' ? `${lt}.\n\nIn this lesson you learn the ideas behind "${lt.toLowerCase()}" and try them on a short task from a real Katsina business. Read the notes, try the example on your phone, then mark the lesson complete.\n\nKey points:\n- Start small and practise every day.\n- Ask your facilitator or the class discussion when you are stuck.\n- Save your work: it becomes evidence on your Passport.` : 'Complete this task and hand it in before the next class.' });
    });
  });

  // ---------------------------------------------------------------- cohorts, classes, grades
  const cohorts = [
    { key: 'c1', id: randomUUID(), name: 'Cohort 1 · Katsina', start: -126, end: -42, status: 'completed', sessions: 24, upcoming: 0 },
    { key: 'c2', id: randomUUID(), name: 'Cohort 2 · Katsina', start: -38, end: 46, status: 'running', sessions: 11, upcoming: 4 },
  ] as const;
  const FACILITATORS = ['Aminu Dahiru', 'Hadiza Ladan', 'Bashir Kankia', 'Zulai Rabiu'];
  type Learner = { enrolment: string; app: Applicant; propensity: number; status: string };
  const learnersBy: Record<string, Learner[]> = { c1: [], c2: [] };

  for (const co of cohorts) {
    rows.cohorts!.push({ id: co.id, tenant_id: hub, programme_id: programme[co.key], name: co.name, starts_on: isoDate(at(co.start)), ends_on: isoDate(at(co.end)),
      status: co.status, min_attendance: 75, pass_mark: 50, course_id: co.key === 'c2' ? course : null });
    const accepted = applicants.filter((a) => a.call === co.key && a.status === 'accepted');
    accepted.forEach((a, i) => {
      const enrolment = randomUUID();
      const propensity = Math.min(0.99, Math.max(0.35, g.normal(0.87, 0.1)));
      const dropped = i % 17 === 5 || (co.key === 'c1' && i % 23 === 11);
      const status = dropped ? 'dropped' : co.key === 'c1' ? (propensity > 0.6 ? 'completed' : 'active') : 'active';
      learnersBy[co.key]!.push({ enrolment, app: a, propensity, status });
      rows.enrolments!.push({ id: enrolment, tenant_id: hub, cohort_id: co.id, application_id: a.id, status, enrolled_at: at(co.start - 5),
        completed_at: status === 'completed' ? at(co.end + 2) : null, dropped_reason: dropped ? g.pick(['Moved to another state for work', 'Family responsibilities', 'Could not attend classes regularly']) : null });
    });

    const total = co.sessions + co.upcoming;
    for (let s = 0; s < total; s++) {
      const offset = co.start + Math.floor(s / 2) * 7 + (s % 2 ? 3 : 0);
      const id = randomUUID();
      const mode = s % 4 === 3 ? 'online' : 'in_person';
      const week = Math.floor(s / 2) + 1;
      rows.class_sessions!.push({ id, tenant_id: hub, cohort_id: co.id, title: `Week ${week}: ${s % 2 ? 'Practical lab' : 'Core class'}`, starts_at: at(offset, 10), ends_at: at(offset, 12),
        mode, location: mode === 'online' ? null : 'iDICE CoE training hall, Katsina', facilitator: FACILITATORS[s % FACILITATORS.length], checkin_code: Array.from({ length: 6 }, () => g.pick(CODE_CHARS)).join('') });
      if (s >= co.sessions) continue; // upcoming
      learnersBy[co.key]!.forEach((l, i) => {
        if (l.status === 'dropped' && s > 4 + (i % 5)) return;
        const r = g.next();
        const status = r < l.propensity * 0.93 ? 'present' : r < l.propensity ? 'late' : r < 0.985 ? 'absent' : 'excused';
        rows.attendance!.push({ tenant_id: hub, session_id: id, enrolment_id: l.enrolment, status, method: g.next() < 0.7 ? 'self' : 'register', marked_at: at(offset, 11) });
      });
    }

    const assessments = co.key === 'c1'
      ? [['Week 4 practical', 'practical', 1, -98], ['Mid-programme quiz', 'quiz', 1, -84], ['Week 9 practical', 'practical', 1, -63], ['Capstone project', 'project', 3, -45]]
      : [['Week 2 quiz', 'quiz', 1, -24], ['Week 4 practical', 'practical', 1, -10]];
    for (const [title, kind, weight, due] of assessments) {
      const id = randomUUID();
      rows.assessments!.push({ id, tenant_id: hub, cohort_id: co.id, title, kind, max_score: 100, weight, due_on: isoDate(at(due as number)) });
      learnersBy[co.key]!.forEach((l) => {
        if (l.status === 'dropped') return;
        const score = Math.round(Math.min(100, Math.max(28, g.normal(48 + l.propensity * 30, 9))));
        rows.assessment_results!.push({ tenant_id: hub, assessment_id: id, enrolment_id: l.enrolment, score, graded_at: at((due as number) + 3),
          feedback: score >= 80 ? 'Excellent work. Clear, complete and well explained.' : score >= 60 ? 'Good work. Tidy up the details in the next task.' : 'You are close. Review the lesson notes and ask your facilitator for help.' });
      });
    }
  }

  // Lesson progress in the running cohort (modules open every two weeks).
  const openLessons = lessonIds.slice(0, 9);
  learnersBy.c2!.forEach((l) => {
    if (l.status === 'dropped') return;
    const done = Math.round(openLessons.length * Math.min(1, Math.max(0.2, l.propensity + g.normal(0, 0.12))));
    openLessons.slice(0, done).forEach((lesson, i) => rows.lesson_progress!.push({ enrolment_id: l.enrolment, lesson_id: lesson, tenant_id: hub,
      first_seen_at: at(-36 + i * 3), last_seen_at: at(-35 + i * 3), completed_at: at(-35 + i * 3) }));
  });

  // ---------------------------------------------------------------- certificates, Passports, work
  const c1 = cohorts[0];
  const completers = learnersBy.c1!.filter((l) => l.status === 'completed');
  for (const l of completers) {
    const scores = rows.assessment_results!.filter((r) => r.enrolment_id === l.enrolment).map((r) => Number(r.score));
    const score = Math.round((scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)) * 10) / 10;
    const att = rows.attendance!.filter((r) => r.enrolment_id === l.enrolment);
    const rate = Math.round((att.filter((r) => r.status === 'present' || r.status === 'late').length / Math.max(att.filter((r) => r.status !== 'excused').length, 1)) * 1000) / 10;
    rows.certificates!.push({ tenant_id: hub, enrolment_id: l.enrolment, serial: `TAL-IDA-26-${Array.from({ length: 6 }, () => g.pick(SERIAL_CHARS)).join('')}`,
      learner_name: l.app.name, programme_title: calls[0].title, cohort_name: c1.name, hub_name: DEMO_NAME, hub_slug: DEMO_SLUG, track: l.app.track,
      attendance: rate, score, completed_on: isoDate(at(c1.end)), issued_at: at(c1.end + 4) });
  }

  // Graduates publish Passports; employers interview and hire some of them.
  const employers = [
    ['Sahel Data Services (demo)', 'Data and analytics', 'Kano'], ['Gidan Digital Agency (demo)', 'Marketing', 'Katsina'],
    ['Arewa Fintech Labs (demo)', 'Financial services', 'Kaduna'], ['Northbound Remote Studio (demo)', 'Software', 'Remote'],
  ] as const;
  const roles: { id: string; track: string; employer: string }[] = [];
  employers.forEach(([name, sector, state], i) => {
    const id = randomUUID();
    rows.employers!.push({ id, name, sector, state, stage: 'active', status: 'verified', verified_at: at(-60), notes: DEMO_NOTE, contact_name: 'Hiring team', contact_email: `jobs.${i + 1}@${DEMO_EMAIL_DOMAIN}` });
    const track = TRACKS[i]![0];
    const role = randomUUID();
    roles.push({ id: role, track, employer: id });
    rows.job_roles!.push({ id: role, employer_id: id, title: ['Junior data analyst', 'Digital marketing assistant', 'Customer insights analyst', 'Junior frontend developer'][i], status: 'filled', on_board: false,
      skills: SKILLS[track]!.slice(0, 4), work_mode: i === 3 ? 'remote' : 'hybrid', job_type: i === 1 ? 'internship' : 'full_time', state, pay_min: 120000, pay_max: 220000, openings: 3, published_at: at(-40) });
  });
  completers.forEach((l, i) => {
    if (i % 5 === 4) return; // a few have not published yet
    const user = randomUUID();
    const learnerUser = l.app.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`);
    if (!learnerUser) return;
    rows.users!.push({ id: user, email: l.app.email, full_name: l.app.name });
    rows.passports!.push({ user_id: user, headline: `${l.app.track} graduate, iDICE CoE Katsina`, bio: 'Trained at the iDICE Centre of Excellence in Katsina, with a portfolio of real projects.',
      state: 'Katsina', city: 'Katsina', languages: ['English', 'Hausa'], skills: SKILLS[l.app.track]!.slice(0, 4), availability: 'immediately',
      discoverable: true, discoverable_at: at(-30), employer_sharing: true, employer_sharing_at: at(-30), verified_at: i % 3 === 0 ? at(-20) : null });
    const role = roles.find((r) => r.track === l.app.track) ?? roles[i % roles.length]!;
    if (i % 2 === 0 || i % 7 === 3) {
      const stage = i % 4 === 0 ? 'placed' : i % 3 === 0 ? 'offered' : i % 2 === 0 ? 'interviewed' : 'shortlisted';
      rows.role_candidates!.push({ role_id: role.id, user_id: user, interest: 'confirmed', interest_at: at(-34), stage, source: 'officer',
        placement_type: stage === 'placed' ? (i % 8 === 0 ? 'internship' : 'full_time') : null, start_date: stage === 'placed' ? isoDate(at(-g.int(5, 25))) : null,
        placement_confirmed_at: stage === 'placed' ? at(-4) : null, placement_confirmation: stage === 'placed' ? 'employer' : null, pay_band: stage === 'placed' ? '₦120,000 to ₦220,000 a month' : null });
    }
  });

  // ---------------------------------------------------------------- write it all in one transaction
  // One statement per table: the rows travel as JSON and only the columns they carry are set, so
  // the table's defaults fill the rest.
  const insert = async (tx: postgres.TransactionSql, table: string, list: Row[]) => {
    if (!list.length) return;
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    const names = cols.map((c) => `"${c}"`).join(', ');
    for (let i = 0; i < list.length; i += 2000) {
      await tx.unsafe(`insert into public.${table} (${names}) select ${names} from jsonb_populate_recordset(null::public.${table}, $1::text::jsonb)`, [JSON.stringify(list.slice(i, i + 2000))]);
    }
  };
  await sql.begin(async (tx) => {
    await tx`insert into public.tenants (id, slug, name, tagline, description, brand_color, contact_email, state, status, profile_completed_at)
      values (${hub}, ${DEMO_SLUG}, ${DEMO_NAME}, 'Digital skills to jobs for young people in Katsina State',
        'A demo academy showing how an iDICE Centre of Excellence runs its programmes on Talentral: calls for applications, cohorts, classes, grades, certificates and jobs. All people and figures here are invented.',
        '#2E5BFF', ${`programmes@${DEMO_EMAIL_DOMAIN}`}, 'Katsina', 'active', now())`;
    await tx`insert into public.memberships (tenant_id, user_id, role) values (${hub}, ${ownerId}, 'owner') on conflict do nothing`;
    for (const table of ['programmes', 'applications', 'courses', 'course_modules', 'lessons', 'cohorts', 'enrolments', 'class_sessions', 'attendance', 'assessments', 'assessment_results', 'lesson_progress', 'certificates', 'users', 'passports', 'employers', 'job_roles', 'role_candidates']) {
      await insert(tx, table, rows[table]!);
    }
    // The optional demo learner gets a Passport in progress, unless they already have one of their own.
    if (learnerEmail) {
      // Their account may not exist until they first sign in; make it now so the Passport has an owner.
      await tx`insert into public.users (email, full_name)
        select ${learnerEmail}, a.full_name from public.applications a where a.email = ${learnerEmail} and a.tenant_id = ${hub} limit 1
        on conflict (email) do nothing`;
      await tx`insert into public.passports (user_id, headline, bio, state, city, languages, skills, availability)
        select id, 'Junior web developer and data analyst',
          'I build simple, fast websites and turn spreadsheets into clear reports. Training at the iDICE CoE Katsina in digital skills.',
          'Katsina', 'Katsina', array['English', 'Hausa'], array['HTML', 'CSS', 'Data analysis', 'Microsoft Excel'], 'immediately'
        from public.users where email = ${learnerEmail}
        on conflict (user_id) do nothing`;
      // A short learning streak: active on each of the last four days (West Africa Time).
      await tx`insert into public.activity_days (enrolment_id, day)
        select e.id, (now() at time zone 'Africa/Lagos')::date - d
        from public.enrolments e join public.applications a on a.id = e.application_id, generate_series(0, 3) as d
        where a.email = ${learnerEmail} and e.tenant_id = ${hub}
        on conflict do nothing`;
    }
    // A small hub team, so the demo looks like a hub in use (an admin and a reviewer).
    for (const [email, name, role] of [[`programmes.lead@${DEMO_EMAIL_DOMAIN}`, 'Halima Sani', 'admin'], [`reviewer@${DEMO_EMAIL_DOMAIN}`, 'Usman Bello', 'reviewer']] as const) {
      const [u] = await tx<{ id: string }[]>`insert into public.users (email, full_name) values (${email}, ${name})
        on conflict (email) do update set full_name = excluded.full_name returning id`;
      await tx`insert into public.memberships (tenant_id, user_id, role) values (${hub}, ${u!.id}, ${role}) on conflict do nothing`;
    }
    await tx`select app.audit(${hub}, 'hub.demo_created', 'tenant', ${hub}, ${tx.json({ learners: learnersBy.c1!.length + learnersBy.c2!.length })})`;
  });
  return { learners: learnersBy.c1!.length + learnersBy.c2!.length };
}

// Removes the demo academy and everything made for it.
export async function deleteDemoAcademy(): Promise<void> {
  const sql = system();
  await sql.begin(async (tx) => {
    await tx`delete from public.employers where notes = ${DEMO_NOTE}`;
    await tx`delete from public.tenants where slug = ${DEMO_SLUG}`;
    await tx`delete from public.users where email like ${`%@${DEMO_EMAIL_DOMAIN}`}`;
  });
}
