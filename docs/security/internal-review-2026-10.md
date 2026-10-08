# Internal security review, October 2026 (before the independent penetration test)

**Scope:** the web application (`apps/web`), database policies and functions (`packages/db/migrations`), and configuration, at the end of MVP-2 month 11. **Method:** code review against the OWASP Top 10 (2021) and ASVS level 2 headings, with scripted checks where possible. This is preparation for the independent test the plan requires before public launch, not a substitute for it.

## What was checked

| Area | How | Result |
| --- | --- | --- |
| Access control on server actions | Script listing every exported server action without a sign-in or role check in its body, then a manual read of each one listed | All 13 non-public actions delegate to a checking helper (`requireHubRole`, `requirePlatformAdmin`, `requireEmployer`, `requireVerifiedEmployer`). Nine are public by design (sign-in, applying, check-in, enquiries, employer registration). |
| Access control on route handlers | Every `route.ts` read for its check | Downloads, exports and media check the person; scheduler and webhooks check a secret or signature; public routes (logos, credential API, keys, health) return only public data. |
| Tenant isolation | Row-level security on every tenant table, 75 database tests, functions as security definer with `search_path = ''` and explicit grants | No gaps found. |
| Injection | All SQL through tagged templates; `tx.unsafe` only with constant fragments; full-text queries built from sanitised words | No gaps found. |
| Cross-site scripting | Every `dangerouslySetInnerHTML` reviewed: QR codes (library SVG) and lesson or story text through `renderLessonText`, which escapes HTML and drops `javascript:` links (tested) | No gaps found. |
| Open redirects | Every `redirect` and `Response.redirect` reviewed | Only internal paths, stored meeting links, signed storage URLs and the hub's own address. |
| Sessions and cookies | `lib/auth.ts` | Random tokens stored hashed, `HttpOnly`, `SameSite=Lax`, `Secure` in production; sign-out is a POST. |
| Brute force and abuse | Sign-in, codes, two-step | Per-person limits existed (5 links an hour, 5 tries a code). **Fixed:** per-address limits added to every anonymous action (below). |
| SSRF | Outbound webhooks, domain checks | Private and local addresses refused, including after DNS resolution; no redirects followed. |
| Security headers | `next.config.ts` | HSTS, nosniff, frame denial, referrer and permissions policies were present. **Fixed:** Content Security Policy added (below). |
| Secrets | Repository and environment | No secrets in the repository; production secrets are Vercel sensitive variables. |
| Data protection | DPIA against the features | **Fixed:** DPIA section 6.4 still said learners never use AI; updated for the tutor. |

## Changes made

1. **Per-address rate limits** (`lib/rate.ts`, counted in the database with `app.take_rate`): sign-in links and phone codes (30 an hour), code and two-step attempts (60 an hour), applications (20 an hour), hub enquiries and employer registrations (5 an hour), class check-ins (120 an hour, generous for a hub's shared Wi-Fi). People see a plain message and can try again later.
2. **Content Security Policy:** enforced `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`; the full policy (scripts, styles, images, media, frames, connections, forms) runs as `Content-Security-Policy-Report-Only` with reports to `/api/csp-report`, so it can be enforced once production traffic shows nothing legitimate is blocked.
3. **DPIA** updated for the AI tutor.

## Known residual risks

| Risk | Rating | Note |
| --- | --- | --- |
| Inline scripts allowed in the report-only policy (`'unsafe-inline'`) | Medium until enforced with nonces | Move to nonce-based scripts after a clean report period. |
| Platform administrators can read data in the database directly | Medium | Administrative control and audit (DPIA 6.2). |
| Certificate pages can be looked up by number without a limit | Low | Numbers have about 730 million combinations per hub and year; the JSON API is rate-limited. |
| Dependency vulnerabilities | Low | Run `pnpm audit` and update before launch and monthly. |

## For the penetration test

See `pentest-scope.md` for the scope, accounts and rules of engagement.

## Addendum: welcome links for accepted applicants (migration 0026)

Acceptance emails and cohort admission emails carry a one-click link into the learner's account, so learners do not have to find the sign-in page first. Controls:

- The link is an ordinary `sign_in_tokens` row (stored hashed) with `purpose = 'welcome'`. It works once and expires after 7 days, the same lifetime as a staff invitation.
- It lands only in the learner area: `next_path` has a database check limiting it to `/learn` and `/passport` paths, so it cannot become an open redirect.
- It never opens an account with hub, employer or platform access. `completeSignIn` checks memberships, employer teams and the platform flag at the moment of use and sends those people to the normal sign-in page. Two-step sign-in still applies to anyone who has it on.
- Welcome links do not count towards the hourly sign-in link limit, so a hub resending a welcome email cannot lock a learner out of asking for a normal link.
- Accounts are created only for applicants a hub has accepted or enrolled, matched on the email they applied with. Learners still cannot read applications: `app.my_places()` returns only their own accepted places and the hub's public contact details.

Residual risk: anyone who can read the learner's mailbox within 7 days can open their learner account, as with any emailed link. A learner account holds the learner's own data only.
