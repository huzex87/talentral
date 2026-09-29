-- Sprint 5: a shared skills taxonomy per track, employers who sign up and post jobs themselves,
-- and the data behind the Impact dashboard. Additive only: preview builds share this database.

-- ================================================================ skills taxonomy

-- Platform skills have no tenant and are shared by every hub. Hubs add their own skills and map
-- them to a platform skill, so evidence stays comparable across hubs.
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  track text not null check (char_length(track) between 2 and 80),
  name text not null check (char_length(name) between 2 and 60),
  description text check (char_length(description) <= 200),
  maps_to uuid references public.skills (id) on delete set null,
  created_at timestamptz not null default now(),
  check (tenant_id is not null or maps_to is null)
);
create unique index skills_unique_name on public.skills (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(track), lower(name));

create table public.assessment_skills (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (assessment_id, skill_id)
);
create index on public.assessment_skills (skill_id);

-- A policy on skills cannot query skills itself, so this check runs as a helper.
create or replace function app.is_platform_skill(p_skill uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.skills s where s.id = p_skill and s.tenant_id is null) $$;

alter table public.skills enable row level security;
alter table public.assessment_skills enable row level security;

create policy skills_read on public.skills for select to app_user
  using (tenant_id is null or app.is_member(tenant_id) or app.is_platform_admin());
create policy skills_write_platform on public.skills for all to app_user
  using (tenant_id is null and app.is_platform_admin()) with check (tenant_id is null and app.is_platform_admin());
create policy skills_write_hub on public.skills for all to app_user
  using (tenant_id is not null and app.has_role(tenant_id, array['owner', 'admin']))
  with check (tenant_id is not null and app.has_role(tenant_id, array['owner', 'admin'])
              and (maps_to is null or app.is_platform_skill(maps_to)));
grant select, insert, delete on public.skills to app_user;
grant update (track, name, description, maps_to) on public.skills to app_user;

create policy assessment_skills_read on public.assessment_skills for select to app_user using (app.is_member(tenant_id) or app.is_platform_admin());
create policy assessment_skills_write on public.assessment_skills for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']))
  with check (app.has_role(tenant_id, array['owner', 'admin'])
              and exists (select 1 from public.assessments a where a.id = assessment_skills.assessment_id and a.tenant_id = assessment_skills.tenant_id)
              and exists (select 1 from public.skills s where s.id = assessment_skills.skill_id and (s.tenant_id is null or s.tenant_id = assessment_skills.tenant_id)));
grant select, insert, delete on public.assessment_skills to app_user;

