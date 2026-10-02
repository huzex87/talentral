-- MVP-2 month 9: custom domains for hubs, white-label emails and learning paths (a cohort working
-- through several courses in order). Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- domains and email branding

alter table public.tenants
  -- Custom domain: the hub's own address (apply.kirkirahub.ng), proven with a DNS TXT record.
  add column custom_domain text unique check (custom_domain ~ '^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  add column domain_token text check (char_length(domain_token) <= 64),
  add column domain_status text check (domain_status in ('pending', 'verified', 'failed')),
  add column domain_checked_at timestamptz,
  add column domain_verified_at timestamptz,
  add column domain_error text check (char_length(domain_error) <= 300),
  -- White-label emails: who learners' emails come from, where replies go, and a footer line.
  add column email_from_name text check (char_length(email_from_name) between 2 and 60 and email_from_name !~ '[<>"@\r\n]'),
  add column email_reply_to citext check (char_length(email_reply_to) <= 254),
  add column email_footer text check (char_length(email_footer) <= 300);
grant update (email_from_name, email_reply_to, email_footer) on public.tenants to app_user;

-- ---------------------------------------------------------------- custom domains

-- Owners and admins set (or remove, with null) their hub's own domain. A new token is issued for
-- the DNS TXT record; the domain is pending until checked.
create or replace function app.set_custom_domain(p_tenant uuid, p_domain text) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_domain text := nullif(lower(trim(trailing '.' from trim(coalesce(p_domain, '')))), ''); v_token text;
begin
  if not (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
  if v_domain is not null and exists (select 1 from public.tenants t where t.custom_domain = v_domain and t.id <> p_tenant) then
    raise exception 'Another hub uses this domain' using errcode = '23505';
  end if;
  v_token := case when v_domain is null then null else 'talentral-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) end;
  update public.tenants set custom_domain = v_domain, domain_token = v_token, domain_status = case when v_domain is null then null else 'pending' end,
    domain_checked_at = null, domain_verified_at = null, domain_error = null
  where id = p_tenant;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (p_tenant, app.uid(), case when v_domain is null then 'hub.domain_removed' else 'hub.domain_set' end, 'tenant', p_tenant, jsonb_build_object('domain', v_domain));
  return v_token;
end
$$;

-- Records the result of a DNS check made by the server.
create or replace function app.record_domain_check(p_tenant uuid, p_ok boolean, p_error text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_was text;
begin
  if not (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
  select domain_status into v_was from public.tenants where id = p_tenant and custom_domain is not null;
  if not found then return false; end if;
  update public.tenants set domain_status = case when p_ok then 'verified' else 'failed' end, domain_checked_at = now(),
    domain_verified_at = case when p_ok then coalesce(domain_verified_at, now()) end, domain_error = case when p_ok then null else left(p_error, 300) end
  where id = p_tenant;
  if p_ok and v_was is distinct from 'verified' then
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id) values (p_tenant, app.uid(), 'hub.domain_verified', 'tenant', p_tenant);
  end if;
  return true;
end
$$;

-- Which live hub a verified custom domain belongs to (for routing requests). Anyone may ask.
create or replace function app.hub_for_domain(p_host text) returns text
language sql stable security definer set search_path = ''
as $$
  select t.slug from public.tenants t
  where t.custom_domain = lower(p_host) and t.domain_status = 'verified' and t.status = 'active'
$$;

-- ---------------------------------------------------------------- learning paths

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  title_ha text check (char_length(title_ha) <= 120),
  summary text check (char_length(summary) <= 600),
  summary_ha text check (char_length(summary_ha) <= 600),
  outcome text check (char_length(outcome) <= 120), -- the role it leads to, e.g. "Junior frontend developer"
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- Each course opens once the previous one is done; otherwise all open together.
  sequential boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.learning_paths (tenant_id);
create trigger learning_paths_touch before update on public.learning_paths for each row execute function app.touch();

create table public.learning_path_courses (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  position integer not null default 0,
  primary key (path_id, course_id)
);
create index on public.learning_path_courses (course_id);

alter table public.learning_paths enable row level security;
alter table public.learning_path_courses enable row level security;
create policy paths_read on public.learning_paths for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy paths_write on public.learning_paths for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());
create policy path_courses_read on public.learning_path_courses for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy path_courses_write on public.learning_path_courses for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.learning_paths p where p.id = learning_path_courses.path_id and p.tenant_id = learning_path_courses.tenant_id)
              and exists (select 1 from public.courses c where c.id = learning_path_courses.course_id and c.tenant_id = learning_path_courses.tenant_id));
grant select, insert, delete on public.learning_paths, public.learning_path_courses to app_user;
grant update (title, title_ha, summary, summary_ha, outcome, status, sequential) on public.learning_paths to app_user;
grant update (position) on public.learning_path_courses to app_user;

-- A cohort follows one course or one learning path, from its own hub.
alter table public.cohorts add column path_id uuid references public.learning_paths (id) on delete set null;
alter table public.cohorts add constraint cohorts_course_or_path check (course_id is null or path_id is null);
grant update (path_id) on public.cohorts to app_user;

