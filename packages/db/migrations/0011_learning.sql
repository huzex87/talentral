-- Sprint 6 "Learn": courses built from modules and lessons (with Hausa variants), cohorts that
-- follow a course, learner progress, auto-marked quizzes and assignment submissions that feed the
-- gradebook. Learners reach content only through the functions at the end, which check enrolment
-- and unlock dates; they never read these tables directly. Additive only.

alter table public.users add column language text not null default 'en' check (language in ('en', 'ha'));
grant update (language) on public.users to app_user;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  programme_id uuid references public.programmes (id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  summary text check (char_length(summary) <= 600),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.courses (tenant_id);
create trigger courses_touch before update on public.courses for each row execute function app.touch();

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  title_ha text check (char_length(title_ha) <= 160),
  position integer not null default 0,
  -- Days after the cohort's start date when the module opens; null opens it straight away.
  unlock_after_days integer check (unlock_after_days between 0 and 730),
  created_at timestamptz not null default now()
);
create index on public.course_modules (course_id, position);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid not null references public.course_modules (id) on delete cascade,
  kind text not null check (kind in ('text', 'video', 'audio', 'pdf', 'quiz', 'assignment')),
  title text not null check (char_length(title) between 2 and 160),
  title_ha text check (char_length(title_ha) <= 160),
  body text check (char_length(body) <= 60000),
  body_ha text check (char_length(body_ha) <= 60000),
  media_url text check (char_length(media_url) <= 500),
  file_path text,
  file_name text check (char_length(file_name) <= 200),
  file_type text check (char_length(file_type) <= 100),
  file_size bigint check (file_size >= 0),
  minutes integer check (minutes between 1 and 600),
  pass_mark integer not null default 50 check (pass_mark between 0 and 100),
  max_attempts integer check (max_attempts between 1 and 20),
  submission_types text[] not null default '{text,link,file}' check (submission_types <@ array['text', 'link', 'file'] and cardinality(submission_types) >= 1),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lessons (module_id, position);
create index on public.lessons (course_id);
create trigger lessons_touch before update on public.lessons for each row execute function app.touch();

create table public.lesson_skills (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (lesson_id, skill_id)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  kind text not null default 'single' check (kind in ('single', 'multiple', 'true_false')),
  prompt text not null check (char_length(prompt) between 2 and 1000),
  prompt_ha text check (char_length(prompt_ha) <= 1000),
  -- [{ "id": "a", "text": "...", "text_ha": "..." }]
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct text[] not null check (cardinality(correct) >= 1),
  points integer not null default 1 check (points between 1 and 20),
  explanation text check (char_length(explanation) <= 1000),
  position integer not null default 0
);
create index on public.quiz_questions (lesson_id, position);

-- Cohorts follow a course; each quiz and assignment becomes an assessment in that cohort's gradebook.
alter table public.cohorts add column course_id uuid references public.courses (id) on delete set null;
grant update (course_id) on public.cohorts to app_user;
alter table public.assessments add column lesson_id uuid references public.lessons (id) on delete set null;
create unique index assessments_cohort_lesson on public.assessments (cohort_id, lesson_id) where lesson_id is not null;

create table public.lesson_progress (
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (enrolment_id, lesson_id)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  -- Generated on the device, so an answer sent twice (say after going offline) counts once.
  client_id uuid not null unique,
  answers jsonb not null,
  score numeric(7, 2) not null,
  max_score integer not null,
  percent numeric(5, 1) not null,
  passed boolean not null,
  submitted_at timestamptz not null default now()
);
create index on public.quiz_attempts (enrolment_id, lesson_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  attempt integer not null default 1,
  body text check (char_length(body) <= 20000),
  url text check (char_length(url) <= 500),
  file_path text,
  file_name text check (char_length(file_name) <= 200),
  file_type text,
  file_size bigint,
  status text not null default 'submitted' check (status in ('submitted', 'graded', 'resubmit')),
  score numeric(5, 1) check (score between 0 and 100),
  feedback text check (char_length(feedback) <= 4000),
  graded_by uuid references public.users (id) on delete set null,
  graded_at timestamptz,
  submitted_at timestamptz not null default now(),
  check (body is not null or url is not null or file_path is not null)
);
create index on public.submissions (lesson_id, status);
create index on public.submissions (enrolment_id);