-- Starter taxonomies for the tracks hubs run most.
insert into public.skills (track, name, description)
select t.track, s.name, s.description
from (values
  ('Digital Marketing', 'Social media management', 'Plans, publishes and grows brand accounts across platforms'),
  ('Digital Marketing', 'Content writing', 'Writes clear posts, articles and ad copy for a target audience'),
  ('Digital Marketing', 'Search engine optimisation', 'Improves how pages rank in search results'),
  ('Digital Marketing', 'Paid advertising', 'Runs and optimises Meta and Google ad campaigns'),
  ('Digital Marketing', 'Email marketing', 'Builds lists and sends campaigns that people open'),
  ('Digital Marketing', 'Marketing analytics', 'Reads campaign data and reports what worked'),
  ('Digital Marketing', 'Graphic content creation', 'Makes simple visuals and short videos for campaigns'),
  ('Digital Marketing', 'Brand strategy', 'Defines audience, voice and positioning'),
  ('Software Development', 'HTML and CSS', 'Builds accessible, responsive page layouts'),
  ('Software Development', 'JavaScript', 'Writes interactive front-end code'),
  ('Software Development', 'React', 'Builds component-based web interfaces'),
  ('Software Development', 'Node.js', 'Builds server-side applications and APIs'),
  ('Software Development', 'Python', 'Writes scripts and applications in Python'),
  ('Software Development', 'Databases and SQL', 'Designs tables and writes queries'),
  ('Software Development', 'Git and version control', 'Works with branches, commits and pull requests'),
  ('Software Development', 'Testing and debugging', 'Finds and fixes defects, writes tests'),
  ('Software Development', 'Web APIs', 'Designs and consumes REST APIs'),
  ('Data Analysis', 'Microsoft Excel', 'Formulas, pivot tables and charts'),
  ('Data Analysis', 'Data cleaning', 'Prepares messy data for analysis'),
  ('Data Analysis', 'Data visualisation', 'Builds clear charts and dashboards'),
  ('Data Analysis', 'SQL for analysis', 'Queries data to answer questions'),
  ('Data Analysis', 'Power BI', 'Builds reports and dashboards in Power BI'),
  ('Data Analysis', 'Statistics', 'Applies descriptive and basic inferential statistics'),
  ('Data Analysis', 'Python for data', 'Uses pandas and notebooks for analysis'),
  ('Graphic Design', 'Visual design principles', 'Layout, typography, colour and hierarchy'),
  ('Graphic Design', 'Canva', 'Produces on-brand designs quickly in Canva'),
  ('Graphic Design', 'Adobe Photoshop', 'Edits and composes images'),
  ('Graphic Design', 'Adobe Illustrator', 'Creates vector logos and illustrations'),
  ('Graphic Design', 'Figma', 'Designs interfaces and prototypes'),
  ('Graphic Design', 'UI/UX design', 'Designs usable screens from user needs'),
  ('Graphic Design', 'Brand identity', 'Creates logos and brand guidelines'),
  ('Graphic Design', 'Video editing', 'Edits short-form video for social media'),
  ('Customer Support and Virtual Assistance', 'Customer service', 'Resolves customer questions politely and quickly'),
  ('Customer Support and Virtual Assistance', 'Written communication', 'Writes clear, professional emails and chats'),
  ('Customer Support and Virtual Assistance', 'Calendar and inbox management', 'Organises schedules and email for others'),
  ('Customer Support and Virtual Assistance', 'Google Workspace', 'Docs, Sheets, Drive and Meet'),
  ('Customer Support and Virtual Assistance', 'CRM tools', 'Keeps customer records up to date in a CRM'),
  ('Customer Support and Virtual Assistance', 'Data entry', 'Enters and checks data accurately'),
  ('Customer Support and Virtual Assistance', 'Time management', 'Plans work and meets deadlines'),
  ('Customer Support and Virtual Assistance', 'Project coordination', 'Tracks tasks and follows up with people')
) as s (track, name, description)
cross join lateral (select s.track) t
on conflict do nothing;

-- ================================================================ employer accounts

alter table public.employers
  add column status text not null default 'verified' check (status in ('pending', 'verified', 'suspended')),
  add column verified_at timestamptz,
  add column self_registered boolean not null default false,
  add column size text check (size in ('1-10', '11-50', '51-200', '201+'));
update public.employers set verified_at = created_at where verified_at is null and status = 'verified';
grant update (status, verified_at) on public.employers to app_user;

create table public.employer_members (
  employer_id uuid not null references public.employers (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (employer_id, user_id)
);
create index on public.employer_members (user_id);
alter table public.employer_members enable row level security;

create or replace function app.is_employer_member(e uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.employer_members m where m.employer_id = e and m.user_id = app.uid()) $$;

create or replace function app.is_verified_employer_member(e uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.employer_members m join public.employers x on x.id = m.employer_id
                     where m.employer_id = e and m.user_id = app.uid() and x.status = 'verified') $$;

create or replace function app.is_verified_employer_user() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.employer_members m join public.employers x on x.id = m.employer_id
                     where m.user_id = app.uid() and x.status = 'verified') $$;

create policy employer_members_read on public.employer_members for select to app_user
  using (user_id = app.uid() or app.is_employer_member(employer_id) or app.is_platform_admin());
create policy employer_members_platform on public.employer_members for all to app_user
  using (app.is_platform_admin()) with check (app.is_platform_admin());
grant select, insert, delete on public.employer_members to app_user;

-- A fourth consent: verified employers may find the learner in their own searches.
alter table public.passports
  add column employer_search boolean not null default false,
  add column employer_search_at timestamptz;
grant update (employer_search) on public.passports to app_user;
alter table public.consent_events drop constraint consent_events_kind_check;
alter table public.consent_events add constraint consent_events_kind_check check (kind in ('discoverable', 'employer_sharing', 'research', 'employer_search'));

