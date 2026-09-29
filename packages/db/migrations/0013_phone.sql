-- Sprint 8: phone sign-in with a one-time SMS code. Additive only.

-- The phone a learner signs in with, in the form 234XXXXXXXXXX. Set the first time they sign in
-- with a code sent to the number on their application.
alter table public.users add column phone text unique check (phone ~ '^234[789][01][0-9]{8}$');

-- System-only, like sign_in_tokens: no grants to app_user. Codes are stored hashed with the number.
create table public.phone_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.phone_codes (phone, created_at desc);
alter table public.phone_codes enable row level security;
