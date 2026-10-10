-- Facilitators: hub team members who teach (sessions, registers, grading, discussions) but take no
-- part in selection. Additive only: previews share this database with production, and no hub has a
-- facilitator until this release, so code that predates it behaves exactly as before.

-- The role itself, on team members and on invitations.
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('owner', 'admin', 'reviewer', 'facilitator'));
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('owner', 'admin', 'reviewer', 'facilitator'));

-- Everyone on the hub's team. Teaching data (cohorts, sessions, attendance, courses, submissions,
-- grades, discussions) stays behind this check, so facilitators get it without new policies.
create or replace function app.is_member(t uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select app.has_role(t, array['owner', 'admin', 'reviewer', 'facilitator']) $$;

-- The people who select applicants: owners, admins and reviewers. Applications, their documents,
-- scores, notes and messages to applicants stay behind this check.
create function app.can_select(t uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select app.has_role(t, array['owner', 'admin', 'reviewer']) $$;
revoke all on function app.can_select(uuid) from public;
grant execute on function app.can_select(uuid) to app_user;

-- Applications: selectors read and update all of them. A facilitator reads only the applications of
-- learners enrolled in one of the hub's cohorts, which is where registers and gradebooks get each
-- learner's name; the application pages themselves stay closed to facilitators in the app.
drop policy applications_read on public.applications;
create policy applications_read on public.applications for select to app_user
  using (app.can_select(tenant_id) or app.is_platform_admin());
create policy applications_read_teaching on public.applications for select to app_user
  using (app.has_role(tenant_id, array['facilitator'])
    and exists (select 1 from public.enrolments e where e.application_id = applications.id and e.tenant_id = applications.tenant_id));

drop policy applications_update on public.applications;
create policy applications_update on public.applications for update to app_user
  using (app.can_select(tenant_id)) with check (app.can_select(tenant_id));

-- Applicants' documents, reviewers' notes and scores, and messages to applicants: selectors only.
drop policy application_files_read on public.application_files;
create policy application_files_read on public.application_files for select to app_user
  using (app.can_select(tenant_id) or app.is_platform_admin());

drop policy application_notes_read on public.application_notes;
create policy application_notes_read on public.application_notes for select to app_user
  using (app.can_select(tenant_id) or app.is_platform_admin());
drop policy application_notes_insert on public.application_notes;
create policy application_notes_insert on public.application_notes for insert to app_user
  with check (app.can_select(tenant_id) and author_id = app.uid()
    and exists (select 1 from public.applications a where a.id = application_notes.application_id and a.tenant_id = application_notes.tenant_id));

drop policy application_scores_read on public.application_scores;
create policy application_scores_read on public.application_scores for select to app_user
  using (app.can_select(tenant_id) or app.is_platform_admin());
drop policy application_scores_insert on public.application_scores;
create policy application_scores_insert on public.application_scores for insert to app_user
  with check (app.can_select(tenant_id) and reviewer_id = app.uid()
    and exists (select 1 from public.applications a where a.id = application_scores.application_id and a.tenant_id = application_scores.tenant_id));
drop policy application_scores_update on public.application_scores;
create policy application_scores_update on public.application_scores for update to app_user
  using (reviewer_id = app.uid() and app.can_select(tenant_id))
  with check (reviewer_id = app.uid() and app.can_select(tenant_id));
drop policy application_scores_delete on public.application_scores;
create policy application_scores_delete on public.application_scores for delete to app_user
  using (reviewer_id = app.uid() and app.can_select(tenant_id));

drop policy messages_read on public.messages;
create policy messages_read on public.messages for select to app_user
  using (app.can_select(tenant_id) or app.is_platform_admin());
