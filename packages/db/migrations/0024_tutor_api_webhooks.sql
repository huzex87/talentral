-- MVP-2 month 11: the public credential verification API (with rate limits), outbound webhooks for
-- hubs, and the AI course tutor (beta) for learners. Additive only: previews run against the
-- shared database.

-- ---------------------------------------------------------------- rate limits

-- Fixed-window counters for public endpoints and costly actions. System only: reached through
-- app.take_rate, which counts and answers in one statement.
create table public.rate_hits (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_hits enable row level security;

-- Counts one hit in the current window and says whether it is within the limit.
create or replace function app.take_rate(p_bucket text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); v_n integer;
begin
  insert into public.rate_hits (bucket, window_start, n) values (left(p_bucket, 200), v_start, 1)
  on conflict (bucket, window_start) do update set n = public.rate_hits.n + 1
  returning n into v_n;
  return v_n <= p_limit;
end
$$;

-- ---------------------------------------------------------------- outbound webhooks

-- Where a hub wants events sent. The secret signs every delivery (HMAC-SHA256) so the receiver
-- can check it came from Talentral; owners and admins can read it to configure their receiver.
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null check (char_length(url) between 10 and 500 and url ~ '^https?://'),
  description text check (char_length(description) <= 120),
  events text[] not null check (cardinality(events) >= 1 and events <@ array[
    'application.submitted', 'application.status_changed', 'learner.enrolled', 'learner.completed',
    'certificate.issued', 'certificate.revoked']),
  secret text not null check (secret ~ '^whsec_[0-9a-f]{48}$'),
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.webhook_endpoints (tenant_id);
create trigger webhook_endpoints_touch before update on public.webhook_endpoints for each row execute function app.touch();

-- One row per event per endpoint, retried by the scheduler until delivered or given up.
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text check (char_length(last_error) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.webhook_deliveries (endpoint_id, created_at desc);
create index webhook_deliveries_due on public.webhook_deliveries (next_attempt_at) where status = 'pending';

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
create policy webhook_endpoints_read on public.webhook_endpoints for select to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());
create policy webhook_deliveries_read on public.webhook_deliveries for select to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());
grant select on public.webhook_endpoints, public.webhook_deliveries to app_user;

