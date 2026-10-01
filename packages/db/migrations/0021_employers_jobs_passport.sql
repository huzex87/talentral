-- MVP-2 month 7: employer organisations and verification, job posting, Passport v2 (portfolio,
-- availability, verification labels). Additive only: previews run against the shared database.

-- ================================================================ employer organisations

-- Verification evidence and the talent team's decision. A rejected employer sees the reason, can
-- fix their details and ask for another review.
alter table public.employers
  add column cac_number text check (char_length(cac_number) <= 20),
  add column review_note text check (char_length(review_note) <= 1000),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.users (id) on delete set null,
  add column review_requested_at timestamptz;
alter table public.employers drop constraint employers_status_check;
alter table public.employers add constraint employers_status_check check (status in ('pending', 'verified', 'rejected', 'suspended'));

-- The employer's own organisations, now with the verification details they may see.
create or replace function app.my_employers_v2()
returns table (id uuid, name text, sector text, website text, state text, size text, contact_name text, contact_email text,
               contact_phone text, status text, verified_at timestamptz, created_at timestamptz, cac_number text, review_note text,
               reviewed_at timestamptz, review_requested_at timestamptz, my_role text)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.name, e.sector, e.website, e.state, e.size, e.contact_name, e.contact_email::text, e.contact_phone, e.status, e.verified_at,
    e.created_at, e.cac_number, case when e.status in ('rejected', 'suspended') then e.review_note end, e.reviewed_at, e.review_requested_at, m.role
  from public.employers e join public.employer_members m on m.employer_id = e.id
  where m.user_id = app.uid() order by e.created_at
$$;

-- Details the employer keeps up to date, including the CAC registration number.
create or replace function app.save_employer_details(p_employer uuid, p_sector text, p_website text, p_state text, p_size text,
                                                     p_contact_name text, p_contact_phone text, p_cac text) returns boolean
language sql security definer set search_path = ''
as $$
  with u as (
    update public.employers set sector = nullif(trim(p_sector), ''), website = nullif(trim(p_website), ''), state = nullif(p_state, ''),
      size = nullif(p_size, ''), contact_name = nullif(trim(p_contact_name), ''), contact_phone = nullif(trim(p_contact_phone), ''),
      cac_number = nullif(upper(regexp_replace(trim(p_cac), '\s+', ' ', 'g')), '')
    where id = p_employer and app.is_employer_member(p_employer) returning 1)
  select exists (select 1 from u)
$$;

-- After a rejection, the employer asks for another review.
create or replace function app.request_employer_review(p_employer uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_employer_member(p_employer) then raise exception 'Not your organisation' using errcode = '42501'; end if;
  update public.employers set status = 'pending', review_requested_at = now() where id = p_employer and status = 'rejected';
  if not found then raise exception 'This organisation is not waiting for changes' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id) values (app.uid(), 'employer.review_requested', 'employer', p_employer);
end
$$;

-- The talent team's decision: verify, reject (with a reason the employer sees) or pause.
create or replace function app.review_employer(p_employer uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  if p_decision not in ('verified', 'rejected', 'suspended') then raise exception 'Unknown decision' using errcode = '22023'; end if;
  if p_decision in ('rejected', 'suspended') and char_length(coalesce(trim(p_note), '')) < 10 then
    raise exception 'Give the employer a reason of at least 10 characters' using errcode = '22023';
  end if;
  update public.employers set status = p_decision, review_note = nullif(trim(p_note), ''), reviewed_at = now(), reviewed_by = app.uid(),
    verified_at = case when p_decision = 'verified' then now() else verified_at end
  where id = p_employer;
  if not found then raise exception 'Employer not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'employer.' || p_decision, 'employer', p_employer, jsonb_build_object('note', nullif(trim(p_note), '')));
end
$$;

-- ---------------------------------------------------------------- employer teams

create or replace function app.is_employer_owner(e uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.employer_members m where m.employer_id = e and m.user_id = app.uid() and m.role = 'owner') $$;

-- The organisation's people, for its members.
create or replace function app.employer_team(p_employer uuid)
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (app.is_employer_member(p_employer) or app.is_platform_admin()) then raise exception 'Not your organisation' using errcode = '42501'; end if;
  return query select m.user_id, u.email::text, u.full_name, m.role, m.created_at, u.last_sign_in_at
    from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = p_employer order by m.created_at;
end
$$;

-- An owner adds a colleague by email. They get access by signing in with that email, which proves
-- it is theirs. Up to 20 people per organisation.
create or replace function app.add_employer_member(p_employer uuid, p_email text, p_name text, p_role text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_email text := lower(trim(p_email)); v_user uuid;
begin
  if not app.is_employer_owner(p_employer) then raise exception 'Only owners can add people' using errcode = '42501'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if (select count(*) from public.employer_members where employer_id = p_employer) >= 20 then raise exception 'An organisation can have up to 20 people' using errcode = 'P0001'; end if;
  insert into public.users (email, full_name) values (v_email, nullif(trim(p_name), ''))
  on conflict (email) do update set full_name = coalesce(public.users.full_name, excluded.full_name) returning id into v_user;
  insert into public.employer_members (employer_id, user_id, role) values (p_employer, v_user, p_role)
  on conflict (employer_id, user_id) do nothing;
  if not found then raise exception 'Already in your team' using errcode = 'P0001'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), 'employer.member_added', 'employer', p_employer, jsonb_build_object('email', v_email, 'role', p_role));
  return v_user;
