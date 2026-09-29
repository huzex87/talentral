# ADR 0001: Week 0 build decisions

Date: September 2026. Status: accepted.

The iDICE Centre of Excellence call for applications opens within a week, so the build starts with
**Apply** (hub onboarding, programme pages, application forms, review and export) instead of the
original Sprint 0 to 7 order. These decisions refine plan section C1 for that first release.

| Topic | Plan (C1) | Decision now | Why |
| --- | --- | --- | --- |
| Authentication | Supabase Auth | Email sign-in links and database sessions in the app (`apps/web/lib/auth.ts`) | Testable on any Postgres, no vendor coupling, works before Supabase is provisioned. Supabase still hosts Postgres and Storage. Phone OTP can be added in the same module. |
| Row-Level Security identity | `auth.uid()` from the Supabase JWT | `app.uid()` from a transaction-local setting, with every request run as the `app_user` role (`packages/db`) | Same guarantees, database-agnostic. Proven by `packages/db/test/rls.test.ts`. |
| Query layer | Drizzle ORM | `postgres.js` tagged templates with typed rows | Fewer moving parts for week 0; SQL migrations remain the source of truth. Revisit when the schema grows. |
| Monorepo tooling | pnpm and Turborepo | pnpm workspaces only | Three packages do not need a task runner yet. |
| Applications | Not in MVP-1 | Added as the first module | Every hub runs calls for applications; it is the front door to cohorts. |
| Hub setup | Platform-admin assisted | Platform creates the hub and invites its owner; the hub completes its own profile | Hubs own their identity; onboarding ten hubs does not depend on our team. |
| Hausa | Interface in English and Hausa | English first; strings move to message files next | Hausa copy must come from native speakers, not machine translation (brand guide). |
| Domain | Subdomains of the platform domain | `talentral.ng`, with hubs at `<hub>.talentral.ng` through `proxy.ts`; path URLs (`/<hub>`) work without DNS | Nigerian domain secured; path URLs keep previews and local development simple. |
