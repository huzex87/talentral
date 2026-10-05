// Receives Content-Security-Policy violation reports from browsers (report-only policy in
// next.config.ts) and logs a compact line for each, so the policy can be tightened safely.
import { clientIp, withinRate } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await withinRate(`csp:${clientIp(req)}`, 30))) return new Response(null, { status: 204 });
  const text = (await req.text()).slice(0, 8000);
  try {
    const body = JSON.parse(text) as { 'csp-report'?: Record<string, unknown> };
    const r = body['csp-report'] ?? {};
    console.warn('csp-violation', JSON.stringify({ directive: r['violated-directive'] ?? r['effective-directive'], blocked: r['blocked-uri'], page: r['document-uri'], source: r['source-file'] }));
  } catch { /* not a report */ }
  return new Response(null, { status: 204 });
}
