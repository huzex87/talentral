// Hub addresses. Subdomains: kirkira.talentral.ng/apply/x is served by the /kirkira/apply/x route.
// Custom domains (MVP-2 month 9): apply.kirkirahub.ng/apply/x is served the same way once the hub
// has verified it; app.hub_for_domain maps the host to the hub, cached here for five minutes.
// Account pages live on the root domain, so they are redirected there from hub addresses.
import { NextResponse, type NextRequest } from 'next/server';
import { withUser } from '@talentral/db';

const ROOT = process.env.ROOT_DOMAIN;
const ROOT_ONLY = ['/api', '/dashboard', '/platform', '/sign-in', '/sign-out', '/auth', '/invite', '/files', '/verify', '/passport', '/shortlist', '/employer', '/employers', '/jobs', '/learn', '/offline', '/account'];
const APP_HOST = (() => { try { return new URL(process.env.APP_URL ?? '').hostname; } catch { return ''; } })();
const TTL = 5 * 60_000;
const domains = new Map<string, { slug: string | null; at: number }>();

// Talentral's own hosts, never a hub's custom domain, so they never cost a lookup.
const ownHost = (host: string) => !host || host === 'localhost' || /^[\d.]+$/.test(host) || host === APP_HOST || host.endsWith('.vercel.app')
  || (ROOT ? host === ROOT || host.endsWith(`.${ROOT}`) : false);

async function hubForDomain(host: string): Promise<string | null> {
  const hit = domains.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.slug;
  const slug = await withUser(null, async (tx) => (await tx<{ slug: string | null }[]>`select app.hub_for_domain(${host}) as slug`)[0]?.slug ?? null)
    .catch((e) => { console.error('domain lookup failed', e); return null; });
  domains.set(host, { slug, at: Date.now() });
  if (domains.size > 5000) domains.delete(domains.keys().next().value!);
  return slug;
}

function rewriteToHub(request: NextRequest, hub: string, root: string) {
  const url = request.nextUrl.clone();
  if (ROOT_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, root));
  }
  if (url.pathname === `/${hub}` || url.pathname.startsWith(`/${hub}/`)) return NextResponse.next();
  url.pathname = `/${hub}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export async function proxy(request: NextRequest) {
  // The e2e suite reaches custom domains through a header, since browsers cannot set Host. Never on in production.
  const forced = process.env.CUSTOM_DOMAIN_TEST_HEADER === '1' ? request.headers.get('x-test-host') : null;
  const host = (forced ?? request.headers.get('host') ?? '').split(':')[0]!.toLowerCase();

  if (!ownHost(host)) {
    const slug = await hubForDomain(host);
    return slug ? rewriteToHub(request, slug, ROOT ? `${request.nextUrl.protocol}//${ROOT}` : process.env.APP_URL ?? request.nextUrl.origin) : NextResponse.next();
  }
  if (!ROOT || host === ROOT || host === `www.${ROOT}` || !host.endsWith(`.${ROOT}`)) return NextResponse.next();
  return rewriteToHub(request, host.slice(0, -(ROOT.length + 1)), `${request.nextUrl.protocol}//${ROOT}`);
}

export const config = {
  matcher: ['/((?!_next/|brand/|media/|icons/|favicon.ico|icon.svg|apple-icon.png|robots.txt|sw.js|manifest.webmanifest).*)'],
};
