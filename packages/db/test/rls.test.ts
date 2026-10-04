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

describe('assessments and certificates', () => {
  const x: Record<string, string> = {};
  const cert = (tx: postgres.TransactionSql, enrolment: string, by: string, serial: string) => tx`
    insert into certificates (tenant_id, enrolment_id, serial, learner_name, programme_title, cohort_name, hub_name, hub_slug, completed_on, issued_by)
    values (${ids['hub-one']!}, ${enrolment}, ${serial}, 'Person 0', 'Open call', 'Cohort A', 'Hub One', 'hub-one-new', current_date, ${by}) returning id`;

  beforeAll(async () => {
    const [e] = await sql`select e.id, e.cohort_id from enrolments e join applications a on a.id = e.application_id where a.email = 'new1@x.ng'`;
    x.enrolment = e!.id; x.cohort = e!.cohort_id;
  });

  it('lets admins set assessments and any team member grade, within the maximum', async () => {
    const [a] = await as(ids.admin1!, (tx) => tx`insert into assessments (tenant_id, cohort_id, title, max_score) values (${ids['hub-one']!}, ${x.cohort!}, 'Portfolio', 20) returning id`);
    x.assessment = a!.id;
    await expect(as(ids.reviewer1!, (tx) => tx`insert into assessments (tenant_id, cohort_id, title) values (${ids['hub-one']!}, ${x.cohort!}, 'X')`)).rejects.toThrow(/row-level security/);
    await as(ids.reviewer1!, (tx) => tx`insert into assessment_results (tenant_id, assessment_id, enrolment_id, score, graded_by) values (${ids['hub-one']!}, ${x.assessment!}, ${x.enrolment!}, 17, ${ids.reviewer1!})`);
    await expect(as(ids.reviewer1!, (tx) => tx`update assessment_results set score = 25, graded_by = ${ids.reviewer1!} where assessment_id = ${x.assessment!}`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner2!, (tx) => tx`insert into assessment_results (tenant_id, assessment_id, enrolment_id, score, graded_by) values (${ids['hub-two']!}, ${x.assessment!}, ${x.enrolment!}, 1, ${ids.owner2!})`)).rejects.toThrow(/row-level security/);
    expect(await as(ids.owner2!, (tx) => tx`select id from assessment_results`)).toHaveLength(0);
  });

  it('issues certificates only to completed learners, by owners and admins', async () => {
    await expect(as(ids.admin1!, (tx) => cert(tx, x.enrolment!, ids.admin1!, 'TAL-HUB-26-AB12CD'))).rejects.toThrow(/row-level security/); // still active
    await sql`update enrolments set status = 'completed' where id = ${x.enrolment!}`;
    await expect(as(ids.reviewer1!, (tx) => cert(tx, x.enrolment!, ids.reviewer1!, 'TAL-HUB-26-AB12CD'))).rejects.toThrow(/row-level security/);
    await as(ids.admin1!, (tx) => cert(tx, x.enrolment!, ids.admin1!, 'TAL-HUB-26-AB12CD'));
    await expect(as(ids.owner1!, (tx) => tx`update certificates set learner_name = 'Someone else'`)).rejects.toThrow(/permission denied/);
    expect(await as(null, (tx) => tx`select id from certificates`)).toHaveLength(0);
  });

  it('shows partners with their programme: public once published, editable by owners and admins only', async () => {
    await as(ids.admin1!, (tx) => tx`insert into programme_partners (tenant_id, programme_id, name, role, logo_path) values (${ids['hub-one']!}, ${ids['open-call']!}, 'iDICE', 'funder', 'x/idice.png')`);
    await as(ids.admin1!, (tx) => tx`insert into programme_partners (tenant_id, programme_id, name, logo_path) values (${ids['hub-one']!}, ${ids['draft-call']!}, 'Secret', 'x/s.png')`);
    expect((await as(null, (tx) => tx`select name from programme_partners`)).map((r) => r.name)).toEqual(['iDICE']);
    await expect(as(ids.reviewer1!, (tx) => tx`insert into programme_partners (tenant_id, programme_id, name, logo_path) values (${ids['hub-one']!}, ${ids['open-call']!}, 'X', 'x')`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner2!, (tx) => tx`insert into programme_partners (tenant_id, programme_id, name, logo_path) values (${ids['hub-two']!}, ${ids['open-call']!}, 'X', 'x')`)).rejects.toThrow(/row-level security/);
  });

  it('lets anyone verify a serial, and shows revocation', async () => {
    const [v] = await as(null, (tx) => tx`select * from app.verify_certificate(' tal-hub-26-ab12cd ')`);
    expect(v).toMatchObject({ serial: 'TAL-HUB-26-AB12CD', learner_name: 'Person 0', hub_name: 'Hub One', revoked_at: null });
    expect(await as(null, (tx) => tx`select * from app.verify_certificate('TAL-HUB-26-ZZZZZZ')`)).toHaveLength(0);
    await as(ids.owner1!, (tx) => tx`update certificates set revoked_at = now(), revoked_reason = 'Issued in error' where serial = 'TAL-HUB-26-AB12CD'`);
    const [r] = await as(null, (tx) => tx`select revoked_reason from app.verify_certificate('TAL-HUB-26-AB12CD')`);
    expect(r!.revoked_reason).toBe('Issued in error');
  });
});

