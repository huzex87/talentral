// "Join class": records the join (which marks the learner present) and forwards to the meeting.
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { env } from '@/lib/env';

export async function GET(_req: Request, { params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  const user = await currentUser();
  if (!user) return Response.redirect(`${env.appUrl}/sign-in`, 302);
  if (!/^[0-9a-f-]{36}$/.test(session)) return Response.redirect(`${env.appUrl}/learn`, 302);
  try {
    const [r] = await withUser(user.id, (tx) => tx<{ url: string }[]>`select app.join_session(${session}) as url`);
    return Response.redirect(r!.url, 302);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const reason = code === 'P0002' ? 'early' : code === 'P0003' ? 'ended' : 'unavailable';
    return Response.redirect(`${env.appUrl}/learn?join=${reason}`, 302);
  }
}
