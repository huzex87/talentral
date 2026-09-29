-- Hosted Postgres (Supabase) exposes the public schema through its Data API as the anon and
-- authenticated roles, and grants them table access by default. Talentral never uses that API:
-- the app connects directly and runs requests as app_user. Remove every such grant so the Data API
-- can read or write nothing, now and for tables created later. No-op on plain Postgres.

alter table public.schema_migrations enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