describe('passports and talent', () => {
  const y: Record<string, string> = {};
  beforeAll(async () => {
    const us = await sql<{ id: string; email: string }[]>`insert into users (email, full_name) values ('new1@x.ng', 'Person 0'), ('stranger@x.ng', 'Stranger') returning id, email`;
    y.learner = us.find((u) => u.email === 'new1@x.ng')!.id;
    y.stranger = us.find((u) => u.email === 'stranger@x.ng')!.id;
  });

  it('belongs to the learner: private by default, consents logged, verification reserved', async () => {
    await as(y.learner!, (tx) => tx`insert into passports (user_id, headline, skills) values (${y.learner!}, 'Digital marketer', ${['SEO', 'Copywriting']})`);
    await expect(as(y.stranger!, (tx) => tx`insert into passports (user_id) values (${y.learner!})`)).rejects.toThrow(/row-level security|duplicate/);
    expect(await as(y.stranger!, (tx) => tx`select user_id from passports where user_id = ${y.learner!}`)).toHaveLength(0);
    expect(await as(ids.platform!, (tx) => tx`select user_id from passports where user_id = ${y.learner!}`)).toHaveLength(0);
    await expect(as(y.learner!, (tx) => tx`update passports set verified_at = now() where user_id = ${y.learner!}`)).rejects.toThrow(/permission denied/);
    await as(y.learner!, (tx) => tx`update passports set discoverable = true, employer_sharing = true where user_id = ${y.learner!}`);
    const [p] = await as(ids.platform!, (tx) => tx`select discoverable_at from passports where user_id = ${y.learner!}`);
    expect(p!.discoverable_at).toBeTruthy();
    const events = await as(y.learner!, (tx) => tx`select kind, granted from consent_events order by kind`);
    expect(events).toEqual([{ kind: 'discoverable', granted: true }, { kind: 'employer_sharing', granted: true }]);
    expect(await as(y.stranger!, (tx) => tx`select id from consent_events`)).toHaveLength(0);
    await expect(as(ids.owner1!, (tx) => tx`select app.set_passport_verified(${y.learner!}, true)`)).rejects.toThrow(/talent officers/);
    const [v] = await as(ids.platform!, (tx) => tx`select app.set_passport_verified(${y.learner!}, true) as ok`);
    expect(v!.ok).toBe(true);
  });

  it('shows a learning record to the learner and, while discoverable, to talent officers only', async () => {
    const mine = await as(y.learner!, (tx) => tx`select * from app.learning_record(${y.learner!})`);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]).toMatchObject({ hub_name: 'Hub One', programme_title: 'Open call' });
    expect(await as(y.stranger!, (tx) => tx`select * from app.learning_record(${y.learner!})`)).toHaveLength(0);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.learning_record(${y.learner!})`)).toHaveLength(0);
    expect((await as(ids.platform!, (tx) => tx`select * from app.learning_record(${y.learner!})`)).length).toBe(mine.length);
  });

  it('keeps employers and roles to talent officers, and shortlists only discoverable talent', async () => {
    const [e] = await as(ids.platform!, (tx) => tx`insert into employers (name, sector) values ('Acme Digital', 'Marketing') returning id`);
    const [r] = await as(ids.platform!, (tx) => tx`insert into job_roles (employer_id, title, skills) values (${e!.id}, 'Social media executive', ${['SEO']}) returning id`);
    y.role = r!.id;
    expect(await as(ids.owner1!, (tx) => tx`select id from employers`)).toHaveLength(0);
    await expect(as(ids.owner1!, (tx) => tx`insert into employers (name) values ('Rogue')`)).rejects.toThrow(/row-level security/);
    await as(y.stranger!, (tx) => tx`insert into passports (user_id) values (${y.stranger!})`); // private
    await expect(as(ids.platform!, (tx) => tx`insert into role_candidates (role_id, user_id) values (${y.role!}, ${y.stranger!})`)).rejects.toThrow(/row-level security/);
    const [c] = await as(ids.platform!, (tx) => tx`insert into role_candidates (role_id, user_id, added_by) values (${y.role!}, ${y.learner!}, ${ids.platform!}) returning id`);
    y.candidate = c!.id;
    await expect(as(ids.platform!, (tx) => tx`update role_candidates set interest = 'confirmed' where id = ${y.candidate!}`)).rejects.toThrow(/permission denied/);
  });

  it('lets only the candidate confirm interest, and shares confirmed candidates through a live link', async () => {
    const [opp] = await as(y.learner!, (tx) => tx`select * from app.my_opportunities()`);
    expect(opp).toMatchObject({ role_title: 'Social media executive', employer_name: 'Acme Digital', interest: 'pending' });
    expect(await as(y.stranger!, (tx) => tx`select * from app.my_opportunities()`)).toHaveLength(0);
    const [no] = await as(y.stranger!, (tx) => tx`select app.respond_to_opportunity(${y.candidate!}, 'confirmed') as ok`);
    expect(no!.ok).toBe(false);

    await as(ids.platform!, (tx) => tx`insert into shortlist_links (role_id, token_hash, expires_at) values (${y.role!}, 'live', now() + interval '14 days'), (${y.role!}, 'old', now() - interval '1 day')`);
    const [before] = await as(null, (tx) => tx`select app.open_shortlist('live') as s`);
    expect(before!.s.candidates).toHaveLength(0); // not confirmed yet
    await as(y.learner!, (tx) => tx`select app.respond_to_opportunity(${y.candidate!}, 'confirmed')`);
    const [after] = await as(null, (tx) => tx`select app.open_shortlist('live') as s`);
    expect(after!.s.role).toMatchObject({ title: 'Social media executive', employer: 'Acme Digital' });
    expect(after!.s.candidates).toHaveLength(1);
    expect(after!.s.candidates[0]).toMatchObject({ name: 'Person 0', headline: 'Digital marketer', verified: true });
    expect(JSON.stringify(after!.s)).not.toContain('new1@x.ng'); // no contact details
    const [expired] = await as(null, (tx) => tx`select app.open_shortlist('old') as s`);
    expect(expired!.s).toBeNull();
    const [seen] = await as(y.learner!, (tx) => tx`select employer_views from app.my_opportunities()`);
    expect(Number(seen!.employer_views)).toBe(1);

    await as(y.learner!, (tx) => tx`update passports set employer_sharing = false where user_id = ${y.learner!}`);
    const [hidden] = await as(null, (tx) => tx`select app.open_shortlist('live') as s`);
    expect(hidden!.s.candidates).toHaveLength(0);
  });

  it('gives hubs work outcomes for their own cohort as counts only', async () => {
    const [c] = await sql`select e.cohort_id from enrolments e join applications a on a.id = e.application_id where a.email = 'new1@x.ng'`;
    const [mine] = await as(ids.owner1!, (tx) => tx`select * from app.cohort_outcomes(${c!.cohort_id})`);
    expect(Number(mine!.put_forward)).toBe(1);
    const [theirs] = await as(ids.owner2!, (tx) => tx`select * from app.cohort_outcomes(${c!.cohort_id})`);
    expect(Number(theirs!.put_forward)).toBe(0);
  });

  it('drops out of search the moment discoverability is withdrawn', async () => {
    await as(y.learner!, (tx) => tx`update passports set discoverable = false where user_id = ${y.learner!}`);
    expect(await as(ids.platform!, (tx) => tx`select user_id from passports where user_id = ${y.learner!}`)).toHaveLength(0);
    expect(await as(ids.platform!, (tx) => tx`select * from app.learning_record(${y.learner!})`)).toHaveLength(0);
  });
});

describe('skills, employer accounts and impact', () => {
  const z: Record<string, string> = {};
  beforeAll(async () => {
    const [l] = await sql`select id from users where email = 'new1@x.ng'`;
    z.learner = l!.id;
    const [a] = await sql`select id from assessments where title = 'Portfolio'`;
    z.assessment = a!.id;
  });

  it('shares platform skills with everyone and keeps hub skills to the hub', async () => {
    const platform = await as(null, (tx) => tx`select id, name from skills where track = 'Software Development'`);
    expect(platform.length).toBeGreaterThanOrEqual(8);
    z.html = platform.find((s) => s.name === 'HTML and CSS')!.id;
    const [mine] = await as(ids.admin1!, (tx) => tx`insert into skills (tenant_id, track, name, maps_to) values (${ids['hub-one']!}, 'Software Development', 'Responsive layouts', ${z.html!}) returning id`);
    z.hubSkill = mine!.id;
    expect(await as(ids.owner2!, (tx) => tx`select id from skills where id = ${z.hubSkill!}`)).toHaveLength(0);
    await expect(as(ids.owner2!, (tx) => tx`insert into skills (tenant_id, track, name, maps_to) values (${ids['hub-two']!}, 'X', 'Y', ${z.hubSkill!})`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner1!, (tx) => tx`insert into skills (track, name) values ('X', 'Platform skill')`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.reviewer1!, (tx) => tx`insert into skills (tenant_id, track, name) values (${ids['hub-one']!}, 'X', 'Y')`)).rejects.toThrow(/row-level security/);
  });

  it('turns graded work tagged with a skill into evidence, reported under the platform skill', async () => {
    await as(ids.admin1!, (tx) => tx`insert into assessment_skills (assessment_id, skill_id, tenant_id) values (${z.assessment!}, ${z.hubSkill!}, ${ids['hub-one']!})`);
    await expect(as(ids.owner2!, (tx) => tx`insert into assessment_skills (assessment_id, skill_id, tenant_id) values (${z.assessment!}, ${z.html!}, ${ids['hub-two']!})`)).rejects.toThrow(/row-level security/);
    const ev = await as(z.learner!, (tx) => tx`select * from app.evidenced_skills(${z.learner!})`);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ skill: 'HTML and CSS', assessment: 'Portfolio', hub: 'Hub One' });
    expect(Number(ev[0]!.percent)).toBe(85);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.evidenced_skills(${z.learner!})`)).toHaveLength(0);
  });

  it('registers employers as pending; only verified employers post roles and search consenting talent', async () => {
    const [r] = await as(null, (tx) => tx`select app.register_employer('Arewa Tech', 'Software', '', 'Kano', '11-50', 'Musa Bello', 'Hiring@Arewa.ng', '0803', 'Frontend developers') as id`);
    z.employer = r!.id;
    const [u] = await sql`select id from users where email = 'hiring@arewa.ng'`;
    z.boss = u!.id;
    const [mine] = await as(z.boss!, (tx) => tx`select * from app.my_employers()`);
    expect(mine).toMatchObject({ name: 'Arewa Tech', status: 'pending' });
    expect(await as(z.boss!, (tx) => tx`select id from employers`)).toHaveLength(0); // no direct access to the CRM record
    await expect(as(z.boss!, (tx) => tx`insert into job_roles (employer_id, title, skills) values (${z.employer!}, 'Frontend developer', ${['React']})`)).rejects.toThrow(/row-level security/);

    await as(ids.platform!, (tx) => tx`update employers set status = 'verified', verified_at = now() where id = ${z.employer!}`);
    const [role] = await as(z.boss!, (tx) => tx`insert into job_roles (employer_id, title, skills, created_by) values (${z.employer!}, 'Frontend developer', ${['React']}, ${z.boss!}) returning id`);
    z.role = role!.id;
    expect(await as(ids.owner1!, (tx) => tx`select id from job_roles where id = ${z.role!}`)).toHaveLength(0);

    // Talent is hidden until the learner opts in to employer search.
    expect(await as(z.boss!, (tx) => tx`select user_id from passports where user_id = ${z.learner!}`)).toHaveLength(0);
    await expect(as(z.boss!, (tx) => tx`insert into role_candidates (role_id, user_id, added_by, invited_by_employer) values (${z.role!}, ${z.learner!}, ${z.boss!}, true)`)).rejects.toThrow(/row-level security/);
    await as(z.learner!, (tx) => tx`update passports set employer_search = true where user_id = ${z.learner!}`);
    expect(await as(z.boss!, (tx) => tx`select user_id from passports where user_id = ${z.learner!}`)).toHaveLength(1);
    expect((await as(z.boss!, (tx) => tx`select full_name from users where id = ${z.learner!}`))[0]!.full_name).toBe('Person 0');
    const [c] = await as(z.boss!, (tx) => tx`insert into role_candidates (role_id, user_id, added_by, invited_by_employer) values (${z.role!}, ${z.learner!}, ${z.boss!}, true) returning id`);
    z.candidate = c!.id;
    expect(await as(z.boss!, (tx) => tx`select * from app.candidate_contact(${z.candidate!})`)).toHaveLength(0); // not until they say yes
    await as(z.learner!, (tx) => tx`select app.respond_to_opportunity(${z.candidate!}, 'confirmed')`);
    const [contact] = await as(z.boss!, (tx) => tx`select * from app.candidate_contact(${z.candidate!})`);
    expect(contact!.email).toBe('new1@x.ng');
    await as(z.boss!, (tx) => tx`update role_candidates set stage = 'placed', placement_type = 'full_time', start_date = current_date - 95 where id = ${z.candidate!}`);
    await as(z.boss!, (tx) => tx`update role_candidates set retained = true, retention_checked_at = now() where id = ${z.candidate!}`);
  });

  it('hides candidates the talent team put forward until they say yes', async () => {
    const [other] = await sql`insert into users (email, full_name) values ('quiet@x.ng', 'Quiet') returning id`;
    await sql`insert into passports (user_id, discoverable) values (${other!.id}, true)`;
    await as(ids.platform!, (tx) => tx`insert into role_candidates (role_id, user_id, added_by) values (${z.role!}, ${other!.id}, ${ids.platform!})`);
    const seen = await as(z.boss!, (tx) => tx`select user_id from role_candidates where role_id = ${z.role!}`);
    expect(seen.map((r) => r.user_id)).toEqual([z.learner!]);
  });

  it('gives hubs per-learner outcomes for their own learners only', async () => {
    const mine = await as(ids.owner1!, (tx) => tx`select * from app.enrolment_outcomes(${ids['hub-one']!}) where placed`);
    expect(mine.length).toBeGreaterThan(0);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.enrolment_outcomes(${ids['hub-one']!})`)).toHaveLength(0);
  });
});

describe('courses, quizzes and submissions', () => {
  const w: Record<string, string> = {};
  const hub = () => ids['hub-one']!;
  beforeAll(async () => {
    const [l] = await sql`select id from users where email = 'new1@x.ng'`;
    w.learner = l!.id;
    const [e] = await sql`select e.id, e.cohort_id from enrolments e join applications a on a.id = e.application_id where a.email = 'new1@x.ng'`;
    w.enrolment = e!.id; w.cohort = e!.cohort_id;
    await sql`update cohorts set starts_on = current_date - 3 where id = ${w.cohort!}`;
    const [s] = await sql`insert into users (email) values ('nosy@x.ng') returning id`;
    w.nosy = s!.id;
  });

  it('lets owners and admins build courses; others cannot', async () => {
    await expect(as(ids.reviewer1!, (tx) => tx`insert into courses (tenant_id, title) values (${hub()}, 'X')`)).rejects.toThrow(/row-level security/);
    const [c] = await as(ids.admin1!, (tx) => tx`insert into courses (tenant_id, title) values (${hub()}, 'Web basics') returning id`);
    w.course = c!.id;
    const [m1] = await as(ids.admin1!, (tx) => tx`insert into course_modules (tenant_id, course_id, title, position) values (${hub()}, ${w.course!}, 'Week 1', 0) returning id`);
    const [m2] = await as(ids.admin1!, (tx) => tx`insert into course_modules (tenant_id, course_id, title, position, unlock_after_days) values (${hub()}, ${w.course!}, 'Week 9', 1, 60) returning id`);
    const lesson = async (module: string, kind: string, title: string, extra = '') => (await as(ids.admin1!, (tx) => tx`
      insert into lessons (tenant_id, course_id, module_id, kind, title, body, max_attempts) values (${hub()}, ${w.course!}, ${module}, ${kind}, ${title}, ${extra || null}, ${kind === 'quiz' ? 2 : null}) returning id`))[0]!.id as string;
    w.text = await lesson(m1!.id, 'text', 'What is HTML?', 'HTML describes the structure of a page.');
    w.quiz = await lesson(m1!.id, 'quiz', 'HTML check');
    w.assignment = await lesson(m1!.id, 'assignment', 'Build a page');
    w.locked = await lesson(m2!.id, 'text', 'Deploying');
    await as(ids.admin1!, (tx) => tx`insert into quiz_questions (tenant_id, lesson_id, kind, prompt, options, correct, position) values
      (${hub()}, ${w.quiz!}, 'single', 'HTML stands for?', ${tx.json([{ id: 'a', text: 'HyperText Markup Language' }, { id: 'b', text: 'High Tech Language' }])}, ${['a']}, 0),
      (${hub()}, ${w.quiz!}, 'multiple', 'Which are tags?', ${tx.json([{ id: 'a', text: '<p>' }, { id: 'b', text: '<div>' }, { id: 'c', text: 'color' }])}, ${['a', 'b']}, 1)`);
    expect(await as(ids.owner2!, (tx) => tx`select id from courses where id = ${w.course!}`)).toHaveLength(0);
    await as(ids.admin1!, (tx) => tx`update cohorts set course_id = ${w.course!} where id = ${w.cohort!}`);
    await as(ids.admin1!, (tx) => tx`insert into assessments (tenant_id, cohort_id, title, kind, max_score, lesson_id) values
      (${hub()}, ${w.cohort!}, 'HTML check', 'quiz', 100, ${w.quiz!}), (${hub()}, ${w.cohort!}, 'Build a page', 'assignment', 100, ${w.assignment!})`);
  });

  it('shows learners nothing until the course is published, then only open lessons', async () => {
    expect(await as(w.learner!, (tx) => tx`select * from app.learner_outline(${w.cohort!})`)).toHaveLength(0);
    await as(ids.admin1!, (tx) => tx`update courses set status = 'published' where id = ${w.course!}`);
    const outline = await as(w.learner!, (tx) => tx`select lesson_id, open from app.learner_outline(${w.cohort!})`);
    expect(outline).toHaveLength(4);
    expect(outline.find((o) => o.lesson_id === w.locked)!.open).toBe(false);
    const [locked] = await as(w.learner!, (tx) => tx`select app.learner_lesson(${w.cohort!}, ${w.locked!}) as l`);
    expect(locked!.l).toBeNull();
    const [quiz] = await as(w.learner!, (tx) => tx`select app.learner_lesson(${w.cohort!}, ${w.quiz!}) as l`);
    expect(quiz!.l.questions).toHaveLength(2);
    expect(JSON.stringify(quiz!.l)).not.toContain('correct');
    expect(await as(w.learner!, (tx) => tx`select id from quiz_questions`)).toHaveLength(0);
    const [other] = await as(w.nosy!, (tx) => tx`select app.learner_lesson(${w.cohort!}, ${w.text!}) as l`);
    expect(other!.l).toBeNull();
    expect(await as(w.nosy!, (tx) => tx`select * from app.learner_outline(${w.cohort!})`)).toHaveLength(0);
    const [courses] = await as(w.learner!, (tx) => tx`select course_title, lessons from app.learner_courses() where cohort_id = ${w.cohort!}`);
    expect(courses).toMatchObject({ course_title: 'Web basics' });
  });

  it('marks quizzes on the server once per attempt, within the attempt limit, into the gradebook', async () => {
    const client = '11111111-1111-4111-8111-111111111111';
    const [r] = await as(w.learner!, (tx) => tx`select * from app.submit_quiz(${w.cohort!}, ${w.quiz!}, ${tx.json({})}, ${client})`);
    expect(r).toMatchObject({ max_score: 2, passed: false, duplicate: false });
    expect(Number(r!.score)).toBe(0);
    const [again] = await as(w.learner!, (tx) => tx`select * from app.submit_quiz(${w.cohort!}, ${w.quiz!}, ${tx.json({})}, ${client})`);
    expect(again).toMatchObject({ duplicate: true });
    expect(Number(again!.attempts)).toBe(1); // sent twice, counted once
    expect(await as(w.learner!, (tx) => tx`select * from app.quiz_review(${w.cohort!}, ${w.quiz!})`)).toHaveLength(0); // not before passing
    const [qs] = await sql`select array_agg(id order by position) as ids from quiz_questions where lesson_id = ${w.quiz!}`;
    const answers = { [qs!.ids[0]]: ['a'], [qs!.ids[1]]: ['b', 'a'] };
    const [ok] = await as(w.learner!, (tx) => tx`select * from app.submit_quiz(${w.cohort!}, ${w.quiz!}, ${tx.json(answers)}, ${'22222222-2222-4222-8222-222222222222'})`);
    expect(ok).toMatchObject({ passed: true });
    expect(Number(ok!.percent)).toBe(100);
    await expect(as(w.learner!, (tx) => tx`select * from app.submit_quiz(${w.cohort!}, ${w.quiz!}, ${tx.json(answers)}, ${'33333333-3333-4333-8333-333333333333'})`)).rejects.toThrow(/No attempts left/);
    expect(await as(w.learner!, (tx) => tx`select * from app.quiz_review(${w.cohort!}, ${w.quiz!})`)).toHaveLength(2); // revealed after passing
    await expect(as(w.nosy!, (tx) => tx`select * from app.submit_quiz(${w.cohort!}, ${w.quiz!}, ${tx.json(answers)}, ${'44444444-4444-4444-8444-444444444444'})`)).rejects.toThrow(/not open/);
    const [grade] = await sql`select r.score from assessment_results r join assessments a on a.id = r.assessment_id where a.lesson_id = ${w.quiz!} and r.enrolment_id = ${w.enrolment!}`;
    expect(Number(grade!.score)).toBe(100);
    const [done] = await as(w.learner!, (tx) => tx`select completed from app.learner_outline(${w.cohort!}) where lesson_id = ${w.quiz!}`);
    expect(done!.completed).toBe(true);
  });

  it('takes assignments one at a time, and lets the hub grade or ask for another go', async () => {
    const [s1] = await as(w.learner!, (tx) => tx`select app.submit_assignment(${w.cohort!}, ${w.assignment!}, 'My page', null, null, null, null, null) as id`);
    await expect(as(w.learner!, (tx) => tx`select app.submit_assignment(${w.cohort!}, ${w.assignment!}, 'Again', null, null, null, null, null)`)).rejects.toThrow(/waiting to be graded/);
    await expect(as(w.learner!, (tx) => tx`select app.submit_assignment(${w.cohort!}, ${w.assignment!}, null, null, 'tenants/other/x.pdf', 'x.pdf', 'application/pdf', 10)`)).rejects.toThrow();
    expect(await as(w.learner!, (tx) => tx`select id from submissions`)).toHaveLength(0);
    await expect(as(ids.owner2!, (tx) => tx`update submissions set status = 'graded', graded_by = ${ids.owner2!} where id = ${s1!.id} returning id`)).resolves.toHaveLength(0);
    await as(ids.reviewer1!, (tx) => tx`update submissions set status = 'resubmit', feedback = 'Add a contact form', graded_by = ${ids.reviewer1!}, graded_at = now() where id = ${s1!.id}`);
    const [s2] = await as(w.learner!, (tx) => tx`select app.submit_assignment(${w.cohort!}, ${w.assignment!}, 'My page with a form', null, null, null, null, null) as id`);
    const [row] = await sql`select attempt from submissions where id = ${s2!.id}`;
    expect(row!.attempt).toBe(2);
    expect((await as(w.learner!, (tx) => tx`select app.record_progress(${w.cohort!}, ${w.locked!}, true) as ok`))[0]!.ok).toBe(false);
  });
});

describe('live classes and announcements', () => {
  const v: Record<string, string> = {};
  beforeAll(async () => {
    const [l] = await sql`select id from users where email = 'new1@x.ng'`;
    v.learner = l!.id;
    const [e] = await sql`select e.id, e.cohort_id from enrolments e join applications a on a.id = e.application_id where a.email = 'new1@x.ng'`;
    v.enrolment = e!.id; v.cohort = e!.cohort_id;
    const [o] = await sql`select id from users where email = 'nosy@x.ng'`;
    v.nosy = o!.id;
    const [live] = await sql`insert into class_sessions (tenant_id, cohort_id, title, starts_at, ends_at, mode, checkin_code, meeting_url)
      values (${ids['hub-one']!}, ${v.cohort!}, 'Live now', now() - interval '5 minutes', now() + interval '55 minutes', 'online', 'LVEK22', 'https://meet.google.com/abc-defg-hij') returning id`;
    const [later] = await sql`insert into class_sessions (tenant_id, cohort_id, title, starts_at, ends_at, mode, checkin_code, meeting_url)
      values (${ids['hub-one']!}, ${v.cohort!}, 'Tomorrow', now() + interval '1 day', now() + interval '1 day 2 hours', 'online', 'LTRK22', 'https://meet.google.com/xyz') returning id`;
    v.live = live!.id; v.later = later!.id;
  });

  it('gives the link only to enrolled learners while the session is open, and marks them present', async () => {
    await expect(as(v.nosy!, (tx) => tx`select app.join_session(${v.live!})`)).rejects.toThrow(/not found/);
    await expect(as(v.learner!, (tx) => tx`select app.join_session(${v.later!})`)).rejects.toThrow(/Not open yet/);
    const [j] = await as(v.learner!, (tx) => tx`select app.join_session(${v.live!}) as url`);
    expect(j!.url).toBe('https://meet.google.com/abc-defg-hij');
    await as(v.learner!, (tx) => tx`select app.join_session(${v.live!})`); // joining twice keeps one mark
    const marks = await sql`select status, method from attendance where session_id = ${v.live!} and enrolment_id = ${v.enrolment!}`;
    expect(marks).toEqual([{ status: 'present', method: 'join' }]);
    expect(await sql`select id from session_joins where session_id = ${v.live!}`).toHaveLength(2);
    expect(await as(v.learner!, (tx) => tx`select meeting_url from class_sessions`)).toHaveLength(0);
  });

  it('checks in with the rotating QR token only while it is current', async () => {
    expect(await as(v.nosy!, (tx) => tx`select * from app.session_qr(${v.live!})`)).toHaveLength(0);
    const [qr] = await as(ids.reviewer1!, (tx) => tx`select * from app.session_qr(${v.live!})`);
    await expect(as(v.learner!, (tx) => tx`select * from app.qr_checkin(${v.live!}, 'deadbeef00')`)).rejects.toThrow(/expired/);
    const [stale] = await sql`select app.qr_token(qr_secret, ${Number(qr!.minute) - 5}) as t from class_sessions where id = ${v.live!}`;
    await expect(as(v.learner!, (tx) => tx`select * from app.qr_checkin(${v.live!}, ${stale!.t})`)).rejects.toThrow(/expired/);
    await expect(as(v.nosy!, (tx) => tx`select * from app.qr_checkin(${v.live!}, ${qr!.token})`)).rejects.toThrow(/not in this cohort/);
    const [r] = await as(v.learner!, (tx) => tx`select * from app.qr_checkin(${v.live!}, ${qr!.token})`);
    expect(r).toMatchObject({ session_title: 'Live now', status: 'present' });
  });

  it('lets the team confirm the register, marking the rest absent, after which joins do not change it', async () => {
    await expect(as(ids.owner2!, (tx) => tx`select app.confirm_attendance(${v.live!})`)).rejects.toThrow(/not found/);
    await expect(as(ids.reviewer1!, (tx) => tx`select app.confirm_attendance(${v.later!})`)).rejects.toThrow(/not happened/);
    const [c] = await as(ids.reviewer1!, (tx) => tx`select app.confirm_attendance(${v.live!}) as n`);
    expect(c!.n).toBeGreaterThanOrEqual(0);
    const unmarked = await sql`select count(*)::int as n from enrolments e where e.cohort_id = ${v.cohort!} and e.status <> 'dropped'
      and not exists (select 1 from attendance a where a.session_id = ${v.live!} and a.enrolment_id = e.id)`;
    expect(unmarked[0]!.n).toBe(0);
    const [sched] = await as(v.learner!, (tx) => tx`select title, has_link, my_status from app.learner_schedule() where session_id = ${v.live!}`);
    expect(sched).toMatchObject({ title: 'Live now', has_link: true, my_status: 'present' });
    expect(await as(v.nosy!, (tx) => tx`select * from app.learner_schedule()`)).toHaveLength(0);
  });

  it('posts announcements to a cohort and records who read them', async () => {
    await expect(as(ids.reviewer1!, (tx) => tx`insert into announcements (tenant_id, cohort_id, author_id, title, body) values (${ids['hub-one']!}, ${v.cohort!}, ${ids.reviewer1!}, 'X', 'Y')`)).rejects.toThrow(/row-level security/);
    const [a] = await as(ids.admin1!, (tx) => tx`insert into announcements (tenant_id, cohort_id, author_id, title, body) values (${ids['hub-one']!}, ${v.cohort!}, ${ids.admin1!}, 'Room change', 'We meet in Hall B today.') returning id`);
    const [before] = await as(v.learner!, (tx) => tx`select title, read from app.learner_announcements()`);
    expect(before).toMatchObject({ title: 'Room change', read: false });
    expect(await as(v.nosy!, (tx) => tx`select * from app.learner_announcements()`)).toHaveLength(0);
    await as(v.nosy!, (tx) => tx`select app.read_announcements(${[a!.id]}::uuid[])`);
    await as(v.learner!, (tx) => tx`select app.read_announcements(${[a!.id]}::uuid[])`);
    expect(await as(ids.admin1!, (tx) => tx`select enrolment_id from announcement_reads where announcement_id = ${a!.id}`)).toEqual([{ enrolment_id: v.enrolment }]);
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

describe('phone sign-in', () => {
  it('keeps codes away from the app role and stores numbers in one form', async () => {
    const [u] = await sql<{ id: string }[]>`insert into users (email, phone) values ('phone-learner@test.ng', '2348031112222') returning id`;
    await sql`insert into phone_codes (phone, user_id, code_hash, expires_at) values ('2348031112222', ${u!.id}, 'hash', now() + interval '10 minutes')`;
    await expect(as(u!.id, (tx) => tx`select * from phone_codes`)).rejects.toThrow(/permission denied/);
    await expect(sql`insert into users (email, phone) values ('dupe-phone@test.ng', '2348031112222')`).rejects.toThrow(/unique/);
    await expect(sql`insert into users (email, phone) values ('bad-phone@test.ng', '08031112222')`).rejects.toThrow(/check/);
    await expect(as(u!.id, (tx) => tx`update users set phone = '2348039998888' where id = ${u!.id}`)).rejects.toThrow(/permission denied/);
  });
});

describe('discussions, two-step secrets and personal data', () => {
  it('lets enrolled learners and the hub team talk, keeps others out, and lets admins moderate', async () => {
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name) values (${ids['hub-one']!}, ${ids['open-call']!}, 'Talk cohort') returning id`;
    const [app] = await submit(ids['open-call']!, 'talker@test.ng', 'HUB-26-TALK1');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id) values (${ids['hub-one']!}, ${cohort!.id}, ${app!.id})`;
    const [learner] = await sql<{ id: string }[]>`insert into users (email, full_name) values ('talker@test.ng', 'Talker Learner') returning id`;
    const [stranger] = await sql<{ id: string }[]>`insert into users (email) values ('stranger@test.ng') returning id`;

    expect((await as(learner!.id, (tx) => tx`select app.discussion_role(${cohort!.id}) as r`))[0]!.r).toBe('learner');
    expect((await as(ids.reviewer1!, (tx) => tx`select app.discussion_role(${cohort!.id}) as r`))[0]!.r).toBe('team');
    expect((await as(ids.owner2!, (tx) => tx`select app.discussion_role(${cohort!.id}) as r`))[0]!.r).toBeNull();

    const [started] = await as(learner!.id, (tx) => tx<{ id: string }[]>`select app.start_thread(${cohort!.id}, 'How do I deploy?', 'Stuck on step 3.') as id`);
    const thread = started!.id;
    await as(ids.reviewer1!, (tx) => tx`select app.reply_to_thread(${thread}, 'Use GitHub Pages.')`);
    await expect(as(stranger!.id, (tx) => tx`select app.start_thread(${cohort!.id}, 'Spam here', 'Buy now')`)).rejects.toThrow(/Not in this cohort/);
    await expect(as(stranger!.id, (tx) => tx`select app.reply_to_thread(${thread}, 'hi')`)).rejects.toThrow(/Not in this cohort/);
    expect(await as(stranger!.id, (tx) => tx`select * from app.cohort_threads(${cohort!.id})`)).toHaveLength(0);
    // No direct table access, even for the hub team.
    await expect(as(ids.owner1!, (tx) => tx`select * from discussion_threads`)).rejects.toThrow(/permission denied/);

    const posts = await as(learner!.id, (tx) => tx<{ author_is_team: boolean }[]>`select * from app.thread_posts(${thread})`);
    expect(posts.map((p) => p.author_is_team)).toEqual([true]);

    // Reviewers cannot moderate; admins can. Closing stops learners, not the team.
    await expect(as(ids.reviewer1!, (tx) => tx`select app.moderate_thread(${thread}, true, true, false)`)).rejects.toThrow(/Not allowed/);
    await as(ids.admin1!, (tx) => tx`select app.moderate_thread(${thread}, true, true, false)`);
    await expect(as(learner!.id, (tx) => tx`select app.reply_to_thread(${thread}, 'still stuck')`)).rejects.toThrow(/closed/);
    await as(ids.admin1!, (tx) => tx`select app.reply_to_thread(${thread}, 'Closing: solved.')`);

    // Hidden threads vanish for other learners but stay visible to the team.
    const [other] = await submit(ids['open-call']!, 'other@test.ng', 'HUB-26-TALK2');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id) values (${ids['hub-one']!}, ${cohort!.id}, ${other!.id})`;
    const [otherUser] = await sql<{ id: string }[]>`insert into users (email) values ('other@test.ng') returning id`;
    await as(ids.admin1!, (tx) => tx`select app.moderate_thread(${thread}, false, true, true)`);
    expect(await as(otherUser!.id, (tx) => tx`select * from app.cohort_threads(${cohort!.id})`)).toHaveLength(0);
    expect(await as(ids.owner1!, (tx) => tx`select * from app.cohort_threads(${cohort!.id})`)).toHaveLength(1);
    const logged = await sql`select action from audit_log where target_id = ${thread} order by at`;
    expect(logged.map((l) => l.action)).toEqual(['discussion.hidden']);
  });

  it('keeps two-step secrets and challenges away from the app role', async () => {
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('secure@test.ng') returning id`;
    await sql`insert into user_totp (user_id, secret, enabled_at) values (${u!.id}, 'SECRETSECRET', now())`;
    for (const table of ['user_totp', 'recovery_codes', 'sign_in_challenges']) {
      await expect(as(u!.id, (tx) => tx.unsafe(`select * from ${table}`))).rejects.toThrow(/permission denied/);
    }
  });

  it('gives each person only their own data', async () => {
    const [learner] = await sql<{ id: string }[]>`select id from users where email = 'talker@test.ng'`;
    type Mine = { account: { email: string }; applications: { reference: string }[]; enrolments: unknown[]; discussion_threads: unknown[] };
    const [mine] = await as(learner!.id, (tx) => tx<{ d: Mine }[]>`select app.my_data() as d`);
    const d = mine!.d;
    expect(d.account.email).toBe('talker@test.ng');
    expect(d.applications.map((a) => a.reference)).toEqual(['HUB-26-TALK1']);
    expect(d.enrolments).toHaveLength(1);
    expect(d.discussion_threads).toHaveLength(1);
    const [anon] = await as(null, (tx) => tx<{ d: { account: unknown } }[]>`select app.my_data() as d`);
    expect(anon!.d.account).toBeNull();
  });
});

describe('rubrics and peer review', () => {
  it('lets hubs build rubrics, hands out anonymous peer reviews fairly, and checks every review', async () => {
    const hub = ids['hub-one']!;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Peer course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title, peer_reviews) values (${hub}, ${course!.id}, ${mod!.id}, 'assignment', 'Build a page', 2) returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id, starts_on) values (${hub}, ${ids['open-call']!}, 'Peer cohort', ${course!.id}, current_date - 1) returning id`;
    const people: { user: string; enrolment: string }[] = [];
    for (const n of [1, 2, 3, 4]) {
      const [app] = await submit(ids['open-call']!, `peer${n}@test.ng`, `HUB-26-PEER${n}`);
      const [e] = await sql<{ id: string }[]>`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id}) returning id`;
      const [u] = await sql<{ id: string }[]>`insert into users (email) values (${`peer${n}@test.ng`}) returning id`;
      people.push({ user: u!.id, enrolment: e!.id });
    }
    const levels = [{ label: 'Good', points: 2 }, { label: 'Weak', points: 0 }];

    // Only owners and admins write rubrics, and only on their own assignments.
    await expect(as(ids.reviewer1!, (tx) => tx`insert into rubric_criteria (tenant_id, lesson_id, title, levels) values (${hub}, ${lesson!.id}, 'Structure', ${tx.json(levels)})`)).rejects.toThrow(/row-level security/);
    await expect(as(ids.owner2!, (tx) => tx`insert into rubric_criteria (tenant_id, lesson_id, title, levels) values (${hub}, ${lesson!.id}, 'Structure', ${tx.json(levels)})`)).rejects.toThrow(/row-level security/);
    const [crit] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into rubric_criteria (tenant_id, lesson_id, title, levels) values (${hub}, ${lesson!.id}, 'Structure', ${tx.json(levels)}) returning id`);

    // Nobody has work to review until they hand in their own.
    expect(await as(people[0]!.user, (tx) => tx`select * from app.my_peer_tasks(${cohort!.id}, ${lesson!.id})`)).toHaveLength(0);
    const subs: string[] = [];
    for (const p of people) {
      const [r] = await as(p.user, (tx) => tx<{ id: string }[]>`select app.submit_assignment(${cohort!.id}, ${lesson!.id}, 'My page', null, null, null, null, null) as id`);
      subs.push(r!.id);
    }
    const tasks = await as(people[0]!.user, (tx) => tx<{ review_id: string; submission_id: string; body: string }[]>`select * from app.my_peer_tasks(${cohort!.id}, ${lesson!.id})`);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.submission_id)).not.toContain(subs[0]);
    expect(new Set(tasks.map((t) => t.submission_id)).size).toBe(2);
    // Asking again hands out nothing new.
    expect(await as(people[0]!.user, (tx) => tx`select * from app.my_peer_tasks(${cohort!.id}, ${lesson!.id})`)).toHaveLength(2);
    // The rest prefer work with the fewest reviewers, so everyone's work ends up reviewed.
    for (const p of people.slice(1)) await as(p.user, (tx) => tx`select * from app.my_peer_tasks(${cohort!.id}, ${lesson!.id})`);
    const spread = await sql<{ n: number }[]>`select count(*)::int as n from peer_reviews where submission_id = any(${subs}::uuid[]) group by submission_id`;
    expect(spread).toHaveLength(4);
    expect(spread.reduce((t, s) => t + s.n, 0)).toBe(8);
    for (const s of spread) expect(s.n).toBeGreaterThanOrEqual(1);

    // Reviews need a real level for every criterion and a comment, come from the right person, and are final.
    const task = tasks[0]!;
    await expect(as(people[1]!.user, (tx) => tx`select app.submit_peer_review(${task.review_id}, ${tx.json({ [crit!.id]: 2 })}, 'Nice clear headings.')`)).rejects.toThrow(/Review not found/);
    await expect(as(people[0]!.user, (tx) => tx`select app.submit_peer_review(${task.review_id}, ${tx.json({ [crit!.id]: 1 })}, 'Nice clear headings.')`)).rejects.toThrow(/every criterion/);
    await expect(as(people[0]!.user, (tx) => tx`select app.submit_peer_review(${task.review_id}, ${tx.json({ [crit!.id]: 2 })}, 'ok')`)).rejects.toThrow(/10 characters/);
    await as(people[0]!.user, (tx) => tx`select app.submit_peer_review(${task.review_id}, ${tx.json({ [crit!.id]: 2, junk: 99 })}, 'Nice clear headings.')`);
    await expect(as(people[0]!.user, (tx) => tx`select app.submit_peer_review(${task.review_id}, ${tx.json({ [crit!.id]: 0 })}, 'Changed my mind here.')`)).rejects.toThrow(/already sent/);
    const [saved] = await sql<{ marks: Record<string, number> }[]>`select marks from peer_reviews where id = ${task.review_id}`;
    expect(saved!.marks).toEqual({ [crit!.id]: 2 });

    // The author sees the review without a name; hiding it takes it away.
    const author = people.find((p) => subs[people.indexOf(p)] === task.submission_id)!;
    const seen = async () => ((await as(author.user, (tx) => tx<{ l: { submissions: { peer: unknown[] }[] } }[]>`select app.learner_lesson(${cohort!.id}, ${lesson!.id}) as l`))[0]!.l.submissions[0]!.peer);
    expect(await seen()).toHaveLength(1);
    expect(JSON.stringify(await seen())).not.toContain(people[0]!.user);
    await as(ids.reviewer1!, (tx) => tx`update peer_reviews set hidden = true where id = ${task.review_id}`);
    expect(await seen()).toHaveLength(0);
    // Learners see nothing in the table itself; they only get their own tasks and feedback.
    expect(await as(people[0]!.user, (tx) => tx`select * from peer_reviews`)).toHaveLength(0);

    // Any team member can record marks; people outside the hub cannot.
    await as(ids.reviewer1!, (tx) => tx`insert into submission_marks (submission_id, criterion_id, tenant_id, points) values (${subs[0]!}, ${crit!.id}, ${hub}, 2)`);
    await expect(as(ids.owner2!, (tx) => tx`insert into submission_marks (submission_id, criterion_id, tenant_id, points) values (${subs[1]!}, ${crit!.id}, ${hub}, 2)`)).rejects.toThrow(/row-level security/);
  });
});

describe('platform admins helping a hub', () => {
  it('can link skills to a hub assessment, like the hub owner; other hubs cannot', async () => {
    const hub = ids['hub-one']!;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, starts_on) values (${hub}, ${ids['open-call']!}, 'Skills cohort', current_date) returning id`;
    const [a] = await sql<{ id: string }[]>`insert into assessments (tenant_id, cohort_id, title) values (${hub}, ${cohort!.id}, 'Skills task') returning id`;
    const [skill] = await sql<{ id: string }[]>`insert into skills (track, name) values ('Help track', 'Helping') returning id`;
    const link = (user: string) => as(user, (tx) => tx`insert into assessment_skills (assessment_id, skill_id, tenant_id) values (${a!.id}, ${skill!.id}, ${hub}) on conflict do nothing`);
    await expect(link(ids.owner2!)).rejects.toThrow(/row-level security/);
    await link(ids.platform!);
    await link(ids.platform!); // again, as the course sync does: the existing row is left alone
    await link(ids.owner1!);
    expect(await sql`select 1 from assessment_skills where assessment_id = ${a!.id}`).toHaveLength(1);
  });
});

