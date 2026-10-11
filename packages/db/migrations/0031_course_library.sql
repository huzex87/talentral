-- Course Library: ready-made courses that Talentral builds once (English with Hausa, quizzes,
-- assignments and rubrics) and any hub can take as its own. The library is a workspace of its own
-- (a tenant with kind 'library') where the platform team and Talentral Faculty author courses with
-- the normal course builder. A hub browses the published courses and copies one into its own
-- workspace as a draft, which it can then edit, publish and give to a cohort. Additive only:
-- previews share this database with production. Never edit this file once pushed.

-- ---------------------------------------------------------------- the library workspace

alter table public.tenants add column kind text not null default 'hub' check (kind in ('hub', 'library'));
-- There is one library.
create unique index tenants_one_library on public.tenants (kind) where kind = 'library';

insert into public.tenants (slug, name, tagline, kind)
values ('talentral-library', 'Talentral Course Library', 'Ready-made courses in English and Hausa', 'library')
on conflict (slug) do nothing;

-- The library is not a hub: visitors and other hubs never see it. Its own team (Talentral Faculty)
-- and the platform team do.
alter policy tenants_read on public.tenants
  using ((status = 'active' and kind = 'hub') or app.is_member(id) or app.is_platform_admin());

-- The library's id, or null if it does not exist.
create function app.library_tenant() returns uuid
language sql stable security definer set search_path = ''
as $$ select id from public.tenants where kind = 'library' limit 1 $$;

-- ---------------------------------------------------------------- where a course came from

-- A copied course remembers the library course it came from and when, so the hub can see when the
-- library has a newer version. The track groups library courses when hubs browse them.
alter table public.courses
  add column source_course_id uuid references public.courses (id) on delete set null,
  add column copied_at timestamptz,
  add column track text check (char_length(track) between 2 and 60);
create index on public.courses (source_course_id) where source_course_id is not null;
grant update (track) on public.courses to app_user;

-- The app role may insert courses with any column; only app.copy_library_course sets the source.
create function app.course_source_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'app_user' then
    new.source_course_id := null; new.copied_at := null;
  end if;
  return new;
end
$$;
create trigger courses_source_guard before insert on public.courses
  for each row execute function app.course_source_guard();

-- ---------------------------------------------------------------- browsing the library

-- Who may browse and copy for a hub: its owners and admins, and the platform team.
create function app.can_use_library(p_tenant uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tenants t where t.id = p_tenant and t.kind = 'hub' and t.status = 'active')
    and (app.has_role(p_tenant, array['owner', 'admin']) or app.is_platform_admin())
$$;

-- Published library courses, with their size, Hausa coverage and this hub's latest copy.
create function app.library_courses(p_tenant uuid)
returns table (id uuid, title text, summary text, track text, updated_at timestamptz, modules integer, lessons integer,
  minutes integer, quizzes integer, assignments integer, videos integer, hausa integer, copy_id uuid, copied_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.title, c.summary, c.track, c.updated_at,
    (select count(*)::int from public.course_modules m where m.course_id = c.id),
    (select count(*)::int from public.lessons l where l.course_id = c.id),
    (select coalesce(sum(l.minutes), 0)::int from public.lessons l where l.course_id = c.id),
    (select count(*)::int from public.lessons l where l.course_id = c.id and l.kind = 'quiz'),
    (select count(*)::int from public.lessons l where l.course_id = c.id and l.kind = 'assignment'),
    (select count(*)::int from public.lessons l where l.course_id = c.id and l.kind = 'video'),
    (select count(*)::int from public.lessons l where l.course_id = c.id and nullif(btrim(l.title_ha), '') is not null),
    cp.id, cp.copied_at
  from public.courses c
  left join lateral (
    select x.id, x.copied_at from public.courses x where x.tenant_id = p_tenant and x.source_course_id = c.id
    order by x.copied_at desc limit 1
  ) cp on true
  where app.can_use_library(p_tenant) and c.tenant_id = app.library_tenant() and c.status = 'published'
  order by c.track nulls last, c.title
$$;

-- One published library course's outline: modules and lessons with their kind, length and Hausa
-- titles, so a hub can judge it before taking it. Lesson content stays in the library.
create function app.library_outline(p_tenant uuid, p_course uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'summary', c.summary, 'track', c.track, 'updated_at', c.updated_at,
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'title_ha', m.title_ha, 'unlock_after_days', m.unlock_after_days,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'kind', l.kind, 'title', l.title, 'title_ha', l.title_ha, 'minutes', l.minutes,
            'hausa', nullif(btrim(l.body_ha), '') is not null or nullif(btrim(l.title_ha), '') is not null,
            'questions', (select count(*)::int from public.quiz_questions q where q.lesson_id = l.id),
            'rubric', (select count(*)::int from public.rubric_criteria r where r.lesson_id = l.id))
            order by l.position, l.created_at)
          from public.lessons l where l.module_id = m.id), '[]'::jsonb))
        order by m.position, m.created_at)
      from public.course_modules m where m.course_id = c.id), '[]'::jsonb))
  from public.courses c
  where c.id = p_course and app.can_use_library(p_tenant) and c.tenant_id = app.library_tenant() and c.status = 'published'
