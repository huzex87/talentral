-- Connecting verified talent to work: the learner-owned Passport with consent, and a talent
-- officer console (employers, roles, candidates, placements) with expiring shortlist links.
-- Talent officers are platform admins for now.

-- ---------------------------------------------------------------- Passport

create table public.passports (
  user_id uuid primary key references public.users (id) on delete cascade,
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 1500),
  state text check (char_length(state) <= 40),
  city text check (char_length(city) <= 80),
  languages text[] not null default '{}' check (cardinality(languages) <= 10),
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  availability text not null default 'immediately' check (availability in ('immediately', 'one_month', 'three_months', 'not_looking')),
  work_modes text[] not null default '{}' check (work_modes <@ array['remote', 'hybrid', 'on_site']),
  job_types text[] not null default '{}' check (job_types <@ array['full_time', 'part_time', 'contract', 'internship', 'freelance']),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6),
  show_scores boolean not null default true,
  -- Consents: each one separate, timestamped and revocable in one tap.
  discoverable boolean not null default false,
  discoverable_at timestamptz,
  employer_sharing boolean not null default false,
  employer_sharing_at timestamptz,
  research boolean not null default false,
  research_at timestamptz,
  -- Set only by a talent officer (through app.set_passport_verified) after an identity check.
  verified_at timestamptz,
  verified_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.passports (discoverable) where discoverable;
create trigger passports_touch before update on public.passports for each row execute function app.touch();

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('discoverable', 'employer_sharing', 'research')),
  granted boolean not null,
  at timestamptz not null default now()
);
create index on public.consent_events (user_id, at desc);

-- Records every consent change and stamps its time, whoever made it.
create or replace function app.passport_consents() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare k text;
begin
  foreach k in array array['discoverable', 'employer_sharing', 'research'] loop
    if tg_op = 'INSERT' and (to_jsonb(new) ->> k)::boolean
       or tg_op = 'UPDATE' and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k) then
      insert into public.consent_events (user_id, kind, granted) values (new.user_id, k, (to_jsonb(new) ->> k)::boolean);
    end if;
  end loop;
  if tg_op = 'INSERT' or new.discoverable is distinct from old.discoverable then new.discoverable_at := case when new.discoverable then now() end; end if;
  if tg_op = 'INSERT' or new.employer_sharing is distinct from old.employer_sharing then new.employer_sharing_at := case when new.employer_sharing then now() end; end if;
  if tg_op = 'INSERT' or new.research is distinct from old.research then new.research_at := case when new.research then now() end; end if;
  return new;
end
$$;
create trigger passports_consents before insert or update on public.passports for each row execute function app.passport_consents();

-- ---------------------------------------------------------------- employers, roles, candidates

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  sector text check (char_length(sector) <= 80),
  website text check (char_length(website) <= 300),
  state text check (char_length(state) <= 40),
  contact_name text check (char_length(contact_name) <= 120),
  contact_email citext check (char_length(contact_email) <= 160),
  contact_phone text check (char_length(contact_phone) <= 30),
  stage text not null default 'lead' check (stage in ('lead', 'engaged', 'active', 'dormant')),
  notes text check (char_length(notes) <= 4000),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger employers_touch before update on public.employers for each row execute function app.touch();

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text check (char_length(description) <= 4000),
  skills text[] not null default '{}' check (cardinality(skills) <= 20),
  work_mode text not null default 'remote' check (work_mode in ('remote', 'hybrid', 'on_site')),
  job_type text not null default 'full_time' check (job_type in ('full_time', 'part_time', 'contract', 'internship', 'freelance')),
  state text check (char_length(state) <= 40),
  pay_min integer check (pay_min >= 0),
  pay_max integer check (pay_max >= 0),
  openings integer not null default 1 check (openings between 1 and 500),
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (pay_min is null or pay_max is null or pay_max >= pay_min)
);
create index on public.job_roles (employer_id);

create table public.role_candidates (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.job_roles (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- The candidate confirms interest before an employer ever sees them.
  interest text not null default 'pending' check (interest in ('pending', 'confirmed', 'declined')),
  interest_at timestamptz,
  stage text not null default 'shortlisted' check (stage in ('shortlisted', 'interviewed', 'offered', 'placed', 'declined')),
  notes text check (char_length(notes) <= 2000),
  placement_type text check (placement_type in ('full_time', 'part_time', 'contract', 'internship', 'freelance')),
  start_date date,
  pay_band text check (char_length(pay_band) <= 60),
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, user_id)
);
create index on public.role_candidates (user_id);
create trigger role_candidates_touch before update on public.role_candidates for each row execute function app.touch();