-- ---------------------------------------------------------------- Row-Level Security (hub side)

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_skills enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.submissions enable row level security;

create policy courses_read on public.courses for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy courses_write on public.courses for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin'])) with check (app.has_role(tenant_id, array['owner', 'admin']));
create policy modules_read on public.course_modules for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy modules_write on public.course_modules for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin']) and exists (select 1 from public.courses c where c.id = course_modules.course_id and c.tenant_id = course_modules.tenant_id));
create policy lessons_read on public.lessons for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy lessons_write on public.lessons for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.course_modules m where m.id = lessons.module_id and m.course_id = lessons.course_id and m.tenant_id = lessons.tenant_id));
create policy lesson_skills_read on public.lesson_skills for select to app_user using (app.is_member(tenant_id));
create policy lesson_skills_write on public.lesson_skills for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin']) and exists (select 1 from public.lessons l where l.id = lesson_skills.lesson_id and l.tenant_id = lesson_skills.tenant_id));
create policy questions_read on public.quiz_questions for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy questions_write on public.quiz_questions for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin']) and exists (select 1 from public.lessons l where l.id = quiz_questions.lesson_id and l.tenant_id = quiz_questions.tenant_id));
create policy progress_read on public.lesson_progress for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy attempts_read on public.quiz_attempts for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy submissions_read on public.submissions for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
-- Any team member can grade, as themselves.
create policy submissions_grade on public.submissions for update to app_user
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id) and graded_by = app.uid());

grant select, insert, delete on public.courses, public.course_modules, public.lessons, public.lesson_skills, public.quiz_questions to app_user;
grant update (programme_id, title, summary, status) on public.courses to app_user;
grant update (title, title_ha, position, unlock_after_days) on public.course_modules to app_user;
grant update (title, title_ha, body, body_ha, media_url, file_path, file_name, file_type, file_size, minutes, pass_mark, max_attempts, submission_types, position, module_id) on public.lessons to app_user;
grant update (kind, prompt, prompt_ha, options, correct, points, explanation, position) on public.quiz_questions to app_user;
grant select on public.lesson_progress, public.quiz_attempts, public.submissions to app_user;
grant update (status, score, feedback, graded_by, graded_at) on public.submissions to app_user;

-- ---------------------------------------------------------------- learner access (functions)

