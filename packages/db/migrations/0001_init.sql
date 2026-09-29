-- Talentral: identity, hubs (tenants), programmes and applications.
--
-- Security model
--   * The app connects as the database owner and runs every request-scoped query inside a
--     transaction that does `set local role app_user` and sets app.user_id (see packages/db/src/index.ts).
--     app_user is subject to Row-Level Security on every table below; the owner is used only for
--     system work (sign-in tokens, sessions, invite acceptance).
--   * Anonymous visitors run as app_user with an empty app.user_id.
--   * Applications are submitted only through app.submit_application(), which checks the programme
--     is open, so anonymous users have no direct insert rights.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end
$$;
grant app_user to current_user;

create schema if not exists app;
grant usage on schema app to app_user;
grant usage on schema public to app_user;

create or replace function app.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- identity

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text check (char_length(full_name) <= 120),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- System-only tables: no grants to app_user.
create table public.sign_in_tokens (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.sign_in_tokens (email, created_at);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.sessions (user_id);

-- ---------------------------------------------------------------- hubs

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 120),
  tagline text check (char_length(tagline) <= 160),
  description text check (char_length(description) <= 2000),
  logo_path text,
  brand_color text check (brand_color ~ '^#[0-9A-F]{6}$'),
  website text check (website ~ '^https?://'),
  contact_email citext,
  contact_phone text check (char_length(contact_phone) <= 30),
  state text,
  address text check (char_length(address) <= 300),
  socials jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'suspended')),
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email citext not null,
  role text not null check (role in ('owner', 'admin', 'reviewer')),
  token_hash text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invites (tenant_id);

-- ---------------------------------------------------------------- programmes and applications

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,38}[a-z0-9]$'),
  title text not null check (char_length(title) between 3 and 160),
  summary text check (char_length(summary) <= 300),
  description text check (char_length(description) <= 8000),
  eligibility text check (char_length(eligibility) <= 3000),
  tracks jsonb not null default '[]'::jsonb check (jsonb_typeof(tracks) = 'array'),
  form jsonb not null default '[]'::jsonb check (jsonb_typeof(form) = 'array'),
  opens_at timestamptz,
  closes_at timestamptz,
  capacity integer check (capacity > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  reference_prefix text not null check (reference_prefix ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  programme_id uuid not null references public.programmes (id) on delete cascade,
  reference text not null unique,
  email citext not null,
  full_name text not null,
  phone text not null,
  track text,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'shortlisted', 'offered', 'accepted', 'declined', 'rejected', 'withdrawn')),
  consent_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, email)
);
create index on public.applications (tenant_id, programme_id, status);

create table public.application_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  field_id text not null,
  storage_path text not null,
  filename text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index on public.application_files (application_id);

create table public.application_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id uuid not null references public.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.application_notes (application_id);

-- Append-only: app_user may read its hub's rows but never write, update or delete.
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (tenant_id, at desc);

-- ---------------------------------------------------------------- helpers (security definer)

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select u.is_platform_admin from public.users u where u.id = app.uid()), false) $$;

create or replace function app.has_role(t uuid, roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = app.uid() and m.role = any (roles)
  )
$$;

create or replace function app.is_member(t uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select app.has_role(t, array['owner', 'admin', 'reviewer']) $$;

create or replace function app.shares_hub_with(other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = app.uid() and theirs.user_id = other
  )
$$;

create or replace function app.audit(t uuid, action text, target_type text, target_id uuid, metadata jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$ insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
      values (t, app.uid(), action, target_type, target_id, coalesce(metadata, '{}'::jsonb)) $$;

create or replace function app.touch() returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;

create trigger tenants_touch before update on public.tenants for each row execute function app.touch();
create trigger programmes_touch before update on public.programmes for each row execute function app.touch();
create trigger applications_touch before update on public.applications for each row execute function app.touch();

-- Hub teams edit their profile; only platform admins change the address (slug) or status.
-- Not security definer: the trigger must see the caller's role (app_user for requests).
create or replace function app.guard_tenant_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.slug is distinct from old.slug or new.status is distinct from old.status)
     and not app.is_platform_admin() and current_user = 'app_user' then
    raise exception 'Only platform admins can change a hub address or status' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger tenants_guard before update on public.tenants for each row execute function app.guard_tenant_update();

-- A hub always keeps at least one owner.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Skip when the hub itself is being deleted (the memberships go with it).
  if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return coalesce(new, old);
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') and not exists (
    select 1 from public.memberships m
    where m.tenant_id = old.tenant_id and m.role = 'owner' and m.user_id <> old.user_id
  ) then
    raise exception 'A hub must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;
create trigger memberships_last_owner before update or delete on public.memberships
  for each row execute function app.guard_last_owner();

