-- MVP-2 month 12: founding-hub case studies. The platform team writes them with the hub, publishes
-- them on Talentral (/stories) and the landing page. Additive only.

create table public.case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  tenant_id uuid references public.tenants (id) on delete set null,
  title text not null check (char_length(title) between 5 and 140),
  summary text not null check (char_length(summary) between 20 and 400),
  body text not null default '' check (char_length(body) <= 20000),
  -- Headline figures, for example [{"label": "Learners completed", "value": "84%"}], at most four.
  metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(metrics) = 'array' and jsonb_array_length(metrics) <= 4),
  quote text check (char_length(quote) <= 500),
  quote_by text check (char_length(quote_by) <= 120),
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- The hub agreed to publication (recorded when publishing).
  consent_note text check (char_length(consent_note) <= 300),
  published_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_studies_published check (status = 'draft' or (published_at is not null and consent_note is not null))
);
create trigger case_studies_touch before update on public.case_studies for each row execute function app.touch();
alter table public.case_studies enable row level security;
create policy case_studies_public on public.case_studies for select to app_user using (status = 'published' or app.is_platform_admin());
create policy case_studies_write on public.case_studies for all to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
grant select, insert, update, delete on public.case_studies to app_user;

-- Publishing and unpublishing are audited.
create or replace function app.audit_case_study() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
    values (new.tenant_id, app.uid(), case when new.status = 'published' then 'story.published' else 'story.unpublished' end, 'case_study', new.id,
            jsonb_build_object('title', new.title, 'consent', new.consent_note));
  end if;
  return new;
end
$$;
revoke all on function app.audit_case_study() from public;
create trigger case_studies_audit after update of status on public.case_studies for each row execute function app.audit_case_study();
