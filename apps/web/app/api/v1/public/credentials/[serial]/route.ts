// GET /api/v1/public/credentials/{serial}: public verification of a Talentral certificate.
// Open to anyone (CORS), 60 requests a minute per address. Documented in docs/verification-api.md.
import { API_HEADERS, clientIp, findCredential, signCredential, withinRate } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

const PER_MINUTE = Number(process.env.PUBLIC_API_PER_MINUTE) || 60;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...API_HEADERS, 'Access-Control-Max-Age': '86400' } });
}

export async function GET(req: Request, { params }: { params: Promise<{ serial: string }> }) {
  if (!(await withinRate(`api:credentials:${clientIp(req)}`, PER_MINUTE))) {
    return Response.json({ error: { code: 'rate_limited', message: `Up to ${PER_MINUTE} requests a minute. Try again shortly.` } }, { status: 429, headers: { ...API_HEADERS, 'Retry-After': '60' } });
  }
  const credential = await findCredential(decodeURIComponent((await params).serial));
  if (!credential) {
    return Response.json({ error: { code: 'not_found', message: 'No Talentral certificate has this number. Check it against the certificate, for example TAL-KIR-26-6J8WXD.' } },
      { status: 404, headers: { ...API_HEADERS, 'Cache-Control': 'public, max-age=60' } });
  }
  const signature = signCredential(credential);
  return Response.json({ ...credential, ...(signature ? { signature } : {}) },
    { headers: { ...API_HEADERS, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
