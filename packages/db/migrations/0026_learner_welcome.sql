-- Welcoming accepted applicants. A hub's acceptance email, and the email sent when the hub adds
-- someone to a cohort, carry a one-click link that opens the learner's account. The learner home
-- shows places that are confirmed but not yet in a cohort. Additive only: previews share this
-- database with production.

-- Sign-in links now have a purpose. 'sign_in' links are asked for on the sign-in page and last
-- 15 minutes; 'welcome' links go out with a hub's decision and last 7 days. next_path is where the
-- learner lands after signing in, limited to the learner area.
alter table public.sign_in_tokens
  add column purpose text not null default 'sign_in' check (purpose in ('sign_in', 'welcome')),
  add column next_path text check (next_path ~ '^/(learn|passport)(/[A-Za-z0-9_-]+)*$');

-- Places the caller has been accepted for that no cohort has taken them into yet. Learners cannot
-- read applications directly (row-level security keeps them to hub staff), so this returns only
-- what the learner home shows, matched on the email they applied with.
create function app.my_places()
returns table (application_id uuid, reference text, programme_title text, hub_name text, hub_slug text,
               hub_phone text, hub_email text, accepted_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.reference, p.title, t.name, t.slug, t.contact_phone, coalesce(t.email_reply_to::text, t.contact_email::text), a.updated_at
  from public.users u
  join public.applications a on a.email = u.email and a.status = 'accepted'
  join public.programmes p on p.id = a.programme_id
  join public.tenants t on t.id = a.tenant_id
  where u.id = app.uid()
    and not exists (select 1 from public.enrolments e where e.application_id = a.id)
  order by a.updated_at desc
$$;
revoke all on function app.my_places() from public;
grant execute on function app.my_places() to app_user;
