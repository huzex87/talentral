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
