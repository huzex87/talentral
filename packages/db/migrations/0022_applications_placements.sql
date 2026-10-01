-- MVP-2 month 8: learners apply to jobs with their Passport, applications carry the rule-based
-- match (score, reasons and concerns) worked out when they applied, employers confirm hires,
-- every placement gets a 90-day retention check, and Gate G3 (pilot outcomes) is measured.
-- Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- applications

alter table public.role_candidates
  -- How the person came to the job: put forward by a talent officer, invited by the employer, or applied.
  add column source text not null default 'officer' check (source in ('officer', 'employer', 'applied')),
  add column cover_note text check (char_length(cover_note) <= 1500),
  add column applied_at timestamptz,
  add column withdrawn_at timestamptz,
  -- The match when they applied or were invited: it orders applicants and explains the order.
  add column match_score integer check (match_score between 0 and 100),
  add column match_reasons text[] not null default '{}',
  add column match_concerns text[] not null default '{}',
  add column stage_changed_at timestamptz,
  -- Placements: who confirmed the hire, and how.
  add column placement_confirmed_at timestamptz,
  add column placement_confirmed_by uuid references public.users (id) on delete set null,
  add column placement_confirmation text check (placement_confirmation in ('employer', 'officer')),
  add column placement_note text check (char_length(placement_note) <= 500),
  -- The 90-day retention check: who answered, and the reminders the scheduler sent (system only).
  add column retention_by uuid references public.users (id) on delete set null,
  add column retention_source text check (retention_source in ('employer', 'officer')),
  add column retention_note text check (char_length(retention_note) <= 500),
  add column retention_asked_at timestamptz,
  add column retention_reminded_at timestamptz;

-- Backfill in one statement (before the guard below exists). Hires recorded before this release
-- by an employer on their own invitation count as employer-confirmed.
update public.role_candidates set
  stage_changed_at = updated_at,
  source = case when invited_by_employer then 'employer' else 'officer' end,
  placement_confirmed_at = case when stage = 'placed' and invited_by_employer then updated_at end,
  placement_confirmation = case when stage = 'placed' and invited_by_employer then 'employer' end,
  retention_source = case when retained is not null then 'employer' end;

create index role_candidates_placed on public.role_candidates (start_date) where stage = 'placed';
create index role_candidates_role_interest on public.role_candidates (role_id, interest);

