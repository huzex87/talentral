-- Closing the MVP-1 gaps: WhatsApp as a message channel (S4) and streamed video with lighter
-- renditions (S2). Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- WhatsApp opt-in

-- A Nigerian mobile number in the form 234XXXXXXXXXX, from any common way of writing it; null
-- when it is not one.
create or replace function app.wa_phone(p text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when d ~ '^234[789][01][0-9]{8}$' then d
    when d ~ '^0[789][01][0-9]{8}$' then '234' || substr(d, 2)
    when d ~ '^[789][01][0-9]{8}$' then '234' || d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- WhatsApp needs the person's permission before a business messages them. One row per number:
-- the latest choice, where it was made, and when. System and functions only.
create table public.whatsapp_optins (
  phone text primary key check (phone ~ '^234[789][01][0-9]{8}$'),
  opted_in boolean not null,
  source text not null check (source in ('account', 'application', 'reply')),
  user_id uuid references public.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.whatsapp_optins enable row level security;

-- The caller's numbers (their account's and those on their applications) and each one's choice.
create or replace function app.my_whatsapp()
returns table (phone text, opted_in boolean, changed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select app.wa_phone(u.phone) as phone from public.users u where u.id = app.uid()
    union
    select app.wa_phone(a.phone) from public.applications a join public.users u on u.email = a.email where u.id = app.uid()
  )
  select m.phone, o.opted_in, o.changed_at from mine m left join public.whatsapp_optins o on o.phone = m.phone
  where m.phone is not null order by m.phone
$$;

-- The caller turns WhatsApp messages on or off for all their numbers.
create or replace function app.set_my_whatsapp(p_on boolean) returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if app.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.whatsapp_optins (phone, opted_in, source, user_id)
  select phone, p_on, 'account', app.uid() from app.my_whatsapp()
  on conflict (phone) do update set opted_in = excluded.opted_in, source = 'account', user_id = excluded.user_id, changed_at = now();
  get diagnostics n = row_count;
  return n;
end
$$;

-- An applicant ticks "Send me updates on WhatsApp" on the form. Only for an application made in
-- the last 15 minutes, with its reference, and never over an earlier "no".
create or replace function app.application_whatsapp_optin(p_application uuid, p_reference text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_phone text;
begin
  select app.wa_phone(a.phone) into v_phone from public.applications a
  where a.id = p_application and a.reference = p_reference and a.submitted_at > now() - interval '15 minutes';
  if v_phone is null then return false; end if;
  insert into public.whatsapp_optins (phone, opted_in, source) values (v_phone, true, 'application')
  on conflict (phone) do nothing;
  return true;
end
$$;

-- Which of these numbers (any format) chose WhatsApp, among people who applied to the hub. For hub
-- owners and admins sending messages, and the platform team.
create or replace function app.whatsapp_audience(p_tenant uuid, p_phones text[]) returns setof text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
  return query
  select distinct o.phone from unnest(p_phones) p
  join public.whatsapp_optins o on o.phone = app.wa_phone(p) and o.opted_in
  where exists (select 1 from public.applications a where a.tenant_id = p_tenant and app.wa_phone(a.phone) = o.phone);
end
$$;

-- Bulk messages record how many went by WhatsApp.
alter table public.messages add column whatsapp integer not null default 0 check (whatsapp >= 0);
grant update (whatsapp) on public.messages to app_user;

-- ---------------------------------------------------------------- streamed lesson video

-- A video lesson can be streamed: uploaded once, encoded into lighter renditions (240p to 720p)
-- that the player picks from for the connection, with a small 360p file for data saver and
-- offline. stream_id is the provider's video id.
alter table public.lessons
  add column stream_id text check (char_length(stream_id) <= 100),
  add column stream_status text check (stream_status in ('uploading', 'processing', 'ready', 'failed')),
  add column stream_renditions text[] not null default '{}',
  add column stream_seconds integer check (stream_seconds >= 0),
  add column stream_updated_at timestamptz;
create unique index lessons_stream_id on public.lessons (stream_id) where stream_id is not null;
grant update (stream_id, stream_status, stream_renditions, stream_seconds, stream_updated_at) on public.lessons to app_user;

-- The stream behind an open lesson, for an enrolled learner.
create or replace function app.lesson_stream(p_cohort uuid, p_lesson uuid)
returns table (stream_id text, stream_status text, stream_renditions text[], stream_seconds integer)
language sql stable security definer set search_path = ''
as $$
  select l.stream_id, l.stream_status, l.stream_renditions, l.stream_seconds from public.lessons l
  where l.id = p_lesson and l.stream_id is not null and app.lesson_open(p_cohort, p_lesson)
$$;

do $$
declare f text;
begin
  foreach f in array array['app.my_whatsapp()', 'app.set_my_whatsapp(boolean)', 'app.application_whatsapp_optin(uuid, text)',
    'app.whatsapp_audience(uuid, text[])', 'app.lesson_stream(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.wa_phone(text) from public;
grant execute on function app.wa_phone(text) to app_user;

-- ---------------------------------------------------------------- support sessions

-- Platform staff helping a hub (through a support session, E13.1) can also post cohort
-- announcements, as they already can edit course content and grade.
create policy announcements_insert_platform on public.announcements for insert to app_user
  with check (app.is_platform_admin() and author_id = app.uid()
              and exists (select 1 from public.cohorts c where c.id = announcements.cohort_id and c.tenant_id = announcements.tenant_id));