create or replace function app.cohort_content_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.course_id is not null and (tg_op = 'INSERT' or new.course_id is distinct from old.course_id)
     and not exists (select 1 from public.courses c where c.id = new.course_id and c.tenant_id = new.tenant_id) then
    raise exception 'Choose a course from this hub' using errcode = '42501';
  end if;
  if new.path_id is not null and (tg_op = 'INSERT' or new.path_id is distinct from old.path_id)
     and not exists (select 1 from public.learning_paths p where p.id = new.path_id and p.tenant_id = new.tenant_id) then
    raise exception 'Choose a learning path from this hub' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger cohorts_content_guard before insert or update on public.cohorts for each row execute function app.cohort_content_guard();

-- Platform staff helping a hub (a support session, E13.1) can also set what a cohort studies, as
-- they already can edit course content and grade (0015).
create policy cohorts_update_platform on public.cohorts for update to app_user
  using (app.is_platform_admin())
  with check (app.is_platform_admin() and exists (select 1 from public.programmes p where p.id = cohorts.programme_id and p.tenant_id = cohorts.tenant_id));

-- The published courses a cohort studies, in order: its single course, or its path's courses.
create or replace function app.cohort_course_list(p_cohort uuid)
returns table (course_id uuid, step integer)
language sql stable security definer set search_path = ''
as $$
  select c.id, 0 from public.cohorts co join public.courses c on c.id = co.course_id and c.status = 'published'
  where co.id = p_cohort
  union all
  select c.id, (row_number() over (order by pc.position, c.created_at))::int - 1
  from public.cohorts co
  join public.learning_paths lp on lp.id = co.path_id and lp.status = 'published'
  join public.learning_path_courses pc on pc.path_id = lp.id
  join public.courses c on c.id = pc.course_id and c.status = 'published'
  where co.id = p_cohort
$$;

-- The caller's courses in a cohort with their progress, and which are open: in a sequential path
-- a course opens once every lesson before it is done (completed, handed in, or a quiz passed).
create or replace function app.my_cohort_courses(p_cohort uuid)
returns table (course_id uuid, course_title text, course_title_ha text, step integer, lessons bigint, done bigint, open boolean)
language sql stable security definer set search_path = ''
as $$
  with me as (select app.my_enrolment(p_cohort) as enrolment),
  list as (
    select l.course_id, c.title, l.step,
      (select count(*) from public.lessons x where x.course_id = l.course_id) as lessons,
      (select count(*) from public.lessons x where x.course_id = l.course_id and (
         exists (select 1 from public.lesson_progress lp where lp.enrolment_id = me.enrolment and lp.lesson_id = x.id and lp.completed_at is not null)
         or exists (select 1 from public.submissions s where s.enrolment_id = me.enrolment and s.lesson_id = x.id)
         or exists (select 1 from public.quiz_attempts qa where qa.enrolment_id = me.enrolment and qa.lesson_id = x.id and qa.passed))) as done
    from me cross join app.cohort_course_list(p_cohort) l join public.courses c on c.id = l.course_id
    where me.enrolment is not null
  ),
  seq as (select coalesce((select lp.sequential from public.cohorts co join public.learning_paths lp on lp.id = co.path_id where co.id = p_cohort), false) as on_)
  select list.course_id, list.title, null::text, list.step, list.lessons, list.done,
    not seq.on_ or coalesce(sum(list.lessons - list.done) over (order by list.step rows between unbounded preceding and 1 preceding), 0) = 0
  from list cross join seq
  order by list.step
$$;

