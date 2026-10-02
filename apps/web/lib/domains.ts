import 'server-only';
// Custom domains (MVP-2 month 9). A hub proves it controls a domain with a TXT record at
// _talentral.<domain> holding its token, and points the domain at Talentral with a CNAME. On
// Vercel, the domain is also added to the project so it gets an HTTPS certificate.
// Drivers: "dns" (default, real lookups) and "fake" (tests: any domain ending in .test passes).
import { resolveCname, resolveTxt } from 'node:dns/promises';

const driver = () => (process.env.DOMAIN_DRIVER ?? 'dns') as 'dns' | 'fake';

// Where hubs point their CNAME.
export const domainTarget = () => process.env.CUSTOM_DOMAIN_TARGET ?? 'cname.vercel-dns.com';

export interface DomainCheck { ok: boolean; pointing: boolean; error: string | null }

export async function checkDomain(domain: string, token: string): Promise<DomainCheck> {
  if (driver() === 'fake') {
    const ok = domain.endsWith('.test');
    return { ok, pointing: ok, error: ok ? null : `We could not find the TXT record _talentral.${domain}.` };
  }
  const txt = await resolveTxt(`_talentral.${domain}`).then((r) => r.map((parts) => parts.join(''))).catch(() => [] as string[]);
  const pointing = await resolveCname(domain).then((r) => r.some((c) => c.replace(/\.$/, '').toLowerCase() === domainTarget())).catch(() => false);
  if (!txt.includes(token)) {
    return { ok: false, pointing, error: txt.length ? `The TXT record _talentral.${domain} has a different value. Copy the value shown here exactly.` : `We could not find the TXT record _talentral.${domain}. DNS changes can take up to an hour to appear.` };
  }
  return { ok: true, pointing, error: null };
}

// Adds or removes the domain on the Vercel project, when Vercel credentials are configured.
async function vercel(method: 'POST' | 'DELETE', domain: string): Promise<void> {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const url = method === 'POST'
    ? `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${team}`
    : `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}${team}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ name: domain }) } : {}) });
  if (!res.ok && res.status !== 409 && res.status !== 404) console.error(`Vercel domain ${method} ${domain} failed (${res.status}): ${await res.text()}`);
}
export const attachDomain = (domain: string) => vercel('POST', domain).catch((e) => console.error('attach domain failed', e));
export const detachDomain = (domain: string) => vercel('DELETE', domain).catch((e) => console.error('detach domain failed', e));