create table public.shortlist_links (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.job_roles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.shortlist_links (role_id);

create table public.shortlist_views (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.shortlist_links (id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index on public.shortlist_views (link_id, viewed_at desc);

-- ---------------------------------------------------------------- Row-Level Security

alter table public.passports enable row level security;
alter table public.consent_events enable row level security;
alter table public.employers enable row level security;
alter table public.job_roles enable row level security;
alter table public.role_candidates enable row level security;
alter table public.shortlist_links enable row level security;
alter table public.shortlist_views enable row level security;

-- Learners own their Passport. Talent officers see it only while it is discoverable, so
-- withdrawing consent removes it from search at once.
create policy passports_read on public.passports for select to app_user
  using (user_id = app.uid() or (discoverable and app.is_platform_admin()));
create policy passports_insert on public.passports for insert to app_user with check (user_id = app.uid());
create policy passports_update on public.passports for update to app_user using (user_id = app.uid()) with check (user_id = app.uid());
grant select, insert on public.passports to app_user;
grant update (headline, bio, state, city, languages, skills, availability, work_modes, job_types, links, show_scores,
              discoverable, employer_sharing, research) on public.passports to app_user;

create policy consents_read on public.consent_events for select to app_user using (user_id = app.uid());
grant select on public.consent_events to app_user;

create policy employers_all on public.employers for all to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy roles_all on public.job_roles for all to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy candidates_read on public.role_candidates for select to app_user using (app.is_platform_admin());
create policy candidates_insert on public.role_candidates for insert to app_user
  with check (app.is_platform_admin() and exists (select 1 from public.passports p where p.user_id = role_candidates.user_id and p.discoverable));
create policy candidates_update on public.role_candidates for update to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy candidates_delete on public.role_candidates for delete to app_user using (app.is_platform_admin());
create policy links_all on public.shortlist_links for all to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy views_read on public.shortlist_views for select to app_user using (app.is_platform_admin());

grant select, insert, delete on public.employers, public.job_roles to app_user;
grant update (name, sector, website, state, contact_name, contact_email, contact_phone, stage, notes) on public.employers to app_user;
grant update (title, description, skills, work_mode, job_type, state, pay_min, pay_max, openings, status) on public.job_roles to app_user;
grant select, insert, delete on public.role_candidates to app_user;
grant update (stage, notes, placement_type, start_date, pay_band) on public.role_candidates to app_user;
grant select, insert on public.shortlist_links to app_user;
grant update (revoked_at) on public.shortlist_links to app_user;
grant select on public.shortlist_views to app_user;

-- ---------------------------------------------------------------- functions

-- A learner's record across every hub: programmes, cohorts and certificates, matched by the
-- email they applied with. Readable by the learner, and by talent officers while discoverable.
create or replace function app.learning_record(p_user uuid)
returns table (hub_name text, hub_slug text, programme_title text, track text, cohort_name text, enrolment_status text,
               enrolled_at timestamptz, completed_at timestamptz, certificate_serial text, certificate_revoked boolean,
               attendance numeric, score numeric)
language sql stable security definer set search_path = ''
as $$
  select t.name, t.slug, p.title, a.track, c.name, e.status, e.enrolled_at, e.completed_at,
         cert.serial, cert.revoked_at is not null, cert.attendance, cert.score
  from public.users u
  join public.applications a on a.email = u.email
  join public.enrolments e on e.application_id = a.id
  join public.cohorts c on c.id = e.cohort_id
  join public.programmes p on p.id = a.programme_id
  join public.tenants t on t.id = a.tenant_id
  left join public.certificates cert on cert.enrolment_id = e.id
  where u.id = p_user
    and (p_user = app.uid() or (app.is_platform_admin() and exists (select 1 from public.passports pp where pp.user_id = p_user and pp.discoverable)))
  order by e.enrolled_at desc
$$;
revoke all on function app.learning_record(uuid) from public;
grant execute on function app.learning_record(uuid) to app_user;

-- The learner's opportunities: roles they were put forward for, and how often employers opened
-- the shortlist after they confirmed interest.
create or replace function app.my_opportunities()
returns table (id uuid, role_title text, employer_name text, description text, work_mode text, job_type text, state text,
               pay_min integer, pay_max integer, interest text, interest_at timestamptz, stage text, created_at timestamptz,
               employer_views bigint, last_viewed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select rc.id, r.title, e.name, r.description, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max,
         rc.interest, rc.interest_at, rc.stage, rc.created_at,
         (select count(*) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at),
         (select max(v.viewed_at) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at)
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id join public.employers e on e.id = r.employer_id
  where rc.user_id = app.uid()
  order by rc.created_at desc
$$;
revoke all on function app.my_opportunities() from public;
grant execute on function app.my_opportunities() to app_user;

create or replace function app.respond_to_opportunity(p_candidate uuid, p_interest text)
returns boolean
language sql security definer set search_path = ''
as $$
  with u as (
    update public.role_candidates set interest = p_interest, interest_at = now()
    where id = p_candidate and user_id = app.uid() and p_interest in ('confirmed', 'declined') and stage <> 'placed'
    returning 1)
  select exists (select 1 from u)
$$;
revoke all on function app.respond_to_opportunity(uuid, text) from public;
grant execute on function app.respond_to_opportunity(uuid, text) to app_user;

create or replace function app.set_passport_verified(p_user uuid, p_verified boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_platform_admin() then raise exception 'Only talent officers can verify a Passport' using errcode = '42501'; end if;
  update public.passports set verified_at = case when p_verified then now() end, verified_by = case when p_verified then app.uid() end
  where user_id = p_user and discoverable;
  return found;
end
$$;
revoke all on function app.set_passport_verified(uuid, boolean) from public;
grant execute on function app.set_passport_verified(uuid, boolean) to app_user;

-- What an employer sees through a shortlist link: the role and only the candidates who confirmed
-- interest and allow sharing with employers, with consented fields only. Each open is logged.
-- Returns null for an unknown, expired or revoked link.
create or replace function app.open_shortlist(p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare l public.shortlist_links; result jsonb;
begin
  select * into l from public.shortlist_links where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then return null; end if;
  insert into public.shortlist_views (link_id) values (l.id);
  select jsonb_build_object(
    'expires_at', l.expires_at,
    'role', jsonb_build_object('title', r.title, 'description', r.description, 'skills', r.skills, 'work_mode', r.work_mode,
                               'job_type', r.job_type, 'state', r.state, 'employer', e.name),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', u.full_name, 'headline', p.headline, 'bio', p.bio, 'state', p.state, 'languages', p.languages,
        'skills', p.skills, 'availability', p.availability, 'work_modes', p.work_modes, 'links', p.links,
        'verified', p.verified_at is not null,
        'credentials', coalesce((
          select jsonb_agg(jsonb_build_object('serial', c.serial, 'programme', c.programme_title, 'hub', c.hub_name, 'track', c.track,
                                              'completed_on', c.completed_on,
                                              'attendance', case when p.show_scores then c.attendance end,
                                              'score', case when p.show_scores then c.score end) order by c.completed_on desc)
          from public.certificates c join public.enrolments en on en.id = c.enrolment_id join public.applications a on a.id = en.application_id
          where a.email = u.email and c.revoked_at is null), '[]'::jsonb)
      ) order by rc.interest_at)
      from public.role_candidates rc join public.passports p on p.user_id = rc.user_id join public.users u on u.id = rc.user_id
      where rc.role_id = r.id and rc.interest = 'confirmed' and rc.stage <> 'declined' and p.employer_sharing), '[]'::jsonb)
  ) into result
  from public.job_roles r join public.employers e on e.id = r.employer_id where r.id = l.role_id;
  return result;
end
$$;
revoke all on function app.open_shortlist(text) from public;
grant execute on function app.open_shortlist(text) to app_user;

-- Work outcomes for a hub's own cohort, as counts only: hubs see how many of their learners were
-- put forward, interviewed and placed, never which employers or candidates.
create or replace function app.cohort_outcomes(p_cohort uuid)
returns table (put_forward bigint, interviewed bigint, placed bigint)
language sql stable security definer set search_path = ''
as $$
  select count(distinct rc.user_id),
         count(distinct rc.user_id) filter (where rc.stage in ('interviewed', 'offered', 'placed')),
         count(distinct rc.user_id) filter (where rc.stage = 'placed')
  from public.cohorts c
  join public.enrolments e on e.cohort_id = c.id
  join public.applications a on a.id = e.application_id
  join public.users u on u.email = a.email
  join public.role_candidates rc on rc.user_id = u.id
  where c.id = p_cohort and (app.is_member(c.tenant_id) or app.is_platform_admin())
$$;
revoke all on function app.cohort_outcomes(uuid) from public;
grant execute on function app.cohort_outcomes(uuid) to app_user;