describe('AI drafts', () => {
  it('counts drafts per hub against a daily limit, lets only the hub team read them, and never lets the app role write them directly', async () => {
    const one = ids['hub-one']!, two = ids['hub-two']!;
    const claim = (user: string, hub: string, limit = 3) => as(user, (tx) => tx<{ id: string | null }[]>`select app.claim_ai_draft(${hub}, 'lesson', 'claude-opus-5-5', ${limit}) as id`).then((r) => r[0]!.id);

    // Members (any role) and platform admins can draft for a hub; others and signed-out callers cannot.
    const a = await claim(ids.reviewer1!, one);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    await expect(claim(ids.owner2!, one)).rejects.toThrow(/Not a member/);
    await expect(as(null, (tx) => tx`select app.claim_ai_draft(${one}, 'lesson', 'm', 3)`)).rejects.toThrow(/Not a member/);
    expect(await claim(ids.platform!, one)).toBeTruthy();

    // Only the person who claimed a draft can record how it went.
    await as(ids.owner1!, (tx) => tx`select app.finish_ai_draft(${a}, true, 900, 400)`);
    await as(ids.reviewer1!, (tx) => tx`select app.finish_ai_draft(${a}, true, 1200, -5)`);
    const [row] = await sql`select ok, input_tokens, output_tokens, user_id from ai_drafts where id = ${a}`;
    expect(row).toMatchObject({ ok: true, input_tokens: 1200, output_tokens: 0, user_id: ids.reviewer1 });

    // The limit is per hub per day; yesterday's drafts do not count.
    await sql`insert into ai_drafts (tenant_id, kind, model, created_at) values (${one}, 'quiz', 'm', app.wat_today() - interval '1 minute')`;
    expect(await claim(ids.owner1!, one)).toBeTruthy(); // third today
    expect(await claim(ids.admin1!, one)).toBeNull();
    expect(await claim(ids.owner2!, two)).toBeTruthy(); // another hub has its own allowance

    // Claims made at the same moment cannot pass the limit together.
    const racers = await Promise.all([1, 2, 3, 4].map(() => claim(ids.owner2!, two, 3)));
    expect(racers.filter(Boolean)).toHaveLength(2);

    // The hub team reads its own usage only; nobody writes rows directly.
    expect(await as(ids.reviewer1!, (tx) => tx`select id from ai_drafts`)).toHaveLength(4);
    expect(await as(ids.owner2!, (tx) => tx`select tenant_id from ai_drafts`).then((r) => new Set(r.map((x) => x.tenant_id)))).toEqual(new Set([two]));
    expect(await as(ids.platform!, (tx) => tx`select id from ai_drafts`)).toHaveLength(7);
    await expect(as(ids.owner1!, (tx) => tx`insert into ai_drafts (tenant_id, kind, model) values (${one}, 'lesson', 'm')`)).rejects.toThrow(/permission denied/);
    await expect(as(ids.owner1!, (tx) => tx`update ai_drafts set ok = false`)).rejects.toThrow(/permission denied/);
    await expect(as(ids.owner1!, (tx) => tx`delete from ai_drafts`)).rejects.toThrow(/permission denied/);
    await expect(sql`insert into ai_drafts (tenant_id, kind, model) values (${one}, 'poem', 'm')`).rejects.toThrow(/check/);
  });
});

