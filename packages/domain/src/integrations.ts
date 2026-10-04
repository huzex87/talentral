// MVP-2 month 11: outbound webhooks for hubs and the AI course tutor. Pure, so the rules are tested.

// ---------------------------------------------------------------- webhooks

export const WEBHOOK_EVENTS = {
  'application.submitted': 'Someone applies to one of your programmes',
  'application.status_changed': 'An application moves to a new status',
  'learner.enrolled': 'A learner joins a cohort',
  'learner.completed': 'A learner completes their cohort',
  'certificate.issued': 'A certificate is issued',
  'certificate.revoked': 'A certificate is revoked',
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
export const isWebhookEvent = (e: string): e is WebhookEvent => e in WEBHOOK_EVENTS;

// Waits before each retry, in minutes: about a day of tries before a delivery is marked failed.
export const WEBHOOK_RETRY_MINUTES = [1, 5, 30, 120, 360, 720] as const;
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_MINUTES.length + 1;

// When to try a delivery again after `attempts` tries, or null to give up.
export function nextWebhookAttempt(attempts: number, now: Date): Date | null {
  const wait = WEBHOOK_RETRY_MINUTES[attempts - 1];
  return wait === undefined ? null : new Date(now.getTime() + wait * 60_000);
}

// Why a URL cannot receive webhooks, or null. Private and local addresses are refused unless
// explicitly allowed (tests); production endpoints must use HTTPS.
export function webhookUrlProblem(raw: string, allowPrivate = false): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'Enter the full address, starting with https://'; }
  if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) return 'Use an https:// address, so events travel encrypted.';
  if (u.username || u.password) return 'Leave out user names and passwords; check the signature instead.';
  if (raw.length > 500) return 'Use an address of 500 characters or fewer.';
  if (!allowPrivate && isPrivateHost(u.hostname)) return 'Use a public address. Talentral cannot send to private or local networks.';
  return null;
}

// Loopback, private, link-local and unique-local addresses, and names that only resolve locally.
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

// ---------------------------------------------------------------- AI tutor

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
  'it', 'its', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'can', 'could', 'should', 'would', 'will', 'i', 'me',
  'my', 'we', 'you', 'your', 'he', 'she', 'they', 'them', 'there', 'here', 'about', 'please', 'explain', 'mean', 'means', 'tell', 'use', 'used', 'using', 'get',
  'not', 'no', 'yes', 'if', 'so', 'than', 'then', 'into', 'out', 'up', 'as', 'also', 'just', 'some', 'any', 'more', 'most', 'make', 'way', 'like', 'between',
  // Hausa
  'da', 'na', 'ta', 'a', 'ya', 'ta', 'su', 'mu', 'ka', 'ki', 'ni', 'shi', 'ita', 'wannan', 'wancan', 'me', 'mene', 'menene', 'yaya', 'ina', 'don', 'domin', 'kuma',
  'amma', 'ko', 'cikin', 'kan', 'ga', 'daga', 'zuwa', 'yake', 'take', 'suke', 'ake', 'nake', 'kake', 'shin', 'wane', 'wace', 'wa', 'za', 'zan', 'zai', 'yi',
]);

// The words in a question worth searching lessons for, most specific first.
export function tutorKeywords(question: string, max = 12): string[] {
  const words = question.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const word = w.replace(/['’-]+$/g, '');
    if (word.length < 2 || STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word); out.push(word);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}

export interface TutorLesson { id: string; title: string; body: string }
export interface TutorPassage { lessonId: string; title: string; text: string }

// The parts of each lesson most relevant to the question: paragraphs ranked by how many keywords
// they contain, in reading order, within a total budget. The first lesson always contributes.
export function tutorPassages(lessons: readonly TutorLesson[], keywords: readonly string[], budget = 12_000): TutorPassage[] {
  const out: TutorPassage[] = [];
  let used = 0;
  const per = Math.max(1200, Math.floor(budget / Math.max(1, lessons.length)));
  for (const [i, l] of lessons.entries()) {
    const paras = l.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const scored = paras.map((p, at) => ({ p, at, hits: keywords.reduce((n, k) => n + (p.toLowerCase().includes(k) ? 1 : 0), 0) }));
    const ranked = [...scored].sort((a, b) => b.hits - a.hits || a.at - b.at);
    const keep: typeof scored = [];
    let len = 0;
    for (const s of ranked) {
      if (s.hits === 0 && keep.length && i > 0) break;
      if (len + s.p.length > per && keep.length) continue;
      keep.push(s); len += Math.min(s.p.length, per);
    }
    const text = keep.sort((a, b) => a.at - b.at).map((s) => s.p).join('\n\n').slice(0, per);
    if (!text || used + text.length > budget) continue;
    out.push({ lessonId: l.id, title: l.title, text });
    used += text.length;
  }
  return out;
}

// The tutor's limits: per hub per month and per learner per day (West Africa Time).
export const TUTOR_LIMITS = { hubMonthly: 3000, learnerDaily: 30, questionMax: 1000 } as const;
