-- Sprint 14: pilot health (Gate G2). NPS surveys for learners and staff, the activity needed to
-- measure activation and weekly use, a security incident log, and indexes for hot learner paths.
-- Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- NPS surveys

-- "How likely are you to recommend Talentral?" 0 to 10. Learners answer per cohort, staff per hub.
-- A row with no score records "Not now", so the question waits before asking again. Answers are
-- shown to hubs without names: user_id is never granted to the app role.
create table public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid references public.cohorts (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  audience text not null check (audience in ('learner', 'staff')),
  score integer check (score between 0 and 10),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  check ((audience = 'learner') = (cohort_id is not null)),
  check (score is not null or comment is null)
);
create index on public.nps_responses (tenant_id, created_at desc);
create index on public.nps_responses (user_id, tenant_id, audience);
alter table public.nps_responses enable row level security;
grant select (id, tenant_id, cohort_id, audience, score, comment, created_at) on public.nps_responses to app_user;
create policy nps_responses_read on public.nps_responses for select to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());

-- Every survey the caller could be asked: one per cohort they learn in, one per hub they work for,
-- with when it became relevant and when they last answered or said "Not now". The timing rules
-- (how long to wait, how often to ask) live in packages/domain/src/health.ts.
create or replace function app.nps_state()
returns table (tenant_id uuid, hub_name text, cohort_id uuid, audience text, started_at timestamptz, last_answered timestamptz, last_dismissed timestamptz)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select co.tenant_id, co.id as cohort_id, 'learner'::text as audience,
      greatest(e.enrolled_at, coalesce((co.starts_on::timestamp at time zone 'Africa/Lagos'), e.enrolled_at)) as started_at
    from public.users u
    join public.applications a on a.email = u.email
    join public.enrolments e on e.application_id = a.id and e.status <> 'dropped'
    join public.cohorts co on co.id = e.cohort_id
    where u.id = app.uid()
    union all
    select m.tenant_id, null, 'staff', m.created_at from public.memberships m where m.user_id = app.uid()
  )
  select x.tenant_id, t.name, x.cohort_id, x.audience, x.started_at,
    (select max(r.created_at) from public.nps_responses r where r.user_id = app.uid() and r.tenant_id = x.tenant_id and r.audience = x.audience
       and r.cohort_id is not distinct from x.cohort_id and r.score is not null),
    (select max(r.created_at) from public.nps_responses r where r.user_id = app.uid() and r.tenant_id = x.tenant_id and r.audience = x.audience
       and r.cohort_id is not distinct from x.cohort_id and r.score is null)
  from mine x join public.tenants t on t.id = x.tenant_id
  where t.status = 'active'
$$;

