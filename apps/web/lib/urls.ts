import { env } from './env';

// Public hub pages: kirkira.talentral.ng/apply/x when ROOT_DOMAIN is set, otherwise /kirkira/apply/x.
export function hubUrl(slug: string, path = ''): string {
  if (env.rootDomain) {
    const scheme = env.appUrl.startsWith('https') ? 'https' : 'http';
    return `${scheme}://${slug}.${env.rootDomain}${path || '/'}`;
  }
  return `${env.appUrl}/${slug}${path}`;
}

// Relative link for use inside the app (same host).
export function hubPath(slug: string, path = ''): string {
  return env.rootDomain ? hubUrl(slug, path) : `/${slug}${path}`;
}
