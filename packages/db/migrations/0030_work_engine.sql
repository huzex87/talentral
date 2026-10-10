-- Work Engine 1: shortlists on a three-working-day clock, one-tap replies from candidates, job
-- alerts for learners, and placement invoices. Additive only: previews share this database with
-- production. Never edit this file once pushed; put changes in a new migration.

-- ---------------------------------------------------------------- shortlist requests

-- An employer asks for a shortlist on an open job; Talentral promises it within three working days
-- (Monday to Friday, West Africa Time). Officers mark it sent when candidates have said yes.
alter table public.job_roles
  add column shortlist_requested_at timestamptz,
  add column shortlist_requested_by uuid references public.users (id) on delete set null,
  add column shortlist_due_at timestamptz,
  add column shortlist_sent_at timestamptz,
  add column shortlist_sent_by uuid references public.users (id) on delete set null;
create index on public.job_roles (shortlist_due_at) where shortlist_requested_at is not null and shortlist_sent_at is null;

-- The app role may insert jobs with any column, so new jobs always start without a request; the
-- functions below are the only way to set these fields.
create function app.job_role_shortlist_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.shortlist_requested_at := null; new.shortlist_requested_by := null; new.shortlist_due_at := null;
  new.shortlist_sent_at := null; new.shortlist_sent_by := null;
  return new;
end
$$;
create trigger job_roles_shortlist_guard before insert on public.job_roles
  for each row execute function app.job_role_shortlist_guard();

-- Adds working days (Monday to Friday, West Africa Time), keeping the time of day. A request made
-- at the weekend starts counting from 09:00 on Monday. Public holidays are not counted out.
create function app.add_working_days(p_from timestamptz, p_days integer) returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  d timestamp := p_from at time zone 'Africa/Lagos';
  n integer := 0;
begin
  if extract(isodow from d) >= 6 then
    d := date_trunc('day', d) + (8 - extract(isodow from d)::integer) * interval '1 day' + interval '9 hours';
  end if;
  while n < p_days loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d at time zone 'Africa/Lagos';
end
$$;
grant execute on function app.add_working_days(timestamptz, integer) to app_user;