$$;

-- ---------------------------------------------------------------- taking a course

-- Copies a published library course into a hub as a draft: modules, lessons (with their files and
-- video links), quiz questions, marking rubrics and the platform skills each lesson proves. Files
-- are shared, not duplicated: lesson files are never deleted when a lesson changes, so the copy
-- keeps working whatever the library does next. Streamed video is not carried (a stream belongs to
-- one lesson); library video lessons use links. Returns the new course's id.
create function app.copy_library_course(p_tenant uuid, p_course uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  src public.courses;
  new_course uuid;
  new_module uuid;
  new_lesson uuid;
  m record;
  l record;
begin
  if not app.can_use_library(p_tenant) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into src from public.courses where id = p_course and tenant_id = app.library_tenant() and status = 'published';
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  insert into public.courses (tenant_id, title, summary, track, status, source_course_id, copied_at)
  values (p_tenant, src.title, src.summary, src.track, 'draft', src.id, now())
  returning id into new_course;

  for m in select * from public.course_modules where course_id = src.id order by position, created_at loop
    insert into public.course_modules (tenant_id, course_id, title, title_ha, position, unlock_after_days)
    values (p_tenant, new_course, m.title, m.title_ha, m.position, m.unlock_after_days)
    returning id into new_module;

    for l in select * from public.lessons where module_id = m.id order by position, created_at loop
      insert into public.lessons (tenant_id, course_id, module_id, kind, title, title_ha, body, body_ha, media_url,
        file_path, file_name, file_type, file_size, minutes, pass_mark, max_attempts, submission_types, position, peer_reviews)
      values (p_tenant, new_course, new_module, l.kind, l.title, l.title_ha, l.body, l.body_ha, l.media_url,
        l.file_path, l.file_name, l.file_type, l.file_size, l.minutes, l.pass_mark, l.max_attempts, l.submission_types, l.position, l.peer_reviews)
      returning id into new_lesson;

      insert into public.quiz_questions (tenant_id, lesson_id, kind, prompt, prompt_ha, options, correct, points, explanation, position)
      select p_tenant, new_lesson, q.kind, q.prompt, q.prompt_ha, q.options, q.correct, q.points, q.explanation, q.position
      from public.quiz_questions q where q.lesson_id = l.id;

      insert into public.rubric_criteria (tenant_id, lesson_id, position, title, title_ha, description, description_ha, levels)
      select p_tenant, new_lesson, r.position, r.title, r.title_ha, r.description, r.description_ha, r.levels
      from public.rubric_criteria r where r.lesson_id = l.id;

      -- Only shared platform skills travel; the library's own skills mean nothing in the hub.
      insert into public.lesson_skills (lesson_id, skill_id, tenant_id)
      select new_lesson, ls.skill_id, p_tenant
      from public.lesson_skills ls join public.skills s on s.id = ls.skill_id
      where ls.lesson_id = l.id and s.tenant_id is null;
    end loop;
  end loop;

  perform app.audit(p_tenant, 'course.copied_from_library', 'course', new_course,
    jsonb_build_object('title', src.title, 'library_course_id', src.id));
  return new_course;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['app.library_tenant()', 'app.can_use_library(uuid)', 'app.library_courses(uuid)',
    'app.library_outline(uuid, uuid)', 'app.copy_library_course(uuid, uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