end
$$;

-- Owners change roles and remove people; anyone may leave. The last owner always stays.
create or replace function app.change_employer_member(p_employer uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (app.is_employer_owner(p_employer) or (p_role is null and p_user = app.uid() and app.is_employer_member(p_employer))) then
    raise exception 'Only owners can change the team' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('owner', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  if (p_role is null or p_role = 'member')
     and exists (select 1 from public.employer_members where employer_id = p_employer and user_id = p_user and role = 'owner')
     and (select count(*) from public.employer_members where employer_id = p_employer and role = 'owner') = 1 then
    raise exception 'Every organisation needs an owner. Make someone else an owner first.' using errcode = 'P0001';
  end if;
  if p_role is null then
    delete from public.employer_members where employer_id = p_employer and user_id = p_user;
  else
    update public.employer_members set role = p_role where employer_id = p_employer and user_id = p_user;
  end if;
  if not found then raise exception 'Not in this team' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), case when p_role is null then 'employer.member_removed' else 'employer.member_role_changed' end, 'employer', p_employer,
          jsonb_build_object('user', p_user, 'role', p_role));
end
$$;

-- ================================================================ job posting

-- Jobs start as drafts or go straight out; they carry requirements, a closing date and whether they
-- are listed on the Talentral jobs board (otherwise they are for invitations only).
alter table public.job_roles
  add column requirements text check (char_length(requirements) <= 3000),
  add column closes_on date,
  add column on_board boolean not null default true,
  add column published_at timestamptz;
alter table public.job_roles drop constraint job_roles_status_check;
alter table public.job_roles add constraint job_roles_status_check check (status in ('draft', 'open', 'filled', 'closed'));
update public.job_roles set published_at = created_at where published_at is null and status <> 'draft';
grant update (requirements, closes_on, on_board, published_at) on public.job_roles to app_user;
create index job_roles_board on public.job_roles (status, closes_on) where on_board;

-- Open jobs on the board: from verified employers, listed, and not past their closing date (WAT).
-- Public, like any job advert; the employer's contact details are never included.
create or replace function app.job_board()
returns table (id uuid, title text, description text, requirements text, skills text[], work_mode text, job_type text, state text,
               pay_min integer, pay_max integer, openings integer, closes_on date, published_at timestamptz,
               employer_id uuid, employer_name text, employer_sector text, employer_website text, employer_state text, employer_size text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.title, r.description, r.requirements, r.skills, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max, r.openings,
    r.closes_on, coalesce(r.published_at, r.created_at), e.id, e.name, e.sector, e.website, e.state, e.size
  from public.job_roles r join public.employers e on e.id = r.employer_id
  where r.status = 'open' and r.on_board and e.status = 'verified'
    and (r.closes_on is null or r.closes_on >= (now() at time zone 'Africa/Lagos')::date)
  order by coalesce(r.published_at, r.created_at) desc
$$;

-- ================================================================ Passport v2

-- Availability beyond a single choice: from which date, relocation, and the roles they want.
alter table public.passports
  add column available_from date,
  add column relocate boolean not null default false,
  add column target_roles text[] not null default '{}' check (cardinality(target_roles) <= 5);
grant update (available_from, relocate, target_roles) on public.passports to app_user;

-- Projects and work samples. Linked to graded work on Talentral, an item is platform-evidenced; a
-- talent officer can mark it verified after checking it. Changing an item clears that mark.
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 1000),
  url text check (char_length(url) <= 300 and url ~ '^https?://'),
  skills text[] not null default '{}' check (cardinality(skills) <= 10),
  submission_id uuid references public.submissions (id) on delete set null,
  position integer not null default 0,
  verified_at timestamptz,
  verified_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (url is not null or submission_id is not null or description is not null)
);
create index on public.portfolio_items (user_id, position);
alter table public.portfolio_items enable row level security;
create policy portfolio_read on public.portfolio_items for select to app_user using (user_id = app.uid() or app.can_view_passport(user_id));
create policy portfolio_insert on public.portfolio_items for insert to app_user with check (user_id = app.uid());
create policy portfolio_update on public.portfolio_items for update to app_user using (user_id = app.uid()) with check (user_id = app.uid());
create policy portfolio_delete on public.portfolio_items for delete to app_user using (user_id = app.uid());
grant select, delete on public.portfolio_items to app_user;
grant insert (user_id, title, description, url, skills, submission_id, position) on public.portfolio_items to app_user;
grant update (title, description, url, skills, submission_id, position) on public.portfolio_items to app_user;