-- Lessons open to the caller: enrolled, in an open course of the cohort, module unlock date reached.
create or replace function app.lesson_open(p_cohort uuid, p_lesson uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.my_enrolment(p_cohort) is not null and exists (
    select 1 from public.lessons l
    join public.course_modules m on m.id = l.module_id
    join app.my_cohort_courses(p_cohort) mc on mc.course_id = l.course_id and mc.open
    join public.cohorts co on co.id = p_cohort
    where l.id = p_lesson
      and (m.unlock_after_days is null or co.starts_on is null or co.starts_on + m.unlock_after_days <= (now() at time zone 'Africa/Lagos')::date))
$$;

-- Everything a learner is studying. For a path, course_id is the course they are on now (the
-- first open one not finished, or the last), and the counts cover the whole path.
drop function app.learner_courses();
create function app.learner_courses()
returns table (cohort_id uuid, cohort_name text, hub_name text, hub_slug text, programme_title text, course_id uuid, course_title text,
               starts_on date, ends_on date, enrolment_status text, lessons bigint, completed bigint, last_lesson uuid,
               path_id uuid, path_title text, path_title_ha text, courses_total integer, courses_done integer, course_step integer)
language sql stable security definer set search_path = ''
as $$
  select co.id, co.name, t.name, t.slug, p.title, cur.course_id, cur.course_title, co.starts_on, co.ends_on, e.status,
    coalesce(agg.lessons, 0), coalesce(agg.done, 0),
    (select lp.lesson_id from public.lesson_progress lp where lp.enrolment_id = e.id order by lp.last_seen_at desc limit 1),
    path.id, path.title, path.title_ha, coalesce(agg.courses, 0)::int, coalesce(agg.courses_done, 0)::int, cur.step
  from public.users u
  join public.applications a on a.email = u.email
  join public.enrolments e on e.application_id = a.id and e.status <> 'dropped'
  join public.cohorts co on co.id = e.cohort_id
  join public.programmes p on p.id = co.programme_id
  join public.tenants t on t.id = co.tenant_id
  left join public.learning_paths path on path.id = co.path_id and path.status = 'published'
  left join lateral (
    select sum(mc.lessons) as lessons, sum(mc.done) as done, count(*) as courses, count(*) filter (where mc.lessons > 0 and mc.done >= mc.lessons) as courses_done
    from app.my_cohort_courses(co.id) mc) agg on true
  left join lateral (
    select mc.course_id, mc.course_title, mc.step from app.my_cohort_courses(co.id) mc where mc.open
    order by (mc.lessons > 0 and mc.done >= mc.lessons), case when mc.lessons > 0 and mc.done >= mc.lessons then -mc.step else mc.step end
    limit 1) cur on true
  where u.id = app.uid()
  order by co.starts_on desc nulls last
$$;

-- A cohort's outline for the learner: every lesson of every course, whether it is open and done.
drop function app.learner_outline(uuid);
create function app.learner_outline(p_cohort uuid)
returns table (module_id uuid, module_title text, module_title_ha text, module_position integer, opens_on date,
               lesson_id uuid, kind text, title text, title_ha text, minutes integer, lesson_position integer, open boolean, completed boolean,
               passed boolean, submission_status text, course_id uuid, course_title text, course_step integer, course_open boolean)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.title, m.title_ha, m.position,
    case when m.unlock_after_days is null or co.starts_on is null then null else co.starts_on + m.unlock_after_days end,
    l.id, l.kind, l.title, l.title_ha, l.minutes, l.position,
    mc.open and (m.unlock_after_days is null or co.starts_on is null or co.starts_on + m.unlock_after_days <= (now() at time zone 'Africa/Lagos')::date),
    exists (select 1 from public.lesson_progress lp where lp.enrolment_id = e.id and lp.lesson_id = l.id and lp.completed_at is not null)
      or exists (select 1 from public.submissions s where s.enrolment_id = e.id and s.lesson_id = l.id and s.status = 'graded'),
    exists (select 1 from public.quiz_attempts qa where qa.enrolment_id = e.id and qa.lesson_id = l.id and qa.passed),
    (select s.status from public.submissions s where s.enrolment_id = e.id and s.lesson_id = l.id order by s.submitted_at desc limit 1),
    mc.course_id, mc.course_title, mc.step, mc.open
  from public.cohorts co
  join app.my_cohort_courses(p_cohort) mc on true
  join public.course_modules m on m.course_id = mc.course_id
  join public.lessons l on l.module_id = m.id
  join public.enrolments e on e.id = app.my_enrolment(p_cohort)
  where co.id = p_cohort
  order by mc.step, m.position, m.created_at, l.position, l.created_at
$$;

-- A hub's published learning paths with their courses, for its public page.
create or replace function app.hub_paths(p_tenant uuid)
returns table (id uuid, title text, title_ha text, summary text, summary_ha text, outcome text, courses text[], lessons bigint, minutes bigint)
language sql stable security definer set search_path = ''
as $$
  select lp.id, lp.title, lp.title_ha, lp.summary, lp.summary_ha, lp.outcome,
    coalesce((select array_agg(c.title order by pc.position, c.created_at) from public.learning_path_courses pc join public.courses c on c.id = pc.course_id and c.status = 'published'
              where pc.path_id = lp.id), '{}'),
    (select count(*) from public.learning_path_courses pc join public.courses c on c.id = pc.course_id and c.status = 'published' join public.lessons l on l.course_id = c.id where pc.path_id = lp.id),
    (select coalesce(sum(l.minutes), 0) from public.learning_path_courses pc join public.courses c on c.id = pc.course_id and c.status = 'published' join public.lessons l on l.course_id = c.id where pc.path_id = lp.id)
  from public.learning_paths lp join public.tenants t on t.id = lp.tenant_id
  where lp.tenant_id = p_tenant and lp.status = 'published' and (t.status = 'active' or app.is_member(t.id) or app.is_platform_admin())
  order by lp.created_at
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.set_custom_domain(uuid, text)', 'app.record_domain_check(uuid, boolean, text)', 'app.hub_for_domain(text)',
    'app.cohort_course_list(uuid)', 'app.my_cohort_courses(uuid)', 'app.lesson_open(uuid, uuid)', 'app.learner_courses()', 'app.learner_outline(uuid)',
    'app.hub_paths(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.cohort_content_guard() from public;
