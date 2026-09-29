# Talentral

Skills-to-Work Platform (working name, pending CAC and trademark clearance). One master brand with two product suites, the Academy Suite and the Workforce Suite, plus a learner-owned Passport and a course-grounded AI layer. The flagship pilot is Kirkira Innovation Hub's iDICE Centre of Excellence in Katsina.

## Source of truth

- `docs/master-plan.md` is the plan. Build scope is Part B (B3 scope matrix, B6 epics and acceptance criteria, B7 non-functional requirements). Architecture is Part C. Read the relevant section before building or changing a feature, and cite story IDs (for example E7.2) in commits and pull requests.
- `docs/master-plan.md` and the `.docx` are generated. Edit `docs/master-plan-source/` and run `npm run build` there.
- The brand name lives in one place per surface (`docs/master-plan-source/brand.js` for documents, app configuration for the product). Never hard-code it elsewhere.

## Status

Planning complete (v3.0). Next is Sprint 0 (C22.1): monorepo, CI, environments, design tokens, and the tenancy schema with RLS isolation tests.

## Engineering rules (Part C)

- TypeScript strict everywhere. pnpm and Turborepo monorepo: `apps/web` (Next.js App Router), `apps/worker` (pg-boss), `packages/*` as in C3.
- Supabase Postgres with Row-Level Security. Every tenant-scoped table has a non-null `tenant_id` and RLS policies. Request-handling code queries as the signed-in user through `withUser()`. Only the worker may use the service role.
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

Huzex Light: primary `#409EF2`, ink `#072435`, light surfaces only, 12 to 16 px radius cards, soft low-opacity shadows, modal overlays in white at 70% with backdrop blur (never dark). Design at 360 px width first.

## Writing and naming

- Currency is the Naira (₦) unless a funder requires another.
- Financing uses non-interest structures only.
- Use only the names in Appendix A of the plan. Do not revive retired names.
- Documents: active voice, no em dashes.
