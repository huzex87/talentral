-- Screening: a rubric per programme and one scoresheet per reviewer per application.
-- A reviewer's percentage is computed by the app from the rubric (packages/domain/src/rubric.ts)
-- and stored with the raw scores, so lists can rank by the average without recomputing.

alter table public.programmes
  add column rubric jsonb not null default '[]'::jsonb check (jsonb_typeof(rubric) = 'array');

create table public.application_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  percent numeric(4, 1) not null check (percent between 0 and 100),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, reviewer_id)
);
create index on public.application_scores (tenant_id, application_id);

alter table public.application_scores enable row level security;

-- The whole hub team sees every scoresheet (moderation needs it); each reviewer writes only their own,
-- and only for applications of a hub they belong to.
create policy application_scores_read on public.application_scores for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());
create policy application_scores_insert on public.application_scores for insert to app_user
  with check (app.is_member(tenant_id) and reviewer_id = app.uid()
              and exists (select 1 from public.applications a
                          where a.id = application_scores.application_id and a.tenant_id = application_scores.tenant_id));
create policy application_scores_update on public.application_scores for update to app_user
  using (reviewer_id = app.uid() and app.is_member(tenant_id))
  with check (reviewer_id = app.uid() and app.is_member(tenant_id));
create policy application_scores_delete on public.application_scores for delete to app_user
  using (reviewer_id = app.uid() and app.is_member(tenant_id));

grant select, insert, delete on public.application_scores to app_user;
grant update (scores, percent, comment, updated_at) on public.application_scores to app_user;

-- Bulk moves are written one row at a time by the app, so the existing status trigger audits each.
