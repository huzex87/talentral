// Row-Level Security: proves each role can do exactly what it should, and nothing across hubs.
// Runs against DATABASE_URL_TEST, which it resets.
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../src/migrations';

const url = process.env.DATABASE_URL_TEST ?? 'postgres://talentral:talentral@localhost:5432/talentral_test';
const sql = postgres(url, { max: 4, onnotice: () => {} });

// Runs fn as the given user (null = anonymous visitor) under app_user, like the app does.
async function as<T>(userId: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId ?? ''}, true)`;
    await tx`set local role app_user`;
    return fn(tx);
  }) as Promise<T>;
}

const ids: Record<string, string> = {};

async function submit(programme: string, email: string, ref: string) {
  return as(null, (tx) => tx`select app.submit_application(${programme}, ${ref}, ${email}, 'Test Person', '08031234567',
    'Software', ${tx.json({ q: 'a' })}, ${tx.json([{ field_id: 'cv', storage_path: 'x/cv.pdf', filename: 'cv.pdf', content_type: 'application/pdf', size_bytes: 10 }])}) as id`);
}

beforeAll(async () => {
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists app cascade; create schema public;');
  await applyMigrations(sql);
  const users = await sql<{ id: string; email: string }[]>`
    insert into users (email, is_platform_admin) values
      ('owner1@hub.ng', false), ('owner2@hub.ng', false), ('reviewer1@hub.ng', false),
      ('admin1@hub.ng', false), ('platform@talentral.ng', true)
    returning id, email`;
  for (const u of users) ids[u.email.split('@')[0]!] = u.id;
  const hubs = await sql<{ id: string; slug: string }[]>`
    insert into tenants (slug, name, status) values ('hub-one', 'Hub One', 'active'), ('hub-two', 'Hub Two', 'active'), ('hub-off', 'Suspended Hub', 'suspended')
    returning id, slug`;
  for (const h of hubs) ids[h.slug] = h.id;
  await sql`insert into memberships (tenant_id, user_id, role) values
    (${ids['hub-one']!}, ${ids.owner1!}, 'owner'), (${ids['hub-one']!}, ${ids.reviewer1!}, 'reviewer'),
    (${ids['hub-one']!}, ${ids.admin1!}, 'admin'), (${ids['hub-two']!}, ${ids.owner2!}, 'owner'),
    (${ids['hub-off']!}, ${ids.owner2!}, 'owner')`;
  const progs = await sql<{ id: string; slug: string }[]>`
    insert into programmes (tenant_id, slug, title, status, reference_prefix, opens_at, closes_at) values
      (${ids['hub-one']!}, 'open-call', 'Open call', 'open', 'HUB', null, null),
      (${ids['hub-one']!}, 'draft-call', 'Draft call', 'draft', 'HUB', null, null),
      (${ids['hub-one']!}, 'future-call', 'Future call', 'open', 'HUB', now() + interval '2 days', null),
      (${ids['hub-one']!}, 'past-call', 'Past call', 'open', 'HUB', null, now() - interval '1 day'),
      (${ids['hub-two']!}, 'two-call', 'Hub two call', 'open', 'TWO', null, null)
    returning id, slug`;
  for (const p of progs) ids[p.slug] = p.id;
});

afterAll(async () => { await sql.end(); });

describe('anonymous visitors', () => {
  it('see active hubs and open or closed programmes only', async () => {
    const hubs = await as(null, (tx) => tx`select slug from tenants order by slug`);
    expect(hubs.map((h) => h.slug)).toEqual(['hub-one', 'hub-two']);
    const progs = await as(null, (tx) => tx`select slug from programmes order by slug`);
    expect(progs.map((p) => p.slug)).not.toContain('draft-call');
    expect(progs.map((p) => p.slug)).toContain('open-call');
  });

  it('can submit only to programmes that are open now', async () => {
    const [row] = await submit(ids['open-call']!, 'applicant@mail.ng', 'HUB-26-AAAAA');
    expect(row!.id).toBeTruthy();
    for (const slug of ['draft-call', 'future-call', 'past-call']) {
      await expect(submit(ids[slug]!, 'applicant@mail.ng', `HUB-26-${slug.slice(0, 5).toUpperCase()}`)).rejects.toThrow(/not open/);
    }
  });

  it('cannot apply twice with the same email', async () => {
    await expect(submit(ids['open-call']!, 'APPLICANT@mail.ng', 'HUB-26-BBBBB')).rejects.toThrow(/duplicate key/);
  });

  it('cannot read or insert applications directly, or touch auth tables', async () => {
    expect(await as(null, (tx) => tx`select id from applications`)).toHaveLength(0);
    await expect(as(null, (tx) => tx`insert into applications (tenant_id, programme_id, reference, email, full_name, phone, consent_at)
      values (${ids['hub-one']!}, ${ids['open-call']!}, 'HUB-26-CCCCC', 'x@y.ng', 'X', '0803', now())`)).rejects.toThrow(/permission denied/);
    await expect(as(null, (tx) => tx`select * from sessions`)).rejects.toThrow(/permission denied/);
    await expect(as(null, (tx) => tx`select * from sign_in_tokens`)).rejects.toThrow(/permission denied/);
  });
});

describe('hub teams', () => {
  it('see their own hub applications and nothing from other hubs', async () => {
    await submit(ids['two-call']!, 'someone@mail.ng', 'TWO-26-AAAAA');
    const own = await as(ids.owner1!, (tx) => tx`select reference from applications`);
    expect(own.map((a) => a.reference)).toEqual(['HUB-26-AAAAA']);
    const other = await as(ids.owner2!, (tx) => tx`select reference from applications`);
    expect(other.map((a) => a.reference)).toEqual(['TWO-26-AAAAA']);
    const files = await as(ids.owner2!, (tx) => tx`select id from application_files where tenant_id = ${ids['hub-one']!}`);
    expect(files).toHaveLength(0);
  });

  it('see their own draft programmes but not other hubs\' drafts, and cannot write to other hubs', async () => {
    const mine = await as(ids.owner1!, (tx) => tx`select slug from programmes where slug = 'draft-call'`);
    expect(mine).toHaveLength(1);
    const theirs = await as(ids.owner2!, (tx) => tx`select slug from programmes where slug = 'draft-call'`);
    expect(theirs).toHaveLength(0);
    await expect(as(ids.owner2!, (tx) => tx`insert into programmes (tenant_id, slug, title, reference_prefix)
      values (${ids['hub-one']!}, 'sneaky', 'Sneaky', 'HUB')`)).rejects.toThrow(/row-level security/);
    const updated = await as(ids.owner2!, (tx) => tx`update tenants set name = 'Hacked' where id = ${ids['hub-one']!} returning id`);
    expect(updated).toHaveLength(0);
  });

  it('lets reviewers move applications and records the change in the audit log', async () => {
    const [app] = await as(ids.reviewer1!, (tx) => tx`update applications set status = 'shortlisted' returning id, status`);
    expect(app!.status).toBe('shortlisted');
    const log = await as(ids.owner1!, (tx) => tx`select action, metadata from audit_log where target_id = ${app!.id} and action = 'application.status'`);
    expect(log[0]!.metadata).toMatchObject({ from: 'submitted', to: 'shortlisted' });
    expect(await as(ids.reviewer1!, (tx) => tx`select id from audit_log`)).toHaveLength(0);
    const blocked = await as(ids.owner2!, (tx) => tx`update applications set status = 'rejected' where tenant_id = ${ids['hub-one']!} returning id`);
    expect(blocked).toHaveLength(0);
    await expect(as(ids.owner1!, (tx) => tx`update applications set email = 'x@y.ng'`)).rejects.toThrow(/permission denied/);
    await expect(as(ids.owner1!, (tx) => tx`delete from audit_log`)).rejects.toThrow(/permission denied/);
  });

  it('only allows notes on their own hub applications', async () => {
    const [app] = await sql`select id from applications where reference = 'HUB-26-AAAAA'`;
    await as(ids.reviewer1!, (tx) => tx`insert into application_notes (tenant_id, application_id, author_id, body)
      values (${ids['hub-one']!}, ${app!.id}, ${ids.reviewer1!}, 'Strong portfolio')`);
    await expect(as(ids.owner2!, (tx) => tx`insert into application_notes (tenant_id, application_id, author_id, body)
      values (${ids['hub-two']!}, ${app!.id}, ${ids.owner2!}, 'Cross-hub note')`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.reviewer1!, (tx) => tx`insert into application_notes (tenant_id, application_id, author_id, body)
      values (${ids['hub-one']!}, ${app!.id}, ${ids.owner1!}, 'Impersonated')`)).rejects.toThrow(/row-level security/);
  });

  it('can edit the profile but not the address or status of the hub', async () => {
    const [row] = await as(ids.admin1!, (tx) => tx`update tenants set tagline = 'Building talent' where id = ${ids['hub-one']!} returning tagline`);
    expect(row!.tagline).toBe('Building talent');
    await expect(as(ids.owner1!, (tx) => tx`update tenants set slug = 'hub-renamed' where id = ${ids['hub-one']!}`)).rejects.toThrow(/platform admins/);
    const [moved] = await as(ids.platform!, (tx) => tx`update tenants set slug = 'hub-one-new' where id = ${ids['hub-one']!} returning slug`);
    expect(moved!.slug).toBe('hub-one-new');
  });

  it('keeps at least one owner and stops admins or reviewers from inviting owners', async () => {
    await expect(as(ids.owner1!, (tx) => tx`update memberships set role = 'admin' where user_id = ${ids.owner1!}`)).rejects.toThrow(/at least one owner/);
    await expect(as(ids.admin1!, (tx) => tx`insert into invites (tenant_id, email, role, token_hash, expires_at)
      values (${ids['hub-one']!}, 'new@hub.ng', 'owner', 'h1', now() + interval '1 day')`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.reviewer1!, (tx) => tx`insert into invites (tenant_id, email, role, token_hash, expires_at)
      values (${ids['hub-one']!}, 'new@hub.ng', 'reviewer', 'h2', now() + interval '1 day')`)).rejects.toThrow(/row-level security/);
    await as(ids.admin1!, (tx) => tx`insert into invites (tenant_id, email, role, token_hash, expires_at)
      values (${ids['hub-one']!}, 'new@hub.ng', 'reviewer', 'h3', now() + interval '1 day')`);
  });

  it('see co-members but not strangers, and cannot grant themselves platform rights', async () => {
    const seen = await as(ids.owner1!, (tx) => tx`select email from users order by email`);
    expect(seen.map((u) => u.email)).toEqual(['admin1@hub.ng', 'owner1@hub.ng', 'reviewer1@hub.ng']);
    await expect(as(ids.owner1!, (tx) => tx`update users set is_platform_admin = true where id = ${ids.owner1!}`)).rejects.toThrow(/permission denied/);
  });

  it('can see a suspended hub they belong to, which the public cannot', async () => {
    expect(await as(ids.owner2!, (tx) => tx`select slug from tenants where slug = 'hub-off'`)).toHaveLength(1);
    expect(await as(null, (tx) => tx`select slug from tenants where slug = 'hub-off'`)).toHaveLength(0);
  });
});

describe('screening scores', () => {
  const sheet = (tx: postgres.TransactionSql, app: string, tenant: string, reviewer: string, percent = 60) =>
    tx`insert into application_scores (tenant_id, application_id, reviewer_id, scores, percent)
       values (${tenant}, ${app}, ${reviewer}, ${tx.json({ motivation: 3 })}, ${percent}) returning id`;

  it('lets each team member keep one scoresheet, visible to the whole team', async () => {
    const [app] = await sql`select id from applications where reference = 'HUB-26-AAAAA'`;
    await as(ids.reviewer1!, (tx) => sheet(tx, app!.id, ids['hub-one']!, ids.reviewer1!, 70));
    await as(ids.owner1!, (tx) => sheet(tx, app!.id, ids['hub-one']!, ids.owner1!, 50));
    await expect(as(ids.reviewer1!, (tx) => sheet(tx, app!.id, ids['hub-one']!, ids.reviewer1!))).rejects.toThrow(/duplicate key/);
    const seen = await as(ids.admin1!, (tx) => tx`select avg(percent)::float as avg, count(*)::int as n from application_scores where application_id = ${app!.id}`);
    expect(seen[0]).toMatchObject({ avg: 60, n: 2 });
  });

  it('stops reviewers writing for someone else, editing others, or scoring another hub', async () => {
    const [app] = await sql`select id from applications where reference = 'HUB-26-AAAAA'`;
    const [other] = await sql`select id from applications where reference = 'TWO-26-AAAAA'`;
    await expect(as(ids.reviewer1!, (tx) => sheet(tx, app!.id, ids['hub-one']!, ids.admin1!))).rejects.toThrow(/row-level security/);
    const edited = await as(ids.reviewer1!, (tx) => tx`update application_scores set percent = 100 where reviewer_id = ${ids.owner1!} returning id`);
    expect(edited).toHaveLength(0);
    await expect(as(ids.owner2!, (tx) => sheet(tx, app!.id, ids['hub-two']!, ids.owner2!))).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner1!, (tx) => sheet(tx, other!.id, ids['hub-one']!, ids.owner1!))).rejects.toThrow(/row-level security/);
    expect(await as(ids.owner2!, (tx) => tx`select id from application_scores`)).toHaveLength(0);
    expect(await as(null, (tx) => tx`select id from application_scores`)).toHaveLength(0);
  });

  it('lets a reviewer revise their own scores but not reassign the sheet', async () => {
    const [mine] = await as(ids.reviewer1!, (tx) => tx`update application_scores set percent = 80, updated_at = now() where reviewer_id = ${ids.reviewer1!} returning percent`);
    expect(Number(mine!.percent)).toBe(80);
    await expect(as(ids.reviewer1!, (tx) => tx`update application_scores set reviewer_id = ${ids.owner1!} where reviewer_id = ${ids.reviewer1!}`)).rejects.toThrow(/permission denied/);
  });
});

describe('importing selected participants', () => {
  const rows = (tx: postgres.TransactionSql, emails: string[]) => tx.json(emails.map((e, i) => ({
    reference: `IMP-26-${String.fromCharCode(65 + i)}${e.length}ZZZ`.slice(0, 12), full_name: `Person ${i}`, email: e, phone: '', track: 'Software', answers: { gender: 'Female' },
  })));

  it('lets owners and admins import, skipping emails already in the programme', async () => {
    const [r] = await as(ids.admin1!, (tx) => tx`select * from app.import_applications(${ids['open-call']!}, 'accepted', ${rows(tx, ['new1@x.ng', 'APPLICANT@mail.ng'])})`);
    expect(r).toMatchObject({ imported: 1, skipped: 1 });
    const [row] = await sql`select status, source, imported_by from applications where email = 'new1@x.ng'`;
    expect(row).toMatchObject({ status: 'accepted', source: 'imported', imported_by: ids.admin1 });
  });

  it('refuses reviewers, other hubs, anonymous callers and odd statuses', async () => {
    await expect(as(ids.reviewer1!, (tx) => tx`select * from app.import_applications(${ids['open-call']!}, 'accepted', ${rows(tx, ['r@x.ng'])})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner2!, (tx) => tx`select * from app.import_applications(${ids['open-call']!}, 'accepted', ${rows(tx, ['o@x.ng'])})`)).rejects.toThrow(/owners and admins/);
    await expect(as(null, (tx) => tx`select * from app.import_applications(${ids['open-call']!}, 'accepted', ${rows(tx, ['a@x.ng'])})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner1!, (tx) => tx`select * from app.import_applications(${ids['open-call']!}, 'withdrawn', ${rows(tx, ['w@x.ng'])})`)).rejects.toThrow(/can start as/);
  });
});

describe('bulk messages', () => {
  const send = (tx: postgres.TransactionSql, tenant: string, author: string) =>
    tx`insert into messages (tenant_id, author_id, channels, subject, body, recipients) values (${tenant}, ${author}, ${['email']}, 'Hi', 'Hello all', 3) returning id`;

  it('lets owners and admins send and log, readable by their own team only', async () => {
    const [m] = await as(ids.admin1!, (tx) => send(tx, ids['hub-one']!, ids.admin1!));
    await as(ids.admin1!, (tx) => tx`update messages set emailed = 3 where id = ${m!.id}`);
    expect(await as(ids.reviewer1!, (tx) => tx`select emailed from messages`)).toEqual([{ emailed: 3 }]);
    expect(await as(ids.owner2!, (tx) => tx`select id from messages where tenant_id = ${ids['hub-one']!}`)).toHaveLength(0);
    expect(await as(null, (tx) => tx`select id from messages`)).toHaveLength(0);
  });

  it('stops reviewers, other hubs and impersonation', async () => {
    await expect(as(ids.reviewer1!, (tx) => send(tx, ids['hub-one']!, ids.reviewer1!))).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner2!, (tx) => send(tx, ids['hub-one']!, ids.owner2!))).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner1!, (tx) => send(tx, ids['hub-one']!, ids.admin1!))).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner1!, (tx) => tx`update messages set body = 'changed'`)).rejects.toThrow(/permission denied/);
  });
});

describe('hub enquiries', () => {
  const lead = (email: string) => as(null, (tx) => tx`select app.submit_hub_lead('Arewa Tech Hub', 'Musa Idris', ${email}, '08031234567', 'Kano', '50 to 100', 'We run a coding bootcamp') as id`);

  it('lets anyone submit, but only platform admins read', async () => {
    const [row] = await lead('musa@arewa.ng');
    expect(row!.id).toBeTruthy();
    expect(await as(null, (tx) => tx`select id from hub_leads`)).toHaveLength(0);
    expect(await as(ids.owner1!, (tx) => tx`select id from hub_leads`)).toHaveLength(0);
    expect(await as(ids.platform!, (tx) => tx`select hub_name from hub_leads`)).toEqual([{ hub_name: 'Arewa Tech Hub' }]);
    await expect(as(null, (tx) => tx`insert into hub_leads (hub_name, contact_name, email, phone) values ('x', 'y', 'z@z.ng', '1')`)).rejects.toThrow(/permission denied/);
  });

  it('limits enquiries per email per day', async () => {
    await lead('MUSA@arewa.ng');
    await lead('musa@arewa.ng');
    await expect(lead('Musa@Arewa.ng')).rejects.toThrow(/Too many enquiries/);
  });
});

describe('cohorts and attendance', () => {
  const c: Record<string, string> = {};

  beforeAll(async () => {
    // An accepted learner and a merely shortlisted one in hub one's open call.
    await sql`update applications set status = 'accepted' where email = 'new1@x.ng'`;
    const [acc] = await sql`select id, reference, phone from applications where email = 'new1@x.ng'`;
    c.accepted = acc!.id; c.reference = acc!.reference;
    await sql`update applications set phone = '0803 555 0101' where id = ${c.accepted!}`;
    const [other] = await sql`select id from applications where reference = 'HUB-26-AAAAA'`;
    c.shortlisted = other!.id;
  });

  it('lets owners and admins create cohorts and enrol accepted applicants only', async () => {
    const [cohort] = await as(ids.admin1!, (tx) => tx`insert into cohorts (tenant_id, programme_id, name) values (${ids['hub-one']!}, ${ids['open-call']!}, 'Cohort A') returning id`);
    c.cohort = cohort!.id;
    await expect(as(ids.reviewer1!, (tx) => tx`insert into cohorts (tenant_id, programme_id, name) values (${ids['hub-one']!}, ${ids['open-call']!}, 'X')`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner2!, (tx) => tx`insert into cohorts (tenant_id, programme_id, name) values (${ids['hub-two']!}, ${ids['open-call']!}, 'X')`)).rejects.toThrow(/row-level security/);
    const [en] = await as(ids.admin1!, (tx) => tx`insert into enrolments (tenant_id, cohort_id, application_id) values (${ids['hub-one']!}, ${c.cohort!}, ${c.accepted!}) returning id`);
    c.enrolment = en!.id;
    await expect(as(ids.admin1!, (tx) => tx`insert into enrolments (tenant_id, cohort_id, application_id) values (${ids['hub-one']!}, ${c.cohort!}, ${c.shortlisted!})`)).rejects.toThrow(/row-level security/);
  });

  it('lets any team member take the register for their own hub only', async () => {
    const [s] = await as(ids.owner1!, (tx) => tx`insert into class_sessions (tenant_id, cohort_id, title, starts_at, ends_at, checkin_code, checkin_open)
      values (${ids['hub-one']!}, ${c.cohort!}, 'Week 1', now() - interval '30 minutes', now() + interval '1 hour', 'ABC234', true) returning id`);
    c.session = s!.id;
    await as(ids.reviewer1!, (tx) => tx`insert into attendance (tenant_id, session_id, enrolment_id, status, marked_by)
      values (${ids['hub-one']!}, ${c.session!}, ${c.enrolment!}, 'present', ${ids.reviewer1!})`);
    await expect(as(ids.owner2!, (tx) => tx`insert into attendance (tenant_id, session_id, enrolment_id, status, marked_by)
      values (${ids['hub-two']!}, ${c.session!}, ${c.enrolment!}, 'absent', ${ids.owner2!})`)).rejects.toThrow(/row-level security/);
    expect(await as(ids.owner2!, (tx) => tx`select id from attendance`)).toHaveLength(0);
    expect(await as(null, (tx) => tx`select id from class_sessions`)).toHaveLength(0);
    await sql`delete from attendance where session_id = ${c.session!}`;
  });

  it('lets learners check in with the code and their reference or phone, late after 15 minutes', async () => {
    const [r] = await as(null, (tx) => tx`select * from app.self_checkin('hub-one-new', 'abc234', ${c.reference!.toLowerCase()})`);
    expect(r).toEqual({ learner: 'Person 0', session_title: 'Week 1', status: 'late' });
    const [again] = await as(null, (tx) => tx`select * from app.self_checkin('hub-one-new', 'ABC234', '+234 803 555 0101')`);
    expect(again!.status).toBe('late'); // already recorded; checking in twice changes nothing
    await expect(as(null, (tx) => tx`select * from app.self_checkin('hub-one-new', 'ABC234', 'HUB-26-NOPE0')`)).rejects.toThrow(/could not find you/);
    await expect(as(null, (tx) => tx`select * from app.self_checkin('hub-two', 'ABC234', ${c.reference!})`)).rejects.toThrow(/not open/);
    await sql`update class_sessions set checkin_open = false where id = ${c.session!}`;
    await expect(as(null, (tx) => tx`select * from app.self_checkin('hub-one-new', 'ABC234', ${c.reference!})`)).rejects.toThrow(/not open/);
  });
});

describe('platform admins', () => {
  it('create hubs; hub teams cannot', async () => {
    await expect(as(ids.owner1!, (tx) => tx`insert into tenants (slug, name) values ('rogue-hub', 'Rogue')`)).rejects.toThrow(/row-level security/);
    const [hub] = await as(ids.platform!, (tx) => tx`insert into tenants (slug, name) values ('new-hub', 'New Hub') returning id`);
    expect(hub!.id).toBeTruthy();
  });

  it('can delete a hub, which removes its owners with it', async () => {
    await sql`delete from tenants where slug = 'hub-off'`;
    expect(await sql`select 1 from memberships where tenant_id = ${ids['hub-off']!}`).toHaveLength(0);
  });
});
