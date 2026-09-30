-- Sprint 13: data-subject requests (E13.2) and time-limited support access (E13.1).
-- Additive only: previews run against the shared database.

-- ---------------------------------------------------------------- data-subject requests

-- A person asks Talentral to delete or correct their data. The law gives 30 days; the platform team
-- works the queue. After an erasure the row keeps only a masked email and a hash, as proof the
-- request was carried out.
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  email_masked text not null check (char_length(email_masked) <= 200),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('erasure', 'correction')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'completed', 'declined', 'cancelled')),
  due_at timestamptz not null default now() + interval '30 days',
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  outcome text check (char_length(outcome) <= 2000),
  created_at timestamptz not null default now()
);
create index on public.data_requests (status, due_at);
create unique index data_requests_one_open on public.data_requests (email_hash, kind) where status = 'open';
alter table public.data_requests enable row level security;
grant select on public.data_requests to app_user;
create policy data_requests_read on public.data_requests for select to app_user
  using (user_id = app.uid() or app.is_platform_admin());

create or replace function app.mask_email(p_email text) returns text
language sql immutable set search_path = ''
as $$ select left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2) $$;

-- The signed-in person asks for their data to be deleted or corrected.
create or replace function app.request_data_change(p_kind text, p_details text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_email text; v_id uuid;
begin
  select email::text into v_email from public.users where id = app.uid();
  if v_email is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_kind not in ('erasure', 'correction') then raise exception 'Unknown request' using errcode = '22023'; end if;
  if p_kind = 'correction' and char_length(coalesce(trim(p_details), '')) < 10 then raise exception 'Say what needs correcting' using errcode = '22023'; end if;
  insert into public.data_requests (user_id, email_masked, email_hash, kind, details)
  values (app.uid(), app.mask_email(lower(v_email)), encode(sha256(convert_to(lower(v_email), 'UTF8')), 'hex'), p_kind, nullif(trim(p_details), ''))
  on conflict (email_hash, kind) where status = 'open' do nothing
  returning id into v_id;
  if v_id is null then raise exception 'You already have a request open' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (app.uid(), 'privacy.request_' || p_kind, 'data_request', v_id);
  return v_id;
end
$$;

-- The person withdraws a request that has not been handled yet.
create or replace function app.cancel_data_request(p_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.data_requests set status = 'cancelled', handled_at = now() where id = p_id and user_id = app.uid() and status = 'open'
$$;

-- The platform team closes a correction (done) or declines a request, with a note the person sees.
create or replace function app.close_data_request(p_id uuid, p_status text, p_outcome text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if p_status not in ('completed', 'declined') then raise exception 'Unknown outcome' using errcode = '22023'; end if;
  update public.data_requests set status = p_status, outcome = nullif(trim(p_outcome), ''), handled_by = app.uid(), handled_at = now()
  where id = p_id and status = 'open';
  if not found then raise exception 'This request is no longer open' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (app.uid(), 'privacy.request_' || p_status, 'data_request', p_id);
end
$$;

-- Carries out an erasure request. Everything that identifies the person goes; what funders and the
-- law need stays, without their name or contact details:
--   * applications: name, email and phone replaced; answers cut to gender, state, LGA, disability,
--     and the year of birth (as 1 July) so age bands still count; notes and files removed
--   * learning records stay for counts (attendance, scores, completion), but written work, quiz
--     answers, peer review comments and discussion posts are removed
--   * certificates are withdrawn, with the name removed, so verification says so
--   * the account, Passport, consents, sessions and sign-in secrets are deleted
-- Returns the storage paths of files to delete. Refuses when the person is the only owner of a hub.
create or replace function app.erase_person(p_request uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare r public.data_requests; v_user uuid; v_email text; v_paths text[] := '{}'; v_apps uuid[]; v_enrol uuid[];
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  select * into r from public.data_requests where id = p_request and kind = 'erasure' and status = 'open' for update;
  if not found then raise exception 'This request is no longer open' using errcode = 'P0001'; end if;
  select id, lower(email::text) into v_user, v_email from public.users where id = r.user_id;
  if v_email is null then raise exception 'The account for this request no longer exists' using errcode = 'P0001'; end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user and m.role = 'owner'
             and not exists (select 1 from public.memberships o where o.tenant_id = m.tenant_id and o.role = 'owner' and o.user_id <> v_user)) then
    raise exception 'This person is the only owner of a hub. Add another owner first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.users where id = v_user and is_platform_admin) then
    raise exception 'Remove platform admin rights first.' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_apps from public.applications where lower(email::text) = v_email;
  select coalesce(array_agg(id), '{}') into v_enrol from public.enrolments where application_id = any(v_apps);

  -- Files first, so their paths can be returned for deletion from storage.
  select v_paths || coalesce(array_agg(storage_path), '{}') into v_paths from public.application_files where application_id = any(v_apps);
  select v_paths || coalesce(array_agg(file_path), '{}') into v_paths from public.submissions where enrolment_id = any(v_enrol) and file_path is not null;
  delete from public.application_files where application_id = any(v_apps);
  delete from public.application_notes where application_id = any(v_apps);

  update public.applications a set
    full_name = 'Removed at request',
    email = 'erased-' || a.id || '@erased.invalid',
    phone = '',
    answers = jsonb_strip_nulls(jsonb_build_object(
      'gender', a.answers -> 'gender', 'state_of_residence', a.answers -> 'state_of_residence', 'lga', a.answers -> 'lga', 'disability', a.answers -> 'disability',
      'date_of_birth', case when a.answers ->> 'date_of_birth' ~ '^\d{4}-' then to_jsonb(left(a.answers ->> 'date_of_birth', 4) || '-07-01') end))
  where a.id = any(v_apps);

  update public.submissions set body = '[Removed at the learner''s request]', url = null, file_path = null, file_name = null, feedback = null
  where enrolment_id = any(v_enrol);
  update public.quiz_attempts set answers = '{}'::jsonb where enrolment_id = any(v_enrol);
  update public.peer_reviews set comment = null where reviewer_enrolment_id = any(v_enrol);
  update public.certificates set learner_name = 'Removed at request', revoked_at = coalesce(revoked_at, now()),
    revoked_reason = 'Withdrawn: the holder asked for their data to be deleted'
  where enrolment_id = any(v_enrol);
  update public.discussion_posts set body = '[Removed at the author''s request]' where author_id = v_user;
  update public.discussion_threads set title = '[Removed]', body = '[Removed at the author''s request]' where author_id = v_user;

  delete from public.users where id = v_user;

  update public.data_requests set status = 'completed', handled_by = app.uid(), handled_at = now(), user_id = null,
    outcome = coalesce(outcome, 'Deleted. Anonymous records kept for funder reporting and the law.')
  where id = p_request;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'privacy.erasure_completed', 'data_request', p_request,
          jsonb_build_object('applications', cardinality(v_apps), 'enrolments', cardinality(v_enrol), 'files', cardinality(v_paths)));
  return v_paths;
end
$$;

-- ---------------------------------------------------------------- support access

-- Platform staff open a hub's dashboard only through a support session: a reason, four hours,
-- visible to the hub's team and in its audit log.
create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  staff_email text not null check (char_length(staff_email) <= 200),
  reason text not null check (char_length(reason) between 10 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '4 hours',
  ended_at timestamptz,
  check (expires_at > created_at)
);
create index on public.support_grants (tenant_id, created_at desc);
create index on public.support_grants (user_id, tenant_id, expires_at);
alter table public.support_grants enable row level security;
grant select on public.support_grants to app_user;
create policy support_grants_read on public.support_grants for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());

create or replace function app.start_support(p_tenant uuid, p_reason text) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v_expires timestamptz; v_id uuid;
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 10 then raise exception 'Give a reason of at least 10 characters' using errcode = '22023'; end if;
  update public.support_grants set ended_at = now() where tenant_id = p_tenant and user_id = app.uid() and ended_at is null and expires_at > now();
  insert into public.support_grants (tenant_id, user_id, staff_email, reason)
  values (p_tenant, app.uid(), (select email::text from public.users where id = app.uid()), trim(p_reason))
  returning id, expires_at into v_id, v_expires;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (p_tenant, app.uid(), 'support.started', 'support_grant', v_id, jsonb_build_object('reason', trim(p_reason)));
  return v_expires;
end
$$;

create or replace function app.end_support(p_tenant uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  update public.support_grants set ended_at = now()
  where tenant_id = p_tenant and user_id = app.uid() and ended_at is null and expires_at > now() returning id into v_id;
  if v_id is not null then
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id) values (p_tenant, app.uid(), 'support.ended', 'support_grant', v_id);
  end if;
end
$$;

-- When the caller's support session for a hub ends, or null without one.
create or replace function app.support_until(p_tenant uuid) returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select max(expires_at) from public.support_grants
  where tenant_id = p_tenant and user_id = app.uid() and ended_at is null and expires_at > now()
$$;

do $$
declare f text;
begin
  foreach f in array array['app.request_data_change(text, text)', 'app.cancel_data_request(uuid)', 'app.close_data_request(uuid, text, text)',
    'app.erase_person(uuid)', 'app.start_support(uuid, text)', 'app.end_support(uuid)', 'app.support_until(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.mask_email(text) from public;
