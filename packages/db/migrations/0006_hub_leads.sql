-- Hubs that want to join Talentral register interest from the public site. Anyone may submit;
-- only platform admins can read. Submission goes through a function so visitors get no table rights.

create table public.hub_leads (
  id uuid primary key default gen_random_uuid(),
  hub_name text not null check (char_length(hub_name) between 2 and 160),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email citext not null check (char_length(email) <= 254),
  phone text not null check (char_length(phone) <= 30),
  state text check (char_length(state) <= 40),
  cohort_size text check (char_length(cohort_size) <= 40),
  message text check (char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'onboarded', 'declined')),
  created_at timestamptz not null default now()
);
create index on public.hub_leads (created_at desc);

alter table public.hub_leads enable row level security;
create policy hub_leads_read on public.hub_leads for select to app_user using (app.is_platform_admin());
create policy hub_leads_update on public.hub_leads for update to app_user using (app.is_platform_admin()) with check (app.is_platform_admin());
grant select on public.hub_leads to app_user;
grant update (status) on public.hub_leads to app_user;

-- At most three enquiries per email a day, so the form cannot be used to flood the list.
create or replace function app.submit_hub_lead(p_hub text, p_contact text, p_email text, p_phone text, p_state text, p_size text, p_message text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if (select count(*) from public.hub_leads l where lower(l.email::text) = lower(p_email) and l.created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many enquiries from this email today' using errcode = 'P0001';
  end if;
  insert into public.hub_leads (hub_name, contact_name, email, phone, state, cohort_size, message)
  values (p_hub, p_contact, p_email, p_phone, nullif(p_state, ''), nullif(p_size, ''), nullif(p_message, ''))
  returning id into new_id;
  return new_id;
end $$;

revoke all on function app.submit_hub_lead(text, text, text, text, text, text, text) from public;
grant execute on function app.submit_hub_lead(text, text, text, text, text, text, text) to app_user;
