'use server';
import { withUser } from '@talentral/db';

export interface CheckinState { ok?: boolean; message?: string; learner?: string; session?: string; status?: string; code?: string; identity?: string }

// A learner checks into a class with the session code and their reference number or phone.
export async function checkIn(hub: string, _prev: CheckinState, form: FormData): Promise<CheckinState> {
  const code = String(form.get('code') ?? '').trim().toUpperCase().slice(0, 12);
  const identity = String(form.get('identity') ?? '').trim().slice(0, 40);
  if (!/^[A-Z0-9]{6}$/.test(code)) return { code, identity, message: 'Enter the 6-character code your facilitator shared.' };
  if (identity.length < 5) return { code, identity, message: 'Enter your application reference number or the phone number you applied with.' };
  try {
    const [r] = await withUser(null, (tx) => tx<{ learner: string; session_title: string; status: string }[]>`select * from app.self_checkin(${hub}, ${code}, ${identity})`);
    return { ok: true, learner: r!.learner, session: r!.session_title, status: r!.status };
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === 'P0001') return { code, identity, message: 'Check-in is not open for this code. Check the code, or ask your facilitator to open check-in.' };
    if (c === 'P0002') return { code, identity, message: 'We could not find you in this class. Use the reference number from your application email, or the phone number you applied with.' };
    throw e;
  }
}
