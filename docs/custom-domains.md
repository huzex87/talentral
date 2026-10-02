# Custom domains and white-label emails

Hubs can serve their public pages (hub page, programmes, application forms, check-in) at their own domain, such as `apply.kirkirahub.ng`, and send applicant and learner emails under their own name. Sign-in, the dashboard and learner pages stay on Talentral's domain.

## How a hub sets it up

1. **Domain and emails** in the hub dashboard (owners and admins). Enter a subdomain the organisation owns.
2. Add two records at the DNS provider:
   - `TXT` `_talentral.<domain>` with the token shown, which proves control of the domain.
   - `CNAME` `<domain>` pointing to `CUSTOM_DOMAIN_TARGET`, which sends visitors to Talentral.
3. Press **Check DNS now**. Once the TXT record is found the domain is verified, and requests to it are routed to the hub by `proxy.ts` (`app.hub_for_domain`, cached for five minutes). Suspended hubs stop resolving.

## Environment (Vercel, set as sensitive variables, never committed)

| Variable | Purpose |
| --- | --- |
| `CUSTOM_DOMAIN_TARGET` | The CNAME target hubs point to. Defaults to `cname.vercel-dns.com`. |
| `VERCEL_API_TOKEN` | Optional. Adds and removes hub domains on the Vercel project so they get HTTPS certificates automatically. |
| `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | The project (and team) the domains are added to. |
| `DOMAIN_DRIVER` | `dns` (default) for real lookups; `fake` in tests, where any domain ending in `.test` verifies. |

Without the Vercel token, add each verified domain to the Vercel project by hand (Project → Settings → Domains).

## White-label emails

Decisions, application receipts, certificates, grading feedback, class reminders, announcements and nudges carry the hub's logo and colour and arrive as "<sender name> via Talentral" from Talentral's sending address, so SPF and DKIM keep passing. Replies go to the hub's chosen address (or its contact email), and the hub's footer line appears at the bottom. Sign-in links, employer emails and platform notices stay from Talentral.