-- The caller's live enrolment in a cohort, if any.
create or replace function app.my_enrolment(p_cohort uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select e.id from public.enrolments e
  join public.applications a on a.id = e.application_id
  join public.users u on u.email = a.email
  where e.cohort_id = p_cohort and u.id = app.uid() and e.status <> 'dropped'
  limit 1
$$;

-- Whether a lesson is open to the caller in a cohort: enrolled, course published and followed by
-- the cohort, and the module's unlock date reached.
create or replace function app.lesson_open(p_cohort uuid, p_lesson uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.my_enrolment(p_cohort) is not null and exists (
    select 1 from public.lessons l
    join public.course_modules m on m.id = l.module_id
    join public.courses c on c.id = l.course_id and c.status = 'published'
    join public.cohorts co on co.id = p_cohort and co.course_id = c.id
    where l.id = p_lesson
      and (m.unlock_after_days is null or co.starts_on is null or co.starts_on + m.unlock_after_days <= (now() at time zone 'Africa/Lagos')::date))
$$;

-- Everything a learner is studying, with progress.
create or replace function app.learner_courses()
returns table (cohort_id uuid, cohort_name text, hub_name text, hub_slug text, programme_title text, course_id uuid, course_title text,
               starts_on date, ends_on date, enrolment_status text, lessons bigint, completed bigint, last_lesson uuid)
language sql stable security definer set search_path = ''
as $$
  select co.id, co.name, t.name, t.slug, p.title, c.id, c.title, co.starts_on, co.ends_on, e.status,
    (select count(*) from public.lessons l where l.course_id = c.id),
    (select count(*) from public.lessons l where l.course_id = c.id and (
       exists (select 1 from public.lesson_progress lp where lp.enrolment_id = e.id and lp.lesson_id = l.id and lp.completed_at is not null)
       or exists (select 1 from public.submissions s where s.enrolment_id = e.id and s.lesson_id = l.id and s.status = 'graded'))),
    (select lp.lesson_id from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where lp.enrolment_id = e.id and l.course_id = c.id order by lp.last_seen_at desc limit 1)
  from public.users u
  join public.applications a on a.email = u.email
  join public.enrolments e on e.application_id = a.id and e.status <> 'dropped'
  join public.cohorts co on co.id = e.cohort_id
  join public.programmes p on p.id = co.programme_id
  join public.tenants t on t.id = co.tenant_id
  left join public.courses c on c.id = co.course_id and c.status = 'published'
  where u.id = app.uid()
  order by co.starts_on desc nulls last
$$;

-- A cohort's course outline for the learner: every lesson, whether it is open and done.
create or replace function app.learner_outline(p_cohort uuid)
returns table (module_id uuid, module_title text, module_title_ha text, module_position integer, opens_on date,
               lesson_id uuid, kind text, title text, title_ha text, minutes integer, lesson_position integer, open boolean, completed boolean,
               passed boolean, submission_status text)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.title, m.title_ha, m.position,
    case when m.unlock_after_days is null or co.starts_on is null then null else co.starts_on + m.unlock_after_days end,
    l.id, l.kind, l.title, l.title_ha, l.minutes, l.position,
    (m.unlock_after_days is null or co.starts_on is null or co.starts_on + m.unlock_after_days <= (now() at time zone 'Africa/Lagos')::date),
    exists (select 1 from public.lesson_progress lp where lp.enrolment_id = e.id and lp.lesson_id = l.id and lp.completed_at is not null)
      or exists (select 1 from public.submissions s where s.enrolment_id = e.id and s.lesson_id = l.id and s.status = 'graded'),
    exists (select 1 from public.quiz_attempts qa where qa.enrolment_id = e.id and qa.lesson_id = l.id and qa.passed),
    (select s.status from public.submissions s where s.enrolment_id = e.id and s.lesson_id = l.id order by s.submitted_at desc limit 1)
  from public.cohorts co
  join public.courses c on c.id = co.course_id and c.status = 'published'
  join public.course_modules m on m.course_id = c.id
  join public.lessons l on l.module_id = m.id
  join public.enrolments e on e.id = app.my_enrolment(p_cohort)
  where co.id = p_cohort
  order by m.position, m.created_at, l.position, l.created_at
$$;

-- One open lesson with its content. Quiz questions come without the answers.
create or replace function app.learner_lesson(p_cohort uuid, p_lesson uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not app.lesson_open(p_cohort, p_lesson) then null else jsonb_build_object(
    'id', l.id, 'tenant_id', l.tenant_id, 'kind', l.kind, 'title', l.title, 'title_ha', l.title_ha, 'body', l.body, 'body_ha', l.body_ha,
    'media_url', l.media_url, 'has_file', l.file_path is not null, 'file_name', l.file_name, 'file_type', l.file_type, 'file_size', l.file_size,
    'minutes', l.minutes, 'pass_mark', l.pass_mark, 'max_attempts', l.max_attempts, 'submission_types', l.submission_types,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'prompt_ha', q.prompt_ha,
        'options', q.options, 'points', q.points) order by q.position, q.id) from public.quiz_questions q where q.lesson_id = l.id), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('score', qa.score, 'max_score', qa.max_score, 'percent', qa.percent, 'passed', qa.passed,
        'submitted_at', qa.submitted_at) order by qa.submitted_at) from public.quiz_attempts qa where qa.enrolment_id = app.my_enrolment(p_cohort) and qa.lesson_id = l.id), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'attempt', s.attempt, 'body', s.body, 'url', s.url, 'file_name', s.file_name,
        'status', s.status, 'score', s.score, 'feedback', s.feedback, 'submitted_at', s.submitted_at, 'graded_at', s.graded_at) order by s.submitted_at)
        from public.submissions s where s.enrolment_id = app.my_enrolment(p_cohort) and s.lesson_id = l.id), '[]'::jsonb),
    'completed', exists (select 1 from public.lesson_progress lp where lp.enrolment_id = app.my_enrolment(p_cohort) and lp.lesson_id = l.id and lp.completed_at is not null)
  ) end
  from public.lessons l where l.id = p_lesson
$$;

-- The stored file behind an open lesson (for the media route).
create or replace function app.lesson_file(p_cohort uuid, p_lesson uuid)
returns table (file_path text, file_name text, file_type text)
language sql stable security definer set search_path = ''
as $$ select l.file_path, l.file_name, l.file_type from public.lessons l where l.id = p_lesson and l.file_path is not null and app.lesson_open(p_cohort, p_lesson) $$;

