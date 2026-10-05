// GET /api/health: for uptime monitors. Checks the database answers; says nothing else about the
// system beyond the deployed version.
import { withUser } from '@talentral/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const db = await withUser(null, (tx) => tx`select 1`).then(() => true).catch(() => false);
  const body = { status: db ? 'ok' : 'degraded', database: db ? 'ok' : 'unreachable', version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local', ms: Date.now() - started };
  return Response.json(body, { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
