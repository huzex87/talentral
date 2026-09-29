// Partner logos as frozen onto a certificate when it was issued, so the certificate reads the same
// even after the programme's partners change.
import { withUser } from '@talentral/db';
import { CERTIFICATE_PATTERN, type PartnerSnapshot } from '@talentral/domain';
import { storage } from '@/lib/storage';
import { imageResponse } from '@/lib/files';

export async function GET(_req: Request, { params }: { params: Promise<{ serial: string; index: string }> }) {
  const { serial: raw, index } = await params;
  const serial = decodeURIComponent(raw).toUpperCase();
  if (!CERTIFICATE_PATTERN.test(serial) || !/^\d{1,2}$/.test(index)) return new Response('Not found', { status: 404 });
  const [c] = await withUser(null, (tx) => tx<{ partners: PartnerSnapshot[] }[]>`select partners from app.verify_certificate(${serial})`);
  const partner = c?.partners[Number(index)];
  if (!partner) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(partner.logo_path);
  return bytes ? imageResponse(partner.logo_path, bytes) : new Response('Not found', { status: 404 });
}
