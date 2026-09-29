-- Proving skills: graded assessments per cohort, and certificates anyone can verify.

alter table public.cohorts add column pass_mark integer not null default 50 check (pass_mark between 0 and 100);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  kind text not null default 'assignment' check (kind in ('assignment', 'quiz', 'project', 'practical')),
  max_score integer not null default 100 check (max_score between 1 and 1000),
  weight integer not null default 1 check (weight between 1 and 10),
  due_on date,
  created_at timestamptz not null default now()
);
create index on public.assessments (cohort_id);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  score numeric(7, 2) not null check (score >= 0),
  feedback text check (char_length(feedback) <= 1000),
  graded_by uuid references public.users (id) on delete set null,
  graded_at timestamptz not null default now(),
  unique (assessment_id, enrolment_id)
);
create index on public.assessment_results (enrolment_id);

-- Funders, partners and sponsors of a programme, shown on its public page and on its certificates.
-- Logo files are never deleted when a partner is removed: issued certificates may still show them.
create table public.programme_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  programme_id uuid not null references public.programmes (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  role text not null default 'partner' check (role in ('funder', 'partner', 'sponsor', 'implementing_partner')),
  logo_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.programme_partners (programme_id, position);

-- A certificate keeps a snapshot of what it certifies, so it reads the same years later even if
-- names or programmes change. Revoking keeps the record and shows the certificate as withdrawn.
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrolment_id uuid not null unique references public.enrolments (id) on delete cascade,
  serial text not null unique check (serial ~ '^TAL-[A-Z]{3}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}$'),
  learner_name text not null,
  programme_title text not null,
  cohort_name text not null,
  hub_name text not null,
  hub_slug text not null,
  track text,
  attendance numeric(4, 1),
  score numeric(4, 1),
  completed_on date not null,
  partners jsonb not null default '[]'::jsonb check (jsonb_typeof(partners) = 'array'),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text check (char_length(revoked_reason) <= 300)
);
create index on public.certificates (tenant_id);

alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
alter table public.certificates enable row level security;
alter table public.programme_partners enable row level security;

-- Partners are as visible as their programme: public once it is published, otherwise hub-only.
create policy partners_read on public.programme_partners for select to app_user
  using (exists (select 1 from public.programmes p where p.id = programme_partners.programme_id));
create policy partners_write on public.programme_partners for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.programmes p where p.id = programme_partners.programme_id and p.tenant_id = programme_partners.tenant_id));
grant select, insert, delete on public.programme_partners to app_user;
grant update (name, role, position) on public.programme_partners to app_user;

create policy assessments_read on public.assessments for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy assessments_write on public.assessments for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.cohorts c where c.id = assessments.cohort_id and c.tenant_id = assessments.tenant_id));

-- Any team member can grade (facilitators often review), within their hub and cohort, as themselves.
create policy results_read on public.assessment_results for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy results_insert on public.assessment_results for insert to app_user
  with check (app.is_member(tenant_id) and graded_by = app.uid() and exists (
    select 1 from public.assessments a join public.enrolments e on e.cohort_id = a.cohort_id
    where a.id = assessment_results.assessment_id and a.tenant_id = assessment_results.tenant_id
      and e.id = assessment_results.enrolment_id and e.tenant_id = assessment_results.tenant_id
      and assessment_results.score <= a.max_score));
create policy results_update on public.assessment_results for update to app_user
  using (app.is_member(tenant_id))
  with check (app.is_member(tenant_id) and graded_by = app.uid() and exists (
    select 1 from public.assessments a where a.id = assessment_results.assessment_id and assessment_results.score <= a.max_score));
create policy results_delete on public.assessment_results for delete to app_user using (app.is_member(tenant_id));

-- Certificates: issued by owners and admins, only for learners marked as completed in their hub.
create policy certificates_read on public.certificates for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy certificates_insert on public.certificates for insert to app_user
  with check (app.has_role(tenant_id, array['owner', 'admin']) and issued_by = app.uid() and exists (
    select 1 from public.enrolments e where e.id = certificates.enrolment_id and e.tenant_id = certificates.tenant_id and e.status = 'completed'));
create policy certificates_update on public.certificates for update to app_user
  using (app.has_role(tenant_id, array['owner', 'admin'])) with check (app.has_role(tenant_id, array['owner', 'admin']));

grant select on public.assessments, public.assessment_results, public.certificates to app_user;
grant insert, delete on public.assessments to app_user;
grant update (title, kind, max_score, weight, due_on) on public.assessments to app_user;
grant insert, delete on public.assessment_results to app_user;
grant update (score, feedback, graded_by, graded_at) on public.assessment_results to app_user;
grant insert on public.certificates to app_user;
grant update (revoked_at, revoked_reason) on public.certificates to app_user;
grant update (pass_mark) on public.cohorts to app_user;

-- Public verification by serial: what the certificate says and whether it still stands.
-- Returns nothing personal beyond what is printed on the certificate itself.
create or replace function app.verify_certificate(p_serial text)
returns table (serial text, learner_name text, programme_title text, cohort_name text, hub_name text, hub_slug text,
               track text, attendance numeric, score numeric, completed_on date, partners jsonb, issued_at timestamptz, revoked_at timestamptz, revoked_reason text)
language sql stable security definer set search_path = ''
as $$
  select c.serial, c.learner_name, c.programme_title, c.cohort_name, c.hub_name, c.hub_slug, c.track, c.attendance, c.score,
         c.completed_on, c.partners, c.issued_at, c.revoked_at, c.revoked_reason
  from public.certificates c where c.serial = upper(trim(p_serial))
$$;
revoke all on function app.verify_certificate(text) from public;
grant execute on function app.verify_certificate(text) to app_user;
