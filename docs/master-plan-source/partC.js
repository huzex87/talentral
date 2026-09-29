const { P, H1, H2, H3, bullets, numbered, table, callout, code, figure, partDivider } = require('./h');

module.exports = () => [
  ...partDivider('Part C: Technical Implementation',
    'Part C is the engineering blueprint for Parts A and B. It records the architecture decisions, system components, repository layout, tenancy and security model, data model, offline design, the rules behind credentials, readiness and matching, the API surface, delivery pipeline and a sprint-level plan. It is written so a technical lead can start Sprint 0 from this document alone.'),

  // C1
  H1('C1. Architecture Decisions'),
  P('Version 2.0 left the backend open ("NestJS or Laravel"). This version decides. The guiding constraints are a small team, a six-month pilot deadline, strict tenant isolation, low-bandwidth users and a clean path to self-hosting if data-residency rules or cost require it.'),
  ...table(['#', 'Decision', 'Choice', 'Rationale'], [
    ['ADR-01', 'Architecture style', 'Modular monolith in a TypeScript monorepo, plus one background worker', 'One deployable is fastest for a small team; module boundaries (Academy, Assess, Certify, Passport, Workforce) allow later extraction'],
    ['ADR-02', 'Language', 'TypeScript (strict) end to end', 'One language across web, API, worker and shared domain logic; shared types and validation'],
    ['ADR-03', 'Web framework', 'Next.js (App Router) with React Server Components', 'Server rendering keeps client JavaScript small on low-end phones; one codebase for learner, staff and employer UIs'],
    ['ADR-04', 'Database', 'PostgreSQL (15 or later) with Row-Level Security, pgvector, pg_trgm', 'Tenant isolation enforced by the database, not only by application code; vectors and fuzzy search without extra services'],
    ['ADR-05', 'Managed backend', 'Supabase (Postgres, Auth, Storage) for MVP', 'Phone OTP, magic links, storage and RLS out of the box; standard Postgres means no lock-in and a self-host path'],
    ['ADR-06', 'ORM and migrations', 'Drizzle ORM with SQL migrations in Git; RLS policies written as SQL', 'Type-safe queries, readable SQL, reviewable policies'],
    ['ADR-07', 'Background jobs', 'pg-boss (Postgres-backed queue) in a Node worker', 'No extra Redis to operate in MVP; transactional enqueue with business writes'],
    ['ADR-08', 'Video', 'Bunny Stream (primary), Mux (fallback) after a two-week cost and latency spike from Katsina, Kano and Abuja', 'Low cost per GB, multiple renditions, MP4 downloads for offline'],
    ['ADR-09', 'Offline', 'PWA: Serwist service worker, IndexedDB via Dexie, outbox sync with idempotent operations', 'Works on the devices learners already own; no app-store dependency'],
    ['ADR-10', 'Internationalisation', 'next-intl with ICU messages; locale fields on content', 'Hausa as first-class; plural and gender rules handled properly'],
    ['ADR-11', 'UI', 'Tailwind CSS and shadcn/ui on Huzex Light tokens', 'Fast, consistent, accessible components'],
    ['ADR-12', 'Messaging', 'Resend (email), Termii (SMS, via Supabase Send-SMS hook), WhatsApp Cloud API (Meta)', 'Reliable Nigerian SMS delivery; WhatsApp is where learners are'],
    ['ADR-13', 'AI', 'Provider-agnostic gateway; Anthropic Claude as default model provider; pgvector for retrieval', 'Swap providers without touching features; per-tenant metering'],
    ['ADR-14', 'Hosting', 'Vercel (web), Supabase (data), Railway (worker), Bunny (media)', 'Managed, low-ops, preview environments per pull request'],
    ['ADR-15', 'Payments (MVP-2)', 'Paystack subscriptions and invoices; bank transfer reconciliation', 'Naira-native, widely used by Nigerian organisations'],
    ['ADR-16', 'Observability', 'Sentry (errors, performance), PostHog (product analytics), Better Stack (uptime, logs)', 'Visibility from day one at low cost'],
  ], [1, 2, 3.4, 3.6]),

  // C2
  H1('C2. System Architecture'),
  P('The platform has five runtime parts. Every request that touches tenant data passes through Postgres RLS, whichever part it comes from.'),
  ...figure('system-architecture', 'System architecture: clients, application, data and jobs, and managed services.'),

  // C3
  H1('C3. Repository Structure'),
  ...code(`
{{BL}}/
├─ apps/
│  ├─ web/                    Next.js app: learner, staff, workforce, public verify
│  │  ├─ app/(learner)/       dashboard, course player, downloads, passport
│  │  ├─ app/(academy)/       admin, authoring, cohorts, grading, impact
│  │  ├─ app/(workforce)/     talent officer console, employer portal (MVP-2)
│  │  ├─ app/(platform)/      super admin
│  │  ├─ app/verify/[code]/   public credential verification
│  │  ├─ app/api/v1/          sync, uploads, webhooks, public API
│  │  ├─ middleware.ts        host → tenant resolution, locale
│  │  └─ sw.ts                service worker (Serwist)
│  └─ worker/                 pg-boss consumers and scheduled jobs
├─ packages/
│  ├─ db/                     Drizzle schema, migrations, RLS policies, pgTAP tests
│  ├─ domain/                 pure logic: completion, grading, readiness, matching
│  ├─ offline/                outbox, sync client, content-pack manager
│  ├─ ai/                     provider gateway, prompts, retrieval, metering
│  ├─ messaging/              email, SMS, WhatsApp adapters and templates
│  ├─ ui/                     design system on Huzex Light tokens
│  ├─ i18n/                   en and ha message catalogues
│  └─ config/                 eslint, tsconfig, tailwind presets
├─ docs/adr/                  architecture decision records
└─ .github/workflows/         CI: typecheck, lint, unit, RLS, e2e, Lighthouse
`, 'text'),
  P('Rule: `packages/domain` has no I/O and no framework imports. The same functions compute completion and readiness on the server and preview them on the device, so the number a learner sees and the number a report shows come from one function.'),

  // C4
  H1('C4. Multi-Tenancy'),
  H2('C4.1 Tenant resolution'),
  ...bullets([
    'Each tenant has a slug and optional custom domain. Middleware maps the request host to a tenant ID (cached at the edge for 5 minutes) and passes it to server code.',
    'Platform-level surfaces (Passport, talent officer console, verification) live on the platform domain and are not tenant-scoped.',
    'A user may hold memberships in several tenants. The active tenant is the one resolved from the host; server code checks the user holds a membership there.',
  ]),
  H2('C4.2 Isolation in the database'),
  P('Every tenant-scoped table carries a non-null `tenant_id`. RLS is enabled on every such table, and policies check membership and role through security-definer helper functions. Application code runs queries as the signed-in user so RLS applies. The service role, which bypasses RLS, is only available to the worker for system jobs and never to request-handling code.'),
  ...code(`
-- schema app holds security-definer helpers; grant usage on it to authenticated
-- helper: does the current user hold one of these roles in this tenant?
create function app.has_role(t uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(roles)
  );
$$;

alter table public.courses enable row level security;

create policy courses_read on public.courses for select
  using (app.has_role(tenant_id, array['owner','admin','programme_manager',
                                       'instructor','mentor','assessor','me_officer'])
         or (status = 'published' and app.is_enrolled_in_course(id)));

create policy courses_write on public.courses for all
  using (app.has_role(tenant_id, array['owner','admin','instructor']))
  with check (app.has_role(tenant_id, array['owner','admin','instructor']));
`, 'sql'),
  ...code(`
// packages/db: every request-scoped query runs inside withUser()
export async function withUser<T>(claims: JwtClaims, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql\`set local role authenticated\`);
    await tx.execute(sql\`select set_config('request.jwt.claims', \${JSON.stringify(claims)}, true)\`);
    return fn(tx);
  });
}
`, 'ts'),
  H2('C4.3 Isolation tests'),
  P('A generated pgTAP suite creates two tenants with users in every role, then asserts that each role can perform exactly its permitted operations on every table in its own tenant and none in the other. The suite runs in CI on every pull request; a new table without RLS fails the build.'),

  // C5
  H1('C5. Identity, Authentication and Authorisation'),
  ...bullets([
    '**Learners:** phone OTP (Termii SMS, WhatsApp fallback) or email magic link. Sessions last 30 days with refresh, so downloaded content stays usable offline.',
    '**Staff:** email magic link plus mandatory TOTP for Owner, Admin, Talent Officer and Super Admin.',
    '**Enterprise (later):** SAML or OIDC single sign-on per tenant.',
    '**Authorisation:** roles from `memberships` (tenant roles), `employer_members` (employer roles) and `platform_roles` (Super Admin, Talent Officer). Permission checks live in one module (`can(user, action, resource)`) and are mirrored in RLS.',
    '**Support access:** Super Admin gains a time-boxed membership (4 hours) with a recorded reason; the tenant owner is notified.',
  ]),
  H3('Permission matrix (MVP-1 excerpt)'),
  P('**Yes** means full permission. A qualifier (for example **Own** or **Assigned**) means the permission is limited to that scope. Blank means no permission.'),
  ...table(['Action', 'Owner', 'Admin', 'Prog. Mgr', 'Instructor', 'Mentor', 'Assessor', 'M&E', 'Learner'], [
    ['Manage branding and roles', 'Yes', 'Yes', '', '', '', '', '', ''],
    ['Create and edit courses', 'Yes', 'Yes', '', 'Yes', '', '', '', ''],
    ['Create cohorts, enrol learners', 'Yes', 'Yes', 'Yes', '', '', '', '', ''],
    ['Schedule sessions, take attendance', 'Yes', 'Yes', 'Yes', 'Yes', 'Assigned', '', '', ''],
    ['Grade submissions', 'Yes', 'Yes', '', 'Yes', '', 'Yes', '', ''],
    ['View cohort progress', 'Yes', 'Yes', 'Yes', 'Yes', 'Assigned', 'Assigned', 'Yes', ''],
    ['Export personal data', 'Yes', 'Yes', 'Yes', '', '', '', 'Anon.', 'Own'],
    ['Issue or revoke certificates', 'Yes', 'Yes', 'Issue', '', '', '', '', ''],
    ['Learn and submit work', '', '', '', '', '', '', '', 'Yes'],
  ], [2.4, 1, 1, 1, 1.2, 1, 1.1, 1, 1], { firstColBold: false, size: 17, pad: 60 }),

  // C6
  H1('C6. Data Model'),
  P('All tables use UUIDv7 primary keys (time-ordered, generated client-side for offline writes), `created_at`, `updated_at`, and soft-delete `deleted_at` where records must be retained. Tenant-scoped tables carry `tenant_id`. Key columns only are listed.'),
  H3('Identity and tenancy'),
  ...table(['Table', 'Key columns', 'Notes'], [
    ['tenants', 'id, slug, name, custom_domain, branding (jsonb), default_locale, plan, status', 'One per academy'],
    ['users', 'id (= auth user), full_name, phone, email, locale, gender, birth_year, state, lga, disability_status', 'Profile; sensitive fields protected'],
    ['memberships', 'tenant_id, user_id, role, status, invited_by, expires_at', 'Unique (tenant_id, user_id, role)'],
    ['platform_roles', 'user_id, role (super_admin, talent_officer)', 'Platform-level roles'],
    ['invites', 'tenant_id, email|phone, role, token_hash, expires_at, accepted_at', 'Token stored hashed'],
  ], [1.8, 5.4, 2.8]),
  H3('Learning and cohorts'),
  ...table(['Table', 'Key columns', 'Notes'], [
    ['courses', 'tenant_id, title, slug, summary, locales, status, track_id, completion_rules (jsonb)', 'Content container'],
    ['modules', 'tenant_id, course_id, position, title', ''],
    ['lessons', 'tenant_id, module_id, position, type, title, body (jsonb per locale), media_id, duration_s, offline_allowed', 'type: text, video, audio, pdf, quiz, assignment, live'],
    ['media', 'tenant_id, kind, provider, provider_ref, renditions (jsonb), size_bytes, status', 'Bunny or Storage objects'],
    ['cohorts', 'tenant_id, course_id, name, starts_on, ends_on, unlock_mode, status', ''],
    ['cohort_staff', 'tenant_id, cohort_id, user_id, role (instructor, mentor, assessor)', ''],
    ['enrollments', 'tenant_id, cohort_id, user_id, status, enrolled_at, completed_at, source', 'Unique (cohort_id, user_id)'],
    ['lesson_progress', 'tenant_id, enrollment_id, lesson_id, status, percent, last_position_s, completed_at', 'Merged by furthest progress'],
    ['live_sessions', 'tenant_id, cohort_id, title, starts_at, ends_at, meeting_url, mode (online, in_person, hybrid)', ''],
    ['attendance', 'tenant_id, session_id, user_id, method (join, qr, manual), recorded_at, confirmed_by', 'Unique (session_id, user_id)'],
    ['announcements, discussion_threads, discussion_posts', 'tenant_id, cohort_id, author_id, body, hidden_at', 'Moderation fields'],
  ], [1.8, 5.4, 2.8]),
  H3('Assessment, skills and credentials'),
  ...table(['Table', 'Key columns', 'Notes'], [
    ['skills', 'id, tenant_id (null = platform), track_id, name (per locale), parent_id, maps_to_skill_id', 'Platform taxonomy plus tenant extensions'],
    ['tracks', 'id, name, readiness_rules (jsonb)', 'Digital Marketing, Software, Design, Customer Support, Data (initial)'],
    ['assessments', 'tenant_id, lesson_id, kind (quiz, assignment, project, capstone, interview), pass_mark, attempts, stakes (practice, graded)', ''],
    ['questions', 'tenant_id, assessment_id, type, prompt (per locale), options, answer_key, skill_ids, ai_generated, approved_by', 'answer_key never sent to clients for graded quizzes'],
    ['rubrics, rubric_criteria, rubric_levels', 'tenant_id, assessment_id, criterion, skill_ids, dimension, level, points, descriptor', 'Criteria map to skills and readiness dimensions'],
    ['submissions', 'tenant_id, assessment_id, user_id, attempt, payload, files, submitted_at, client_op_id', 'Idempotent on client_op_id'],
    ['grades', 'tenant_id, submission_id, grader_id, score, criterion_scores, feedback, released_at, moderated_by', ''],
    ['evidence', 'id, user_id, tenant_id, skill_id, dimension, source_type, source_id, level, verification (self, platform, verified), issued_at', 'Denormalised evidence ledger used by readiness and Passport'],
    ['credentials', 'id, tenant_id, user_id, course_id, code, issued_at, revoked_at, revoke_reason, payload (jsonb), signature', 'Signed Ed25519; code is public'],
  ], [1.8, 5.4, 2.8]),
  H3('Passport, consent and workforce'),
  ...table(['Table', 'Key columns', 'Notes'], [
    ['passports', 'user_id, headline, bio, target_roles, work_modes, availability_from, relocation, languages, visibility (jsonb per section), readiness (jsonb)', 'User-owned, not tenant-scoped'],
    ['portfolio_items', 'user_id, title, url, file_id, skill_ids, evidence_id', ''],
    ['consents', 'user_id, purpose, audience (talent_officers, employer:<id>, research), granted_at, withdrawn_at, text_version', 'Immutable rows; latest wins'],
    ['employers', 'id, name, sector, country, verified_at, status', ''],
    ['employer_members', 'employer_id, user_id, role', 'MVP-2'],
    ['roles_open (jobs)', 'employer_id, title, skills (jsonb with weights), work_mode, location, pay_min, pay_max, currency, status', ''],
    ['shortlists, shortlist_candidates', 'employer_id, job_id, created_by, share_token_hash, expires_at; user_id, stage, candidate_confirmed_at', ''],
    ['placements', 'user_id, employer_id, job_id, type, start_date, pay_band, confirmed_by, retention_90d', 'Feeds North Star metric'],
    ['profile_views', 'user_id, viewer_id, viewer_employer_id, context, viewed_at', 'Visible to learner'],
  ], [1.8, 5.4, 2.8]),
  H3('Platform'),
  ...table(['Table', 'Key columns', 'Notes'], [
    ['audit_log', 'id, tenant_id, actor_id, action, target_type, target_id, metadata, ip_hash, at', 'Append-only: update and delete revoked from every role'],
    ['sync_ops', 'op_id, user_id, kind, applied_at, result', 'Idempotency ledger for offline writes'],
    ['notifications, message_log', 'user_id, channel, template, locale, status, provider_ref', ''],
    ['ai_usage', 'tenant_id, user_id, feature, model, input_tokens, output_tokens, cost_minor', 'Metering and caps'],
    ['doc_chunks', 'tenant_id, lesson_id, locale, content, embedding vector', 'Retrieval for {{B}} AI'],
    ['subscriptions, invoices (MVP-2)', 'tenant_id, plan, status, period_end, paystack_ref, amount_kobo', ''],
  ], [1.8, 5.4, 2.8]),

  // C7
  H1('C7. Offline and Synchronisation'),
  H2('C7.1 Content packs'),
  ...bullets([
    'A module download creates a **pack manifest**: list of lesson JSON, images, PDFs and the chosen media rendition, each with URL, byte size and content hash.',
    'The app shows total size and checks storage quota (`navigator.storage.estimate`) before downloading, and requests persistent storage.',
    'Files are stored in Cache Storage; lesson JSON in IndexedDB. Video is the MP4 rendition the learner picks (240p default for downloads).',
    'Signed media URLs are refreshed at download time; cached copies expire 30 days after download or when the cohort ends.',
    'Packs update in the background on Wi-Fi only when the manifest hash changes.',
  ]),
  H2('C7.2 Outbox and sync'),
  ...numbered([
    'Every offline write (progress, practice quiz answers, graded quiz submissions, QR attendance, discussion drafts) becomes an operation with a client-generated UUIDv7 `op_id`, kind, payload and device timestamp, stored in the IndexedDB outbox.',
    'When online, the client posts batches of up to 100 operations to `POST /api/v1/sync/push`. Background Sync triggers this when supported; otherwise on app open and every 60 seconds while open.',
    'The server applies each operation in a transaction and records the `op_id` in `sync_ops`. A repeated `op_id` returns the stored result without re-applying, so retries are safe.',
    'The client pulls changes with `GET /api/v1/sync/pull?since=<cursor>` (grades released, announcements, schedule changes) and advances its cursor.',
    'Conflict rules: progress keeps the maximum; completion keeps the earliest completion time; submissions are append-only attempts; attendance keeps the first valid check-in.',
  ]),
  H2('C7.3 Quiz integrity offline'),
  P('Practice quizzes ship with their answer keys and give instant feedback offline. Graded quizzes never ship answer keys: answers are queued offline and graded by the server on sync, and the learner sees "Submitted, result after sync". QR attendance tokens embed a session ID and a 60-second time window signed by the server; offline check-ins are accepted only if the device timestamp falls inside the window and the sync arrives within 72 hours.'),

  // C8
  H1('C8. Media Pipeline'),
  ...numbered([
    'Instructor uploads through a resumable upload (tus) directly to Bunny Stream using a short-lived signed URL; the file never passes through the web server.',
    'Bunny produces HLS renditions (240p, 360p, 720p) and MP4 fallbacks; the worker receives the webhook and marks `media.status = ready`.',
    'The worker extracts an audio-only AAC track (64 kbps) for audio-mode learning.',
    'Transcripts are generated for accessibility and AI retrieval, then reviewed by the instructor.',
    'Playback uses token-authenticated URLs that expire after 6 hours; the default rendition adapts to connection, capped at 360p on cellular unless the learner opts up.',
    'PDFs and images go to Supabase Storage; images are resized to responsive WebP/AVIF variants.',
  ]),

  // C9
  H1('C9. Assessment, Completion and Evidence Engine'),
  ...bullets([
    '**Auto-grading** for choice questions is a pure function in `packages/domain`; short answers go to the grading queue.',
    '**Rubric grading:** each criterion maps to skills and a readiness dimension. On grade release the worker writes rows to the `evidence` ledger (skill, dimension, level, source).',
    '**Completion rules** are stored per course as JSON and evaluated by one pure function.',
  ]),
  ...code(`
{
  "requireLessonsPercent": 90,
  "requirePassedAssessments": ["all_graded"],
  "minAttendancePercent": 75,
  "requireCapstone": true
}
`, 'json'),

  // C10
  H1('C10. Credentials and Verification'),
  ...numbered([
    'When completion rules are satisfied, the worker creates a credential record with a 10-character public code (Crockford base32, no ambiguous characters).',
    'The payload (holder name, course, issuer tenant, issue date, skills) is signed with the platform Ed25519 key held in the secret manager; the signature and key ID are stored.',
    'The worker renders the tenant-branded PDF with a QR code pointing to `/verify/<code>` and stores it.',
    'The verification page shows status from the database (valid or revoked) and validates the signature, so tampered PDFs are detectable.',
    'MVP-2 exposes `GET /api/v1/public/credentials/<code>`; post-MVP adds Open Badges 3.0 / W3C Verifiable Credential export.',
  ]),

  // C11
  H1('C11. Employment Readiness Rules'),
  P('Readiness is computed by a pure function from the evidence ledger and the track\'s published rules. Tracks can tune thresholds; defaults are below.'),
  ...table(['Dimension', 'Met when (default rule)'], [
    ['Knowledge', 'All graded module quizzes passed at the pass mark'],
    ['Practical skill', 'At least 3 rubric-graded practical tasks at "Proficient" level or above'],
    ['Project capability', 'Capstone graded at 60% or above by an assessor'],
    ['Communication', 'Communication-mapped rubric criteria at level 3 of 4 or above'],
    ['Professional behaviour', 'Attendance at 75% or above and at least 80% of submissions on time'],
    ['Tool proficiency', 'Tool-mapped criteria at "Proficient" or above'],
    ['Interview readiness', 'Mock interview rubric completed at level 3 of 4 or above'],
    ['Credential status', 'Valid course or programme credential'],
  ], [2.4, 7.6]),
  ...table(['Status', 'Rule'], [
    ['Not yet assessed', 'No graded evidence yet'],
    ['Developing', 'Some evidence, fewer than 6 dimensions met, or no credential'],
    ['Ready', 'Credential held and at least 6 of 8 dimensions met'],
    ['Ready and Verified', 'Ready, plus capstone moderated by a second assessor or a talent officer verification interview'],
  ], [2.4, 7.6]),
  P('Readiness is recomputed by a job whenever new evidence is written. The Passport displays each dimension with links to its evidence. Protected characteristics (gender, age, disability, religion, ethnicity) are never inputs.'),

  // C12
  H1('C12. Passport and Consent Enforcement'),
  ...bullets([
    'Passports are read through a single database view per audience (`passport_for_officer`, `passport_for_employer`) that joins the latest active consent and applies section visibility. Base tables are not directly readable by workforce roles.',
    'Shortlist links carry a random 32-byte token (stored hashed), expire after 14 days, and render only fields allowed by consent at view time, so withdrawal takes effect immediately.',
    'Every view writes to `profile_views`, which the learner can see.',
    'Consent text is versioned; a material change to the text requires re-consent.',
  ]),

  // C13
  H1('C13. Matching Engine (MVP-2)'),
  H3('Stage 1: hard filters'),
  P('Active discoverability consent, work mode compatible, location compatible for on-site roles, availability date before job start, required languages present.'),
  H3('Stage 2: explainable score (0 to 100)'),
  ...table(['Component', 'Weight', 'Calculation'], [
    ['Skill coverage', '50%', 'Sum over required skills of (job skill weight × evidence factor). Job skill weights sum to 1. Evidence factor: 1.0 verified, 0.8 platform-evidenced, 0.3 self-declared, 0 missing'],
    ['Readiness', '20%', 'Ready and Verified 1.0, Ready 0.8, Developing 0.3'],
    ['Language fit', '10%', 'Share of preferred languages held'],
    ['Availability', '10%', '1.0 if available by start date, decaying linearly over 30 days'],
    ['Relevant experience', '10%', 'Portfolio items and past placements tagged with the job\'s skills, capped'],
  ], [2.2, 1, 6.8]),
  P('Every result lists its top reasons ("Verified: Google Ads, capstone 82%", "Available from 1 March") and its gaps. Talent officers review automated shortlists before employers see them during MVP-2. The team monitors shortlist composition by gender and state each month to catch bias introduced through the data.'),

  // C14
  H1('C14. {{B}} AI Implementation'),
  ...table(['Feature', 'Release', 'Implementation'], [
    ['Question generation', 'MVP-1', 'Lesson text and transcript sent with a structured-output prompt; returns questions with source quotes; all drafts require approval'],
    ['Lesson summaries', 'MVP-1', 'Generated per locale; instructor approves; stored as lesson content'],
    ['Feedback assistance', 'MVP-2', 'Drafts rubric-aligned feedback for the assessor to edit; never sets a grade'],
    ['Course tutor', 'MVP-2 beta', 'Retrieval over approved `doc_chunks` for the learner\'s enrolled courses only; answers cite lessons; refuses when context is insufficient; Hausa and English'],
    ['Reporting assistant', 'Later', 'Narrative drafts for funder reports from aggregate metrics'],
  ], [2, 1.3, 6.7]),
  ...bullets([
    '**Models:** Anthropic Claude as default provider, using a fast, low-cost model (for example `claude-haiku-4-5`) for summaries and classification and a stronger model (for example `claude-sonnet-5-5`) for question generation and tutoring. Model IDs are configuration, not code.',
    '**Embeddings:** a multilingual embedding model selected by a retrieval test on Hausa and English course content; stored in pgvector.',
    '**Guardrails:** tenant-scoped retrieval enforced by RLS; no personal data in prompts beyond first name; prompt and response logging with 30-day retention; per-tenant monthly token caps.',
    '**Evaluation:** a fixed test set of 100 questions per track, checked before each prompt or model change.',
  ]),

  // C15
  H1('C15. Notifications and Live Sessions'),
  ...bullets([
    '**Channels:** in-app, email (Resend), SMS (Termii), WhatsApp (Cloud API with pre-approved templates in English and Hausa).',
    '**Routing:** user preference first; fallback SMS if WhatsApp fails; quiet hours 21:00 to 07:00 WAT for non-urgent messages.',
    '**Cost control:** SMS and WhatsApp messages are metered per tenant and shown in the admin panel.',
    '**Live sessions:** meeting URL stored per session; the join button records attendance then redirects; reminders at 24 hours and 30 minutes; recordings attached as lessons afterwards.',
  ]),

  // C16
  H1('C16. Impact Analytics and Reporting'),
  ...bullets([
    'Operational metrics come from SQL views over transactional tables, refreshed as materialised views every 15 minutes by the worker.',
    'Disaggregation fields (gender, age band, state, LGA, disability status) are collected at onboarding with an explanation of purpose and a "prefer not to say" option.',
    'Exports are generated by the worker, stored for 7 days behind signed URLs and logged in the audit log.',
    'Small-cell suppression: aggregates covering fewer than 5 people are hidden in anonymised exports.',
    'A warehouse (for example BigQuery or ClickHouse) is introduced only when cross-tenant analytics outgrow Postgres.',
  ]),

  // C17
  H1('C17. API and Webhooks'),
  P('UI mutations use Server Actions. A versioned REST API under `/api/v1` serves the offline client, integrations and the public. Request and response schemas are defined in Zod and published as OpenAPI.'),
  ...table(['Endpoint', 'Purpose', 'Release'], [
    ['POST /api/v1/sync/push', 'Apply a batch of offline operations idempotently', 'MVP-1'],
    ['GET /api/v1/sync/pull?since=', 'Changes since cursor for the signed-in learner', 'MVP-1'],
    ['GET /api/v1/packs/{moduleId}', 'Content-pack manifest with signed URLs', 'MVP-1'],
    ['POST /api/v1/uploads', 'Signed upload URL for submissions and media', 'MVP-1'],
    ['POST /api/v1/attendance/qr', 'QR check-in (online or synced)', 'MVP-1'],
    ['POST /api/v1/webhooks/{provider}', 'Bunny, Termii, WhatsApp, Paystack callbacks (signature verified)', 'MVP-1 / MVP-2'],
    ['GET /api/v1/public/credentials/{code}', 'Public credential verification', 'MVP-2'],
    ['GET/POST /api/v1/tenants/{id}/learners', 'Import and export learners (API key)', 'MVP-2'],
    ['GET /api/v1/employer/matches?job=', 'Ranked matches with reasons', 'MVP-2'],
  ], [3.6, 5, 1.4]),
  P('Outbound webhooks (MVP-2): `enrollment.created`, `lesson.completed`, `course.completed`, `credential.issued`, `credential.revoked`, `placement.recorded`. Payloads are signed with HMAC-SHA256, retried with exponential backoff for 24 hours and visible in a delivery log.'),

  // C18
  H1('C18. Security and Data Protection Controls'),
  ...table(['Control', 'Implementation'], [
    ['Tenant isolation', 'RLS on every tenant table; pgTAP isolation suite in CI; service role restricted to the worker'],
    ['Authentication', 'OTP rate limits; magic-link expiry; mandatory TOTP for privileged roles; session revocation on role change'],
    ['Least privilege', 'Role matrix mirrored in RLS; time-boxed support access; production database access by named engineers only, through audited sessions'],
    ['Encryption', 'TLS 1.2+; encryption at rest for database and storage; sensitive columns (NIN, work authorisation) encrypted with pgsodium or application-level keys'],
    ['Audit', 'Append-only `audit_log` for sign-ins, role changes, exports, consents, shares, grades, revocations, support access'],
    ['Application security', 'OWASP ASVS L2; CSP and security headers; Zod validation on every input; dependency scanning (Dependabot) and secret scanning; SAST in CI'],
    ['File safety', 'Content-type allow-list; 50 MB cap; malware scan on uploads before other users can download them'],
    ['Abuse', 'Rate limiting per IP and user; report-abuse on discussions; moderation tools'],
    ['NDPA 2023', 'Record of processing; lawful basis per purpose; DPIA before pilot; data-subject request workflow; 72-hour breach notification runbook; controller/processor terms with each tenant; cross-border transfer safeguards documented for hosting outside Nigeria'],
    ['Retention', 'Learning records kept for the funder-required period (default 5 years); inactive Passports archived after 3 years with notice; logs 1 year'],
    ['Safeguarding', 'Minimum age 16 on Workforce features; employer verification before search access; grievance channel; safeguarding officer'],
    ['Testing', 'Independent penetration test before MVP-2 public launch'],
  ], [2.2, 7.8]),

  // C19
  H1('C19. Engineering Workflow, Environments and Testing'),
  ...table(['Environment', 'Purpose', 'Data'], [
    ['Local', 'Development with the Supabase CLI (Postgres, Auth, Storage in Docker)', 'Seed data'],
    ['Preview', 'One per pull request (Vercel preview plus Supabase branch)', 'Seed data'],
    ['Staging', 'Release candidate, UAT, device testing', 'Anonymised copy'],
    ['Production', 'Live tenants', 'Real data'],
  ], [1.8, 5.6, 2.6]),
  H3('CI pipeline (GitHub Actions) on every pull request'),
  ...numbered([
    'Typecheck, lint and format check.',
    'Unit tests (Vitest) for `packages/domain` with 90% line coverage required.',
    'Migration apply plus pgTAP RLS isolation suite.',
    'Playwright end-to-end tests on a mobile profile with network throttling, including an offline scenario.',
    'Lighthouse CI against performance budgets (fails on regression beyond budget) and axe accessibility checks.',
    'Dependency and secret scanning.',
  ]),
  H3('Release process'),
  P('Trunk-based development with short-lived branches, required review, and squash merges. Production deploys from `main` after staging sign-off, behind feature flags (PostHog) for anything learner-facing. Migrations are forward-only and backwards-compatible for one release. Weekly release cadence during the pilot; hotfixes follow the same pipeline.'),

  // C20
  H1('C20. Operations and Reliability'),
  ...bullets([
    '**SLOs:** 99.5% availability (MVP-1), p95 read latency under 400 ms, sync success rate above 99%.',
    '**Monitoring:** Sentry for errors and performance, Better Stack uptime checks every minute from Europe and Africa, alerts to an on-call WhatsApp group.',
    '**Backups:** Supabase point-in-time recovery (7 days) plus a nightly logical dump to separate storage kept for 30 days; restore drill every quarter.',
    '**Incident response:** severity levels, a named incident lead, status updates to tenants, a post-incident review within 5 working days.',
    '**Pilot support:** a {{B}} support desk (WhatsApp and email) with a 4-working-hour first-response target and on-site support at the Centre during launch weeks.',
  ]),

  // C21
  H1('C21. UI Foundations'),
  ...table(['Token', 'Value', 'Use'], [
    ['Primary', '#409EF2', 'Actions, links, focus rings, progress'],
    ['Ink', '#072435', 'Headings and primary text'],
    ['Surface', '#FFFFFF / #F7FAFD', 'Pages and cards (light theme only)'],
    ['Primary tints', '#EAF4FE, #CFE6FC', 'Selected states, callouts, badges'],
    ['Radius', '12 to 16 px', 'Cards, dialogs, inputs'],
    ['Shadow', 'Soft, low-opacity', 'Cards and popovers'],
    ['Overlay', 'White at 70% with backdrop blur', 'Modals; never dark overlays'],
  ], [2, 3, 5]),
  P('Tenant branding overrides primary colour and logo only; the platform enforces contrast ratios of at least 4.5:1 and falls back to the default primary when a tenant colour fails. Every screen is designed at 360 px width first.'),

  // C22
  H1('C22. Delivery Plan'),
  ...figure('roadmap-12-months', 'Twelve-month roadmap with releases, workstreams and validation gates.'),
  H2('C22.1 MVP-1 sprint plan (two-week sprints)'),
  ...table(['Sprint', 'Weeks', 'Deliverables'], [
    ['S0', '1 to 2', 'Monorepo, CI, environments, Supabase project, design tokens and core components, ADRs, tenancy schema and RLS helpers with isolation tests'],
    ['S1', '3 to 4', 'Auth (phone OTP, magic link, TOTP), tenants, memberships, invites, roles, branding, audit log'],
    ['S2', '5 to 6', 'Course builder (modules, lessons, rich text, PDF), Bunny upload and renditions, lesson player'],
    ['S3', '7 to 8', 'Cohorts, enrolment, CSV import, learner dashboard, English and Hausa interface'],
    ['S4', '9 to 10', 'Notifications (email, SMS, WhatsApp), announcements, live sessions, join and QR attendance'],
    ['S5', '11 to 12', 'Quizzes and auto-grading, assignments and projects, rubrics, grading queue, moderation'],
    ['S6', '13 to 14', 'PWA, content packs, outbox sync, offline quizzes; completion rules; certificates and verification page'],
    ['S7', '15 to 16', 'Skills taxonomy, evidence ledger, readiness engine, Impact dashboard, exports, AI question drafts and summaries. **Gate G1**'],
    ['S8', '17 to 18', 'Passport v1 and consent; security review fixes; pilot content loading; staff training; **first cohort goes live**'],
    ['S9', '19 to 20', 'Talent officer console, employer CRM, shortlists with secure links, outcome recording'],
    ['S10', '21 to 22', 'Discussion threads, automated nudges, funder PDF report, pilot feedback fixes'],
    ['S11', '23 to 24', 'Performance and accessibility hardening, DPIA update, data-subject request workflow. **Gate G2**'],
  ], [0.9, 1.1, 8]),
  H2('C22.2 MVP-2 monthly plan'),
  ...table(['Month', 'Deliverables'], [
    ['7', 'Employer organisations and verification, job posting, Passport v2 (portfolio, availability, verification labels)'],
    ['8', 'Applications, rule-based matching with reasons, employer-confirmed placements, 90-day retention check. **Gate G3**'],
    ['9', 'Self-serve hub onboarding, custom domains, white-label emails, learning paths'],
    ['10', 'Paystack billing, plans, usage metering, invoices'],
    ['11', 'AI tutor beta, AI feedback assistance, public verification API, outbound webhooks'],
    ['12', 'Penetration test and fixes, public launch, founding-hub case studies. **Gate G4**'],
  ], [1, 9]),

  // C23
  H1('C23. Team and Budget'),
  H2('C23.1 Team'),
  ...table(['Role', 'MVP-1', 'MVP-2'], [
    ['Product Lead', '1', '1'],
    ['Technical Lead / Architect', '1', '1'],
    ['Full-stack Engineers', '3', '3 to 4'],
    ['Frontend / PWA Engineer', '1', '1 to 2'],
    ['UI/UX Designer', '1', '1'],
    ['QA Engineer', '1', '1'],
    ['DevOps / Cloud', 'Part-time (tech lead covers)', 'Part-time'],
    ['AI Engineer', 'Part-time', 'Part-time to full-time'],
    ['Implementation / Customer Success', '1', '1 to 2'],
    ['Workforce Lead (employer partnerships, talent officer)', '1', '1 plus 1 talent officer'],
    ['M&E / Data Lead', 'Part-time', 'Part-time'],
  ], [4.4, 2.8, 2.8]),
  H2('C23.2 Indicative 12-month build budget'),
  P('Planning estimate for MVP-1 and MVP-2 together, not a vendor quotation. Refine after technical discovery.'),
  ...table(['Cost area', 'Indicative range'], [
    ['Product discovery and UX', '₦3m to ₦6m'],
    ['Core SaaS development', '₦18m to ₦35m'],
    ['PWA and offline layer', '₦4m to ₦8m'],
    ['AI foundation', '₦3m to ₦7m'],
    ['Cloud, storage, video and security setup', '₦3m to ₦6m'],
    ['QA, testing and deployment', '₦3m to ₦5m'],
    ['Brand and product design', '₦1.5m to ₦3m'],
    ['Pilot implementation and training', '₦2m to ₦5m'],
    ['Contingency', '₦4m to ₦8m'],
    ['**Indicative total**', '**₦41.5m to ₦83m**'],
  ], [6, 4]),
  P('A lean in-house team and reuse of managed services can reduce cash cost. A fully outsourced build with native apps, enterprise security and advanced AI could exceed this range.'),
  H2('C23.3 Running costs during the pilot (estimate)'),
  P('Vendors bill in US dollars, so figures are shown in USD. Estimated monthly platform cost during MVP-1 is about **US$250 to US$700** (Vercel, Supabase, Railway, Bunny Stream, Resend, Sentry, PostHog), plus SMS and WhatsApp messaging and AI usage, which scale with learners and are passed through to tenants in pricing. These are estimates to be confirmed during Sprint 0.'),

  // C24
  H1('C24. Definition of Done'),
  ...bullets([
    'Acceptance criteria met and demonstrated on a low-end Android device over a throttled connection.',
    'Unit, RLS and end-to-end tests written and passing; no drop in coverage.',
    'Performance and accessibility budgets pass in CI.',
    'All new strings present in English and Hausa.',
    'Audit events emitted for any sensitive action.',
    'Feature flagged if learner-facing; documentation and help text updated.',
    'Reviewed by a second engineer; security checklist completed for data-touching changes.',
  ]),
];