create or replace function app.passport_consents() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare k text;
begin
  foreach k in array array['discoverable', 'employer_sharing', 'research', 'employer_search'] loop
    if tg_op = 'INSERT' and (to_jsonb(new) ->> k)::boolean
       or tg_op = 'UPDATE' and (to_jsonb(new) ->> k) is distinct from (to_jsonb(old) ->> k) then
      insert into public.consent_events (user_id, kind, granted) values (new.user_id, k, (to_jsonb(new) ->> k)::boolean);
    end if;
  end loop;
  if tg_op = 'INSERT' or new.discoverable is distinct from old.discoverable then new.discoverable_at := case when new.discoverable then now() end; end if;
  if tg_op = 'INSERT' or new.employer_sharing is distinct from old.employer_sharing then new.employer_sharing_at := case when new.employer_sharing then now() end; end if;
  if tg_op = 'INSERT' or new.research is distinct from old.research then new.research_at := case when new.research then now() end; end if;
  if tg_op = 'INSERT' or new.employer_search is distinct from old.employer_search then new.employer_search_at := case when new.employer_search then now() end; end if;
  return new;
end
$$;

alter table public.role_candidates
  add column invited_by_employer boolean not null default false,
  add column retained boolean,
  add column retention_checked_at timestamptz;
grant update (retained, retention_checked_at) on public.role_candidates to app_user;

