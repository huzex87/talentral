import { env } from './env';

// Public hub pages: kirkira.talentral.ng/apply/x when ROOT_DOMAIN is set, otherwise /kirkira/apply/x.
// A hub with a verified custom domain (MVP-2 month 9) uses that instead: apply.kirkirahub.ng/apply/x.
export function hubUrl(slug: string, path = '', domain?: string | null): string {
  if (domain) return `https://${domain}${path || '/'}`;
  if (env.rootDomain) {
    const scheme = env.appUrl.startsWith('https') ? 'https' : 'http';
    return `${scheme}://${slug}.${env.rootDomain}${path || '/'}`;
  }
  return `${env.appUrl}/${slug}${path}`;
}

// The hub's own domain once verified, for hubUrl.
export const liveDomain = (hub: { custom_domain?: string | null; domain_status?: string | null }) =>
  hub.domain_status === 'verified' ? hub.custom_domain ?? null : null;

// Relative link for use inside the app (same host).
export function hubPath(slug: string, path = ''): string {
  return env.rootDomain ? hubUrl(slug, path) : `/${slug}${path}`;
}