-- Keeps placements and retention honest whoever writes the row:
--  * a hire needs the type of work and a start date;
--  * an employer saving a hire confirms it; a hire a talent officer records waits for the
--    employer (or an officer's confirmation with a note, through app.confirm_placement);
--  * moving away from "placed" clears the confirmation and the retention check;
--  * the retention answer is only taken 90 days after the start date, and records who gave it.
create or replace function app.candidate_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_employer uuid;
  v_member boolean;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select r.employer_id into v_employer from public.job_roles r where r.id = new.role_id;
  v_member := app.uid() is not null and app.is_employer_member(v_employer);

  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;

  if new.stage = 'placed' then
    if new.placement_type is null or new.start_date is null then
      raise exception 'A hire needs the type of work and a start date' using errcode = 'P0001';
    end if;
    if v_member and new.placement_confirmed_at is null then
      new.placement_confirmed_at := now(); new.placement_confirmed_by := app.uid(); new.placement_confirmation := 'employer';
    end if;
  elsif tg_op = 'UPDATE' and old.stage = 'placed' then
    new.placement_confirmed_at := null; new.placement_confirmed_by := null; new.placement_confirmation := null; new.placement_note := null;
    new.retained := null; new.retention_checked_at := null; new.retention_by := null; new.retention_source := null; new.retention_note := null;
    new.retention_asked_at := null; new.retention_reminded_at := null;
  end if;

  if tg_op = 'UPDATE' and new.retained is distinct from old.retained and new.retained is not null then
    if new.stage <> 'placed' or new.start_date > v_today - 90 then
      raise exception 'The 90-day check opens 90 days after the start date' using errcode = 'P0001';
    end if;
    new.retention_checked_at := now();
    new.retention_by := app.uid();
    new.retention_source := case when v_member then 'employer' else 'officer' end;
    -- Answering the 90-day check confirms the hire too.
    if v_member and new.placement_confirmed_at is null then
      new.placement_confirmed_at := now(); new.placement_confirmed_by := app.uid(); new.placement_confirmation := 'employer';
    end if;
  end if;
  return new;
end
$$;
create trigger role_candidates_guard before insert or update on public.role_candidates
  for each row execute function app.candidate_guard();

-- A learner applies to a job on the board with their Passport. Applying says yes to this
-- employer: they see the Passport and contact details, so Passport sharing must be on. An
-- invitation they had not answered becomes an application. Ten applications a day at most.
-- Returns the application and who at the employer to tell.
create or replace function app.apply_to_job(p_role uuid, p_note text, p_score integer, p_reasons text[], p_concerns text[])
returns table (candidate_id uuid, role_title text, employer_name text, notify text[])
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := app.uid();
  v_job record;
  v_existing public.role_candidates;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.passports p where p.user_id = v_uid) then
    raise exception 'Create your Passport first' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.passports p where p.user_id = v_uid and p.employer_sharing) then
    raise exception 'Turn on sharing with employers first' using errcode = 'P0001';
  end if;
  select b.id, b.title, b.employer_id, b.employer_name into v_job from app.job_board() b where b.id = p_role;
  if v_job.id is null then raise exception 'This job is no longer open' using errcode = 'P0001'; end if;
  if (select count(*) from public.role_candidates c where c.user_id = v_uid and c.applied_at >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')) >= 10 then
    raise exception 'You can apply to 10 jobs a day' using errcode = 'P0001';
  end if;

  select * into v_existing from public.role_candidates c where c.role_id = p_role and c.user_id = v_uid;
  if v_existing.id is not null then
    if v_existing.stage in ('declined', 'placed') then raise exception 'This job is no longer open' using errcode = 'P0001'; end if;
    if v_existing.interest = 'confirmed' then raise exception 'You have already applied' using errcode = 'P0001'; end if;
    update public.role_candidates set interest = 'confirmed', interest_at = now(), applied_at = now(), withdrawn_at = null,
      cover_note = nullif(trim(p_note), ''), match_score = greatest(0, least(100, p_score)), match_reasons = coalesce(p_reasons[1:8], '{}'),
      match_concerns = coalesce(p_concerns[1:8], '{}')
    where id = v_existing.id returning id into v_id;
  else
    insert into public.role_candidates (role_id, user_id, added_by, source, interest, interest_at, applied_at, cover_note, match_score, match_reasons, match_concerns)
    values (p_role, v_uid, v_uid, 'applied', 'confirmed', now(), now(), nullif(trim(p_note), ''), greatest(0, least(100, p_score)),
            coalesce(p_reasons[1:8], '{}'), coalesce(p_concerns[1:8], '{}'))
    returning id into v_id;
  end if;

  return query
  select v_id, v_job.title, v_job.employer_name,
    coalesce((select array_agg(distinct u.email::text) from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = v_job.employer_id), '{}');
end
$$;

-- The learner withdraws an application (or an invitation they said yes to). The employer no
-- longer sees them. Not after a hire.
create or replace function app.withdraw_application(p_candidate uuid) returns boolean
language sql security definer set search_path = ''
as $$
  with u as (
    update public.role_candidates set interest = 'declined', interest_at = now(), withdrawn_at = now()
    where id = p_candidate and user_id = app.uid() and interest = 'confirmed' and stage not in ('placed', 'declined')
    returning 1)
  select exists (select 1 from u)
$$;

-- The learner's opportunities and applications, with where each one stands.
drop function app.my_opportunities();
create function app.my_opportunities()
returns table (id uuid, role_id uuid, role_title text, employer_name text, description text, work_mode text, job_type text, state text,
               pay_min integer, pay_max integer, interest text, interest_at timestamptz, stage text, created_at timestamptz,
               employer_views bigint, last_viewed_at timestamptz, invited_by_employer boolean, source text, applied_at timestamptz,
               withdrawn_at timestamptz, cover_note text, stage_changed_at timestamptz, start_date date, placement_type text,
               placement_confirmed boolean, retained boolean, role_status text, on_board boolean, match_reasons text[], match_concerns text[])
language sql stable security definer set search_path = ''
as $$
  select rc.id, r.id, r.title, e.name, r.description, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max,
         rc.interest, rc.interest_at, rc.stage, rc.created_at,
         (select count(*) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at),
         (select max(v.viewed_at) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at),
         rc.invited_by_employer, rc.source, rc.applied_at, rc.withdrawn_at, rc.cover_note, rc.stage_changed_at, rc.start_date, rc.placement_type,
         rc.placement_confirmed_at is not null, rc.retained, r.status,
         exists (select 1 from app.job_board() b where b.id = r.id), rc.match_reasons, rc.match_concerns
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id join public.employers e on e.id = r.employer_id
  where rc.user_id = app.uid()
  order by coalesce(rc.applied_at, rc.created_at) desc
$$;

-- ---------------------------------------------------------------- placements

-- Confirms a hire. An employer member confirms their own; a talent officer confirms on the
-- employer's behalf only with a note of how the employer confirmed it (10+ characters). Audited.
create or replace function app.confirm_placement(p_candidate uuid, p_note text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_employer uuid; v_stage text;
begin
  select r.employer_id, rc.stage into v_employer, v_stage
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id where rc.id = p_candidate;
  if v_employer is null or v_stage <> 'placed' then return false; end if;
  if app.is_verified_employer_member(v_employer) then
    update public.role_candidates set placement_confirmed_at = now(), placement_confirmed_by = app.uid(), placement_confirmation = 'employer',
      placement_note = nullif(trim(p_note), '')
    where id = p_candidate;
  elsif app.is_platform_admin() then
    if char_length(trim(coalesce(p_note, ''))) < 10 then
      raise exception 'Say how the employer confirmed the hire' using errcode = 'P0001';
    end if;
    update public.role_candidates set placement_confirmed_at = now(), placement_confirmed_by = app.uid(), placement_confirmation = 'officer',
      placement_note = trim(p_note)
    where id = p_candidate;
  else
    raise exception 'Only the employer or a talent officer can confirm a hire' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'placement.confirmed', 'role_candidate', p_candidate, jsonb_build_object('by', case when app.is_platform_admin() and not app.is_employer_member(v_employer) then 'officer' else 'employer' end));
  return true;
end
$$;

-- A talent officer records the 90-day answer when the employer has not, with a note of how they
-- found out (10+ characters). Audited.
create or replace function app.record_retention(p_candidate uuid, p_retained boolean, p_note text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_platform_admin() then raise exception 'Talent officers only' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Say how you checked' using errcode = 'P0001';
  end if;
  update public.role_candidates set retained = p_retained, retention_note = trim(p_note) where id = p_candidate and stage = 'placed';
  if not found then return false; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'placement.retention', 'role_candidate', p_candidate, jsonb_build_object('retained', p_retained));
  return true;
end
$$;

-- ---------------------------------------------------------------- Gate G3

-- One row per enrolment, for the pilot outcomes gate: whether the cohort has ended, whether the
-- learner completed, whether their readiness was assessed (a certificate under the published
-- readiness rules, or a Passport a talent officer verified), and their work outcome. Booleans
-- only, never employers. Hub owners and admins see their hub; the platform sees every active
-- hub with a null tenant.
create or replace function app.g3_enrolments(p_tenant uuid)
returns table (enrolment_id uuid, tenant_id uuid, hub text, cohort_id uuid, cohort text, cohort_ended boolean, status text,
               assessed boolean, placed boolean, confirmed boolean, retained boolean, retention_due boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_tenant is null and not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if p_tenant is not null and not (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
  return query
  select e.id, c.tenant_id, t.name, c.id, c.name,
    coalesce(c.ends_on < (now() at time zone 'Africa/Lagos')::date, false), e.status,
    exists (select 1 from public.certificates cert where cert.enrolment_id = e.id and cert.revoked_at is null)
      or coalesce(pp.verified_at is not null, false),
    coalesce(pl.placed, false), coalesce(pl.confirmed, false), pl.retained, coalesce(pl.retention_due, false)
  from public.enrolments e
  join public.cohorts c on c.id = e.cohort_id
  join public.tenants t on t.id = c.tenant_id
  join public.applications a on a.id = e.application_id
  left join public.users u on u.email = a.email
  left join public.passports pp on pp.user_id = u.id
  left join lateral (
    select true as placed, bool_or(rc.placement_confirmed_at is not null) as confirmed,
      -- Retained when any confirmed hire is; left when every answered check says so.
      case when bool_or(rc.retained) then true when bool_and(rc.retained = false) then false end as retained,
      bool_or(rc.retained is null and rc.start_date <= (now() at time zone 'Africa/Lagos')::date - 90) as retention_due
    from public.role_candidates rc where rc.user_id = u.id and rc.stage = 'placed'
    having count(*) > 0) pl on true
  where (p_tenant is null and t.status = 'active') or c.tenant_id = p_tenant;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['app.apply_to_job(uuid, text, integer, text[], text[])', 'app.withdraw_application(uuid)', 'app.my_opportunities()',
    'app.confirm_placement(uuid, text)', 'app.record_retention(uuid, boolean, text)', 'app.g3_enrolments(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.candidate_guard() from public;
