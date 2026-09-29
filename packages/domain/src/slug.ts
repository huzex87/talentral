// Hub and programme slugs appear in URLs such as kirkira.talentral.ng/apply/idice-coe-2026.
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'platform', 'dashboard', 'sign-in', 'sign-out', 'signin', 'auth', 'invite',
  'files', 'media', 'static', 'assets', 'help', 'support', 'about', 'blog', 'docs', 'status', 'mail', 'talentral',
  'verify', 'certificates', 'jobs', 'employers', 'passport', 'shortlist', 'talent', 'employer', 'impact', 'learn', 'courses', 'grading',
]);

const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,38}[a-z0-9]$/;

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function slugProblem(slug: string, { hub = false } = {}): string | null {
  if (!SLUG.test(slug)) return 'Use 3 to 40 lower-case letters, numbers and single hyphens.';
  if (hub && RESERVED_SLUGS.has(slug)) return 'That address is reserved. Choose another.';
  return null;
}
