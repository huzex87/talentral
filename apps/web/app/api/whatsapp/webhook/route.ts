// WhatsApp Business webhook (Meta). GET answers Meta's one-time verification with
// WHATSAPP_VERIFY_TOKEN. POST receives messages people send us: STOP (or TSAYA) turns WhatsApp
// messages off for that number and START (or FARA) back on, each confirmed with a reply. Every POST
// must carry Meta's signature over the body, made with WHATSAPP_APP_SECRET.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { system } from '@talentral/db';
import { waPhone, whatsappKeyword, whatsappReply } from '@talentral/domain';
import { sendWhatsAppBatch } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === expected) return new Response(q.get('hub.challenge') ?? '', { status: 200 });
  return new Response('Forbidden', { status: 403 });
}

type Inbound = { entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string }; button?: { text?: string } }[] } }[] }[] };

function signed(body: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!signed(body, req.headers.get('x-hub-signature-256'))) return new Response('Unauthorised', { status: 401 });
  let data: Inbound;
  try { data = JSON.parse(body) as Inbound; } catch { return new Response('Bad request', { status: 400 }); }
  const sql = system();
  let handled = 0;
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const phone = waPhone(m.from);
        const kind = whatsappKeyword(m.text?.body ?? m.button?.text ?? '');
        if (!phone || !kind) continue;
        await sql`insert into public.whatsapp_optins (phone, opted_in, source) values (${phone}, ${kind === 'start'}, 'reply')
                  on conflict (phone) do update set opted_in = excluded.opted_in, source = 'reply', changed_at = now()`;
        const [u] = await sql<{ language: 'en' | 'ha' }[]>`select language from public.users where phone = ${phone}`;
        await sendWhatsAppBatch([{ to: phone, kind: 'reply', text: whatsappReply(kind, u?.language ?? 'en') }]).catch(() => 0);
        handled += 1;
      }
    }
  }
  // Meta retries anything but a 200, so always answer 200 once the signature is good.
  return Response.json({ ok: true, handled });
}
