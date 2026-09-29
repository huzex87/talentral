# Talentral

Skills-to-Work Platform (working name, pending CAC and trademark clearance). One master brand with two product suites, the Academy Suite and the Workforce Suite, plus a learner-owned Passport and a course-grounded AI layer. The flagship pilot is Kirkira Innovation Hub's iDICE Centre of Excellence in Katsina.

## Source of truth

- `docs/master-plan.md` is the plan. Build scope is Part B (B3 scope matrix, B6 epics and acceptance criteria, B7 non-functional requirements). Architecture is Part C. Read the relevant section before building or changing a feature, and cite story IDs (for example E7.2) in commits and pull requests.
- `docs/master-plan.md` and the `.docx` are generated. Edit `docs/master-plan-source/` and run `npm run build` there.
- The brand name lives in one place per surface (`docs/master-plan-source/brand.js` for documents, app configuration for the product). Never hard-code it elsewhere.

## Status

Week 0 "Apply" is built: hub onboarding by invitation, self-service hub profiles, programmes with a form builder, public application pages, review, notes, CSV export (see docs/adr/0001). Sprint 1 "Screen & Communicate" is built: weighted rubrics and per-reviewer scoring, bulk status moves, decision emails, bulk email and SMS (Termii), CSV/Excel import of participants selected elsewhere, and the printable call-and-selection milestone report. Sprint 2 "Admit & Run the Cohort" is built: cohorts, one-click admission of accepted applicants, a session timetable, mobile registers, learner self check-in with a session code (`/<hub>/checkin`), completion against an attendance bar, and the printable cohort-completion report. The timetable table is `class_sessions` (`sessions` holds sign-in sessions). Next: assessments and certificates. Run `pnpm typecheck`, `pnpm test` and the e2e suite before pushing.

## Engineering rules (Part C)

- TypeScript strict everywhere. pnpm workspaces: `apps/web` (Next.js 16 App Router; `proxy.ts` maps hub subdomains), `packages/db` (SQL migrations, RLS, `withUser`), `packages/domain` (pure logic).
- Postgres with Row-Level Security. Every tenant-scoped table has a non-null `tenant_id` and RLS policies. Request-handling code queries through `withUser(userId)` (role `app_user`, `app.uid()`); `system()` bypasses RLS and is only for sign-in, sessions and invite acceptance.
- A new table without RLS policies and isolation tests does not merge.
- `packages/domain` is pure: no I/O and no framework imports. Completion, grading, readiness and matching logic lives there.
- Offline writes are idempotent operations keyed by a client-generated UUIDv7 `op_id`.
- Every learner-facing string exists in English and Hausa.
- Performance budgets (B7) and WCAG 2.2 AA are acceptance criteria, checked in CI.
- Sensitive actions write to the append-only audit log.

## Product rules

- No learner data reaches an employer without an active, recorded consent.
- Readiness is a published rule set (C11), never a hidden score. Protected characteristics are never inputs to readiness or matching.
- AI drafts; people decide. AI never sets grades, issues credentials or makes employment decisions.
- Candidates never pay recruitment fees (employer-pays principle).

## Design

Talentral has its own brand system, which replaces Huzex Light for this venture. Read `brand/README.md` before any UI or visual work; tokens are in `brand/tokens.css` and `brand/tokens.json`.

- Colour: Blue `#2E5BFF` for actions and links, Ink `#101733` for text, Muted `#5B6482`, Canvas `#F7F8FC`, Line `#E3E7F2`. Teal `#14B8A6` is decorative on light; use Teal 700 `#0F766E` for success text.
- Midnight `#0D1230` and the journey gradient (`#7C3AED → #2E5BFF → #14B8A6`) are for brand moments only, never controls or text.
- Type: Outfit 600 for display and headings, Inter for interface and body.
- Light interface, 12 px controls, 16 px cards, soft shadows, modal overlays in white at 70% with backdrop blur (never dark). Design at 360 px width first.
- Use the logo files in `brand/logo/`; never redraw, recolour or rearrange the mark.

## Writing and naming

- Currency is the Naira (₦) unless a funder requires another.
- Financing uses non-interest structures only.
- Use only the names in Appendix A of the plan. Do not revive retired names.
- Documents: active voice, no em dashes.
