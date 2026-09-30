-- Sprint 12: automated nudges for inactive learners (E12.2) and the funder report (E11.3).
-- Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- nudge rule per cohort

-- Off until the hub turns it on (null). When on, a learner with no learning activity for
-- nudge_after_days gets a friendly nudge; if they are still inactive nudge_escalate_days later, the
-- hub team is told so someone can follow up in person.
alter table public.cohorts add column nudge_after_days integer check (nudge_after_days between 2 and 30);
alter table public.cohorts add column nudge_escalate_days integer not null default 3 check (nudge_escalate_days between 1 and 14);
-- The funder report's executive summary, written (or drafted with AI and edited) by the hub.
alter table public.cohorts add column funder_summary text check (char_length(funder_summary) <= 4000);
grant update (nudge_after_days, nudge_escalate_days, funder_summary) on public.cohorts to app_user;

-- One row per nudge step per quiet spell. inactive_since is the learner's last activity (or the
-- cohort start) when the nudge went out; the unique key makes each step go out once per spell, and a
-- new spell (after the learner comes back) starts afresh.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  step text not null check (step in ('learner', 'team')),
  inactive_since timestamptz not null,
  emailed boolean not null default false,
  texted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (enrolment_id, step, inactive_since)
);
create index on public.nudges (cohort_id, created_at desc);
alter table public.nudges enable row level security;
-- The hub team sees what went out. Only the scheduler (system connection) writes.
grant select on public.nudges to app_user;
create policy nudges_read on public.nudges for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());

-- ---------------------------------------------------------------- learning activity

-- When each learner in a cohort last did something on Talentral: opened a lesson, answered a quiz,
-- handed in work, reviewed a classmate, attended or joined a class, or posted in the discussion.
-- "since" is the later of that and the start of the cohort (or enrolment), which is where an
-- inactive spell is counted from. Not granted to the app role: the scheduler calls it directly and
-- hub screens go through app.cohort_activity, which checks membership.
create or replace function app.cohort_activity_all(p_cohort uuid)
returns table (enrolment_id uuid, last_active_at timestamptz, since timestamptz)
language sql stable security definer set search_path = ''
as $$
  with base as (
    select e.id, a.email, greatest(e.enrolled_at, coalesce((c.starts_on::timestamp at time zone 'Africa/Lagos'), e.enrolled_at)) as start
    from public.enrolments e join public.cohorts c on c.id = e.cohort_id join public.applications a on a.id = e.application_id
    where e.cohort_id = p_cohort
  ), activity as (
    select b.id, b.start, greatest(
      (select max(lp.last_seen_at) from public.lesson_progress lp where lp.enrolment_id = b.id),
      (select max(q.submitted_at) from public.quiz_attempts q where q.enrolment_id = b.id),
      (select max(s.submitted_at) from public.submissions s where s.enrolment_id = b.id),
      (select max(pr.completed_at) from public.peer_reviews pr where pr.reviewer_enrolment_id = b.id),
      (select max(cs.starts_at) from public.attendance at join public.class_sessions cs on cs.id = at.session_id
         where at.enrolment_id = b.id and at.status in ('present', 'late')),
      (select max(j.joined_at) from public.session_joins j where j.enrolment_id = b.id),
      (select max(p.created_at) from public.discussion_posts p join public.discussion_threads t on t.id = p.thread_id join public.users u on u.id = p.author_id
         where t.cohort_id = p_cohort and u.email = b.email),
      (select max(t.created_at) from public.discussion_threads t join public.users u on u.id = t.author_id where t.cohort_id = p_cohort and u.email = b.email)
    ) as last_active
    from base b
  )
  -- Millisecond precision, so the times survive a round trip through JavaScript and match stored nudges.
  select id, date_trunc('milliseconds', last_active), date_trunc('milliseconds', greatest(last_active, start)) from activity
$$;

create or replace function app.cohort_activity(p_cohort uuid)
returns table (enrolment_id uuid, last_active_at timestamptz, since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.cohorts c where c.id = p_cohort and (app.is_member(c.tenant_id) or app.is_platform_admin())) then
    raise exception 'Not a member of this hub' using errcode = '42501';
  end if;
  return query select * from app.cohort_activity_all(p_cohort);
end
$$;

revoke all on function app.cohort_activity_all(uuid) from public;
revoke all on function app.cohort_activity(uuid) from public;
grant execute on function app.cohort_activity(uuid) to app_user;

-- ---------------------------------------------------------------- AI: report summaries

-- The funder report's executive summary can be drafted with AI from aggregate figures only.
alter table public.ai_drafts drop constraint ai_drafts_kind_check;
alter table public.ai_drafts add constraint ai_drafts_kind_check check (kind in ('programme', 'lesson', 'translation', 'quiz', 'feedback', 'report'));
