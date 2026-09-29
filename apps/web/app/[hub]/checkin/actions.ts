'use server';
import { withUser } from '@talentral/db';
import { translator, visitorLanguage } from '@/lib/i18n';

export interface CheckinState { ok?: boolean; message?: string; learner?: string; session?: string; status?: string; code?: string; identity?: string }

// A learner checks into a class with the session code and their reference number or phone.
export async function checkIn(hub: string, _prev: CheckinState, form: FormData): Promise<CheckinState> {
  const t = translator(await visitorLanguage());
  const code = String(form.get('code') ?? '').trim().toUpperCase().slice(0, 12);
  const identity = String(form.get('identity') ?? '').trim().slice(0, 40);
  if (!/^[A-Z0-9]{6}$/.test(code)) return { code, identity, message: t('Enter the 6-character code your facilitator shared.', 'Rubuta lamba mai haruffa 6 da malaminka ya bayar.') };
  if (identity.length < 5) return { code, identity, message: t('Enter your application reference number or the phone number you applied with.', 'Rubuta lambar shaidar takardar neman shigarka ko lambar wayar da ka yi amfani da ita.') };
  try {
    const [r] = await withUser(null, (tx) => tx<{ learner: string; session_title: string; status: string }[]>`select * from app.self_checkin(${hub}, ${code}, ${identity})`);
    return { ok: true, learner: r!.learner, session: r!.session_title, status: r!.status };
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === 'P0001') return { code, identity, message: t('Check-in is not open for this code. Check the code, or ask your facilitator to open check-in.', 'Rajista ba ta buɗe ba da wannan lambar. Duba lambar, ko ka roƙi malaminka ya buɗe rajista.') };
    if (c === 'P0002') return { code, identity, message: t('We could not find you in this class. Use the reference number from your application email, or the phone number you applied with.', 'Ba mu same ka a wannan ajin ba. Yi amfani da lambar shaida daga imel ɗin neman shiga, ko lambar wayar da ka yi amfani da ita.') };
    throw e;
  }
}
