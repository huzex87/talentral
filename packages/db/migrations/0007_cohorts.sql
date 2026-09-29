-- Running the programme: cohorts, who is enrolled, the session timetable and attendance.
-- Evidence for the cohort-completion milestone comes from these tables.

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  programme_id uuid not null references public.programmes (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  starts_on date,
  ends_on date,
  min_attendance integer not null default 75 check (min_attendance between 0 and 100),
  status text not null default 'planned' check (status in ('planned', 'running', 'completed')),
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index on public.cohorts (tenant_id, programme_id);

-- One place per application: a learner belongs to one cohort of a programme.
create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  application_id uuid not null unique references public.applications (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'dropped')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  dropped_reason text check (char_length(dropped_reason) <= 300)
);
create index on public.enrolments (cohort_id);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null default 'in_person' check (mode in ('in_person', 'online', 'hybrid')),
  location text check (char_length(location) <= 300),
  facilitator text check (char_length(facilitator) <= 120),
  checkin_code text not null check (checkin_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  checkin_open boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.class_sessions (cohort_id, starts_at);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  method text not null default 'register' check (method in ('register', 'self')),
  marked_by uuid references public.users (id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (session_id, enrolment_id)
);
create index on public.attendance (enrolment_id);

alter table public.cohorts enable row level security;
alter table public.enrolments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;

-- Hub teams read everything about their cohorts; owners and admins shape them.
create policy cohorts_read on public.cohorts for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy cohorts_write on public.cohorts for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.programmes p where p.id = cohorts.programme_id and p.tenant_id = cohorts.tenant_id));

create policy enrolments_read on public.enrolments for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
-- Only accepted applicants of the cohort's own programme can be enrolled.
create policy enrolments_insert on public.enrolments for insert to app_user
  with check (app.has_role(tenant_id, array['owner', 'admin']) and exists (
    select 1 from public.cohorts c join public.applications a on a.programme_id = c.programme_id
    where c.id = enrolments.cohort_id and c.tenant_id = enrolments.tenant_id
      and a.id = enrolments.application_id and a.tenant_id = enrolments.tenant_id and a.status = 'accepted'));
create policy enrolments_update on public.enrolments for update to app_user
  using (app.has_role(tenant_id, array['owner', 'admin'])) with check (app.has_role(tenant_id, array['owner', 'admin']));

create policy class_sessions_read on public.class_sessions for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy class_sessions_write on public.class_sessions for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.cohorts c where c.id = class_sessions.cohort_id and c.tenant_id = class_sessions.tenant_id));

-- Any team member can take the register (facilitators are often reviewers), for their own hub only,
-- and only for learners enrolled in that session's cohort.
create policy attendance_read on public.attendance for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy attendance_insert on public.attendance for insert to app_user
  with check (app.is_member(tenant_id) and marked_by = app.uid() and exists (
    select 1 from public.class_sessions s join public.enrolments e on e.cohort_id = s.cohort_id
    where s.id = attendance.session_id and s.tenant_id = attendance.tenant_id
      and e.id = attendance.enrolment_id and e.tenant_id = attendance.tenant_id));
create policy attendance_update on public.attendance for update to app_user
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id) and marked_by = app.uid());

grant select on public.cohorts, public.enrolments, public.class_sessions, public.attendance to app_user;
grant insert, delete on public.cohorts to app_user;
grant update (name, starts_on, ends_on, min_attendance, status) on public.cohorts to app_user;
grant insert on public.enrolments to app_user;
grant update (status, completed_at, dropped_reason) on public.enrolments to app_user;
grant insert, delete on public.class_sessions to app_user;
grant update (title, starts_at, ends_at, mode, location, facilitator, checkin_code, checkin_open) on public.class_sessions to app_user;
grant insert on public.attendance to app_user;
grant update (status, method, marked_by, marked_at) on public.attendance to app_user;

-- Learners check themselves in with the session code and their reference number or phone.
-- Works only while staff have check-in open for that session and until two hours after it ends.
-- Arriving more than 15 minutes after the start counts as late. A register mark by staff wins.
create or replace function app.self_checkin(p_hub text, p_code text, p_identity text)
returns table (learner text, session_title text, status text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  s record;
  e record;
  ident text := upper(regexp_replace(coalesce(p_identity, ''), '\s', '', 'g'));
  digits text := right(regexp_replace(coalesce(p_identity, ''), '\D', '', 'g'), 10);
  mark text;
begin
  select ss.* into s from public.class_sessions ss join public.tenants t on t.id = ss.tenant_id
  where t.slug = p_hub and t.status = 'active' and ss.checkin_code = upper(trim(p_code))
    and ss.checkin_open and now() between ss.starts_at - interval '1 hour' and ss.ends_at + interval '2 hours';
  if s.id is null then raise exception 'Check-in is not open for this code' using errcode = 'P0001'; end if;

  select en.id, a.full_name into e from public.enrolments en join public.applications a on a.id = en.application_id
  where en.cohort_id = s.cohort_id and en.status = 'active'
    and (a.reference = ident or (length(digits) = 10 and right(regexp_replace(a.phone, '\D', '', 'g'), 10) = digits))
  limit 1;
  if e.id is null then raise exception 'We could not find you in this cohort' using errcode = 'P0002'; end if;

  mark := case when now() > s.starts_at + interval '15 minutes' then 'late' else 'present' end;
  insert into public.attendance (tenant_id, session_id, enrolment_id, status, method)
  values (s.tenant_id, s.id, e.id, mark, 'self')
  on conflict (session_id, enrolment_id) do nothing;
  return query select e.full_name, s.title,
    (select at.status from public.attendance at where at.session_id = s.id and at.enrolment_id = e.id);
end $$;

revoke all on function app.self_checkin(text, text, text) from public;
grant execute on function app.self_checkin(text, text, text) to app_user;
