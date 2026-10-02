// MVP-2 month 9: hubs' own domains, white-label emails and learning paths. Pure, so the rules are
// tested.

// ---------------------------------------------------------------- custom domains

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// "https://Apply.KirkiraHub.ng/apply" -> "apply.kirkirahub.ng"
export function normaliseDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
}

// Why a domain cannot be used, or null. rootDomain is Talentral's own (talentral.ng).
export function domainProblem(domain: string, rootDomain: string | null): string | null {
  if (!domain) return 'Enter a domain, for example apply.yourhub.ng.';
  if (/^\d+(\.\d+){3}$/.test(domain)) return 'Use a domain name, not an IP address.';
  if (!HOST.test(domain)) return 'Enter a domain such as apply.yourhub.ng, without https:// or a path.';
  if (rootDomain && (domain === rootDomain || domain.endsWith(`.${rootDomain}`))) return 'Your hub already has a Talentral address. Use a domain your organisation owns.';
  if (domain.split('.').length < 3) return 'Use a subdomain such as apply.yourhub.ng or learn.yourhub.ng, so your main website keeps working.';
  return null;
}

export interface DnsRecord { type: 'CNAME' | 'TXT'; host: string; value: string; purpose: string }

// The two records a hub adds at its DNS provider: one proves ownership, one points traffic here.
export function domainRecords(domain: string, token: string, target: string): DnsRecord[] {
  return [
    { type: 'TXT', host: `_talentral.${domain}`, value: token, purpose: 'Proves your organisation controls the domain.' },
    { type: 'CNAME', host: domain, value: target, purpose: 'Sends visitors to your Talentral pages.' },
  ];
}

// ---------------------------------------------------------------- white-label emails

// "Kirkira Hub via Talentral <no-reply@talentral.ng>": the hub's name with Talentral's sending
// address, so emails are recognisable and still pass the sender checks of Talentral's domain.
export function brandedFrom(fromName: string, mailFrom: string): string {
  const address = mailFrom.match(/<([^>]+)>/)?.[1] ?? mailFrom.trim();
  const name = fromName.replace(/["<>\r\n]/g, '').trim().slice(0, 60);
  return name ? `"${name} via Talentral" <${address}>` : mailFrom;
}

// ---------------------------------------------------------------- learning paths

export interface PathCourse { lessons: number; done: number; open: boolean }

export interface PathProgress { coursesDone: number; total: number; current: number; percent: number }

// Where a learner is on a path: courses finished, the one they are on now, and lessons done overall.
export function pathProgress(courses: readonly PathCourse[]): PathProgress {
  const finished = (c: PathCourse) => c.lessons > 0 && c.done >= c.lessons;
  const coursesDone = courses.filter(finished).length;
  const current = courses.findIndex((c) => c.open && !finished(c));
  const lessons = courses.reduce((s, c) => s + c.lessons, 0);
  const done = courses.reduce((s, c) => s + Math.min(c.done, c.lessons), 0);
  return { coursesDone, total: courses.length, current: current === -1 ? Math.max(0, courses.length - 1) : current, percent: lessons ? Math.round((done / lessons) * 100) : 0 };
}

export const DOMAIN_STATUS_LABELS = { pending: 'Waiting for DNS', verified: 'Verified', failed: 'Not verified yet' } as const;