-- A verified employer's member asks for a shortlist. Asking again while one is pending keeps the
-- original deadline; asking after one was sent starts a new clock.
create function app.request_shortlist(p_role uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare r public.job_roles; due timestamptz;
begin
  select * into r from public.job_roles where id = p_role;
  if not found or not app.is_verified_employer_member(r.employer_id) then
    raise exception 'Job not found' using errcode = '42501';
  end if;
  if r.status <> 'open' then raise exception 'Open the job before asking for a shortlist' using errcode = '22023'; end if;
  if r.shortlist_requested_at is not null and r.shortlist_sent_at is null then return r.shortlist_due_at; end if;
  due := app.add_working_days(now(), 3);
  update public.job_roles set shortlist_requested_at = now(), shortlist_requested_by = app.uid(), shortlist_due_at = due,
    shortlist_sent_at = null, shortlist_sent_by = null
  where id = p_role;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (null, app.uid(), 'shortlist.requested', 'job_role', p_role, jsonb_build_object('due_at', due));
  return due;
end
$$;
revoke all on function app.request_shortlist(uuid) from public;
grant execute on function app.request_shortlist(uuid) to app_user;

-- A talent officer sends the shortlist: at least one candidate has said yes and shares their
-- Passport with employers. Returns how many candidates the employer can now see.
create function app.send_shortlist(p_role uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare ready integer;
begin
  if not app.is_platform_admin() then raise exception 'Only talent officers send shortlists' using errcode = '42501'; end if;
  select count(*)::integer into ready from public.role_candidates c join public.passports p on p.user_id = c.user_id
  where c.role_id = p_role and c.interest = 'confirmed' and c.stage <> 'declined' and p.employer_sharing;
  if ready = 0 then raise exception 'No candidate has said yes and shared their Passport yet' using errcode = '22023'; end if;
  update public.job_roles set shortlist_sent_at = now(), shortlist_sent_by = app.uid() where id = p_role;
  if not found then raise exception 'Job not found' using errcode = '42501'; end if;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (null, app.uid(), 'shortlist.sent', 'job_role', p_role, jsonb_build_object('candidates', ready));
  return ready;
end
$$;
revoke all on function app.send_shortlist(uuid) from public;
grant execute on function app.send_shortlist(uuid) to app_user;

-- ---------------------------------------------------------------- one-tap replies

-- A private link sent by WhatsApp, SMS and email lets a candidate say yes or no to a role without
-- signing in. Only a hash is stored; the table is never readable by the app role.
create table public.candidate_reply_links (
  candidate_id uuid primary key references public.role_candidates (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.candidate_reply_links enable row level security;

-- Talent officers, or members of the verified employer that invited the person, issue a link.
-- Issuing again replaces the previous link.
create function app.issue_reply_link(p_candidate uuid, p_token_hash text, p_days integer default 14) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare emp uuid;
begin
  select r.employer_id into emp from public.role_candidates c join public.job_roles r on r.id = c.role_id where c.id = p_candidate;
  if emp is null or not (app.is_platform_admin() or app.is_verified_employer_member(emp)) then
    raise exception 'Candidate not found' using errcode = '42501';
  end if;
  insert into public.candidate_reply_links (candidate_id, token_hash, expires_at)
  values (p_candidate, p_token_hash, now() + make_interval(days => least(greatest(p_days, 1), 30)))
  on conflict (candidate_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, used_at = null, created_at = now();
  return true;
end
$$;
revoke all on function app.issue_reply_link(uuid, text, integer) from public;
grant execute on function app.issue_reply_link(uuid, text, integer) to app_user;

-- What the link shows: the role and its employer, the person's first name, and where they stand.
-- Nothing for an unknown or expired link.
create function app.reply_link(p_token_hash text)
returns table (candidate_id uuid, first_name text, language text, role_title text, employer text, work_mode text, job_type text,
               state text, pay_min integer, pay_max integer, interest text, stage text, answered boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, split_part(coalesce(u.full_name, ''), ' ', 1), coalesce(u.language, 'en'), r.title, e.name, r.work_mode, r.job_type,
    r.state, r.pay_min, r.pay_max, c.interest, c.stage, l.used_at is not null
  from public.candidate_reply_links l
  join public.role_candidates c on c.id = l.candidate_id
  join public.job_roles r on r.id = c.role_id
  join public.employers e on e.id = r.employer_id
  join public.users u on u.id = c.user_id
  where l.token_hash = p_token_hash and l.expires_at > now()
$$;
revoke all on function app.reply_link(text) from public;
grant execute on function app.reply_link(text) to app_user;

-- The answer. The person can change it while the link lasts, until they are placed.
create function app.reply_by_link(p_token_hash text, p_interest text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare cid uuid; uid uuid;
begin
  if p_interest not in ('confirmed', 'declined') then raise exception 'Choose yes or no' using errcode = '22023'; end if;
  select l.candidate_id, c.user_id into cid, uid from public.candidate_reply_links l join public.role_candidates c on c.id = l.candidate_id
  where l.token_hash = p_token_hash and l.expires_at > now() and c.stage <> 'placed';
  if cid is null then return false; end if;
  update public.role_candidates set interest = p_interest, interest_at = now() where id = cid;
  update public.candidate_reply_links set used_at = now() where candidate_id = cid;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (null, uid, 'candidate.replied', 'role_candidate', cid, jsonb_build_object('interest', p_interest, 'via', 'link'));
  return true;
end
$$;
revoke all on function app.reply_by_link(text, text) from public;
grant execute on function app.reply_by_link(text, text) to app_user;

-- ---------------------------------------------------------------- job alerts

-- Learners choose to hear about new jobs that match their Passport. The scheduler records each
-- alert once per person and job; the record is system-only and goes with the account.
alter table public.passports add column job_alerts boolean not null default false, add column job_alerts_at timestamptz;
grant update (job_alerts, job_alerts_at) on public.passports to app_user;

create table public.job_alerts_sent (
  user_id uuid not null references public.users (id) on delete cascade,
  role_id uuid not null references public.job_roles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  match_score integer,
  primary key (user_id, role_id)
);
create index on public.job_alerts_sent (user_id, sent_at);
alter table public.job_alerts_sent enable row level security;

-- ---------------------------------------------------------------- placement invoices

-- One invoice per placement, numbered TAL-<year>-<0001>, in whole naira. A fee is a percentage of
-- the first year's pay or a flat amount, with optional VAT. Each invoice keeps a snapshot of who
-- and what it was for, because invoices are kept as financial records. No interest or
-- late-payment charge is ever added.
create table public.invoice_counters (year integer primary key, last integer not null);
alter table public.invoice_counters enable row level security;

create table public.placement_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  candidate_id uuid unique references public.role_candidates (id) on delete set null,
  employer_id uuid not null references public.employers (id) on delete restrict,
  employer_name text not null,
  role_title text not null,
  candidate_name text not null,
  start_date date not null,
  fee_type text not null check (fee_type in ('percent', 'flat')),
  fee_percent numeric(5, 2) check (fee_percent > 0 and fee_percent <= 50),
  annual_pay bigint check (annual_pay > 0),
  subtotal bigint not null check (subtotal > 0),
  vat_percent numeric(4, 2) not null default 0 check (vat_percent >= 0 and vat_percent <= 20),
  vat bigint not null default 0 check (vat >= 0),
  total bigint not null check (total > 0),
  issued_at timestamptz not null default now(),
  due_on date not null,
  replacement_until date not null,
  status text not null default 'issued' check (status in ('issued', 'paid', 'waived', 'void')),
  paid_at timestamptz,
  payment_reference text check (char_length(payment_reference) <= 120),
  status_note text check (char_length(status_note) <= 500),
  created_by uuid references public.users (id) on delete set null,
  constraint placement_invoices_terms check (
    (fee_type = 'percent' and fee_percent is not null and annual_pay is not null) or (fee_type = 'flat' and fee_percent is null))
);
create index on public.placement_invoices (employer_id, issued_at desc);
create index on public.placement_invoices (status, due_on);
alter table public.placement_invoices enable row level security;
grant select on public.placement_invoices to app_user;
create policy invoices_read on public.placement_invoices for select to app_user
  using (app.is_platform_admin() or app.is_employer_member(employer_id));

-- Issues the invoice for a confirmed hire. Talent officers only.
create function app.issue_placement_invoice(
  p_candidate uuid, p_fee_type text, p_fee_percent numeric, p_annual_pay bigint, p_flat bigint,
  p_vat_percent numeric default 0, p_due_days integer default 14)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c record; sub bigint; v bigint; yr integer := extract(year from now() at time zone 'Africa/Lagos')::integer; n integer; inv uuid;
begin
  if not app.is_platform_admin() then raise exception 'Only talent officers issue invoices' using errcode = '42501'; end if;
  select rc.id, rc.stage, rc.start_date, r.title, r.employer_id, e.name as employer, coalesce(u.full_name, u.email::text) as person
  into c
  from public.role_candidates rc join public.job_roles r on r.id = rc.role_id join public.employers e on e.id = r.employer_id
  join public.users u on u.id = rc.user_id where rc.id = p_candidate;
  if c.id is null then raise exception 'Placement not found' using errcode = '42501'; end if;
  if c.stage <> 'placed' or c.start_date is null then raise exception 'Record the hire and its start date first' using errcode = '22023'; end if;
  if p_fee_type = 'percent' then
    if p_fee_percent is null or p_fee_percent <= 0 or p_fee_percent > 50 then raise exception 'The fee must be between 0 and 50 percent' using errcode = '22023'; end if;
    if p_annual_pay is null or p_annual_pay <= 0 then raise exception 'Enter the first year''s pay' using errcode = '22023'; end if;
    sub := round(p_annual_pay * p_fee_percent / 100);
  elsif p_fee_type = 'flat' then
    if p_flat is null or p_flat <= 0 then raise exception 'Enter the fee' using errcode = '22023'; end if;
    sub := p_flat;
  else
    raise exception 'Choose a percentage or a flat fee' using errcode = '22023';
  end if;
  if coalesce(p_vat_percent, 0) < 0 or coalesce(p_vat_percent, 0) > 20 then raise exception 'VAT must be between 0 and 20 percent' using errcode = '22023'; end if;
  v := round(sub * coalesce(p_vat_percent, 0) / 100);
  insert into public.invoice_counters (year, last) values (yr, 1)
  on conflict (year) do update set last = public.invoice_counters.last + 1 returning last into n;
  insert into public.placement_invoices (number, candidate_id, employer_id, employer_name, role_title, candidate_name, start_date,
    fee_type, fee_percent, annual_pay, subtotal, vat_percent, vat, total, due_on, replacement_until, created_by)
  values ('TAL-' || yr || '-' || lpad(n::text, 4, '0'), c.id, c.employer_id, c.employer, c.title, c.person, c.start_date,
    p_fee_type, case when p_fee_type = 'percent' then p_fee_percent end, case when p_fee_type = 'percent' then p_annual_pay end,
    sub, coalesce(p_vat_percent, 0), v, sub + v,
    (now() at time zone 'Africa/Lagos')::date + least(greatest(coalesce(p_due_days, 14), 0), 90), c.start_date + 60, app.uid())
  returning id into inv;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (null, app.uid(), 'invoice.issued', 'placement_invoice', inv, jsonb_build_object('total', sub + v, 'employer', c.employer_id));
  return inv;
end
$$;
revoke all on function app.issue_placement_invoice(uuid, text, numeric, bigint, bigint, numeric, integer) from public;
grant execute on function app.issue_placement_invoice(uuid, text, numeric, bigint, bigint, numeric, integer) to app_user;

-- Records payment, or waives or voids an invoice with a reason. Talent officers only.
create function app.set_invoice_status(p_invoice uuid, p_status text, p_reference text default null, p_note text default null) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_platform_admin() then raise exception 'Only talent officers change invoices' using errcode = '42501'; end if;
  if p_status not in ('issued', 'paid', 'waived', 'void') then raise exception 'Unknown status' using errcode = '22023'; end if;
  if p_status in ('waived', 'void') and char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters' using errcode = '22023';
  end if;
  update public.placement_invoices set status = p_status,
    paid_at = case when p_status = 'paid' then now() end,
    payment_reference = case when p_status = 'paid' then nullif(trim(coalesce(p_reference, '')), '') end,
    status_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_invoice;
  if not found then raise exception 'Invoice not found' using errcode = '42501'; end if;
  insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
  values (null, app.uid(), 'invoice.' || case p_status when 'issued' then 'reopened' else p_status end, 'placement_invoice', p_invoice,
    jsonb_build_object('reference', p_reference));
  return true;
end
$$;
revoke all on function app.set_invoice_status(uuid, text, text, text) from public;
grant execute on function app.set_invoice_status(uuid, text, text, text) to app_user;
