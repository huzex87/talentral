-- Sprint 7 "Live": join links with attendance on join, a rotating QR for in-person check-in,
-- facilitator confirmation of the register, recordings, reminders and cohort announcements.
-- Additive only.

alter table public.class_sessions
  add column meeting_url text check (char_length(meeting_url) <= 500),
  add column recording_url text check (char_length(recording_url) <= 500),
  -- Signs the rotating QR code; never leaves the database except as short-lived tokens.
  add column qr_secret text not null default md5(gen_random_uuid()::text || clock_timestamp()::text),
  add column attendance_confirmed_at timestamptz,
  add column attendance_confirmed_by uuid references public.users (id) on delete set null,
  add column reminded_day_at timestamptz,
  add column reminded_soon_at timestamptz;
grant update (meeting_url, recording_url) on public.class_sessions to app_user;

alter table public.attendance drop constraint attendance_method_check;
alter table public.attendance add constraint attendance_method_check check (method in ('register', 'self', 'join', 'qr'));

create table public.session_joins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index on public.session_joins (session_id, enrolment_id);
alter table public.session_joins enable row level security;
create policy session_joins_read on public.session_joins for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
grant select on public.session_joins to app_user;

-- ---------------------------------------------------------------- announcements

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  channels text[] not null default '{}' check (channels <@ array['email', 'sms']),
  recipients integer not null default 0,
  emailed integer not null default 0,
  texted integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.announcements (cohort_id, created_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, enrolment_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
create policy announcements_read on public.announcements for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy announcements_insert on public.announcements for insert to app_user
  with check (app.has_role(tenant_id, array['owner', 'admin']) and author_id = app.uid()
              and exists (select 1 from public.cohorts c where c.id = announcements.cohort_id and c.tenant_id = announcements.tenant_id));
create policy announcements_update on public.announcements for update to app_user
  using (author_id = app.uid()) with check (author_id = app.uid());
create policy announcement_reads_read on public.announcement_reads for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
grant select, insert on public.announcements to app_user;
grant update (recipients, emailed, texted) on public.announcements to app_user;
grant select on public.announcement_reads to app_user;

-- ---------------------------------------------------------------- functions

-- The QR token for a minute: the first 10 hex characters of sha256(secret:minute). A token is
-- accepted during its minute and the next, so a scan across the change still works.
create or replace function app.qr_token(p_secret text, p_minute bigint) returns text
language sql immutable set search_path = ''
as $$ select substr(encode(sha256(convert_to(p_secret || ':' || p_minute, 'UTF8')), 'hex'), 1, 10) $$;

-- The current token for the room screen; hub team only.
create or replace function app.session_qr(p_session uuid) returns table (token text, minute bigint)
language sql stable security definer set search_path = ''
as $$
  select app.qr_token(s.qr_secret, floor(extract(epoch from now()) / 60)::bigint), floor(extract(epoch from now()) / 60)::bigint
  from public.class_sessions s where s.id = p_session and app.is_member(s.tenant_id)
$$;

-- A learner joins an online session: returns the meeting link, logs the join, and marks them
-- present (late after 15 minutes) unless staff have marked them or confirmed the register.
create or replace function app.join_session(p_session uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare s public.class_sessions; v_enrolment uuid;
begin
  select * into s from public.class_sessions where id = p_session;
  if not found then raise exception 'Session not found' using errcode = 'P0001'; end if;
  v_enrolment := app.my_enrolment(s.cohort_id);
  if v_enrolment is null then raise exception 'Session not found' using errcode = 'P0001'; end if;
  if s.meeting_url is null then raise exception 'This session has no link' using errcode = 'P0001'; end if;
  if now() < s.starts_at - interval '10 minutes' then raise exception 'Not open yet' using errcode = 'P0002'; end if;
  if now() > s.ends_at then raise exception 'This session has ended' using errcode = 'P0003'; end if;
  insert into public.session_joins (tenant_id, session_id, enrolment_id) values (s.tenant_id, s.id, v_enrolment);
  if s.attendance_confirmed_at is null then
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method)
    values (s.tenant_id, s.id, v_enrolment, case when now() > s.starts_at + interval '15 minutes' then 'late' else 'present' end, 'join')
    on conflict (session_id, enrolment_id) do nothing;
  end if;
  return s.meeting_url;
end
$$;

-- A signed-in learner scans the room's QR code.
create or replace function app.qr_checkin(p_session uuid, p_token text)
returns table (session_title text, status text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare s public.class_sessions; v_enrolment uuid; v_minute bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  select * into s from public.class_sessions where id = p_session;
  if not found or p_token is null
     or p_token not in (app.qr_token(s.qr_secret, v_minute), app.qr_token(s.qr_secret, v_minute - 1)) then
    raise exception 'This code has expired. Scan the screen again.' using errcode = 'P0001';
  end if;
  v_enrolment := app.my_enrolment(s.cohort_id);
  if v_enrolment is null then raise exception 'You are not in this cohort' using errcode = 'P0002'; end if;
  if now() not between s.starts_at - interval '1 hour' and s.ends_at + interval '2 hours' then
    raise exception 'Check-in is closed for this session' using errcode = 'P0003';
  end if;
  if s.attendance_confirmed_at is null then
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method)
    values (s.tenant_id, s.id, v_enrolment, case when now() > s.starts_at + interval '15 minutes' then 'late' else 'present' end, 'qr')
    on conflict (session_id, enrolment_id) do nothing;
  end if;
  return query select s.title, (select a.status from public.attendance a where a.session_id = s.id and a.enrolment_id = v_enrolment);
end
$$;

-- The facilitator confirms the register: anyone not marked is recorded absent and the list is final.
create or replace function app.confirm_attendance(p_session uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare s public.class_sessions; v_absent integer;
begin
  select * into s from public.class_sessions where id = p_session;
  if not found or not app.is_member(s.tenant_id) then raise exception 'Session not found' using errcode = '42501'; end if;
  if s.starts_at > now() then raise exception 'This session has not happened yet' using errcode = 'P0001'; end if;
  insert into public.attendance (tenant_id, session_id, enrolment_id, status, method, marked_by)
  select s.tenant_id, s.id, e.id, 'absent', 'register', app.uid()
  from public.enrolments e where e.cohort_id = s.cohort_id and e.status <> 'dropped'
  on conflict (session_id, enrolment_id) do nothing;
  get diagnostics v_absent = row_count;
  update public.class_sessions set attendance_confirmed_at = now(), attendance_confirmed_by = app.uid() where id = s.id;
  perform app.audit(s.tenant_id, 'session.attendance_confirmed', 'session', s.id, jsonb_build_object('marked_absent', v_absent));
  return v_absent;
end
$$;

-- A learner's timetable: the last 30 days and the next 14, with links, recordings and their mark.
create or replace function app.learner_schedule()
returns table (session_id uuid, cohort_id uuid, cohort_name text, hub_name text, title text, starts_at timestamptz, ends_at timestamptz,
               mode text, location text, facilitator text, has_link boolean, recording_url text, my_status text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.cohort_id, co.name, t.name, s.title, s.starts_at, s.ends_at, s.mode, s.location, s.facilitator,
         s.meeting_url is not null, s.recording_url,
         (select a.status from public.attendance a where a.session_id = s.id and a.enrolment_id = app.my_enrolment(s.cohort_id))
  from public.class_sessions s join public.cohorts co on co.id = s.cohort_id join public.tenants t on t.id = co.tenant_id
  where app.my_enrolment(s.cohort_id) is not null
    and s.starts_at between now() - interval '30 days' and now() + interval '14 days'
  order by s.starts_at
$$;

-- Announcements for the learner's cohorts, newest first, with whether they have read each.
create or replace function app.learner_announcements()
returns table (id uuid, cohort_name text, hub_name text, title text, body text, created_at timestamptz, read boolean)
language sql stable security definer set search_path = ''
as $$
  select a.id, co.name, t.name, a.title, a.body, a.created_at,
         exists (select 1 from public.announcement_reads r where r.announcement_id = a.id and r.enrolment_id = app.my_enrolment(a.cohort_id))
  from public.announcements a join public.cohorts co on co.id = a.cohort_id join public.tenants t on t.id = a.tenant_id
  where app.my_enrolment(a.cohort_id) is not null and a.created_at > now() - interval '60 days'
  order by a.created_at desc limit 20
$$;

create or replace function app.read_announcements(p_ids uuid[]) returns integer
language sql security definer set search_path = ''
as $$
  with ins as (
    insert into public.announcement_reads (announcement_id, enrolment_id, tenant_id)
    select a.id, app.my_enrolment(a.cohort_id), a.tenant_id from public.announcements a
    where a.id = any(p_ids) and app.my_enrolment(a.cohort_id) is not null
    on conflict do nothing returning 1)
  select count(*)::integer from ins
$$;

do $$
declare f text;
begin
  foreach f in array array['app.session_qr(uuid)', 'app.join_session(uuid)', 'app.qr_checkin(uuid, text)', 'app.confirm_attendance(uuid)',
    'app.learner_schedule()', 'app.learner_announcements()', 'app.read_announcements(uuid[])'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
