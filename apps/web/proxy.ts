// Hub subdomains: kirkira.talentral.ng/apply/x is served by the /kirkira/apply/x route.
// Account pages live on the root domain, so they are redirected there from hub subdomains.
import { NextResponse, type NextRequest } from 'next/server';

const ROOT = process.env.ROOT_DOMAIN;
const ROOT_ONLY = ['/dashboard', '/platform', '/sign-in', '/sign-out', '/auth', '/invite', '/files', '/verify', '/passport', '/shortlist', '/employer', '/employers', '/learn'];

export function proxy(request: NextRequest) {
  if (!ROOT) return NextResponse.next();
  const host = (request.headers.get('host') ?? '').split(':')[0]!.toLowerCase();
  if (host === ROOT || host === `www.${ROOT}` || !host.endsWith(`.${ROOT}`)) return NextResponse.next();

  const hub = host.slice(0, -(ROOT.length + 1));
  const url = request.nextUrl.clone();
  if (ROOT_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, `${url.protocol}//${ROOT}`));
  }
  if (url.pathname === `/${hub}` || url.pathname.startsWith(`/${hub}/`)) return NextResponse.next();
  url.pathname = `/${hub}${url.pathname === '/' ? '' : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/|brand/|media/|favicon.ico|icon.svg|apple-icon.png|robots.txt).*)'],
};