describe('nudges and learning activity', () => {
  it('works out each learner’s last activity for the hub team only, and keeps nudges read-only', async () => {
    const hub = ids['hub-one']!;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Nudge course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'text', 'Read me') returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id, starts_on, status) values (${hub}, ${ids['open-call']!}, 'Nudge cohort', ${course!.id}, current_date - 20, 'running') returning id`;
    const people: string[] = [];
    for (const n of [1, 2, 3]) {
      const [app] = await submit(ids['open-call']!, `nudge${n}@test.ng`, `HUB-26-NUDG${n}`);
      const [e] = await sql<{ id: string }[]>`insert into enrolments (tenant_id, cohort_id, application_id, enrolled_at) values (${hub}, ${cohort!.id}, ${app!.id}, now() - interval '20 days') returning id`;
      people.push(e!.id);
    }
    // Learner 1 read a lesson 2 days ago; learner 2 posted in the discussion yesterday; learner 3 did nothing.
    await sql`insert into lesson_progress (enrolment_id, lesson_id, tenant_id, first_seen_at, last_seen_at) values (${people[0]!}, ${lesson!.id}, ${hub}, now() - interval '9 days', now() - interval '2 days')`;
    const [u2] = await sql<{ id: string }[]>`insert into users (email) values ('nudge2@test.ng') returning id`;
    const [thread] = await sql<{ id: string }[]>`insert into discussion_threads (tenant_id, cohort_id, author_id, title, body, created_at) values (${hub}, ${cohort!.id}, ${ids.owner1!}, 'Welcome', 'Hello', now() - interval '5 days') returning id`;
    await sql`insert into discussion_posts (tenant_id, thread_id, author_id, body, created_at) values (${hub}, ${thread!.id}, ${u2!.id}, 'Thanks!', now() - interval '1 day')`;

    const rows = await as(ids.reviewer1!, (tx) => tx<{ enrolment_id: string; last_active_at: Date | null; since: Date }[]>`select * from app.cohort_activity(${cohort!.id})`);
    const by = new Map(rows.map((r) => [r.enrolment_id, r]));
    const ago = (d: Date | null) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 86_400_000) : null);
    expect(ago(by.get(people[0]!)!.last_active_at)).toBe(2);
    expect(ago(by.get(people[1]!)!.last_active_at)).toBe(1);
    expect(by.get(people[2]!)!.last_active_at).toBeNull();
    expect(ago(by.get(people[2]!)!.since)).toBeGreaterThanOrEqual(19); // counted from the start

    // Other hubs and the app role's internal function are refused.
    await expect(as(ids.owner2!, (tx) => tx`select * from app.cohort_activity(${cohort!.id})`)).rejects.toThrow(/Not a member/);
    await expect(as(ids.owner1!, (tx) => tx`select * from app.cohort_activity_all(${cohort!.id})`)).rejects.toThrow(/permission denied/);

    // Times come back at millisecond precision, so a nudge stored with a spell's start matches it exactly.
    const [match] = await sql<{ exact: number }[]>`select count(*)::int as exact from app.cohort_activity_all(${cohort!.id}) a where a.since = ${by.get(people[2]!)!.since}::timestamptz`;
    expect(match!.exact).toBe(1);

    // Nudges: the scheduler writes them once per step per quiet spell; the team reads them; nobody else.
    const since = by.get(people[2]!)!.since;
    await sql`insert into nudges (tenant_id, cohort_id, enrolment_id, step, inactive_since) values (${hub}, ${cohort!.id}, ${people[2]!}, 'learner', ${since})`;
    await expect(sql`insert into nudges (tenant_id, cohort_id, enrolment_id, step, inactive_since) values (${hub}, ${cohort!.id}, ${people[2]!}, 'learner', ${since})`).rejects.toThrow(/unique/);
    expect(await as(ids.reviewer1!, (tx) => tx`select id from nudges where cohort_id = ${cohort!.id}`)).toHaveLength(1);
    expect(await as(ids.owner2!, (tx) => tx`select id from nudges where cohort_id = ${cohort!.id}`)).toHaveLength(0);
    await expect(as(ids.owner1!, (tx) => tx`insert into nudges (tenant_id, cohort_id, enrolment_id, step, inactive_since) values (${hub}, ${cohort!.id}, ${people[0]!}, 'learner', now())`)).rejects.toThrow(/permission denied/);
    await expect(as(ids.owner1!, (tx) => tx`delete from nudges`)).rejects.toThrow(/permission denied/);

    // Owners and admins set the nudge rule and the funder summary; the database keeps them sensible.
    await as(ids.admin1!, (tx) => tx`update cohorts set nudge_after_days = 5, nudge_escalate_days = 2, funder_summary = 'On track.' where id = ${cohort!.id}`);
    const [saved] = await sql`select nudge_after_days, nudge_escalate_days, funder_summary from cohorts where id = ${cohort!.id}`;
    expect(saved).toMatchObject({ nudge_after_days: 5, nudge_escalate_days: 2, funder_summary: 'On track.' });
    await expect(as(ids.admin1!, (tx) => tx`update cohorts set nudge_after_days = 1 where id = ${cohort!.id}`)).rejects.toThrow(/check/);
    const untouched = await as(ids.reviewer1!, (tx) => tx`update cohorts set nudge_after_days = 9 where id = ${cohort!.id} returning id`);
    expect(untouched).toHaveLength(0);
    // AI drafts can now be report summaries.
    expect(await as(ids.owner1!, (tx) => tx<{ id: string | null }[]>`select app.claim_ai_draft(${hub}, 'report', 'm', 1000) as id`).then((r) => r[0]!.id)).toBeTruthy();
  });
});

describe('data-subject requests and erasure', () => {
  it('lets people ask for deletion, and erases them while keeping anonymous records for funders', async () => {
    const hub = ids['hub-one']!;
    const [app] = await submit(ids['open-call']!, 'erase-me@test.ng', 'HUB-26-ERASE');
    await sql`update applications set answers = ${sql.json({ gender: 'Female', date_of_birth: '2001-03-14', lga: 'Katsina', disability: 'No', why: 'I love code', address: '12 Kofar Soro' })} where id = ${app!.id}`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('Erase-Me@test.ng') returning id`;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Erase course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'assignment', 'Task') returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id) values (${hub}, ${ids['open-call']!}, 'Erase cohort', ${course!.id}) returning id`;
    const [e] = await sql<{ id: string }[]>`insert into enrolments (tenant_id, cohort_id, application_id, status) values (${hub}, ${cohort!.id}, ${app!.id}, 'completed') returning id`;
    await sql`insert into submissions (tenant_id, lesson_id, enrolment_id, body, file_path, file_name, feedback) values (${hub}, ${lesson!.id}, ${e!.id}, 'My essay about my family', 'sub/essay.pdf', 'essay.pdf', 'Good work, Amina')`;
    await sql`insert into application_notes (tenant_id, application_id, author_id, body) values (${hub}, ${app!.id}, ${ids.owner1!}, 'Lives near the hub')`;
    await sql`insert into certificates (tenant_id, enrolment_id, serial, learner_name, programme_title, cohort_name, hub_name, hub_slug, completed_on)
              values (${hub}, ${e!.id}, 'TAL-HUB-26-A1B2C3', 'Amina Erase', 'Open call', 'Erase cohort', 'Hub One', 'hub-one', current_date)`;
    const [thread] = await sql<{ id: string }[]>`insert into discussion_threads (tenant_id, cohort_id, author_id, title, body) values (${hub}, ${cohort!.id}, ${u!.id}, 'My question', 'Where is the hub?') returning id`;
    await sql`insert into discussion_posts (tenant_id, thread_id, author_id, body) values (${hub}, ${thread!.id}, ${u!.id}, 'Thanks all')`;

    // The person asks; a second open request of the same kind is refused; only they and the platform see it.
    const requestId = (await as(u!.id, (tx) => tx<{ id: string }[]>`select app.request_data_change('erasure', 'I no longer want an account') as id`))[0]!.id;
    await expect(as(u!.id, (tx) => tx`select app.request_data_change('erasure', null)`)).rejects.toThrow(/already have a request open/);
    await expect(as(u!.id, (tx) => tx`select app.request_data_change('correction', 'short')`)).rejects.toThrow(/Say what needs correcting/);
    const [mine] = await as(u!.id, (tx) => tx`select email_masked, status, due_at > now() + interval '29 days' as due from data_requests where id = ${requestId}`);
    expect(mine).toMatchObject({ email_masked: 'e***@test.ng', status: 'open', due: true });
    expect(await as(ids.owner1!, (tx) => tx`select id from data_requests where id = ${requestId}`)).toHaveLength(0);
    expect(await as(ids.platform!, (tx) => tx`select id from data_requests where id = ${requestId}`)).toHaveLength(1);
    await expect(as(u!.id, (tx) => tx`update data_requests set status = 'completed'`)).rejects.toThrow(/permission denied/);

    // Only the platform team can carry it out.
    await expect(as(ids.owner1!, (tx) => tx`select app.erase_person(${requestId})`)).rejects.toThrow(/Platform team only/);
    const paths = (await as(ids.platform!, (tx) => tx<{ paths: string[] }[]>`select app.erase_person(${requestId}) as paths`))[0]!.paths;
    expect(paths.sort()).toEqual(['sub/essay.pdf', 'x/cv.pdf']);

    // Gone: the account, contact details, free-text answers, notes, files, written work, posts.
    expect(await sql`select 1 from users where id = ${u!.id}`).toHaveLength(0);
    const [redacted] = await sql`select full_name, email::text, phone, answers from applications where id = ${app!.id}`;
    expect(redacted).toEqual({ full_name: 'Removed at request', email: `erased-${app!.id}@erased.invalid`, phone: '',
      answers: { gender: 'Female', date_of_birth: '2001-07-01', lga: 'Katsina', disability: 'No' } });
    expect(await sql`select 1 from application_notes where application_id = ${app!.id}`).toHaveLength(0);
    expect(await sql`select 1 from application_files where application_id = ${app!.id}`).toHaveLength(0);
    const [work] = await sql`select body, file_path, feedback from submissions where enrolment_id = ${e!.id}`;
    expect(work).toEqual({ body: "[Removed at the learner's request]", file_path: null, feedback: null });
    expect((await sql`select body from discussion_posts where thread_id = ${thread!.id}`)[0]!.body).toBe("[Removed at the author's request]");
    // Kept, anonymously: the enrolment (for completion counts) and a withdrawn certificate.
    expect(await sql`select status from enrolments where id = ${e!.id}`).toEqual([{ status: 'completed' }]);
    const [cert] = await sql`select learner_name, revoked_at is not null as revoked from certificates where enrolment_id = ${e!.id}`;
    expect(cert).toEqual({ learner_name: 'Removed at request', revoked: true });
    // The request is closed with proof, and nothing links it to the person any more.
    const [done] = await sql`select status, user_id, email_masked from data_requests where id = ${requestId}`;
    expect(done).toEqual({ status: 'completed', user_id: null, email_masked: 'e***@test.ng' });
    expect(await sql`select 1 from audit_log where action = 'privacy.erasure_completed' and target_id = ${requestId}`).toHaveLength(1);
    await expect(as(ids.platform!, (tx) => tx`select app.erase_person(${requestId})`)).rejects.toThrow(/no longer open/);

    // A hub's only owner cannot be erased until someone else owns the hub.
    const ownerReq = (await as(ids.owner2!, (tx) => tx<{ id: string }[]>`select app.request_data_change('erasure', null) as id`))[0]!.id;
    await expect(as(ids.platform!, (tx) => tx`select app.erase_person(${ownerReq})`)).rejects.toThrow(/only owner of a hub/);
    await as(ids.owner2!, (tx) => tx`select app.cancel_data_request(${ownerReq})`);
    expect((await sql`select status from data_requests where id = ${ownerReq}`)[0]!.status).toBe('cancelled');

    // Corrections are closed by the platform team with a note.
    const fix = (await as(ids.reviewer1!, (tx) => tx<{ id: string }[]>`select app.request_data_change('correction', 'My surname is spelt wrongly on my account') as id`))[0]!.id;
    await expect(as(ids.reviewer1!, (tx) => tx`select app.close_data_request(${fix}, 'completed', 'Done')`)).rejects.toThrow(/Platform team only/);
    await as(ids.platform!, (tx) => tx`select app.close_data_request(${fix}, 'completed', 'Surname corrected')`);
    expect((await sql`select status, outcome from data_requests where id = ${fix}`)[0]).toEqual({ status: 'completed', outcome: 'Surname corrected' });
  });
});

describe('support access', () => {
  it('gives platform staff four hours in a hub with a reason, visible to that hub only', async () => {
    const hub = ids['hub-one']!;
    await expect(as(ids.owner1!, (tx) => tx`select app.start_support(${hub}, 'Just looking around')`)).rejects.toThrow(/Platform team only/);
    await expect(as(ids.platform!, (tx) => tx`select app.start_support(${hub}, 'short')`)).rejects.toThrow(/at least 10/);
    expect((await as(ids.platform!, (tx) => tx`select app.support_until(${hub}) as u`))[0]!.u).toBeNull();
    const until = (await as(ids.platform!, (tx) => tx<{ until: Date }[]>`select app.start_support(${hub}, 'Helping set up the course') as until`))[0]!.until;
    const hours = (new Date(until).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThanOrEqual(4);
    expect((await as(ids.platform!, (tx) => tx`select app.support_until(${hub}) as u`))[0]!.u).not.toBeNull();
    expect((await as(ids.platform!, (tx) => tx`select app.support_until(${ids['hub-two']!}) as u`))[0]!.u).toBeNull();

    // The hub's team sees who came in and why; other hubs do not; the audit log has it.
    expect(await as(ids.reviewer1!, (tx) => tx`select reason from support_grants where tenant_id = ${hub}`)).toEqual([{ reason: 'Helping set up the course' }]);
    expect(await as(ids.owner2!, (tx) => tx`select 1 from support_grants where tenant_id = ${hub}`)).toHaveLength(0);
    await expect(as(ids.platform!, (tx) => tx`insert into support_grants (tenant_id, staff_email, reason) values (${hub}, 'x@y.z', 'sneaky access here')`)).rejects.toThrow(/permission denied/);
    expect(await sql`select 1 from audit_log where tenant_id = ${hub} and action = 'support.started'`).toHaveLength(1);

    await as(ids.platform!, (tx) => tx`select app.end_support(${hub})`);
    expect((await as(ids.platform!, (tx) => tx`select app.support_until(${hub}) as u`))[0]!.u).toBeNull();
    expect(await sql`select 1 from audit_log where tenant_id = ${hub} and action = 'support.ended'`).toHaveLength(1);
  });
});

describe('pilot health', () => {
  it('asks learners and staff for NPS, keeps answers anonymous to hubs, and forgets comments on deletion', async () => {
    const hub = ids['hub-one']!;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, starts_on, status) values (${hub}, ${ids['open-call']!}, 'NPS cohort', current_date - 30, 'running') returning id`;
    const [app] = await submit(ids['open-call']!, 'nps-learner@test.ng', 'HUB-26-NPS01');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id, enrolled_at) values (${hub}, ${cohort!.id}, ${app!.id}, now() - interval '30 days')`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('nps-learner@test.ng') returning id`;

    // The learner is asked about their cohort; staff about their hub.
    const state = await as(u!.id, (tx) => tx<{ audience: string; cohort_id: string | null; hub_name: string; last_answered: Date | null }[]>`select * from app.nps_state()`);
    expect(state).toEqual([expect.objectContaining({ audience: 'learner', cohort_id: cohort!.id, hub_name: 'Hub One', last_answered: null })]);
    const staff = await as(ids.reviewer1!, (tx) => tx<{ audience: string; tenant_id: string }[]>`select audience, tenant_id from app.nps_state()`);
    expect(staff).toEqual([{ audience: 'staff', tenant_id: hub }]);

    // "Not now" records a dismissal without a score; an answer is recorded once per 60 days.
    await as(u!.id, (tx) => tx`select app.submit_nps(${hub}, ${cohort!.id}, 'learner', null, 'ignored')`);
    await as(u!.id, (tx) => tx`select app.submit_nps(${hub}, ${cohort!.id}, 'learner', 9, '  The mentors are great  ')`);
    await expect(as(u!.id, (tx) => tx`select app.submit_nps(${hub}, ${cohort!.id}, 'learner', 10, null)`)).rejects.toThrow(/already answered/);
    const [after] = await as(u!.id, (tx) => tx<{ last_answered: Date | null; last_dismissed: Date | null }[]>`select last_answered, last_dismissed from app.nps_state()`);
    expect(after!.last_answered).not.toBeNull();
    expect(after!.last_dismissed).not.toBeNull();

    // Only people in the cohort or on the team can answer, and only with 0 to 10.
    await expect(as(ids.owner2!, (tx) => tx`select app.submit_nps(${hub}, ${cohort!.id}, 'learner', 5, null)`)).rejects.toThrow(/not learning in this cohort/);
    await expect(as(ids.owner2!, (tx) => tx`select app.submit_nps(${hub}, null, 'staff', 5, null)`)).rejects.toThrow(/not on this hub/);
    await expect(as(ids.admin1!, (tx) => tx`select app.submit_nps(${hub}, null, 'staff', 11, null)`)).rejects.toThrow(/0 to 10/);
    await as(ids.admin1!, (tx) => tx`select app.submit_nps(${hub}, null, 'staff', 6, 'Grading takes long')`);
    await expect(as(ids.admin1!, (tx) => tx`insert into nps_responses (tenant_id, audience, score) values (${hub}, 'staff', 10)`)).rejects.toThrow(/permission denied/);

    // Owners and admins read answers without names; reviewers and other hubs do not see them.
    const seen = await as(ids.owner1!, (tx) => tx<{ audience: string; score: number | null; comment: string | null }[]>`
      select audience, score, comment from nps_responses where tenant_id = ${hub} order by created_at`);
    expect(seen).toEqual([{ audience: 'learner', score: null, comment: null }, { audience: 'learner', score: 9, comment: 'The mentors are great' }, { audience: 'staff', score: 6, comment: 'Grading takes long' }]);
    await expect(as(ids.owner1!, (tx) => tx`select user_id from nps_responses`)).rejects.toThrow(/permission denied/);
    expect(await as(ids.reviewer1!, (tx) => tx`select id from nps_responses`)).toHaveLength(0);
    expect(await as(ids.owner2!, (tx) => tx`select id from nps_responses where tenant_id = ${hub}`)).toHaveLength(0);

    // When the account is deleted, the score stays in the totals but the comment goes.
    await sql`delete from users where id = ${u!.id}`;
    expect(await sql`select score, comment, user_id from nps_responses where audience = 'learner' and score is not null and tenant_id = ${hub}`).toEqual([{ score: 9, comment: null, user_id: null }]);
  });

  it('logs each day a learner opens a lesson and lists activity days for the hub or the platform', async () => {
    const hub = ids['hub-one']!;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Health course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'text', 'Read') returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id, starts_on) values (${hub}, ${ids['open-call']!}, 'Health cohort', ${course!.id}, current_date - 10) returning id`;
    const [app] = await submit(ids['open-call']!, 'health1@test.ng', 'HUB-26-HLTH1');
    const [e] = await sql<{ id: string }[]>`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id}) returning id`;
    // Three visits over two days: the trigger logs two days, even though progress keeps only first and last.
    await sql`insert into lesson_progress (enrolment_id, lesson_id, tenant_id, first_seen_at, last_seen_at) values (${e!.id}, ${lesson!.id}, ${hub}, now() - interval '8 days', now() - interval '8 days')`;
    await sql`update lesson_progress set last_seen_at = now() - interval '5 days' where enrolment_id = ${e!.id}`;
    await sql`update lesson_progress set last_seen_at = now() - interval '1 day' where enrolment_id = ${e!.id}`;
    expect((await sql`select count(*)::int as n from activity_days where enrolment_id = ${e!.id}`)[0]!.n).toBe(3);

    const days = await as(ids.admin1!, (tx) => tx<{ day: string }[]>`select day::text from app.health_days(${hub}) where enrolment_id = ${e!.id} order by day`);
    expect(days).toHaveLength(3);
    expect((await as(ids.platform!, (tx) => tx`select 1 from app.health_days(null) where enrolment_id = ${e!.id}`)).length).toBe(3);
    await expect(as(ids.reviewer1!, (tx) => tx`select * from app.health_days(${hub})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner2!, (tx) => tx`select * from app.health_days(${hub})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner1!, (tx) => tx`select * from app.health_days(null)`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner1!, (tx) => tx`select * from activity_days`)).rejects.toThrow(/permission denied/);
  });

  it('keeps the security incident log to the platform team, with an audit trail', async () => {
    await expect(as(ids.owner1!, (tx) => tx`select app.record_incident(current_date, 'Something odd happened', false, false)`)).rejects.toThrow(/Platform team only/);
    await expect(as(ids.platform!, (tx) => tx`select app.record_incident(current_date + 3, 'Something odd happened', false, false)`)).rejects.toThrow(/date it happened/);
    await expect(as(ids.platform!, (tx) => tx`select app.record_incident(current_date, 'short', false, false)`)).rejects.toThrow(/at least 10/);
    const id = (await as(ids.platform!, (tx) => tx<{ id: string }[]>`select app.record_incident(current_date - 1, 'Phishing email sent to hub staff', false, true) as id`))[0]!.id;
    await as(ids.platform!, (tx) => tx`select app.update_incident(${id}, 'notified')`);
    await as(ids.platform!, (tx) => tx`select app.update_incident(${id}, 'resolved')`);
    const [row] = await as(ids.platform!, (tx) => tx`select cross_tenant, personal_data, ndpc_notified_on is not null as notified, resolved_on is not null as resolved from security_incidents where id = ${id}`);
    expect(row).toEqual({ cross_tenant: false, personal_data: true, notified: true, resolved: true });
    expect(await as(ids.owner1!, (tx) => tx`select id from security_incidents`)).toHaveLength(0);
    await expect(as(ids.platform!, (tx) => tx`insert into security_incidents (occurred_on, summary) values (current_date, 'Direct write attempt')`)).rejects.toThrow(/permission denied/);
    expect(await sql`select action from audit_log where target_id = ${id} order by at, id`).toEqual([
      { action: 'security.incident_recorded' }, { action: 'security.incident_notified' }, { action: 'security.incident_resolved' }]);
  });
});

describe('WhatsApp opt-in and streamed lessons', () => {
  it('keeps each number’s WhatsApp choice, lets people change it, and shows hubs only their own opted-in applicants', async () => {
    expect((await sql`select app.wa_phone('0803 123 4567') as a, app.wa_phone('+234 803-123-4567') as b, app.wa_phone('8031234567') as c, app.wa_phone('12345') as d`)[0])
      .toEqual({ a: '2348031234567', b: '2348031234567', c: '2348031234567', d: null });
    const [app] = await submit(ids['open-call']!, 'wa-learner@test.ng', 'HUB-26-WA001');
    await sql`update applications set phone = '0805 111 2222', submitted_at = now() where id = ${app!.id}`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('wa-learner@test.ng') returning id`;

    // Ticking the box on the application form: needs the matching reference, and only just after applying.
    expect((await as(null, (tx) => tx`select app.application_whatsapp_optin(${app!.id}, 'WRONG-REF') as ok`))[0]!.ok).toBe(false);
    expect((await as(null, (tx) => tx`select app.application_whatsapp_optin(${app!.id}, 'HUB-26-WA001') as ok`))[0]!.ok).toBe(true);
    expect(await as(u!.id, (tx) => tx`select phone, opted_in from app.my_whatsapp()`)).toEqual([{ phone: '2348051112222', opted_in: true }]);

    // The hub sees the number as opted in; another hub and reviewers do not.
    const aud = await as(ids.owner1!, (tx) => tx<{ phone: string }[]>`select * from app.whatsapp_audience(${ids['hub-one']!}, ${['08051112222', '08099999999']}::text[]) as phone`);
    expect(aud.map((r) => r.phone)).toEqual(['2348051112222']);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.whatsapp_audience(${ids['hub-two']!}, ${['08051112222']}::text[])`)).toHaveLength(0);
    await expect(as(ids.reviewer1!, (tx) => tx`select * from app.whatsapp_audience(${ids['hub-one']!}, ${['08051112222']}::text[])`)).rejects.toThrow(/owners and admins/);

    // The learner turns it off; an application tick later never overrides that "no".
    expect((await as(u!.id, (tx) => tx`select app.set_my_whatsapp(false) as n`))[0]!.n).toBe(1);
    await as(null, (tx) => tx`select app.application_whatsapp_optin(${app!.id}, 'HUB-26-WA001')`);
    expect(await as(u!.id, (tx) => tx`select opted_in from app.my_whatsapp()`)).toEqual([{ opted_in: false }]);
    expect(await as(ids.owner1!, (tx) => tx`select * from app.whatsapp_audience(${ids['hub-one']!}, ${['08051112222']}::text[])`)).toHaveLength(0);
    // Nobody reads or writes the table directly.
    await expect(as(u!.id, (tx) => tx`select * from whatsapp_optins`)).rejects.toThrow(/permission denied/);
    await expect(as(null, (tx) => tx`select app.set_my_whatsapp(true)`)).rejects.toThrow(/Sign in first/);
  });

  it('gives enrolled learners the stream of an open lesson, and lets the hub team set it', async () => {
    const hub = ids['hub-one']!;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Stream course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'video', 'Watch') returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id) values (${hub}, ${ids['open-call']!}, 'Stream cohort', ${course!.id}) returning id`;
    const [app] = await submit(ids['open-call']!, 'streamer@test.ng', 'HUB-26-STRM1');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id})`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('streamer@test.ng') returning id`;

    await as(ids.admin1!, (tx) => tx`update lessons set stream_id = 'vid-123', stream_status = 'ready', stream_renditions = '{240p,360p,720p}', stream_seconds = 95 where id = ${lesson!.id}`);
    expect(await as(u!.id, (tx) => tx`select * from app.lesson_stream(${cohort!.id}, ${lesson!.id})`)).toEqual([{ stream_id: 'vid-123', stream_status: 'ready', stream_renditions: ['240p', '360p', '720p'], stream_seconds: 95 }]);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.lesson_stream(${cohort!.id}, ${lesson!.id})`)).toHaveLength(0);
    const other = await as(ids.owner2!, (tx) => tx`update lessons set stream_id = 'hijack' where id = ${lesson!.id} returning id`);
    expect(other).toHaveLength(0);
    // One lesson per provider video.
    const [l2] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'video', 'Again') returning id`;
    await expect(sql`update lessons set stream_id = 'vid-123' where id = ${l2!.id}`).rejects.toThrow(/unique/);

    // Platform staff helping the hub can post a cohort announcement; a reviewer still cannot.
    await as(ids.platform!, (tx) => tx`insert into announcements (tenant_id, cohort_id, author_id, title, body, channels) values (${hub}, ${cohort!.id}, ${ids.platform!}, 'From support', 'Hello', '{}')`);
    await expect(as(ids.reviewer1!, (tx) => tx`insert into announcements (tenant_id, cohort_id, author_id, title, body, channels) values (${hub}, ${cohort!.id}, ${ids.reviewer1!}, 'Nope', 'Hello', '{}')`)).rejects.toThrow(/row-level security/);
  });
});

