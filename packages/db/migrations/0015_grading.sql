-- Sprint 10: marking rubrics on assignments, marks per criterion, and anonymous peer review.
-- Additive only (learner_lesson and submission_file are replaced with supersets).

-- ---------------------------------------------------------------- rubrics

-- Each criterion has levels, such as Excellent (4), Good (3), Fair (2), Needs work (1).
create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(title) between 2 and 120),
  title_ha text check (char_length(title_ha) <= 120),
  description text check (char_length(description) <= 600),
  description_ha text check (char_length(description_ha) <= 600),
  levels jsonb not null check (jsonb_typeof(levels) = 'array' and jsonb_array_length(levels) between 2 and 6),
  created_at timestamptz not null default now()
);
create index on public.rubric_criteria (lesson_id, position);

create table public.submission_marks (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  points numeric(5, 1) not null check (points >= 0),
  comment text check (char_length(comment) <= 600),
  primary key (submission_id, criterion_id)
);

-- How many classmates' work each learner reviews after handing in (0 turns peer review off).
alter table public.lessons add column peer_reviews integer not null default 0 check (peer_reviews between 0 and 3);
grant update (peer_reviews) on public.lessons to app_user;

create table public.peer_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reviewer_enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  marks jsonb not null default '{}'::jsonb,
  comment text check (char_length(comment) <= 2000),
  hidden boolean not null default false,
  unique (submission_id, reviewer_enrolment_id)
);
create index on public.peer_reviews (reviewer_enrolment_id);

alter table public.rubric_criteria enable row level security;
alter table public.submission_marks enable row level security;
alter table public.peer_reviews enable row level security;

create policy rubric_read on public.rubric_criteria for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy rubric_write on public.rubric_criteria for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.lessons l where l.id = rubric_criteria.lesson_id and l.tenant_id = rubric_criteria.tenant_id and l.kind = 'assignment'));
-- Anyone on the team can grade, as with scores.
create policy marks_read on public.submission_marks for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy marks_write on public.submission_marks for all to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin())
  with check ((app.is_member(tenant_id) or app.is_platform_admin()) and exists (select 1 from public.submissions s where s.id = submission_marks.submission_id and s.tenant_id = submission_marks.tenant_id));
create policy peer_read on public.peer_reviews for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy peer_hide on public.peer_reviews for update to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin()) with check (app.is_member(tenant_id) or app.is_platform_admin());

grant select, insert, delete on public.rubric_criteria to app_user;
grant update (position, title, title_ha, description, description_ha, levels) on public.rubric_criteria to app_user;
grant select, insert, update, delete on public.submission_marks to app_user;
grant select on public.peer_reviews to app_user;
grant update (hidden) on public.peer_reviews to app_user;

-- The most a criterion can score: its highest level.
create or replace function app.criterion_max(p_levels jsonb) returns numeric
language sql immutable set search_path = ''
as $$ select coalesce(max((x ->> 'points')::numeric), 0) from jsonb_array_elements(p_levels) x $$;

-- ---------------------------------------------------------------- learner view