-- Status changes are always audited, whoever makes them.
create or replace function app.audit_application_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform app.audit(new.tenant_id, 'application.status', 'application', new.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end
$$;
create trigger applications_audit after update on public.applications
  for each row execute function app.audit_application_status();

-- ---------------------------------------------------------------- submission

-- The only way to create an application. Runs as the owner so anonymous applicants need no
-- table rights; it enforces the programme window and records files atomically.
create or replace function app.submit_application(
  p_programme uuid, p_reference text, p_email text, p_full_name text, p_phone text,
  p_track text, p_answers jsonb, p_files jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prog public.programmes%rowtype;
  new_id uuid;
  f jsonb;
begin
  select p.* into prog from public.programmes p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.id = p_programme;
  if not found then
    raise exception 'Programme not found' using errcode = 'P0002';
  end if;
  if prog.status <> 'open'
     or (prog.opens_at is not null and prog.opens_at > now())
     or (prog.closes_at is not null and prog.closes_at <= now()) then
    raise exception 'Applications for this programme are not open' using errcode = 'P0001';
  end if;

  insert into public.applications (tenant_id, programme_id, reference, email, full_name, phone, track, answers, consent_at)
  values (prog.tenant_id, prog.id, p_reference, p_email, p_full_name, p_phone, nullif(p_track, ''), coalesce(p_answers, '{}'::jsonb), now())
  returning id into new_id;

  for f in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    insert into public.application_files (tenant_id, application_id, field_id, storage_path, filename, content_type, size_bytes)
    values (prog.tenant_id, new_id, f ->> 'field_id', f ->> 'storage_path', f ->> 'filename', f ->> 'content_type', (f ->> 'size_bytes')::integer);
  end loop;

  insert into public.audit_log (tenant_id, action, target_type, target_id, metadata)
  values (prog.tenant_id, 'application.submitted', 'application', new_id, jsonb_build_object('reference', p_reference));
  return new_id;
end
$$;

-- ---------------------------------------------------------------- row-level security

alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.programmes enable row level security;
alter table public.applications enable row level security;
alter table public.application_files enable row level security;
alter table public.application_notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.sign_in_tokens enable row level security;
alter table public.sessions enable row level security;

create policy users_read on public.users for select to app_user
  using (id = app.uid() or app.is_platform_admin() or app.shares_hub_with(id));
create policy users_update_self on public.users for update to app_user
  using (id = app.uid()) with check (id = app.uid());

create policy tenants_read on public.tenants for select to app_user
  using (status = 'active' or app.is_member(id) or app.is_platform_admin());
create policy tenants_insert on public.tenants for insert to app_user
  with check (app.is_platform_admin());
create policy tenants_update on public.tenants for update to app_user
  using (app.has_role(id, array['owner', 'admin']) or app.is_platform_admin())
  with check (app.has_role(id, array['owner', 'admin']) or app.is_platform_admin());

create policy memberships_read on public.memberships for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());
create policy memberships_update on public.memberships for update to app_user
  using (app.has_role(tenant_id, array['owner']) or app.is_platform_admin()
         or (app.has_role(tenant_id, array['admin']) and role <> 'owner'))
  with check (app.has_role(tenant_id, array['owner']) or app.is_platform_admin()
              or (app.has_role(tenant_id, array['admin']) and role <> 'owner'));
create policy memberships_delete on public.memberships for delete to app_user
  using (app.has_role(tenant_id, array['owner']) or app.is_platform_admin()
         or (app.has_role(tenant_id, array['admin']) and role <> 'owner')
         or user_id = app.uid());

create policy invites_read on public.invites for select to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());
create policy invites_insert on public.invites for insert to app_user
  with check (app.has_role(tenant_id, array['owner']) or app.is_platform_admin()
              or (app.has_role(tenant_id, array['admin']) and role <> 'owner'));
create policy invites_delete on public.invites for delete to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());

create policy programmes_read on public.programmes for select to app_user
  using (
    app.is_member(tenant_id) or app.is_platform_admin()
    or (status in ('open', 'closed') and exists (select 1 from public.tenants t where t.id = programmes.tenant_id and t.status = 'active'))
  );
create policy programmes_write on public.programmes for all to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin())
  with check (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());

create policy applications_read on public.applications for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());
create policy applications_update on public.applications for update to app_user
  using (app.is_member(tenant_id)) with check (app.is_member(tenant_id));

create policy application_files_read on public.application_files for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());

create policy application_notes_read on public.application_notes for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());
create policy application_notes_insert on public.application_notes for insert to app_user
  with check (app.is_member(tenant_id) and author_id = app.uid()
              and exists (select 1 from public.applications a
                          where a.id = application_notes.application_id and a.tenant_id = application_notes.tenant_id));

create policy audit_read on public.audit_log for select to app_user
  using (app.has_role(tenant_id, array['owner', 'admin']) or app.is_platform_admin());

-- ---------------------------------------------------------------- grants

grant select on public.users, public.tenants, public.memberships, public.invites, public.programmes,
  public.applications, public.application_files, public.application_notes, public.audit_log to app_user;
grant update (full_name) on public.users to app_user;
grant insert on public.tenants to app_user;
grant update (name, tagline, description, logo_path, brand_color, website, contact_email, contact_phone,
  state, address, socials, profile_completed_at, slug, status) on public.tenants to app_user;
grant update (role), delete on public.memberships to app_user;
grant insert, delete on public.invites to app_user;
grant insert, update, delete on public.programmes to app_user;
grant update (status) on public.applications to app_user;
grant insert on public.application_notes to app_user;

revoke all on function app.submit_application(uuid, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function app.uid(), app.is_platform_admin(), app.has_role(uuid, text[]), app.is_member(uuid),
  app.shares_hub_with(uuid), app.submit_application(uuid, text, text, text, text, text, jsonb, jsonb) to app_user;
revoke all on function app.audit(uuid, text, text, uuid, jsonb) from public;
grant execute on function app.audit(uuid, text, text, uuid, jsonb) to app_user;
