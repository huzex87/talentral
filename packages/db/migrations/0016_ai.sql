-- Sprint 11: AI drafting help for hubs. A record of each draft, for the per-hub daily limit and cost
-- reporting. It keeps the kind of draft, the model and the tokens used, never the text sent or returned.
-- The hub team can read its own hub's usage. Rows are written only through app.claim_ai_draft (which
-- checks membership and the daily limit atomically) and app.finish_ai_draft. Additive only.
create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  kind text not null check (kind in ('programme', 'lesson', 'translation', 'quiz', 'feedback')),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.ai_drafts (tenant_id, created_at desc);
alter table public.ai_drafts enable row level security;
grant select on public.ai_drafts to app_user;
create policy ai_drafts_read on public.ai_drafts for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());

-- Start of the current day in West Africa Time.
create or replace function app.wat_today() returns timestamptz
language sql stable set search_path = ''
as $$ select date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' $$;

-- Takes one of the hub's drafts for today. Returns the new draft's id, or null when the hub has used
-- its daily limit. A lock per hub stops two people racing past the limit together.
create or replace function app.claim_ai_draft(p_tenant uuid, p_kind text, p_model text, p_limit integer) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if app.uid() is null or not (app.is_member(p_tenant) or app.is_platform_admin()) then
    raise exception 'Not a member of this hub' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_drafts:' || p_tenant::text, 0));
  if (select count(*) from public.ai_drafts where tenant_id = p_tenant and created_at >= app.wat_today()) >= p_limit then
    return null;
  end if;
  insert into public.ai_drafts (tenant_id, user_id, kind, model) values (p_tenant, app.uid(), p_kind, p_model) returning id into v_id;
  return v_id;
end
$$;

-- Records how a draft went. Only the person who claimed it can finish it.
create or replace function app.finish_ai_draft(p_id uuid, p_ok boolean, p_input integer, p_output integer) returns void
language sql security definer set search_path = ''
as $$
  update public.ai_drafts set ok = p_ok, input_tokens = greatest(coalesce(p_input, 0), 0), output_tokens = greatest(coalesce(p_output, 0), 0)
  where id = p_id and user_id = app.uid()
$$;

do $$
declare f text;
begin
  foreach f in array array['app.wat_today()', 'app.claim_ai_draft(uuid, text, text, integer)', 'app.finish_ai_draft(uuid, boolean, integer, integer)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to app_user', f);
  end loop;
end $$;

-- Platform admins helping a hub can change course content (0015), which re-links each quiz and
-- assignment's skills to the gradebook. That write was still limited to hub owners and admins, so a
-- platform admin could not add a lesson to a course whose lessons had skills. Same rule, plus them.
alter policy assessment_skills_write on public.assessment_skills
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check (
    (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
    and exists (select 1 from public.assessments a where a.id = assessment_skills.assessment_id and a.tenant_id = assessment_skills.tenant_id)
    and exists (select 1 from public.skills s where s.id = assessment_skills.skill_id and (s.tenant_id is null or s.tenant_id = assessment_skills.tenant_id))
  );