create or replace function app.learner_lesson(p_cohort uuid, p_lesson uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not app.lesson_open(p_cohort, p_lesson) then null else jsonb_build_object(
    'id', l.id, 'tenant_id', l.tenant_id, 'kind', l.kind, 'title', l.title, 'title_ha', l.title_ha, 'body', l.body, 'body_ha', l.body_ha,
    'media_url', l.media_url, 'has_file', l.file_path is not null, 'file_name', l.file_name, 'file_type', l.file_type, 'file_size', l.file_size,
    'minutes', l.minutes, 'pass_mark', l.pass_mark, 'max_attempts', l.max_attempts, 'submission_types', l.submission_types,
    'peer_reviews', l.peer_reviews,
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'prompt_ha', q.prompt_ha,
        'options', q.options, 'points', q.points) order by q.position, q.id) from public.quiz_questions q where q.lesson_id = l.id), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('score', qa.score, 'max_score', qa.max_score, 'percent', qa.percent, 'passed', qa.passed,
        'submitted_at', qa.submitted_at) order by qa.submitted_at) from public.quiz_attempts qa where qa.enrolment_id = app.my_enrolment(p_cohort) and qa.lesson_id = l.id), '[]'::jsonb),
    'rubric', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'title_ha', r.title_ha, 'description', r.description,
        'description_ha', r.description_ha, 'levels', r.levels) order by r.position, r.created_at) from public.rubric_criteria r where r.lesson_id = l.id), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'attempt', s.attempt, 'body', s.body, 'url', s.url, 'file_name', s.file_name,
        'status', s.status, 'score', s.score, 'feedback', s.feedback, 'submitted_at', s.submitted_at, 'graded_at', s.graded_at,
        'marks', coalesce((select jsonb_object_agg(m.criterion_id, jsonb_build_object('points', m.points, 'comment', m.comment))
                           from public.submission_marks m where m.submission_id = s.id), '{}'::jsonb),
        -- Classmates' reviews of this work: anonymous, and only once finished and not hidden by the hub.
        'peer', coalesce((select jsonb_agg(jsonb_build_object('marks', p.marks, 'comment', p.comment, 'at', p.completed_at) order by p.completed_at)
                          from public.peer_reviews p where p.submission_id = s.id and p.completed_at is not null and not p.hidden), '[]'::jsonb)
        ) order by s.submitted_at)
        from public.submissions s where s.enrolment_id = app.my_enrolment(p_cohort) and s.lesson_id = l.id), '[]'::jsonb),
    'completed', exists (select 1 from public.lesson_progress lp where lp.enrolment_id = app.my_enrolment(p_cohort) and lp.lesson_id = l.id and lp.completed_at is not null)
  ) end
  from public.lessons l where l.id = p_lesson
$$;

-- ---------------------------------------------------------------- peer review

-- The classmates' work a learner reviews for an assignment. Reviews are handed out once the
-- learner has handed in their own work: each goes to the latest work of a classmate in the same
-- cohort, preferring work with the fewest reviewers, never the learner's own, never twice.
create or replace function app.my_peer_tasks(p_cohort uuid, p_lesson uuid)
returns table (review_id uuid, submission_id uuid, body text, url text, file_name text, completed boolean, marks jsonb, comment text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare v_me uuid := app.my_enrolment(p_cohort); l public.lessons; v_have integer;
begin
  if v_me is null or not app.lesson_open(p_cohort, p_lesson) then return; end if;
  select * into l from public.lessons where id = p_lesson and kind = 'assignment';
  if not found or l.peer_reviews = 0 then return; end if;
  if not exists (select 1 from public.submissions s where s.enrolment_id = v_me and s.lesson_id = p_lesson) then return; end if;

  select count(*) into v_have from public.peer_reviews pr join public.submissions s on s.id = pr.submission_id
  where pr.reviewer_enrolment_id = v_me and s.lesson_id = p_lesson;
  if v_have < l.peer_reviews then
    insert into public.peer_reviews (tenant_id, submission_id, reviewer_enrolment_id)
    select l.tenant_id, c.id, v_me from (
      select distinct on (s.enrolment_id) s.id, s.enrolment_id from public.submissions s join public.enrolments e on e.id = s.enrolment_id
      where s.lesson_id = p_lesson and e.cohort_id = p_cohort and e.status <> 'dropped' and s.enrolment_id <> v_me
        and not exists (select 1 from public.peer_reviews pr join public.submissions s2 on s2.id = pr.submission_id
                        where pr.reviewer_enrolment_id = v_me and s2.enrolment_id = s.enrolment_id and s2.lesson_id = p_lesson)
      order by s.enrolment_id, s.submitted_at desc) c
    order by (select count(*) from public.peer_reviews pr where pr.submission_id = c.id), random()
    limit l.peer_reviews - v_have
    on conflict do nothing;
  end if;

  return query
    select pr.id, s.id, s.body, s.url, s.file_name, pr.completed_at is not null, pr.marks, pr.comment
    from public.peer_reviews pr join public.submissions s on s.id = pr.submission_id
    where pr.reviewer_enrolment_id = v_me and s.lesson_id = p_lesson order by pr.assigned_at;
end
$$;

-- A learner finishes a review: a level for each criterion (if the assignment has a rubric) and
-- a comment. Reviews cannot be changed afterwards.
create or replace function app.submit_peer_review(p_review uuid, p_marks jsonb, p_comment text) returns void
language plpgsql security definer set search_path = ''
as $$
declare pr public.peer_reviews; v_cohort uuid; v_lesson uuid; c record; v_points numeric;
begin
  select * into pr from public.peer_reviews where id = p_review;
  if not found then raise exception 'Review not found' using errcode = '42501'; end if;
  select e.cohort_id, s.lesson_id into v_cohort, v_lesson from public.submissions s join public.enrolments e on e.id = s.enrolment_id where s.id = pr.submission_id;
  if app.my_enrolment(v_cohort) is distinct from pr.reviewer_enrolment_id then raise exception 'Review not found' using errcode = '42501'; end if;
  if pr.completed_at is not null then raise exception 'You have already sent this review' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_comment, ''))) not between 10 and 2000 then raise exception 'Write a comment of at least 10 characters' using errcode = 'P0002'; end if;
  for c in select id, levels from public.rubric_criteria where lesson_id = v_lesson loop
    v_points := (p_marks ->> c.id::text)::numeric;
    if v_points is null or not exists (select 1 from jsonb_array_elements(c.levels) x where (x ->> 'points')::numeric = v_points) then
      raise exception 'Choose a level for every criterion' using errcode = 'P0003';
    end if;
  end loop;
  update public.peer_reviews set completed_at = now(), comment = trim(p_comment),
    marks = coalesce((select jsonb_object_agg(r.id, (p_marks ->> r.id::text)::numeric) from public.rubric_criteria r where r.lesson_id = v_lesson), '{}'::jsonb)
  where id = p_review;
