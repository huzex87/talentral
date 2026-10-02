import 'server-only';
// White-label emails (MVP-2 month 9): a hub's name, colour, logo, sender name, reply address and
// footer, read alongside whatever query loads the recipients. Hubs without settings still get
// their name, colour and logo; replies go to the hub's contact address.
import type { Tenant } from '@talentral/db';
import { env } from './env';
import type { HubBrand } from './mail';

export const BRAND_COLUMNS = 't.slug as brand_slug, t.brand_color, t.logo_path as brand_logo, t.email_from_name, t.email_reply_to::text as email_reply_to, t.email_footer, t.contact_email::text as brand_contact';

export interface BrandColumns {
  brand_slug: string; brand_color: string | null; brand_logo: string | null; email_from_name: string | null;
  email_reply_to: string | null; email_footer: string | null; brand_contact: string | null;
}

const logo = (slug: string, path: string | null) => (path ? `${env.appUrl}/media/${slug}/logo?v=${encodeURIComponent(path.slice(-12))}` : null);

export function brandOf(name: string, r: BrandColumns): HubBrand {
  return { name, color: r.brand_color, logoUrl: logo(r.brand_slug, r.brand_logo), fromName: r.email_from_name, replyTo: r.email_reply_to ?? r.brand_contact, footer: r.email_footer };
}

export function tenantBrand(t: Tenant): HubBrand {
  return { name: t.name, color: t.brand_color, logoUrl: logo(t.slug, t.logo_path), fromName: t.email_from_name, replyTo: t.email_reply_to ?? t.contact_email, footer: t.email_footer };
}
