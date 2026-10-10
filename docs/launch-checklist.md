# Public launch checklist (Gate G4)

Work through this before announcing Talentral publicly. Items that need a person outside the code are marked **owner**.

## Security
- [ ] Independent penetration test done; high and critical findings fixed and retested (`docs/security/pentest-scope.md`). **owner**
- [ ] CSP reports reviewed for two weeks (`csp-violation` in Vercel logs); the full policy enforced with nonces if clean.
- [x] `pnpm audit` clean of high and critical advisories (clean on 10 October 2026 after Next.js 16.3.8 and source-map-js 1.2.2; run again before launch).
- [ ] Two-step sign-in on for every platform admin and required for founding hubs.

## Legal and data protection
- [ ] Privacy notice (`/privacy`) and terms (`/terms`) reviewed by counsel. **owner**
- [ ] DPIA `[confirm]` items closed and signed off (`docs/privacy/dpia.md`). **owner**
- [ ] Controller-processor agreement signed with each founding hub. **owner**
- [ ] `privacy@talentral.ng` mailbox monitored. **owner**
- [ ] CAC name, trademark and domain clearance complete (plan A1.5). **owner**

## Production configuration (Vercel, production only, sensitive)
- [ ] `ANTHROPIC_API_KEY` (AI drafting and the tutor).
- [ ] `CERTIFICATE_SIGNING_KEY` (signed credential API; `docs/verification-api.md`).
- [ ] `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` (custom domains; `docs/custom-domains.md`).
- [ ] Termii (SMS), Meta WhatsApp (`docs/whatsapp.md`) and Bunny Stream (`docs/video-streaming.md`) live credentials.
- [ ] `CRON_SECRET` set; the database scheduler calls `/api/cron/reminders` every five minutes.
- [ ] Invoice issuer and bank details set: `INVOICE_FROM`, `INVOICE_ADDRESS`, `INVOICE_EMAIL`, `INVOICE_TIN`, `INVOICE_BANK`, `INVOICE_ACCOUNT_NAME`, `INVOICE_ACCOUNT_NUMBER`; placement fee terms and VAT treatment confirmed with the accountant and a Shariah adviser. **owner**
- [ ] Never set in production: `CRON_ALLOW_CLOCK`, `CUSTOM_DOMAIN_TEST_HEADER`, `WEBHOOK_ALLOW_PRIVATE`, `RATE_LIMIT_SCALE`, `AI_DRIVER=fake`.

## Operations
- [ ] Uptime monitor on `https://talentral.ng/api/health` (alerts to the on-call phone).
- [ ] Database backups and point-in-time recovery confirmed; one restore rehearsed.
- [ ] Email domain (SPF, DKIM, DMARC) verified in Resend.
- [ ] Support desk (WhatsApp and email) staffed for launch weeks.
- [ ] Sitemap submitted to Google Search Console (`/sitemap.xml`).

## Content
- [ ] At least one founding-hub story published with the hub's agreement (`/platform/stories`). **owner**
- [ ] Hausa strings reviewed by a native speaker. **owner**

## Gate G4 (month 12)
- [ ] 5 or more external hubs onboarded, 3 or more paying.
- [ ] 25 or more employers with at least one shortlist.
- [ ] Verified Opportunity Outcomes baseline established (`/platform/outcomes`).