-- Records a visit, and completion when asked. Progress only moves forward.
create or replace function app.record_progress(p_cohort uuid, p_lesson uuid, p_complete boolean) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_enrolment uuid := app.my_enrolment(p_cohort); v_tenant uuid;
begin
  if v_enrolment is null or not app.lesson_open(p_cohort, p_lesson) then return false; end if;
  select tenant_id into v_tenant from public.lessons where id = p_lesson;
  insert into public.lesson_progress (enrolment_id, lesson_id, tenant_id, completed_at)
  values (v_enrolment, p_lesson, v_tenant, case when p_complete then now() end)
  on conflict (enrolment_id, lesson_id) do update
    set last_seen_at = now(), completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at);
  return true;
end
$$;

-- Marks a quiz on the server (the device never sees the answers), records the attempt once per
-- client id, and writes the best result into the cohort's gradebook.
create or replace function app.submit_quiz(p_cohort uuid, p_lesson uuid, p_answers jsonb, p_client_id uuid)
returns table (score numeric, max_score integer, percent numeric, passed boolean, attempts bigint, duplicate boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_enrolment uuid := app.my_enrolment(p_cohort);
  l public.lessons;
  q record;
  v_score numeric := 0; v_max integer := 0; v_given text[]; v_percent numeric; v_passed boolean; v_used bigint;
  v_existing public.quiz_attempts;
begin
  if v_enrolment is null or not app.lesson_open(p_cohort, p_lesson) then raise exception 'This quiz is not open to you' using errcode = '42501'; end if;
  select * into l from public.lessons where id = p_lesson and kind = 'quiz';
  if not found then raise exception 'Not a quiz' using errcode = 'P0001'; end if;
  select * into v_existing from public.quiz_attempts where client_id = p_client_id;
  if found then
    if v_existing.enrolment_id <> v_enrolment then raise exception 'Invalid attempt' using errcode = '42501'; end if;
    return query select v_existing.score, v_existing.max_score, v_existing.percent, v_existing.passed,
      (select count(*) from public.quiz_attempts where enrolment_id = v_enrolment and lesson_id = p_lesson), true;
    return;
  end if;
  select count(*) into v_used from public.quiz_attempts where enrolment_id = v_enrolment and lesson_id = p_lesson;
  if l.max_attempts is not null and v_used >= l.max_attempts then raise exception 'No attempts left' using errcode = 'P0002'; end if;
  for q in select * from public.quiz_questions where lesson_id = p_lesson loop
    v_max := v_max + q.points;
    select coalesce(array_agg(x order by x), '{}') into v_given from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]'::jsonb)) x;
    if v_given = (select array_agg(c order by c) from unnest(q.correct) c) then v_score := v_score + q.points; end if;
  end loop;
  if v_max = 0 then raise exception 'This quiz has no questions yet' using errcode = 'P0001'; end if;
  v_percent := round(v_score / v_max * 100, 1);
  v_passed := v_percent >= l.pass_mark;
  insert into public.quiz_attempts (tenant_id, lesson_id, enrolment_id, client_id, answers, score, max_score, percent, passed)
  values (l.tenant_id, p_lesson, v_enrolment, p_client_id, p_answers, v_score, v_max, v_percent, v_passed);
  -- Best score counts in the gradebook.
  insert into public.assessment_results (tenant_id, assessment_id, enrolment_id, score, feedback, graded_by)
  select a.tenant_id, a.id, v_enrolment, round(best.percent / 100 * a.max_score, 2), 'Marked automatically', null
  from public.assessments a,
       lateral (select max(percent) as percent from public.quiz_attempts where enrolment_id = v_enrolment and lesson_id = p_lesson) best
  where a.cohort_id = p_cohort and a.lesson_id = p_lesson
  on conflict (assessment_id, enrolment_id) do update set score = excluded.score, graded_at = now();
  if v_passed then perform app.record_progress(p_cohort, p_lesson, true); end if;
  return query select v_score, v_max, v_percent, v_passed, v_used + 1, false;
end
$$;