create or replace function app.webhook_manager(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Hub owners and admins only' using errcode = '42501';
  end if;
end
$$;

-- Adds an endpoint with a fresh secret. Audited without the secret.
create or replace function app.add_webhook(p_tenant uuid, p_url text, p_description text, p_events text[]) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform app.webhook_manager(p_tenant);
  if (select count(*) from public.webhook_endpoints where tenant_id = p_tenant) >= 10 then
    raise exception 'A hub can have up to 10 webhook endpoints' using errcode = '23514';
  end if;
  insert into public.webhook_endpoints (tenant_id, url, description, events, secret, created_by)
  values (p_tenant, trim(p_url), nullif(trim(p_description), ''), p_events,
          'whsec_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), app.uid())
  returning id into v_id;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (p_tenant, app.uid(), 'webhook.added', 'webhook', v_id, jsonb_build_object('url', trim(p_url), 'events', p_events));
  return v_id;
end
$$;

-- Changes an endpoint: its events, on or off, a new secret, or removes it (p_action).
create or replace function app.change_webhook(p_id uuid, p_action text, p_events text[] default null) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_tenant uuid; v_url text;
begin
  select tenant_id, url into v_tenant, v_url from public.webhook_endpoints where id = p_id;
  if not found then return false; end if;
  perform app.webhook_manager(v_tenant);
  if p_action = 'pause' then update public.webhook_endpoints set active = false where id = p_id;
  elsif p_action = 'resume' then update public.webhook_endpoints set active = true where id = p_id;
  elsif p_action = 'events' then update public.webhook_endpoints set events = p_events where id = p_id;
  elsif p_action = 'roll' then
    update public.webhook_endpoints set secret = 'whsec_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) where id = p_id;
  elsif p_action = 'delete' then delete from public.webhook_endpoints where id = p_id;
  else raise exception 'Unknown webhook action' using errcode = '22023';
  end if;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (v_tenant, app.uid(), 'webhook.' || case p_action when 'delete' then 'removed' when 'roll' then 'secret_rolled' when 'events' then 'changed' else p_action || 'd' end,
          'webhook', p_id, jsonb_build_object('url', v_url));
  return true;
end
$$;

-- Queues an event for every active endpoint of the hub that listens for it. Called by triggers.
create or replace function app.queue_webhook(p_tenant uuid, p_type text, p_data jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.webhook_deliveries (tenant_id, endpoint_id, event_type, payload)
  select e.tenant_id, e.id, p_type, jsonb_build_object('type', p_type, 'created_at', now(), 'hub', t.slug, 'data', p_data)
  from public.webhook_endpoints e join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = p_tenant and e.active and p_type = any (e.events)
$$;

-- A test event, or a fresh copy of an earlier delivery, for one endpoint.
create or replace function app.queue_webhook_test(p_endpoint uuid, p_redeliver uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_tenant uuid; v_id uuid; v_type text; v_payload jsonb;
begin
  select tenant_id into v_tenant from public.webhook_endpoints where id = p_endpoint;
  if not found then return null; end if;
  perform app.webhook_manager(v_tenant);
  if p_redeliver is not null then
    select event_type, payload into v_type, v_payload from public.webhook_deliveries where id = p_redeliver and endpoint_id = p_endpoint;
    if not found then return null; end if;
  else
    v_type := 'ping';
    v_payload := jsonb_build_object('type', 'ping', 'created_at', now(), 'hub', (select slug from public.tenants where id = v_tenant),
      'data', jsonb_build_object('message', 'Test event from Talentral'));
  end if;
  insert into public.webhook_deliveries (tenant_id, endpoint_id, event_type, payload) values (v_tenant, p_endpoint, v_type, v_payload)
  returning id into v_id;
  return v_id;
end
$$;

-- Event triggers: applications, enrolments and certificates.
create or replace function app.webhook_application() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  v := jsonb_build_object('application', jsonb_build_object('id', new.id, 'reference', new.reference, 'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status end, 'full_name', new.full_name, 'email', new.email, 'track', new.track,
    'submitted_at', new.submitted_at),
    'programme', (select jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title) from public.programmes p where p.id = new.programme_id));
  perform app.queue_webhook(new.tenant_id, case when tg_op = 'INSERT' then 'application.submitted' else 'application.status_changed' end, v);
  return new;
end
$$;
create trigger applications_webhook after insert or update of status on public.applications
  for each row execute function app.webhook_application();

create or replace function app.webhook_enrolment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (new.status = 'completed' and old.status is distinct from 'completed') then return new; end if;
  perform app.queue_webhook(new.tenant_id, case when tg_op = 'INSERT' then 'learner.enrolled' else 'learner.completed' end,
    (select jsonb_build_object('enrolment', jsonb_build_object('id', new.id, 'status', new.status, 'enrolled_at', new.enrolled_at, 'completed_at', new.completed_at),
       'learner', jsonb_build_object('full_name', a.full_name, 'email', a.email, 'reference', a.reference),
       'cohort', jsonb_build_object('id', c.id, 'name', c.name))
     from public.applications a, public.cohorts c where a.id = new.application_id and c.id = new.cohort_id));
  return new;
end
$$;
create trigger enrolments_webhook after insert or update of status on public.enrolments
  for each row execute function app.webhook_enrolment();

create or replace function app.webhook_certificate() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (new.revoked_at is not null and old.revoked_at is null) then return new; end if;
  perform app.queue_webhook(new.tenant_id, case when tg_op = 'INSERT' then 'certificate.issued' else 'certificate.revoked' end,
    jsonb_build_object('certificate', jsonb_build_object('serial', new.serial, 'learner_name', new.learner_name, 'programme_title', new.programme_title,
      'cohort_name', new.cohort_name, 'track', new.track, 'completed_on', new.completed_on, 'issued_at', new.issued_at,
      'revoked_at', new.revoked_at, 'revoked_reason', new.revoked_reason)));
  return new;
end
$$;
create trigger certificates_webhook after insert or update of revoked_at on public.certificates
  for each row execute function app.webhook_certificate();

-- ---------------------------------------------------------------- AI course tutor (beta)

-- A learner's question to the tutor and its answer. Kept 30 days (the scheduler purges older rows)
-- and visible only to the learner who asked. Hubs see counts, never the questions.
create table public.tutor_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  question text not null check (char_length(question) between 3 and 1000),
  lang text not null default 'en' check (lang in ('en', 'ha')),
  status text not null default 'pending' check (status in ('pending', 'answered', 'declined', 'failed')),
  answer text check (char_length(answer) <= 6000),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index on public.tutor_questions (user_id, cohort_id, created_at desc);
create index on public.tutor_questions (tenant_id, created_at);
alter table public.tutor_questions enable row level security;
create policy tutor_questions_own on public.tutor_questions for select to app_user using (user_id = app.uid());
grant select on public.tutor_questions to app_user;

-- Takes a question for the signed-in learner, within the hub's monthly and the learner's daily
-- limits (WAT). Raises tutor_hub_limit or tutor_daily_limit when either is used up.
create or replace function app.claim_tutor_question(p_cohort uuid, p_lesson uuid, p_question text, p_lang text, p_model text,
                                                    p_hub_monthly integer, p_daily integer) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_tenant uuid; v_id uuid; v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if app.my_enrolment(p_cohort) is null then raise exception 'Not enrolled in this cohort' using errcode = '42501'; end if;
  if p_lesson is not null and not app.lesson_open(p_cohort, p_lesson) then p_lesson := null; end if;
  select tenant_id into v_tenant from public.cohorts where id = p_cohort;
  perform pg_advisory_xact_lock(hashtext('tutor:' || v_tenant::text));
  if (select count(*) from public.tutor_questions q where q.tenant_id = v_tenant
        and q.created_at >= (date_trunc('month', v_today::timestamp) at time zone 'Africa/Lagos')) >= p_hub_monthly then
    raise exception 'tutor_hub_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.tutor_questions q where q.user_id = app.uid()
        and q.created_at >= (v_today::timestamp at time zone 'Africa/Lagos')) >= p_daily then
    raise exception 'tutor_daily_limit' using errcode = 'P0001';
  end if;
  insert into public.tutor_questions (tenant_id, cohort_id, user_id, lesson_id, question, lang, model)
  values (v_tenant, p_cohort, app.uid(), p_lesson, trim(p_question), p_lang, p_model)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function app.finish_tutor_question(p_id uuid, p_status text, p_answer text, p_citations jsonb, p_input integer, p_output integer) returns void
language sql security definer set search_path = ''
as $$
  update public.tutor_questions set status = p_status, answer = left(p_answer, 6000), citations = coalesce(p_citations, '[]'::jsonb),
    input_tokens = p_input, output_tokens = p_output
  where id = p_id and user_id = app.uid() and status = 'pending'
$$;

-- The tutor's reading: the learner's open lessons in this cohort that best match the keywords,
-- plus the lesson they are on. Only lessons they can open; nothing from other cohorts or hubs.
create or replace function app.tutor_context(p_cohort uuid, p_keywords text[], p_lesson uuid default null, p_limit integer default 5)
returns table (lesson_id uuid, title text, title_ha text, course_title text, kind text, body text, body_ha text, rank real)
language plpgsql stable security definer set search_path = ''
as $$
declare v_query tsquery;
begin
  if app.my_enrolment(p_cohort) is null then return; end if;
  select to_tsquery('simple', string_agg(w || ':*', ' | ')) into v_query
  from (select distinct regexp_replace(lower(k), '[^[:alnum:]]', '', 'g') as w from unnest(coalesce(p_keywords, '{}')) k) s
  where char_length(w) between 2 and 40;
  return query
    select l.id, l.title, l.title_ha, c.title, l.kind, l.body, l.body_ha,
      (case when v_query is null then 0 else ts_rank_cd(to_tsvector('simple', concat_ws(' ', l.title, l.title_ha, l.body, l.body_ha)), v_query) end)::real
    from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.kind in ('text', 'video', 'audio', 'pdf', 'quiz', 'assignment')
      and coalesce(l.body, l.body_ha) is not null
      and app.lesson_open(p_cohort, l.id)
      and (l.id = p_lesson or (v_query is not null and to_tsvector('simple', concat_ws(' ', l.title, l.title_ha, l.body, l.body_ha)) @@ v_query))
    order by (l.id = p_lesson) desc, 8 desc
    limit greatest(1, least(p_limit, 8));
end
$$;

-- ---------------------------------------------------------------- housekeeping

-- Run by the scheduler: tutor questions after 30 days, deliveries after 30 days, old rate windows.
create or replace function app.purge_month11() returns void
language sql security definer set search_path = ''
as $$
  delete from public.tutor_questions where created_at < now() - interval '30 days';
  delete from public.webhook_deliveries where created_at < now() - interval '30 days' and status <> 'pending';
  delete from public.rate_hits where window_start < now() - interval '1 day';
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.take_rate(text, integer, integer)', 'app.add_webhook(uuid, text, text, text[])', 'app.change_webhook(uuid, text, text[])',
    'app.queue_webhook_test(uuid, uuid)', 'app.claim_tutor_question(uuid, uuid, text, text, text, integer, integer)',
    'app.finish_tutor_question(uuid, text, text, jsonb, integer, integer)', 'app.tutor_context(uuid, text[], uuid, integer)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
  foreach f in array array['app.webhook_manager(uuid)', 'app.queue_webhook(uuid, text, jsonb)', 'app.purge_month11()',
    'app.webhook_application()', 'app.webhook_enrolment()', 'app.webhook_certificate()'] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end $$;
