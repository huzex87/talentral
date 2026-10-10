-- Staff weekly summary emails and hub cover photos. Additive only: previews share this database
-- with production.

-- Each hub team member gets a short summary of the week by email on Monday morning (West Africa
-- Time) unless they turn it off. digest_sent_on is the Monday it last went out, claimed before
-- sending so overlapping scheduler runs never send twice.
alter table public.memberships
  add column weekly_digest boolean not null default true,
  add column digest_sent_on date;

-- Staff turn their own summary on or off; nobody else's.
create function app.set_weekly_digest(p_tenant uuid, p_on boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.memberships set weekly_digest = p_on where tenant_id = p_tenant and user_id = app.uid()
$$;
revoke all on function app.set_weekly_digest(uuid, boolean) from public;
grant execute on function app.set_weekly_digest(uuid, boolean) to app_user;

-- A wide photo for the top of the hub's public page, uploaded by the hub on its profile.
alter table public.tenants add column cover_path text;
grant update (cover_path) on public.tenants to app_user;

-- The learner home's streak: consecutive days (West Africa Time) with any learning activity,
-- counted while the run reaches today or yesterday, and the active days in the last week.
create function app.my_activity()
returns table (streak integer, week integer)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select distinct d.day from public.activity_days d
    join public.enrolments e on e.id = d.enrolment_id
    join public.applications a on a.id = e.application_id
    join public.users u on u.email = a.email
    where u.id = app.uid()
  ), today as (select (now() at time zone 'Africa/Lagos')::date as t),
  runs as (select day, day - (row_number() over (order by day))::integer as grp from mine),
  latest as (select max(day) as d from mine)
  select
    coalesce((select count(*)::integer from runs where grp = (select grp from runs where day = (select d from latest))
      and (select d from latest) >= (select t from today) - 1), 0),
    (select count(*)::integer from mine where day > (select t from today) - 7)
$$;
revoke all on function app.my_activity() from public;
grant execute on function app.my_activity() to app_user;

-- A Passport photo, uploaded by the learner. Served only to people who can already see the
-- Passport (the passports_read policy), and removed with the account.
alter table public.passports add column photo_path text;
grant update (photo_path) on public.passports to app_user;

-- Results a hub's public page shows: learners trained, certificates issued and learners placed in
-- work. Counts only, never names; a hub with nothing to show yet shows nothing.
create function app.hub_results(p_tenant uuid)
returns table (learners integer, certified integer, placed integer)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::integer from public.enrolments e join public.tenants t on t.id = e.tenant_id
      where e.tenant_id = p_tenant and t.status = 'active' and e.status <> 'dropped'),
    (select count(*)::integer from public.certificates c where c.tenant_id = p_tenant and c.revoked_at is null),
    (select count(distinct rc.user_id)::integer from public.role_candidates rc join public.users u on u.id = rc.user_id
      join public.applications a on a.email = u.email and a.tenant_id = p_tenant join public.enrolments e on e.application_id = a.id
      where rc.stage = 'placed')
$$;
revoke all on function app.hub_results(uuid) from public;
grant execute on function app.hub_results(uuid) to app_user;