-- Records an answer (score 0 to 10, optional comment) or "Not now" (no score).
create or replace function app.submit_nps(p_tenant uuid, p_cohort uuid, p_audience text, p_score integer, p_comment text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if app.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_audience = 'learner' then
    if p_cohort is null or not exists (select 1 from public.cohorts c where c.id = p_cohort and c.tenant_id = p_tenant) or app.my_enrolment(p_cohort) is null then
      raise exception 'You are not learning in this cohort' using errcode = '42501';
    end if;
  elsif p_audience = 'staff' then
    if p_cohort is not null or not app.is_member(p_tenant) then raise exception 'You are not on this hub''s team' using errcode = '42501'; end if;
  else
    raise exception 'Unknown survey' using errcode = '22023';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then raise exception 'Choose a score from 0 to 10' using errcode = '22023'; end if;
  if p_score is not null and exists (
    select 1 from public.nps_responses r where r.user_id = app.uid() and r.tenant_id = p_tenant and r.audience = p_audience
      and r.cohort_id is not distinct from p_cohort and r.score is not null and r.created_at > now() - interval '60 days') then
    raise exception 'You have already answered. Thank you!' using errcode = 'P0001';
  end if;
  insert into public.nps_responses (tenant_id, cohort_id, user_id, audience, score, comment)
  values (p_tenant, p_cohort, app.uid(), p_audience, p_score, case when p_score is null then null else nullif(left(trim(p_comment), 1000), '') end);
end
$$;

-- A deleted person's comments go with them; their anonymous score stays in the totals.
create or replace function app.forget_nps_comments() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.nps_responses set comment = null where user_id = old.id;
  return old;
end
$$;
create trigger users_forget_nps_comments before delete on public.users for each row execute function app.forget_nps_comments();

-- ---------------------------------------------------------------- learning activity by day

-- Lesson progress keeps only the first and latest visit, so a day log records every day a learner
-- opened a lesson. Weekly-active figures are counted from it and the other dated records.
create table public.activity_days (
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  day date not null,
  primary key (enrolment_id, day)
);
alter table public.activity_days enable row level security;

create or replace function app.log_activity_day() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.activity_days (enrolment_id, day) values (new.enrolment_id, (new.last_seen_at at time zone 'Africa/Lagos')::date)
  on conflict do nothing;
  return new;
end
$$;
create trigger lesson_progress_activity_day after insert or update of last_seen_at on public.lesson_progress
  for each row execute function app.log_activity_day();

-- Days already known from lesson progress, so history is not empty on day one.
insert into public.activity_days (enrolment_id, day)
select enrolment_id, (first_seen_at at time zone 'Africa/Lagos')::date from public.lesson_progress
union
select enrolment_id, (last_seen_at at time zone 'Africa/Lagos')::date from public.lesson_progress
on conflict do nothing;

-- Every day (WAT) each learner did something: opened a lesson, answered a quiz, handed in or
-- reviewed work, attended or joined a class, or posted in the discussion. One hub, or every hub
-- for the platform team (p_tenant null).
create or replace function app.health_days(p_tenant uuid)
returns table (cohort_id uuid, enrolment_id uuid, day date)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (app.is_platform_admin() or (p_tenant is not null and app.has_role(p_tenant, array['owner', 'admin']))) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
  return query
  with e as (
    select en.id, en.cohort_id, a.email from public.enrolments en join public.applications a on a.id = en.application_id
    where p_tenant is null or en.tenant_id = p_tenant
  ), ev as (
    select e.id, e.cohort_id, d.day::timestamp at time zone 'Africa/Lagos' + interval '12 hours' as at from e join public.activity_days d on d.enrolment_id = e.id
    union all select e.id, e.cohort_id, lp.first_seen_at from e join public.lesson_progress lp on lp.enrolment_id = e.id
    union all select e.id, e.cohort_id, q.submitted_at from e join public.quiz_attempts q on q.enrolment_id = e.id
    union all select e.id, e.cohort_id, s.submitted_at from e join public.submissions s on s.enrolment_id = e.id
    union all select e.id, e.cohort_id, pr.completed_at from e join public.peer_reviews pr on pr.reviewer_enrolment_id = e.id where pr.completed_at is not null
    union all select e.id, e.cohort_id, cs.starts_at from e join public.attendance at on at.enrolment_id = e.id join public.class_sessions cs on cs.id = at.session_id
      where at.status in ('present', 'late')
    union all select e.id, e.cohort_id, j.joined_at from e join public.session_joins j on j.enrolment_id = e.id
    union all select e.id, e.cohort_id, p.created_at from e join public.discussion_threads t on t.cohort_id = e.cohort_id
      join public.discussion_posts p on p.thread_id = t.id join public.users u on u.id = p.author_id and u.email = e.email
    union all select e.id, e.cohort_id, t.created_at from e join public.discussion_threads t on t.cohort_id = e.cohort_id
      join public.users u on u.id = t.author_id and u.email = e.email
  )
  select distinct ev.cohort_id, ev.id, (ev.at at time zone 'Africa/Lagos')::date from ev;
end
$$;

-- ---------------------------------------------------------------- security incidents

-- The platform team's incident log (see docs/privacy/breach-runbook.md). Gate G2 needs zero
-- cross-tenant incidents, so each incident says whether one hub's data reached another.
create table public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  summary text not null check (char_length(summary) between 10 and 2000),
  cross_tenant boolean not null default false,
  personal_data boolean not null default false,
  ndpc_notified_on date,
  resolved_on date,
  recorded_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.security_incidents (occurred_on desc);
alter table public.security_incidents enable row level security;
grant select on public.security_incidents to app_user;
create policy security_incidents_read on public.security_incidents for select to app_user using (app.is_platform_admin());

create or replace function app.record_incident(p_occurred date, p_summary text, p_cross_tenant boolean, p_personal boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if p_occurred is null or p_occurred > (now() at time zone 'Africa/Lagos')::date then raise exception 'Give the date it happened' using errcode = '22023'; end if;
  if char_length(coalesce(trim(p_summary), '')) < 10 then raise exception 'Describe what happened in at least 10 characters' using errcode = '22023'; end if;
  insert into public.security_incidents (occurred_on, summary, cross_tenant, personal_data, recorded_by)
  values (p_occurred, trim(p_summary), coalesce(p_cross_tenant, false), coalesce(p_personal, false), app.uid()) returning id into v_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'security.incident_recorded', 'security_incident', v_id, jsonb_build_object('cross_tenant', coalesce(p_cross_tenant, false)));
  return v_id;
end
$$;

-- Marks the regulator notified and/or the incident resolved (today, WAT).
create or replace function app.update_incident(p_id uuid, p_step text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if p_step = 'notified' then
    update public.security_incidents set ndpc_notified_on = coalesce(ndpc_notified_on, v_today) where id = p_id;
  elsif p_step = 'resolved' then
    update public.security_incidents set resolved_on = coalesce(resolved_on, v_today) where id = p_id;
  else
    raise exception 'Unknown step' using errcode = '22023';
  end if;
  if not found then raise exception 'Incident not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (app.uid(), 'security.incident_' || p_step, 'security_incident', p_id);
end
$$;

do $$
declare f text;
begin
  foreach f in array array['app.nps_state()', 'app.submit_nps(uuid, uuid, text, integer, text)', 'app.health_days(uuid)',
    'app.record_incident(date, text, boolean, boolean)', 'app.update_incident(uuid, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.forget_nps_comments() from public;
revoke all on function app.log_activity_day() from public;

-- ---------------------------------------------------------------- performance

-- Learner pages and sign-in match applications by email; the programme-scoped unique index does
-- not help there. Live-class activity is looked up by enrolment.
create index if not exists applications_email_idx on public.applications (email);
create index if not exists session_joins_enrolment_idx on public.session_joins (enrolment_id);