-- Graded work the person handed in on Talentral, which a portfolio item can point to.
create or replace function app.my_graded_work()
returns table (submission_id uuid, lesson_title text, course_title text, hub_name text, score numeric, graded_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select distinct on (s.lesson_id) s.id, l.title, c.title, t.name, s.score, s.graded_at
  from public.submissions s
  join public.enrolments e on e.id = s.enrolment_id
  join public.applications a on a.id = e.application_id
  join public.users u on u.email = a.email and u.id = app.uid()
  join public.lessons l on l.id = s.lesson_id
  join public.courses c on c.id = l.course_id
  join public.tenants t on t.id = s.tenant_id
  where s.status = 'graded'
  order by s.lesson_id, s.graded_at desc nulls last
$$;

-- Keeps items honest: a linked submission must be the person's own graded work, and any change to
-- a verified item clears the verification.
create or replace function app.portfolio_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.submission_id is not null and not exists (
    select 1 from public.submissions s join public.enrolments e on e.id = s.enrolment_id join public.applications a on a.id = e.application_id
    join public.users u on u.email = a.email where s.id = new.submission_id and u.id = new.user_id and s.status = 'graded') then
    raise exception 'Link only your own graded work' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if (new.title, new.description, new.url, new.skills, new.submission_id) is distinct from (old.title, old.description, old.url, old.skills, old.submission_id)
       and new.verified_at is not distinct from old.verified_at then
      new.verified_at := null; new.verified_by := null;
    end if;
  end if;
  if (select count(*) from public.portfolio_items where user_id = new.user_id and id <> new.id) >= 12 then
    raise exception 'Add up to 12 portfolio items' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger portfolio_items_guard before insert or update on public.portfolio_items for each row execute function app.portfolio_guard();

-- A Passport's portfolio as others may see it (the person, or whoever can view the Passport), with
-- the graded work behind linked items: lesson, course, hub and score.
create or replace function app.portfolio_view(p_user uuid)
returns table (id uuid, title text, description text, url text, skills text[], submission_id uuid, verified_at timestamptz, sort_order integer,
               created_at timestamptz, lesson_title text, course_title text, hub_name text, score numeric)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.title, i.description, i.url, i.skills, i.submission_id, i.verified_at, i.position, i.created_at, l.title, c.title, t.name, s.score
  from public.portfolio_items i
  left join public.submissions s on s.id = i.submission_id
  left join public.lessons l on l.id = s.lesson_id
  left join public.courses c on c.id = l.course_id
  left join public.tenants t on t.id = s.tenant_id
  where i.user_id = p_user and (p_user = app.uid() or app.can_view_passport(p_user))
  order by i.position, i.created_at
$$;

-- A talent officer marks an item verified (or not) after checking it.
create or replace function app.verify_portfolio_item(p_item uuid, p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if not app.is_platform_admin() then raise exception 'Platform team only' using errcode = '42501'; end if;
  update public.portfolio_items set verified_at = case when p_on then now() end, verified_by = case when p_on then app.uid() end
  where id = p_item returning user_id into v_user;
  if v_user is null then raise exception 'Item not found' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, metadata)
  values (app.uid(), case when p_on then 'passport.portfolio_verified' else 'passport.portfolio_unverified' end, 'portfolio_item', p_item, jsonb_build_object('user', v_user));
end
$$;

do $$
declare f text;
begin
  foreach f in array array['app.my_employers_v2()', 'app.save_employer_details(uuid, text, text, text, text, text, text, text)',
    'app.request_employer_review(uuid)', 'app.review_employer(uuid, text, text)', 'app.is_employer_owner(uuid)', 'app.employer_team(uuid)',
    'app.add_employer_member(uuid, text, text, text)', 'app.change_employer_member(uuid, uuid, text)', 'app.job_board()',
    'app.my_graded_work()', 'app.verify_portfolio_item(uuid, boolean)', 'app.portfolio_view(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;
revoke all on function app.portfolio_guard() from public;