-- Who may see a Passport: its owner; talent officers while it is discoverable; verified employers
-- while it is open to employer search; and an employer the learner said yes to, while sharing is on.
create or replace function app.can_view_passport(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = app.uid()
    or exists (select 1 from public.passports p where p.user_id = p_user and (
         (p.discoverable and app.is_platform_admin())
      or (p.employer_search and app.is_verified_employer_user())
      or (p.employer_sharing and exists (
            select 1 from public.role_candidates rc join public.job_roles r on r.id = rc.role_id
            where rc.user_id = p_user and rc.interest = 'confirmed' and app.is_verified_employer_member(r.employer_id)))))
$$;

drop policy passports_read on public.passports;
create policy passports_read on public.passports for select to app_user using (app.can_view_passport(user_id));
create policy users_read_talent on public.users for select to app_user using (app.can_view_passport(id));

-- Employers manage their own roles once verified, and see candidates who said yes or whom they invited.
create policy roles_member_read on public.job_roles for select to app_user using (app.is_employer_member(employer_id));
create policy roles_member_insert on public.job_roles for insert to app_user with check (app.is_verified_employer_member(employer_id));
create policy roles_member_update on public.job_roles for update to app_user
  using (app.is_verified_employer_member(employer_id)) with check (app.is_verified_employer_member(employer_id));

create policy candidates_member_read on public.role_candidates for select to app_user
  using ((interest = 'confirmed' or invited_by_employer)
         and exists (select 1 from public.job_roles r where r.id = role_candidates.role_id and app.is_employer_member(r.employer_id)));
create policy candidates_member_insert on public.role_candidates for insert to app_user
  with check (invited_by_employer and added_by = app.uid()
              and exists (select 1 from public.job_roles r where r.id = role_candidates.role_id and r.status = 'open' and app.is_verified_employer_member(r.employer_id))
              and exists (select 1 from public.passports p where p.user_id = role_candidates.user_id and p.employer_search));
create policy candidates_member_update on public.role_candidates for update to app_user
  using (interest = 'confirmed' and exists (select 1 from public.job_roles r where r.id = role_candidates.role_id and app.is_verified_employer_member(r.employer_id)))
  with check (exists (select 1 from public.job_roles r where r.id = role_candidates.role_id and app.is_verified_employer_member(r.employer_id)));

-- The same visibility rule now guards the learning record.
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
  where u.id = p_user and app.can_view_passport(p_user)
  order by e.enrolled_at desc
$$;

-- Skills a learner has shown in graded work: an assessment tagged with the skill, scored at or
-- above the cohort's pass mark. Hub skills are reported under the platform skill they map to.
create or replace function app.evidenced_skills(p_user uuid)
returns table (skill text, track text, assessment text, programme text, hub text, percent numeric, graded_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select coalesce(ps.name, s.name), coalesce(ps.track, s.track), asm.title, p.title, t.name,
         round(r.score / asm.max_score * 100, 1), r.graded_at
  from public.users u
  join public.applications a on a.email = u.email
  join public.enrolments e on e.application_id = a.id and e.status <> 'dropped'
  join public.cohorts c on c.id = e.cohort_id
  join public.programmes p on p.id = a.programme_id
  join public.tenants t on t.id = a.tenant_id
  join public.assessment_results r on r.enrolment_id = e.id
  join public.assessments asm on asm.id = r.assessment_id
  join public.assessment_skills ak on ak.assessment_id = asm.id
  join public.skills s on s.id = ak.skill_id
  left join public.skills ps on ps.id = s.maps_to
  where u.id = p_user and app.can_view_passport(p_user) and r.score / asm.max_score * 100 >= c.pass_mark
  order by r.graded_at desc
$$;
revoke all on function app.evidenced_skills(uuid) from public;
grant execute on function app.evidenced_skills(uuid) to app_user;

-- Employer self-registration from the public sign-up page. Creates the organisation as pending
-- (a talent officer verifies it before it can post or search), its first user and membership.
create or replace function app.register_employer(p_name text, p_sector text, p_website text, p_state text, p_size text,
                                                 p_contact_name text, p_email text, p_phone text, p_hiring text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_employer uuid; v_email text := lower(trim(p_email));
begin
  if (select count(*) from public.employers e join public.employer_members m on m.employer_id = e.id join public.users u on u.id = m.user_id
      where lower(u.email::text) = v_email and e.created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many registrations for this email today' using errcode = 'P0001';
  end if;
  insert into public.users (email, full_name) values (v_email, nullif(trim(p_contact_name), ''))
  on conflict (email) do update set full_name = coalesce(public.users.full_name, excluded.full_name)
  returning id into v_user;
  insert into public.employers (name, sector, website, state, size, contact_name, contact_email, contact_phone, notes, status, verified_at, self_registered, created_by)
  values (trim(p_name), nullif(trim(p_sector), ''), nullif(trim(p_website), ''), nullif(p_state, ''), nullif(p_size, ''), nullif(trim(p_contact_name), ''),
          v_email, nullif(trim(p_phone), ''), nullif(trim(p_hiring), ''), 'pending', null, true, v_user)
  returning id into v_employer;
  insert into public.employer_members (employer_id, user_id, role) values (v_employer, v_user, 'owner');
  return v_employer;
end
$$;
revoke all on function app.register_employer(text, text, text, text, text, text, text, text, text) from public;
grant execute on function app.register_employer(text, text, text, text, text, text, text, text, text) to app_user;

-- The employer's own organisations, without the talent team's internal notes and stage.
create or replace function app.my_employers()
returns table (id uuid, name text, sector text, website text, state text, size text, contact_name text, contact_email text,
               contact_phone text, status text, verified_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.name, e.sector, e.website, e.state, e.size, e.contact_name, e.contact_email::text, e.contact_phone, e.status, e.verified_at, e.created_at
  from public.employers e join public.employer_members m on m.employer_id = e.id
  where m.user_id = app.uid() order by e.created_at
$$;
revoke all on function app.my_employers() from public;
grant execute on function app.my_employers() to app_user;

create or replace function app.update_employer_profile(p_employer uuid, p_sector text, p_website text, p_state text, p_size text, p_contact_name text, p_contact_phone text)
returns boolean
language sql security definer set search_path = ''
as $$
  with u as (
    update public.employers set sector = nullif(trim(p_sector), ''), website = nullif(trim(p_website), ''), state = nullif(p_state, ''),
      size = nullif(p_size, ''), contact_name = nullif(trim(p_contact_name), ''), contact_phone = nullif(trim(p_contact_phone), '')
    where id = p_employer and app.is_employer_member(p_employer) returning 1)
  select exists (select 1 from u)
$$;
revoke all on function app.update_employer_profile(uuid, text, text, text, text, text, text) from public;
grant execute on function app.update_employer_profile(uuid, text, text, text, text, text, text) to app_user;

-- Contact details of a candidate who said yes, for the employer that role belongs to.
create or replace function app.candidate_contact(p_candidate uuid)
returns table (email text, phone text)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, (select a.phone from public.applications a where a.email = u.email order by a.submitted_at desc limit 1)
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id join public.users u on u.id = rc.user_id
  where rc.id = p_candidate and rc.interest = 'confirmed'
    and (app.is_verified_employer_member(r.employer_id) or app.is_platform_admin())
$$;
revoke all on function app.candidate_contact(uuid) from public;
grant execute on function app.candidate_contact(uuid) to app_user;

-- my_opportunities also says whether an employer invited the learner directly.
drop function app.my_opportunities();
create function app.my_opportunities()
returns table (id uuid, role_title text, employer_name text, description text, work_mode text, job_type text, state text,
               pay_min integer, pay_max integer, interest text, interest_at timestamptz, stage text, created_at timestamptz,
               employer_views bigint, last_viewed_at timestamptz, invited_by_employer boolean)
language sql stable security definer set search_path = ''
as $$
  select rc.id, r.title, e.name, r.description, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max,
         rc.interest, rc.interest_at, rc.stage, rc.created_at,
         (select count(*) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at),
         (select max(v.viewed_at) from public.shortlist_views v join public.shortlist_links l on l.id = v.link_id
            where l.role_id = r.id and rc.interest = 'confirmed' and v.viewed_at >= rc.interest_at),
         rc.invited_by_employer
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id join public.employers e on e.id = r.employer_id
  where rc.user_id = app.uid()
  order by rc.created_at desc
$$;
revoke all on function app.my_opportunities() from public;
grant execute on function app.my_opportunities() to app_user;

-- ================================================================ Impact dashboard

-- Per-learner work outcomes for a hub's own learners (booleans only, never employers), so the
-- Impact dashboard can disaggregate placements and M&E exports can include outcomes.
create or replace function app.enrolment_outcomes(p_tenant uuid)
returns table (enrolment_id uuid, has_passport boolean, verified boolean, put_forward boolean, interviewed boolean, placed boolean)
language sql stable security definer set search_path = ''
as $$
  select e.id,
         pp.user_id is not null,
         coalesce(pp.verified_at is not null, false),
         exists (select 1 from public.role_candidates rc where rc.user_id = u.id),
         exists (select 1 from public.role_candidates rc where rc.user_id = u.id and rc.stage in ('interviewed', 'offered', 'placed')),
         exists (select 1 from public.role_candidates rc where rc.user_id = u.id and rc.stage = 'placed')
  from public.enrolments e
  join public.applications a on a.id = e.application_id
  left join public.users u on u.email = a.email
  left join public.passports pp on pp.user_id = u.id
  where e.tenant_id = p_tenant and (app.is_member(p_tenant) or app.is_platform_admin())
$$;
revoke all on function app.enrolment_outcomes(uuid) from public;
grant execute on function app.enrolment_outcomes(uuid) to app_user;

-- ================================================================ shortlist links carry evidence

-- As before, plus skills shown in graded work (percentages only where the learner shows scores).
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
          where a.email = u.email and c.revoked_at is null), '[]'::jsonb),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object('skill', coalesce(ps.name, s.name), 'assessment', asm.title, 'programme', pr.title,
                                              'percent', case when p.show_scores then round(rs.score / asm.max_score * 100, 1) end))
          from public.applications a2
          join public.enrolments e2 on e2.application_id = a2.id and e2.status <> 'dropped'
          join public.cohorts co on co.id = e2.cohort_id
          join public.programmes pr on pr.id = a2.programme_id
          join public.assessment_results rs on rs.enrolment_id = e2.id
          join public.assessments asm on asm.id = rs.assessment_id
          join public.assessment_skills ak on ak.assessment_id = asm.id
          join public.skills s on s.id = ak.skill_id
          left join public.skills ps on ps.id = s.maps_to
          where a2.email = u.email and rs.score / asm.max_score * 100 >= co.pass_mark), '[]'::jsonb)
      ) order by rc.interest_at)
      from public.role_candidates rc join public.passports p on p.user_id = rc.user_id join public.users u on u.id = rc.user_id
      where rc.role_id = r.id and rc.interest = 'confirmed' and rc.stage <> 'declined' and p.employer_sharing), '[]'::jsonb)
  ) into result
  from public.job_roles r join public.employers e on e.id = r.employer_id where r.id = l.role_id;
  return result;
end
$$;
