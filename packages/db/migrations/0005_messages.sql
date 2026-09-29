-- Bulk messages from a hub to a group of applicants, by email and/or SMS. Each send is logged with
-- who sent it, to whom (the filters used and the count) and how many were delivered to the
-- providers, so hubs can show funders how participants were kept informed.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  channels text[] not null check (channels <@ array['email', 'sms'] and cardinality(channels) > 0),
  subject text check (char_length(subject) <= 160),
  body text not null check (char_length(body) between 1 and 5000),
  audience jsonb not null default '{}'::jsonb,
  recipients integer not null default 0 check (recipients >= 0),
  emailed integer not null default 0 check (emailed >= 0),
  texted integer not null default 0 check (texted >= 0),
  created_at timestamptz not null default now()
);
create index on public.messages (tenant_id, created_at desc);

alter table public.messages enable row level security;

create policy messages_read on public.messages for select to app_user
  using (app.is_member(tenant_id) or app.is_platform_admin());
create policy messages_insert on public.messages for insert to app_user
  with check (app.has_role(tenant_id, array['owner', 'admin']) and author_id = app.uid());
-- Delivery counts are filled in after sending, by the author only.
create policy messages_update on public.messages for update to app_user
  using (author_id = app.uid() and app.has_role(tenant_id, array['owner', 'admin']))
  with check (author_id = app.uid());

grant select, insert on public.messages to app_user;
grant update (recipients, emailed, texted) on public.messages to app_user;