end
$$;

-- Files handed in: the learner who sent them, the hub team, and classmates asked to review them.
create or replace function app.submission_file(p_submission uuid)
returns table (file_path text, file_name text, file_type text)
language sql stable security definer set search_path = ''
as $$
  select s.file_path, s.file_name, s.file_type from public.submissions s
  join public.enrolments e on e.id = s.enrolment_id
  where s.id = p_submission and s.file_path is not null
    and (app.is_member(s.tenant_id) or app.my_enrolment(e.cohort_id) = e.id
         or exists (select 1 from public.peer_reviews pr where pr.submission_id = s.id and pr.reviewer_enrolment_id = app.my_enrolment(e.cohort_id)))
$$;

do $$
declare f text;
begin
  foreach f in array array['app.my_peer_tasks(uuid, uuid)', 'app.submit_peer_review(uuid, jsonb, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- platform support

-- The platform team can open any hub's dashboard to help set it up. These course and grading
-- rules let their changes take effect too, instead of silently changing nothing.
alter policy courses_write on public.courses
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());
alter policy modules_write on public.course_modules
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.courses c where c.id = course_modules.course_id and c.tenant_id = course_modules.tenant_id));
alter policy lessons_write on public.lessons
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.course_modules m where m.id = lessons.module_id and m.course_id = lessons.course_id and m.tenant_id = lessons.tenant_id));
alter policy lesson_skills_write on public.lesson_skills
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.lessons l where l.id = lesson_skills.lesson_id and l.tenant_id = lesson_skills.tenant_id));
alter policy questions_write on public.quiz_questions
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.lessons l where l.id = quiz_questions.lesson_id and l.tenant_id = quiz_questions.tenant_id));
alter policy submissions_grade on public.submissions
  using (app.is_member(tenant_id) or app.is_platform_admin())
  with check ((app.is_member(tenant_id) or app.is_platform_admin()) and graded_by = app.uid());
alter policy assessments_write on public.assessments
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check ((app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
              and exists (select 1 from public.cohorts c where c.id = assessments.cohort_id and c.tenant_id = assessments.tenant_id));
alter policy results_insert on public.assessment_results
  with check ((app.is_member(tenant_id) or app.is_platform_admin()) and graded_by = app.uid() and exists (
    select 1 from public.assessments a join public.enrolments e on e.cohort_id = a.cohort_id
    where a.id = assessment_results.assessment_id and a.tenant_id = assessment_results.tenant_id
      and e.id = assessment_results.enrolment_id and e.tenant_id = assessment_results.tenant_id
      and assessment_results.score <= a.max_score));
alter policy results_update on public.assessment_results
  using (app.is_member(tenant_id) or app.is_platform_admin())
  with check ((app.is_member(tenant_id) or app.is_platform_admin()) and graded_by = app.uid() and exists (
    select 1 from public.assessments a where a.id = assessment_results.assessment_id and assessment_results.score <= a.max_score));