-- A learner hands in an assignment: text, a link or an uploaded file (already in storage).
create or replace function app.submit_assignment(p_cohort uuid, p_lesson uuid, p_body text, p_url text,
                                                 p_file_path text, p_file_name text, p_file_type text, p_file_size bigint)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_enrolment uuid := app.my_enrolment(p_cohort); l public.lessons; v_last public.submissions; v_id uuid;
begin
  if v_enrolment is null or not app.lesson_open(p_cohort, p_lesson) then raise exception 'This assignment is not open to you' using errcode = '42501'; end if;
  select * into l from public.lessons where id = p_lesson and kind = 'assignment';
  if not found then raise exception 'Not an assignment' using errcode = 'P0001'; end if;
  select * into v_last from public.submissions where enrolment_id = v_enrolment and lesson_id = p_lesson order by submitted_at desc limit 1;
  if found and v_last.status = 'submitted' then raise exception 'Your work is waiting to be graded' using errcode = 'P0002'; end if;
  if found and v_last.status = 'graded' then raise exception 'Your work has been graded' using errcode = 'P0003'; end if;
  if p_file_path is not null and p_file_path not like 'tenants/' || l.tenant_id || '/submissions/%' then raise exception 'Invalid file' using errcode = '42501'; end if;
  insert into public.submissions (tenant_id, lesson_id, enrolment_id, attempt, body, url, file_path, file_name, file_type, file_size)
  values (l.tenant_id, p_lesson, v_enrolment, coalesce(v_last.attempt, 0) + 1, nullif(trim(p_body), ''), nullif(trim(p_url), ''),
          p_file_path, p_file_name, p_file_type, p_file_size)
  returning id into v_id;
  perform app.record_progress(p_cohort, p_lesson, false);
  return v_id;
end
$$;

-- The file of a submission, for the learner who sent it or the hub team.
create or replace function app.submission_file(p_submission uuid)
returns table (file_path text, file_name text, file_type text)
language sql stable security definer set search_path = ''
as $$
  select s.file_path, s.file_name, s.file_type from public.submissions s
  join public.enrolments e on e.id = s.enrolment_id
  where s.id = p_submission and s.file_path is not null
    and (app.is_member(s.tenant_id) or app.my_enrolment(e.cohort_id) = e.id)
$$;

-- What a learner has coming up across their cohorts: sessions in the next two weeks.
create or replace function app.learner_sessions()
returns table (cohort_id uuid, cohort_name text, hub_name text, title text, starts_at timestamptz, ends_at timestamptz, mode text, location text)
language sql stable security definer set search_path = ''
as $$
  select s.cohort_id, co.name, t.name, s.title, s.starts_at, s.ends_at, s.mode, s.location
  from public.class_sessions s join public.cohorts co on co.id = s.cohort_id join public.tenants t on t.id = co.tenant_id
  where app.my_enrolment(s.cohort_id) is not null and s.ends_at >= now() and s.starts_at < now() + interval '14 days'
  order by s.starts_at limit 10
$$;

-- The right answers and explanations, revealed only once the learner has passed the quiz or used
-- every attempt, so they cannot be read off before answering.
create or replace function app.quiz_review(p_cohort uuid, p_lesson uuid)
returns table (question_id uuid, correct text[], explanation text)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.correct, q.explanation from public.quiz_questions q join public.lessons l on l.id = q.lesson_id
  where q.lesson_id = p_lesson and app.lesson_open(p_cohort, p_lesson) and (
    exists (select 1 from public.quiz_attempts a where a.enrolment_id = app.my_enrolment(p_cohort) and a.lesson_id = p_lesson and a.passed)
    or (l.max_attempts is not null and (select count(*) from public.quiz_attempts a where a.enrolment_id = app.my_enrolment(p_cohort) and a.lesson_id = p_lesson) >= l.max_attempts))
  order by q.position, q.id
$$;

do $$
declare f text;
begin
  foreach f in array array['app.my_enrolment(uuid)', 'app.lesson_open(uuid, uuid)', 'app.learner_courses()', 'app.learner_outline(uuid)',
    'app.learner_lesson(uuid, uuid)', 'app.lesson_file(uuid, uuid)', 'app.record_progress(uuid, uuid, boolean)', 'app.submit_quiz(uuid, uuid, jsonb, uuid)',
    'app.submit_assignment(uuid, uuid, text, text, text, text, text, bigint)', 'app.submission_file(uuid)', 'app.learner_sessions()', 'app.quiz_review(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