describe('employer organisations, the jobs board and Passport v2', () => {
  it('verifies employers with a reason, lets them ask again, and lets owners run their team', async () => {
    const [r] = await as(null, (tx) => tx<{ id: string }[]>`select app.register_employer('Sahel Foods', 'Food processing', 'https://sahelfoods.ng', 'Katsina', '51-200', 'Hauwa Sani', 'hauwa@sahelfoods.ng', '0803', 'Sales') as id`);
    const employer = r!.id;
    const [owner] = await sql<{ id: string }[]>`select id from users where email = 'hauwa@sahelfoods.ng'`;
    const me = owner!.id;

    // The owner adds their CAC number; only the platform team decides, and a rejection needs a reason.
    expect((await as(me, (tx) => tx`select app.save_employer_details(${employer}, 'Food processing', 'https://sahelfoods.ng', 'Katsina', '51-200', 'Hauwa Sani', '0803', 'rc 1234567') as ok`))[0]!.ok).toBe(true);
    expect((await sql`select cac_number from employers where id = ${employer}`)[0]!.cac_number).toBe('RC 1234567');
    await expect(as(me, (tx) => tx`select app.review_employer(${employer}, 'verified', null)`)).rejects.toThrow(/Platform team only/);
    await expect(as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'rejected', 'no')`)).rejects.toThrow(/at least 10/);
    await as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'rejected', 'We could not find this CAC number. Please check it.')`);
    const [mine] = await as(me, (tx) => tx`select status, review_note, my_role from app.my_employers_v2()`);
    expect(mine).toEqual({ status: 'rejected', review_note: 'We could not find this CAC number. Please check it.', my_role: 'owner' });
    // Rejected employers cannot post; after fixing details they ask again and go back to pending.
    await expect(as(me, (tx) => tx`insert into job_roles (employer_id, title) values (${employer}, 'Sales rep')`)).rejects.toThrow(/row-level security/);
    await as(me, (tx) => tx`select app.request_employer_review(${employer})`);
    await expect(as(me, (tx) => tx`select app.request_employer_review(${employer})`)).rejects.toThrow(/not waiting for changes/);
    expect((await as(me, (tx) => tx`select status, review_note from app.my_employers_v2()`))[0]).toEqual({ status: 'pending', review_note: null });
    await as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'verified', null)`);
    expect((await sql`select status, verified_at is not null as v from employers where id = ${employer}`)[0]).toEqual({ status: 'verified', v: true });
    expect((await sql`select action from audit_log where target_id = ${employer} order by at, id`).map((a) => a.action)).toEqual(['employer.rejected', 'employer.review_requested', 'employer.verified']);

    // Owners add colleagues; members cannot; the last owner cannot leave or be demoted.
    const colleague = (await as(me, (tx) => tx<{ id: string }[]>`select app.add_employer_member(${employer}, 'Musa@SahelFoods.ng', 'Musa Idris', 'member') as id`))[0]!.id;
    await expect(as(me, (tx) => tx`select app.add_employer_member(${employer}, 'musa@sahelfoods.ng', null, 'member')`)).rejects.toThrow(/Already in your team/);
    await expect(as(colleague, (tx) => tx`select app.add_employer_member(${employer}, 'x@y.ng', null, 'member')`)).rejects.toThrow(/Only owners/);
    const team = await as(colleague, (tx) => tx<{ email: string; role: string }[]>`select email, role from app.employer_team(${employer})`);
    expect(team).toEqual([{ email: 'hauwa@sahelfoods.ng', role: 'owner' }, { email: 'musa@sahelfoods.ng', role: 'member' }]);
    await expect(as(ids.owner1!, (tx) => tx`select * from app.employer_team(${employer})`)).rejects.toThrow(/Not your organisation/);
    await expect(as(me, (tx) => tx`select app.change_employer_member(${employer}, ${me}, 'member')`)).rejects.toThrow(/needs an owner/);
    await expect(as(me, (tx) => tx`select app.change_employer_member(${employer}, ${me}, null)`)).rejects.toThrow(/needs an owner/);
    await as(me, (tx) => tx`select app.change_employer_member(${employer}, ${colleague}, 'owner')`);
    await as(me, (tx) => tx`select app.change_employer_member(${employer}, ${me}, null)`); // now allowed: someone else owns it
    expect((await as(colleague, (tx) => tx`select email from app.employer_team(${employer})`)).map((t) => t.email)).toEqual(['musa@sahelfoods.ng']);

    // Jobs: drafts and closed or past-closing jobs stay off the board; listed jobs from verified employers show publicly.
    await as(colleague, (tx) => tx`insert into job_roles (employer_id, title, skills, status, on_board, closes_on) values
      (${employer}, 'Draft job', '{Sales}', 'draft', true, null),
      (${employer}, 'Field sales officer', '{Sales,Excel}', 'open', true, current_date + 10),
      (${employer}, 'Expired job', '{Sales}', 'open', true, current_date - 1),
      (${employer}, 'Invite-only job', '{Sales}', 'open', false, null)`);
    const board = await as(null, (tx) => tx<{ title: string; employer_name: string }[]>`select title, employer_name from app.job_board() where employer_id = ${employer}`);
    expect(board).toEqual([{ title: 'Field sales officer', employer_name: 'Sahel Foods' }]);
    // Publishing the draft (with its new details) puts it on the board.
    await as(colleague, (tx) => tx`update job_roles set status = 'open', published_at = now(), requirements = 'A smartphone', closes_on = current_date + 5, on_board = true
      where employer_id = ${employer} and title = 'Draft job'`);
    expect((await as(null, (tx) => tx`select title from app.job_board() where employer_id = ${employer} order by title`)).map((j) => j.title)).toEqual(['Draft job', 'Field sales officer']);
    await as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'suspended', 'Paused while we check a complaint.')`);
    expect(await as(null, (tx) => tx`select 1 from app.job_board() where employer_id = ${employer}`)).toHaveLength(0);
  });

  it('keeps portfolio items honest: own graded work only, verification by officers, cleared on edit', async () => {
    const hub = ids['hub-one']!;
    const [course] = await sql<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Portfolio course', 'published') returning id`;
    const [mod] = await sql<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${course!.id}, 'M1') returning id`;
    const [lesson] = await sql<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${course!.id}, ${mod!.id}, 'assignment', 'Build a landing page') returning id`;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id) values (${hub}, ${ids['open-call']!}, 'Portfolio cohort', ${course!.id}) returning id`;
    const [app] = await submit(ids['open-call']!, 'maker@test.ng', 'HUB-26-PORT1');
    const [e] = await sql<{ id: string }[]>`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id}) returning id`;
    const [graded] = await sql<{ id: string }[]>`insert into submissions (tenant_id, lesson_id, enrolment_id, body, status, score, graded_at) values (${hub}, ${lesson!.id}, ${e!.id}, 'My page', 'graded', 82, now()) returning id`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('maker@test.ng') returning id`;
    const [other] = await sql<{ id: string }[]>`insert into users (email) values ('copycat@test.ng') returning id`;

    expect(await as(u!.id, (tx) => tx`select lesson_title, score::float from app.my_graded_work()`)).toEqual([{ lesson_title: 'Build a landing page', score: 82 }]);
    const [item] = await as(u!.id, (tx) => tx<{ id: string }[]>`insert into portfolio_items (user_id, title, url, skills, submission_id) values (${u!.id}, 'Landing page for a tailor', 'https://maker.dev/tailor', '{HTML and CSS}', ${graded!.id}) returning id`);
    // Someone else cannot claim that work, write for another person, or verify their own item.
    await expect(as(other!.id, (tx) => tx`insert into portfolio_items (user_id, title, submission_id) values (${other!.id}, 'Not mine', ${graded!.id})`)).rejects.toThrow(/own graded work/);
    await expect(as(other!.id, (tx) => tx`insert into portfolio_items (user_id, title, url) values (${u!.id}, 'Sneaky', 'https://x.ng')`)).rejects.toThrow(/row-level security/);
    await expect(as(u!.id, (tx) => tx`update portfolio_items set verified_at = now() where id = ${item!.id}`)).rejects.toThrow(/permission denied/);
    await expect(as(u!.id, (tx) => tx`select app.verify_portfolio_item(${item!.id}, true)`)).rejects.toThrow(/Platform team only/);

    await as(ids.platform!, (tx) => tx`select app.verify_portfolio_item(${item!.id}, true)`);
    expect((await sql`select verified_at is not null as v from portfolio_items where id = ${item!.id}`)[0]!.v).toBe(true);
    // Editing the content clears the verification; reordering does not.
    await as(u!.id, (tx) => tx`update portfolio_items set position = 3 where id = ${item!.id}`);
    expect((await sql`select verified_at is not null as v from portfolio_items where id = ${item!.id}`)[0]!.v).toBe(true);
    await as(u!.id, (tx) => tx`update portfolio_items set title = 'Landing page for a tailor (v2)' where id = ${item!.id}`);
    expect((await sql`select verified_at is not null as v from portfolio_items where id = ${item!.id}`)[0]!.v).toBe(false);
    // Private until the Passport is shared: another learner sees nothing.
    expect(await as(other!.id, (tx) => tx`select id from portfolio_items where user_id = ${u!.id}`)).toHaveLength(0);
    // Availability details are the learner's to set.
    await as(u!.id, (tx) => tx`insert into passports (user_id, available_from, relocate, target_roles) values (${u!.id}, current_date + 30, true, '{Frontend developer}')`);
    await expect(as(u!.id, (tx) => tx`update passports set target_roles = '{a,b,c,d,e,f}' where user_id = ${u!.id}`)).rejects.toThrow(/check/);
  });
});

