-- Participants selected outside Talentral (for example on a funder's platform) can be imported
-- into a programme from a spreadsheet. They become applications like any other, marked with their
-- source and who imported them, so reports can say where selection happened.

alter table public.applications
  add column source text not null default 'applied' check (source in ('applied', 'imported')),
  add column imported_by uuid references public.users (id) on delete set null;

-- Owners and admins import through this function only; app_user still cannot insert applications.
-- rows: [{ reference, full_name, email, phone, track, answers }]. Existing emails are skipped.
-- consent_at records when the hub attested that participants agreed to share their data.
create or replace function app.import_applications(p_programme uuid, p_status text, p_rows jsonb)
returns table (imported integer, skipped integer)
language plpgsql security definer set search_path = ''
as $$
declare
  prog record;
  r jsonb;
  n_in integer := 0;
  n_skip integer := 0;
  new_id uuid;
begin
  select p.id, p.tenant_id into prog from public.programmes p where p.id = p_programme;
  if prog.id is null then raise exception 'Programme not found' using errcode = 'P0002'; end if;
  if not (app.has_role(prog.tenant_id, array['owner', 'admin']) or app.is_platform_admin()) then
    raise exception 'Only hub owners and admins can import participants' using errcode = '42501';
  end if;
  if p_status not in ('submitted', 'shortlisted', 'offered', 'accepted') then
    raise exception 'Imported participants can start as submitted, shortlisted, offered or accepted' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Import at most 1000 rows at a time' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.applications (tenant_id, programme_id, reference, email, full_name, phone, track, answers,
                                     status, consent_at, source, imported_by)
    values (prog.tenant_id, prog.id, r ->> 'reference', r ->> 'email', r ->> 'full_name', coalesce(r ->> 'phone', ''),
            nullif(r ->> 'track', ''), coalesce(r -> 'answers', '{}'::jsonb), p_status, now(), 'imported', app.uid())
    on conflict (programme_id, email) do nothing
    returning id into new_id;
    if new_id is null then n_skip := n_skip + 1; else n_in := n_in + 1; end if;
    new_id := null;
  end loop;

  perform app.audit(prog.tenant_id, 'applications.imported', 'programme', prog.id,
                    jsonb_build_object('imported', n_in, 'skipped', n_skip, 'status', p_status));
  return query select n_in, n_skip;
end $$;

revoke all on function app.import_applications(uuid, text, jsonb) from public;
grant execute on function app.import_applications(uuid, text, jsonb) to app_user;
