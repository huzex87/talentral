-- Sprint 9: two-step sign-in, cohort discussions, and a learner's copy of their own data.
-- Additive only.

-- ---------------------------------------------------------------- two-step sign-in

-- System-only, like sessions: no grants to app_user. The secret never leaves the server.
create table public.user_totp (
  user_id uuid primary key references public.users (id) on delete cascade,
  secret text not null,
  enabled_at timestamptz,
  -- The last 30-second step accepted, so a code cannot be used twice.
  last_step bigint not null default 0,
  created_at timestamptz not null default now()
);
create table public.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz
);
create index on public.recovery_codes (user_id);
-- Between the email link (or phone code) and the authenticator code.
create table public.sign_in_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.user_totp enable row level security;
alter table public.recovery_codes enable row level security;
alter table public.sign_in_challenges enable row level security;

-- A hub can require two-step sign-in for everyone on its team.
alter table public.tenants add column require_two_step boolean not null default false;
grant update (require_two_step) on public.tenants to app_user;

-- ---------------------------------------------------------------- discussions

create table public.discussion_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  pinned boolean not null default false,
  locked boolean not null default false,
  hidden boolean not null default false,
  replies integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.discussion_threads (cohort_id, pinned desc, last_activity_at desc);

create table public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  thread_id uuid not null references public.discussion_threads (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.discussion_posts (thread_id, created_at);

-- Everything goes through the functions below, which know who is a learner in the cohort and who
-- is on the hub's team. No direct grants.
alter table public.discussion_threads enable row level security;
alter table public.discussion_posts enable row level security;

-- Who the caller is in a cohort's discussion: 'team' (hub members and platform admins),
-- 'learner' (enrolled, not dropped), or null.
create or replace function app.discussion_role(p_cohort uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.cohorts c where c.id = p_cohort and (app.is_member(c.tenant_id) or app.is_platform_admin())) then 'team'
    when app.my_enrolment(p_cohort) is not null then 'learner'
  end
$$;

create or replace function app.cohort_threads(p_cohort uuid)
returns table (id uuid, title text, body text, author text, author_is_team boolean, mine boolean, pinned boolean, locked boolean, hidden boolean,
               replies integer, last_activity_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.title, t.body, coalesce(u.full_name, 'Former member'),
         exists (select 1 from public.memberships m where m.tenant_id = t.tenant_id and m.user_id = t.author_id) or coalesce(u.is_platform_admin, false),
         t.author_id = app.uid(), t.pinned, t.locked, t.hidden,
         (select count(*)::int from public.discussion_posts p where p.thread_id = t.id and (not p.hidden or app.discussion_role(t.cohort_id) = 'team')),
         t.last_activity_at, t.created_at
  from public.discussion_threads t left join public.users u on u.id = t.author_id
  where t.cohort_id = p_cohort and app.discussion_role(p_cohort) is not null
    and (not t.hidden or app.discussion_role(p_cohort) = 'team' or t.author_id = app.uid())
  order by t.pinned desc, t.last_activity_at desc
$$;

create or replace function app.thread_posts(p_thread uuid)
returns table (id uuid, body text, author text, author_is_team boolean, mine boolean, hidden boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.body, coalesce(u.full_name, 'Former member'),
         exists (select 1 from public.memberships m where m.tenant_id = p.tenant_id and m.user_id = p.author_id) or coalesce(u.is_platform_admin, false),
         p.author_id = app.uid(), p.hidden, p.created_at
  from public.discussion_posts p join public.discussion_threads t on t.id = p.thread_id left join public.users u on u.id = p.author_id
  where p.thread_id = p_thread and app.discussion_role(t.cohort_id) is not null
    and (not t.hidden or app.discussion_role(t.cohort_id) = 'team' or t.author_id = app.uid())
    and (not p.hidden or app.discussion_role(t.cohort_id) = 'team' or p.author_id = app.uid())
  order by p.created_at
$$;

create or replace function app.start_thread(p_cohort uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_tenant uuid; v_id uuid;
begin
  if app.discussion_role(p_cohort) is null then raise exception 'Not in this cohort' using errcode = '42501'; end if;
  select tenant_id into v_tenant from public.cohorts where id = p_cohort;
  insert into public.discussion_threads (tenant_id, cohort_id, author_id, title, body)
  values (v_tenant, p_cohort, app.uid(), trim(p_title), trim(p_body)) returning id into v_id;
  return v_id;
end
$$;

create or replace function app.reply_to_thread(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t public.discussion_threads; v_role text; v_id uuid;
begin
  select * into t from public.discussion_threads where id = p_thread;
  v_role := case when found then app.discussion_role(t.cohort_id) end;
  if v_role is null or (t.hidden and v_role <> 'team') then raise exception 'Not in this cohort' using errcode = '42501'; end if;
  if t.locked and v_role <> 'team' then raise exception 'This discussion is closed' using errcode = 'P0001'; end if;
  insert into public.discussion_posts (tenant_id, thread_id, author_id, body) values (t.tenant_id, t.id, app.uid(), trim(p_body)) returning id into v_id;
  update public.discussion_threads set replies = replies + 1, last_activity_at = now() where id = t.id;
  return v_id;
end
$$;

-- Hub owners and admins pin, close and hide threads; hide and restore replies. Audited.
create or replace function app.moderate_thread(p_thread uuid, p_pinned boolean, p_locked boolean, p_hidden boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare t public.discussion_threads;
begin
  select * into t from public.discussion_threads where id = p_thread;
  if not found or not (app.has_role(t.tenant_id, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.discussion_threads set pinned = p_pinned, locked = p_locked, hidden = p_hidden where id = t.id;
  if p_hidden is distinct from t.hidden then
    perform app.audit(t.tenant_id, case when p_hidden then 'discussion.hidden' else 'discussion.restored' end, 'discussion_thread', t.id, jsonb_build_object('title', t.title));
  end if;
end
$$;

create or replace function app.moderate_post(p_post uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare p public.discussion_posts;
begin
  select * into p from public.discussion_posts where id = p_post;
  if not found or not (app.has_role(p.tenant_id, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.discussion_posts set hidden = p_hidden where id = p.id;
  perform app.audit(p.tenant_id, case when p_hidden then 'discussion.reply_hidden' else 'discussion.reply_restored' end, 'discussion_post', p.id, '{}'::jsonb);
end
$$;

-- ---------------------------------------------------------------- a learner's own data

-- Everything Talentral holds about the caller, for the Nigeria Data Protection Act right of access.
create or replace function app.my_data() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (select * from public.users where id = app.uid())
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', email, 'full_name', full_name, 'phone', phone, 'language', language,
                                          'created_at', created_at, 'last_sign_in_at', last_sign_in_at) from me),
    'passport', (select to_jsonb(p) - 'user_id' from public.passports p where p.user_id = app.uid()),
    'consent_history', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'granted', granted, 'at', at) order by at)
                                 from public.consent_events where user_id = app.uid()), '[]'),
    'applications', coalesce((select jsonb_agg(jsonb_build_object(
        'hub', t.name, 'programme', pr.title, 'reference', a.reference, 'track', a.track, 'status', a.status,
        'submitted_at', a.submitted_at, 'phone', a.phone, 'answers', a.answers) order by a.submitted_at)
      from public.applications a join public.tenants t on t.id = a.tenant_id join public.programmes pr on pr.id = a.programme_id
      where lower(a.email) = (select lower(email) from me)), '[]'),
    'enrolments', coalesce((select jsonb_agg(jsonb_build_object(
        'hub', t.name, 'cohort', c.name, 'status', e.status, 'enrolled_at', e.enrolled_at,
        'attendance', (select coalesce(jsonb_agg(jsonb_build_object('session', s.title, 'starts_at', s.starts_at, 'status', at.status, 'method', at.method) order by s.starts_at), '[]')
                       from public.attendance at join public.class_sessions s on s.id = at.session_id where at.enrolment_id = e.id),
        'scores', (select coalesce(jsonb_agg(jsonb_build_object('assessment', asm.title, 'score', sc.score, 'max', asm.max_score, 'feedback', sc.feedback)), '[]')
                   from public.assessment_results sc join public.assessments asm on asm.id = sc.assessment_id where sc.enrolment_id = e.id),
        'quiz_attempts', (select coalesce(jsonb_agg(jsonb_build_object('lesson', l.title, 'percent', q.percent, 'passed', q.passed, 'submitted_at', q.submitted_at)), '[]')
                          from public.quiz_attempts q join public.lessons l on l.id = q.lesson_id where q.enrolment_id = e.id),
        'submissions', (select coalesce(jsonb_agg(jsonb_build_object('lesson', l.title, 'attempt', s.attempt, 'status', s.status, 'score', s.score,
                                                                    'feedback', s.feedback, 'url', s.url, 'file_name', s.file_name, 'submitted_at', s.submitted_at)), '[]')
                        from public.submissions s join public.lessons l on l.id = s.lesson_id where s.enrolment_id = e.id),
        'certificate', (select jsonb_build_object('serial', ce.serial, 'issued_at', ce.issued_at, 'revoked_at', ce.revoked_at)
                        from public.certificates ce where ce.enrolment_id = e.id)) order by e.enrolled_at)
      from public.enrolments e join public.cohorts c on c.id = e.cohort_id join public.tenants t on t.id = c.tenant_id
      join public.applications a on a.id = e.application_id
      where lower(a.email) = (select lower(email) from me)), '[]'),
    'opportunities', coalesce((select jsonb_agg(to_jsonb(o)) from app.my_opportunities() o), '[]'),
    'discussion_posts', coalesce((select jsonb_agg(jsonb_build_object('thread', t.title, 'body', p.body, 'at', p.created_at) order by p.created_at)
                                  from public.discussion_posts p join public.discussion_threads t on t.id = p.thread_id where p.author_id = app.uid()), '[]'),
    'discussion_threads', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'body', body, 'at', created_at) order by created_at)
                                    from public.discussion_threads where author_id = app.uid()), '[]')
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['app.discussion_role(uuid)', 'app.cohort_threads(uuid)', 'app.thread_posts(uuid)', 'app.start_thread(uuid, text, text)',
    'app.reply_to_thread(uuid, text)', 'app.moderate_thread(uuid, boolean, boolean, boolean)', 'app.moderate_post(uuid, boolean)', 'app.my_data()'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
