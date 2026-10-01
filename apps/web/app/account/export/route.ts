// A person's own data as a JSON file: their right of access under the Nigeria Data Protection Act.
// The data is read as the person (app.my_data only returns their own), and every download is
// recorded in the audit log.
import { system, withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response('Sign in first', { status: 401 });
  const { row, portfolio } = await withUser(user.id, async (tx) => ({
    row: (await tx<{ d: Record<string, unknown> }[]>`select app.my_data() as d`)[0],
    portfolio: await tx`select title, description, url, skills, submission_id, verified_at, created_at, updated_at from public.portfolio_items where user_id = ${user.id} order by position, created_at`,
  }));
  await system()`insert into public.audit_log (actor_id, action, target_type, target_id) values (${user.id}, 'account.data_exported', 'user', ${user.id})`;
  return new Response(JSON.stringify({ ...row!.d, portfolio }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="talentral-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