describe('applications, placements and Gate G3', () => {
  it('lets learners apply with their Passport, shows employers only real applicants, and lets learners withdraw', async () => {
    const [r] = await as(null, (tx) => tx<{ id: string }[]>`select app.register_employer('Kano Tech Hub Ltd', 'Software', 'https://kanotech.ng', 'Kano', '11-50', 'Zainab Ali', 'zainab@kanotech.ng', '0803', 'Developers') as id`);
    const employer = r!.id;
    await as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'verified', null)`);
    const boss = (await sql<{ id: string }[]>`select id from users where email = 'zainab@kanotech.ng'`)[0]!.id;
    const [job] = await as(boss, (tx) => tx<{ id: string }[]>`insert into job_roles (employer_id, title, skills, status, on_board, published_at) values (${employer}, 'Junior web developer', '{React,CSS}', 'open', true, now()) returning id`);
    const [hidden] = await as(boss, (tx) => tx<{ id: string }[]>`insert into job_roles (employer_id, title, skills, status, on_board) values (${employer}, 'Invite-only role', '{React}', 'open', false) returning id`);
    const [amina] = await sql<{ id: string }[]>`insert into users (email, full_name) values ('amina.apply@test.ng', 'Amina Bello') returning id`;
    const me = amina!.id;
    const apply = (role: string, note = 'I built three React sites.') =>
      as(me, (tx) => tx<{ candidate_id: string; role_title: string; employer_name: string; notify: string[] }[]>`
        select * from app.apply_to_job(${role}, ${note}, 72, ${['Has 2 of 2 required skills: React, CSS']}, ${['Lives outside Kano']})`);

    // A Passport, shared with employers, comes first: applying shares it with this employer.
    await expect(apply(job!.id)).rejects.toThrow(/Create your Passport/);
    await as(me, (tx) => tx`insert into passports (user_id, headline, skills) values (${me}, 'Frontend developer', '{React,CSS}')`);
    await expect(apply(job!.id)).rejects.toThrow(/Turn on sharing/);
    await as(me, (tx) => tx`update passports set employer_sharing = true where user_id = ${me}`);
    await expect(apply(hidden!.id)).rejects.toThrow(/no longer open/);
    const [applied] = await apply(job!.id);
    expect(applied).toMatchObject({ role_title: 'Junior web developer', employer_name: 'Kano Tech Hub Ltd', notify: ['zainab@kanotech.ng'] });
    await expect(apply(job!.id)).rejects.toThrow(/already applied/);

    // The employer sees the application with its match; other employers and hubs do not.
    const seen = await as(boss, (tx) => tx`select source, cover_note, match_score, match_reasons, match_concerns, interest from role_candidates where role_id = ${job!.id}`);
    expect(seen).toEqual([{ source: 'applied', cover_note: 'I built three React sites.', match_score: 72, match_reasons: ['Has 2 of 2 required skills: React, CSS'], match_concerns: ['Lives outside Kano'], interest: 'confirmed' }]);
    expect(await as(ids.owner1!, (tx) => tx`select id from role_candidates where role_id = ${job!.id}`)).toHaveLength(0);
    expect((await as(boss, (tx) => tx`select email from app.candidate_contact(${applied!.candidate_id})`))[0]!.email).toBe('amina.apply@test.ng');
    // The learner cannot write applications directly or change what the employer records.
    await expect(as(me, (tx) => tx`update role_candidates set stage = 'offered' where id = ${applied!.candidate_id}`)).resolves.toHaveLength(0);
    expect((await sql`select stage from role_candidates where id = ${applied!.candidate_id}`)[0]!.stage).toBe('shortlisted');

    const mine = await as(me, (tx) => tx`select role_title, source, stage, role_status, on_board, match_reasons from app.my_opportunities()`);
    expect(mine).toEqual([{ role_title: 'Junior web developer', source: 'applied', stage: 'shortlisted', role_status: 'open', on_board: true, match_reasons: ['Has 2 of 2 required skills: React, CSS'] }]);

    // Withdrawing hides them from the employer; they may apply again while the job is open.
    expect((await as(me, (tx) => tx`select app.withdraw_application(${applied!.candidate_id}) as ok`))[0]!.ok).toBe(true);
    expect(await as(boss, (tx) => tx`select id from role_candidates where role_id = ${job!.id}`)).toHaveLength(0);
    expect((await as(me, (tx) => tx`select app.withdraw_application(${applied!.candidate_id}) as ok`))[0]!.ok).toBe(false);
    await apply(job!.id, '');
    expect((await as(boss, (tx) => tx`select cover_note, withdrawn_at from role_candidates where role_id = ${job!.id}`))[0]).toEqual({ cover_note: null, withdrawn_at: null });

    // Ten applications a day at most.
    const many = await as(boss, (tx) => tx<{ id: string }[]>`insert into job_roles (employer_id, title, skills, status, on_board, published_at)
      select ${employer}, 'Role ' || n, '{React}', 'open', true, now() from generate_series(1, 10) n returning id`);
    for (const m of many.slice(0, 9)) await apply(m.id);
    await expect(apply(many[9]!.id)).rejects.toThrow(/10 jobs a day/);

    // Hires: the employer's own hire is confirmed; a hire needs its details; the 90-day check waits 90 days.
    await expect(as(boss, (tx) => tx`update role_candidates set stage = 'placed' where id = ${applied!.candidate_id}`)).rejects.toThrow(/type of work and a start date/);
    await as(boss, (tx) => tx`update role_candidates set stage = 'placed', placement_type = 'full_time', start_date = current_date - 10, pay_band = '₦180k a month' where id = ${applied!.candidate_id}`);
    expect((await sql`select placement_confirmation, placement_confirmed_by from role_candidates where id = ${applied!.candidate_id}`)[0]).toEqual({ placement_confirmation: 'employer', placement_confirmed_by: boss });
    await expect(as(boss, (tx) => tx`update role_candidates set retained = true where id = ${applied!.candidate_id}`)).rejects.toThrow(/90 days after the start date/);
    await expect(as(me, (tx) => tx`select app.withdraw_application(${applied!.candidate_id}) as ok`)).resolves.toEqual([{ ok: false }]);
    await sql`update role_candidates set start_date = current_date - 95 where id = ${applied!.candidate_id}`;
    await as(boss, (tx) => tx`update role_candidates set retained = true where id = ${applied!.candidate_id}`);
    expect((await sql`select retention_source, retention_by, retention_checked_at is not null as at from role_candidates where id = ${applied!.candidate_id}`)[0]).toEqual({ retention_source: 'employer', retention_by: boss, at: true });
    // Undoing the hire clears the confirmation and the check.
    await as(boss, (tx) => tx`update role_candidates set stage = 'offered' where id = ${applied!.candidate_id}`);
    expect((await sql`select placement_confirmed_at, retained, retention_source from role_candidates where id = ${applied!.candidate_id}`)[0]).toEqual({ placement_confirmed_at: null, retained: null, retention_source: null });
  });

  it('makes officer-recorded hires wait for the employer, or an officer’s note, and audits both', async () => {
    const [r] = await as(null, (tx) => tx<{ id: string }[]>`select app.register_employer('Arewa Agro', 'Agriculture', 'https://arewaagro.ng', 'Kaduna', '51-200', 'Sani Musa', 'sani@arewaagro.ng', '0803', 'Field staff') as id`);
    const employer = r!.id;
    await as(ids.platform!, (tx) => tx`select app.review_employer(${employer}, 'verified', null)`);
    const boss = (await sql<{ id: string }[]>`select id from users where email = 'sani@arewaagro.ng'`)[0]!.id;
    const [role] = await sql<{ id: string }[]>`insert into job_roles (employer_id, title, status) values (${employer}, 'Extension officer', 'open') returning id`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('placed.one@test.ng') returning id`;
    await sql`insert into passports (user_id, discoverable) values (${u!.id}, true)`;
    const [cand] = await as(ids.platform!, (tx) => tx<{ id: string }[]>`insert into role_candidates (role_id, user_id, interest, interest_at) values (${role!.id}, ${u!.id}, 'confirmed', now()) returning id`);
    await as(ids.platform!, (tx) => tx`update role_candidates set stage = 'placed', placement_type = 'contract', start_date = current_date - 100 where id = ${cand!.id}`);
    expect((await sql`select placement_confirmed_at, source from role_candidates where id = ${cand!.id}`)[0]).toEqual({ placement_confirmed_at: null, source: 'officer' });

    // An officer confirming needs to say how; other people cannot confirm at all.
    await expect(as(ids.platform!, (tx) => tx`select app.confirm_placement(${cand!.id}, 'ok')`)).rejects.toThrow(/how the employer confirmed/);
    await expect(as(ids.owner1!, (tx) => tx`select app.confirm_placement(${cand!.id}, 'Looks right to me')`)).rejects.toThrow(/Only the employer or a talent officer/);
    // The employer confirms with one click.
    expect((await as(boss, (tx) => tx`select app.confirm_placement(${cand!.id}, null) as ok`))[0]!.ok).toBe(true);
    expect((await sql`select placement_confirmation from role_candidates where id = ${cand!.id}`)[0]!.placement_confirmation).toBe('employer');

    // A second hire the employer never answers: the officer confirms it and records the 90-day check, with notes.
    const [u2] = await sql<{ id: string }[]>`insert into users (email) values ('placed.two@test.ng') returning id`;
    await sql`insert into passports (user_id, discoverable) values (${u2!.id}, true)`;
    const [cand2] = await as(ids.platform!, (tx) => tx<{ id: string }[]>`insert into role_candidates (role_id, user_id, interest, stage, placement_type, start_date)
      values (${role!.id}, ${u2!.id}, 'confirmed', 'placed', 'full_time', current_date - 120) returning id`);
    await as(ids.platform!, (tx) => tx`select app.confirm_placement(${cand2!.id}, 'HR confirmed by phone on Monday')`);
    await expect(as(ids.platform!, (tx) => tx`select app.record_retention(${cand2!.id}, false, 'left')`)).rejects.toThrow(/how you checked/);
    await expect(as(boss, (tx) => tx`select app.record_retention(${cand2!.id}, true, 'They are doing well here')`)).rejects.toThrow(/Talent officers only/);
    await as(ids.platform!, (tx) => tx`select app.record_retention(${cand2!.id}, false, 'Sani said she left in month two')`);
    expect((await sql`select placement_confirmation, placement_note, retained, retention_source, retention_note from role_candidates where id = ${cand2!.id}`)[0]).toEqual({
      placement_confirmation: 'officer', placement_note: 'HR confirmed by phone on Monday', retained: false, retention_source: 'officer', retention_note: 'Sani said she left in month two' });
    expect((await sql`select action, metadata from audit_log where target_id = ${cand2!.id} order by at, id`)).toEqual([
      { action: 'placement.confirmed', metadata: { by: 'officer' } }, { action: 'placement.retention', metadata: { retained: false } }]);
    // The scheduler's reminder columns stay out of the app role's hands.
    await expect(as(boss, (tx) => tx`update role_candidates set retention_asked_at = now() where id = ${cand!.id}`)).rejects.toThrow(/permission denied/);
  });

  it('measures Gate G3 per enrolment for hub owners and the platform only', async () => {
    const hub = ids['hub-one']!;
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, ends_on) values (${hub}, ${ids['open-call']!}, 'G3 cohort', current_date - 1) returning id`;
    const [a1] = await submit(ids['open-call']!, 'placed.one@test.ng', 'HUB-26-G3001');
    const [a2] = await submit(ids['open-call']!, 'g3.dropout@test.ng', 'HUB-26-G3002');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id, status) values (${hub}, ${cohort!.id}, ${a1!.id}, 'completed'), (${hub}, ${cohort!.id}, ${a2!.id}, 'dropped')`;
    const u = (await sql<{ id: string }[]>`select id from users where email = 'placed.one@test.ng'`)[0]!.id;
    await sql`update passports set verified_at = now() where user_id = ${u}`;

    const rows = await as(ids.owner1!, (tx) => tx`select status, cohort_ended, assessed, placed, confirmed, retained, retention_due from app.g3_enrolments(${hub}) where cohort_id = ${cohort!.id} order by status`);
    expect(rows).toEqual([
      { status: 'completed', cohort_ended: true, assessed: true, placed: true, confirmed: true, retained: null, retention_due: true },
      { status: 'dropped', cohort_ended: true, assessed: false, placed: false, confirmed: false, retained: null, retention_due: false },
    ]);
    await expect(as(ids.reviewer1!, (tx) => tx`select * from app.g3_enrolments(${hub})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner2!, (tx) => tx`select * from app.g3_enrolments(${hub})`)).rejects.toThrow(/owners and admins/);
    await expect(as(ids.owner1!, (tx) => tx`select * from app.g3_enrolments(null)`)).rejects.toThrow(/Platform team only/);
    expect((await as(ids.platform!, (tx) => tx`select count(*)::int as n from app.g3_enrolments(null) where cohort_id = ${cohort!.id}`))[0]!.n).toBe(2);
  });
});

describe('custom domains, white-label emails and learning paths', () => {
  it('lets hub owners brand their emails and prove a custom domain, which then routes to the hub', async () => {
    const hub = ids['hub-two']!; const owner = ids.owner2!;
    // White-label email settings belong to the hub team.
    await as(owner, (tx) => tx`update tenants set email_from_name = 'Hub Two Academy', email_reply_to = 'hello@hubtwo.ng', email_footer = 'No 4 Zaria Road, Kano' where id = ${hub}`);
    await expect(as(owner, (tx) => tx`update tenants set email_from_name = 'Evil <x@y.ng>' where id = ${hub}`)).rejects.toThrow(/check/);
    await expect(as(ids.owner1!, (tx) => tx`update tenants set email_from_name = 'Not mine' where id = ${hub} returning id`)).resolves.toHaveLength(0);

    // Custom domain: owners set it, a DNS check verifies it, then requests to it reach the hub.
    await expect(as(ids.owner1!, (tx) => tx`select app.set_custom_domain(${hub}, 'apply.hubtwo.ng')`)).rejects.toThrow(/owners and admins/);
    const [t] = await as(owner, (tx) => tx<{ token: string }[]>`select app.set_custom_domain(${hub}, 'Apply.HubTwo.ng.') as token`);
    expect(t!.token).toMatch(/^talentral-[0-9a-f]{24}$/);
    expect((await sql`select custom_domain, domain_status from tenants where id = ${hub}`)[0]).toEqual({ custom_domain: 'apply.hubtwo.ng', domain_status: 'pending' });
    expect((await as(null, (tx) => tx`select app.hub_for_domain('apply.hubtwo.ng') as slug`))[0]!.slug).toBeNull();
    await expect(as(owner, (tx) => tx`update tenants set domain_status = 'verified' where id = ${hub}`)).rejects.toThrow(/permission denied/);
    await as(owner, (tx) => tx`select app.record_domain_check(${hub}, false, 'No TXT record found')`);
    expect((await sql`select domain_status, domain_error from tenants where id = ${hub}`)[0]).toEqual({ domain_status: 'failed', domain_error: 'No TXT record found' });
    await as(owner, (tx) => tx`select app.record_domain_check(${hub}, true, null)`);
    expect((await as(null, (tx) => tx`select app.hub_for_domain('APPLY.hubtwo.ng') as slug`))[0]!.slug).toBe('hub-two');
    await expect(as(ids.owner1!, (tx) => tx`select app.set_custom_domain(${ids['hub-one']!}, 'apply.hubtwo.ng')`)).rejects.toThrow(/Another hub/);
    expect((await sql`select action from audit_log where target_id = ${hub} and action like 'hub.domain%' order by at, id`).map((a) => a.action)).toEqual(['hub.domain_set', 'hub.domain_verified']);
    // A suspended hub's domain stops resolving; removing the domain clears it.
    await as(ids.platform!, (tx) => tx`update tenants set status = 'suspended' where id = ${hub}`);
    expect((await as(null, (tx) => tx`select app.hub_for_domain('apply.hubtwo.ng') as slug`))[0]!.slug).toBeNull();
    await as(ids.platform!, (tx) => tx`update tenants set status = 'active' where id = ${hub}`);
    await as(owner, (tx) => tx`select app.set_custom_domain(${hub}, null)`);
    expect((await sql`select custom_domain, domain_token, domain_status from tenants where id = ${hub}`)[0]).toEqual({ custom_domain: null, domain_token: null, domain_status: null });
  });

  it('takes learners through a path one course at a time, and keeps paths within their hub', async () => {
    const hub = ids['hub-one']!;
    const course = async (title: string, lesson: string) => {
      const [c] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, ${title}, 'published') returning id`);
      const [m] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${c!.id}, 'Week 1') returning id`);
      const [l] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title) values (${hub}, ${c!.id}, ${m!.id}, 'text', ${lesson}) returning id`);
      return { course: c!.id, lesson: l!.id };
    };
    const a = await course('HTML and CSS', 'Your first page');
    const b = await course('JavaScript', 'Variables');
    const [path] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into learning_paths (tenant_id, title, outcome) values (${hub}, 'Frontend developer', 'Junior frontend developer') returning id`);
    await as(ids.admin1!, (tx) => tx`insert into learning_path_courses (path_id, course_id, tenant_id, position) values (${path!.id}, ${a.course}, ${hub}, 0), (${path!.id}, ${b.course}, ${hub}, 1)`);
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name) values (${hub}, ${ids['open-call']!}, 'Path cohort') returning id`;
    const [app] = await submit(ids['open-call']!, 'pathfinder@test.ng', 'HUB-26-PATH1');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id})`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('pathfinder@test.ng') returning id`;
    const me = u!.id;

    // Paths and cohorts stay within their hub; a cohort follows a course or a path, not both.
    await expect(as(ids.owner2!, (tx) => tx`insert into learning_path_courses (path_id, course_id, tenant_id) values (${path!.id}, ${a.course}, ${ids['hub-two']!})`)).rejects.toThrow(/row-level security/);
    const [other] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name) values (${ids['hub-two']!}, ${ids['two-call']!}, 'Other hub') returning id`;
    await expect(as(ids.owner2!, (tx) => tx`update cohorts set path_id = ${path!.id} where id = ${other!.id}`)).rejects.toThrow(/from this hub/);
    await expect(as(ids.admin1!, (tx) => tx`update cohorts set path_id = ${path!.id}, course_id = ${a.course} where id = ${cohort!.id}`)).rejects.toThrow(/course_or_path/);
    // Platform staff helping the hub can set it too (through a support session in the app).
    expect(await as(ids.platform!, (tx) => tx`update cohorts set path_id = ${path!.id} where id = ${cohort!.id} returning id`)).toHaveLength(1);

    // Nothing until the path is published; then the second course waits for the first.
    expect(await as(me, (tx) => tx`select * from app.learner_outline(${cohort!.id})`)).toHaveLength(0);
    await as(ids.admin1!, (tx) => tx`update learning_paths set status = 'published' where id = ${path!.id}`);
    const outline = await as(me, (tx) => tx`select lesson_id, open, course_title, course_step from app.learner_outline(${cohort!.id})`);
    expect(outline).toEqual([
      { lesson_id: a.lesson, open: true, course_title: 'HTML and CSS', course_step: 0 },
      { lesson_id: b.lesson, open: false, course_title: 'JavaScript', course_step: 1 },
    ]);
    expect((await as(me, (tx) => tx`select app.learner_lesson(${cohort!.id}, ${b.lesson}) as l`))[0]!.l).toBeNull();
    expect((await as(me, (tx) => tx`select course_title, path_title, courses_total, courses_done, course_step from app.learner_courses() where cohort_id = ${cohort!.id}`))[0])
      .toEqual({ course_title: 'HTML and CSS', path_title: 'Frontend developer', courses_total: 2, courses_done: 0, course_step: 0 });
    await as(me, (tx) => tx`select app.record_progress(${cohort!.id}, ${a.lesson}, true)`);
    expect((await as(me, (tx) => tx`select open from app.learner_outline(${cohort!.id}) where lesson_id = ${b.lesson}`))[0]!.open).toBe(true);
    expect((await as(me, (tx) => tx`select course_title, courses_done from app.learner_courses() where cohort_id = ${cohort!.id}`))[0]).toEqual({ course_title: 'JavaScript', courses_done: 1 });
    // Not sequential: everything opens at once.
    await as(ids.admin1!, (tx) => tx`update learning_paths set sequential = false where id = ${path!.id}`);
    expect((await as(me, (tx) => tx`select count(*)::int as n from app.my_cohort_courses(${cohort!.id}) where open`))[0]!.n).toBe(2);

    // The hub's public page lists published paths with their courses.
    expect(await as(null, (tx) => tx`select title, outcome, courses, lessons::int from app.hub_paths(${hub})`))
      .toEqual([{ title: 'Frontend developer', outcome: 'Junior frontend developer', courses: ['HTML and CSS', 'JavaScript'], lessons: 2 }]);
  });
});

describe('verification API limits, outbound webhooks and the AI tutor', () => {
  it('counts hits per window and says when a caller is over the limit', async () => {
    const take = async () => (await as(null, (tx) => tx<{ ok: boolean }[]>`select app.take_rate('api:1.2.3.4', 2, 60) as ok`))[0]!.ok;
    expect([await take(), await take(), await take()]).toEqual([true, true, false]);
    await expect(as(null, (tx) => tx`select * from rate_hits`)).rejects.toThrow(/permission denied/);
  });

  it('lets hub owners and admins add endpoints that receive their own hub’s events, signed and audited', async () => {
    const hub = ids['hub-two']!; const owner = ids.owner2!;
    await expect(as(ids.owner1!, (tx) => tx`select app.add_webhook(${hub}, 'https://crm.hubtwo.ng/hooks', 'CRM', ${['application.submitted']})`)).rejects.toThrow(/owners and admins/);
    await expect(as(owner, (tx) => tx`select app.add_webhook(${hub}, 'https://crm.hubtwo.ng/hooks', null, ${['nonsense']})`)).rejects.toThrow(/check/);
    const [w] = await as(owner, (tx) => tx<{ id: string }[]>`select app.add_webhook(${hub}, 'https://crm.hubtwo.ng/hooks', 'CRM', ${['application.submitted', 'application.status_changed']}) as id`);
    const [e] = await as(owner, (tx) => tx<{ secret: string; active: boolean }[]>`select secret, active from webhook_endpoints where id = ${w!.id}`);
    expect(e!.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(await as(ids.owner1!, (tx) => tx`select id from webhook_endpoints where id = ${w!.id}`)).toHaveLength(0);
    await expect(as(owner, (tx) => tx`insert into webhook_endpoints (tenant_id, url, events, secret) values (${hub}, 'https://x.ng/h', '{ping}', ${e!.secret})`)).rejects.toThrow(/permission denied/);

    // Events queue a delivery for the endpoint; other hubs' events never reach it.
    const [app] = await submit(ids['two-call']!, 'webhook@test.ng', 'TWO-26-HOOK1');
    await submit(ids['open-call']!, 'other-hub@test.ng', 'HUB-26-HOOK2');
    await sql`update applications set status = 'shortlisted' where id = ${app!.id}`;
    await sql`update applications set status = 'shortlisted' where id = ${app!.id}`;
    const queued = await as(owner, (tx) => tx<{ event_type: string; payload: { hub: string; data: { application: { reference: string; status: string; previous_status: string | null } } } }[]>`
      select event_type, payload from webhook_deliveries where endpoint_id = ${w!.id} order by created_at, event_type`);
    expect(queued.map((q) => [q.event_type, q.payload.data.application.status, q.payload.data.application.previous_status])).toEqual([
      ['application.submitted', 'submitted', null], ['application.status_changed', 'shortlisted', 'submitted']]);
    expect(queued[0]!.payload.hub).toBe('hub-two');
    expect(queued[0]!.payload.data.application.reference).toBe('TWO-26-HOOK1');

    // Paused endpoints get nothing; tests and redeliveries are queued on request; changes are audited.
    await as(owner, (tx) => tx`select app.change_webhook(${w!.id}, 'pause')`);
    await sql`update applications set status = 'offered' where id = ${app!.id}`;
    expect((await sql`select count(*)::int as n from webhook_deliveries where endpoint_id = ${w!.id}`)[0]!.n).toBe(2);
    const [ping] = await as(owner, (tx) => tx<{ id: string }[]>`select app.queue_webhook_test(${w!.id}) as id`);
    expect((await sql`select event_type from webhook_deliveries where id = ${ping!.id}`)[0]!.event_type).toBe('ping');
    await as(owner, (tx) => tx`select app.change_webhook(${w!.id}, 'roll')`);
    expect((await sql`select secret from webhook_endpoints where id = ${w!.id}`)[0]!.secret).not.toBe(e!.secret);
    expect((await sql`select action from audit_log where target_id = ${w!.id} order by at, id`).map((a) => a.action))
      .toEqual(['webhook.added', 'webhook.paused', 'webhook.secret_rolled']);
    expect((await sql`select metadata from audit_log where target_id = ${w!.id}`).some((a) => JSON.stringify(a.metadata).includes('whsec_'))).toBe(false);
    await as(owner, (tx) => tx`select app.change_webhook(${w!.id}, 'delete')`);
    expect(await sql`select id from webhook_deliveries where endpoint_id = ${w!.id}`).toHaveLength(0);
  });

  it('answers learners from their own open lessons only, within daily and monthly limits', async () => {
    const hub = ids['hub-one']!;
    const [c] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into courses (tenant_id, title, status) values (${hub}, 'Web basics', 'published') returning id`);
    const [m] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title) values (${hub}, ${c!.id}, 'Week 1') returning id`);
    const [later] = await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into course_modules (tenant_id, course_id, title, unlock_after_days) values (${hub}, ${c!.id}, 'Week 9', 60) returning id`);
    const lesson = async (module: string, title: string, body: string) =>
      (await as(ids.admin1!, (tx) => tx<{ id: string }[]>`insert into lessons (tenant_id, course_id, module_id, kind, title, body) values (${hub}, ${c!.id}, ${module}, 'text', ${title}, ${body}) returning id`))[0]!.id;
    const tags = await lesson(m!.id, 'HTML tags', 'A tag wraps content. The paragraph tag is written as p.');
    const css = await lesson(m!.id, 'Styling', 'CSS changes colours and spacing.');
    const hidden = await lesson(later!.id, 'Deploying', 'Upload your tag soup to a host.');
    const [cohort] = await sql<{ id: string }[]>`insert into cohorts (tenant_id, programme_id, name, course_id, starts_on) values (${hub}, ${ids['open-call']!}, 'Tutor cohort', ${c!.id}, current_date) returning id`;
    const [app] = await submit(ids['open-call']!, 'tutee@test.ng', 'HUB-26-TUTOR');
    await sql`insert into enrolments (tenant_id, cohort_id, application_id) values (${hub}, ${cohort!.id}, ${app!.id})`;
    const [u] = await sql<{ id: string }[]>`insert into users (email) values ('tutee@test.ng') returning id`;
    const me = u!.id;

    // Keyword search over open lessons; locked lessons never appear; the current lesson comes first.
    const found = await as(me, (tx) => tx<{ lesson_id: string }[]>`select lesson_id from app.tutor_context(${cohort!.id}, ${['tag', 'paragraph']})`);
    expect(found.map((f) => f.lesson_id)).toEqual([tags]);
    expect((await as(me, (tx) => tx<{ lesson_id: string }[]>`select lesson_id from app.tutor_context(${cohort!.id}, ${['tag']}, ${css})`)).map((f) => f.lesson_id)).toEqual([css, tags]);
    expect(found.map((f) => f.lesson_id)).not.toContain(hidden);
    expect(await as(ids.owner2!, (tx) => tx`select * from app.tutor_context(${cohort!.id}, ${['tag']})`)).toHaveLength(0);

    // Questions are claimed within limits and only the learner who asked can read them.
    const claim = (n: number) => as(me, (tx) => tx<{ id: string }[]>`select app.claim_tutor_question(${cohort!.id}, ${tags}, 'What does a tag do?', 'en', 'fake', 100, ${n}) as id`);
    const [q] = await claim(2);
    await as(me, (tx) => tx`select app.finish_tutor_question(${q!.id}, 'answered', 'It wraps content.', ${tx.json([{ lesson_id: tags, title: 'HTML tags' }])}, 10, 5)`);
    await claim(2);
    await expect(claim(2)).rejects.toThrow(/tutor_daily_limit/);
    await expect(as(me, (tx) => tx`select app.claim_tutor_question(${cohort!.id}, null, 'Another question', 'en', 'fake', 2, 50)`)).rejects.toThrow(/tutor_hub_limit/);
    await expect(as(ids.owner2!, (tx) => tx`select app.claim_tutor_question(${cohort!.id}, null, 'Not my cohort', 'en', 'fake', 100, 100)`)).rejects.toThrow(/Not enrolled/);
    expect((await as(me, (tx) => tx`select status, answer from tutor_questions where id = ${q!.id}`))[0]).toEqual({ status: 'answered', answer: 'It wraps content.' });
    expect(await as(ids.owner1!, (tx) => tx`select id from tutor_questions`)).toHaveLength(0);
    // Old questions are purged after 30 days.
    await sql`update tutor_questions set created_at = now() - interval '31 days' where id = ${q!.id}`;
    await sql`select app.purge_month11()`;
    expect(await sql`select id from tutor_questions where id = ${q!.id}`).toHaveLength(0);
  });
});
