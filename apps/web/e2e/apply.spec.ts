// The Week 0 journey end to end, on a phone-sized screen:
// platform admin creates a hub -> owner accepts, completes the profile and opens a call ->
// an applicant applies with a document -> the owner reviews, shortlists and exports.
import { createHmac, createPublicKey, verify as verifySignature } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { E2E_DATABASE_URL } from '../playwright.config';
import { lastMail, linkIn } from './mail';
import { codeAt, stepAt } from '../lib/totp';

// A 1x1 PNG and a minimal PDF, generated in memory.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

// A realistic wordmark logo as PNG bytes, drawn by the browser itself.
async function logoPng(page: Page, text: string, color: string): Promise<Buffer> {
  const tmp = await page.context().newPage();
  await tmp.setContent(`<div id="l" style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;font:700 34px system-ui;color:${color}">
    <span style="width:40px;height:40px;border-radius:10px;background:${color}"></span>${text}</div>`);
  const png = await tmp.locator('#l').screenshot({ omitBackground: true });
  await tmp.close();
  return png;
}

async function signIn(page: Page, email: string, landing = /\/dashboard|\/platform/) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const mail = await lastMail(email, /sign-in link/);
  await page.goto(linkIn(mail.text));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(landing);
}

// Platform staff open a hub only through a support session with a reason (E13.1). Does nothing when
// one is already open.
async function support(page: Page, slug = 'kirkira') {
  await page.goto(`/dashboard/${slug}`);
  if (!page.url().includes('/platform/support/')) return;
  await page.getByLabel('Why do you need access?').fill('Helping the hub team test the platform.');
  await page.getByRole('button', { name: 'Open for four hours' }).click();
  await page.waitForURL(new RegExp(`/dashboard/${slug}$`));
}

test('hub onboarding, application and review', async ({ page, browser }) => {
  // 1. Platform admin creates the hub and invites its owner.
  await signIn(page, 'ops@talentral.ng');
  await page.goto('/platform');
  await page.getByLabel('Hub name').fill('Kirkira Innovation Hub');
  await expect(page.getByLabel('Web address')).toHaveValue('kirkira-innovation-hub');
  await page.getByLabel('Web address').fill('kirkira');
  await page.getByLabel("Owner's email").fill('owner@kirkira.ng');
  await page.getByRole('button', { name: 'Create hub and invite owner' }).click();
  await expect(page.getByText('Kirkira Innovation Hub created')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Owner invited/ })).toBeVisible();

  // 2. Owner accepts and completes the hub profile (in a fresh browser).
  const owner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  const invite = await lastMail('owner@kirkira.ng', /invited to manage Kirkira/);
  await owner.goto(linkIn(invite.text));
  await owner.getByLabel('Your full name').fill('Amina Bello');
  await owner.getByRole('button', { name: 'Accept and continue' }).click();
  await owner.waitForURL('**/dashboard/kirkira/profile?welcome=1');
  await expect(owner.getByText('Welcome to Talentral, Kirkira Innovation Hub')).toBeVisible();

  await owner.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await owner.getByLabel('Tagline').fill('Building the next generation of tech talent in Katsina');
  await owner.getByLabel('About your hub').fill('Kirkira Innovation Hub runs the iDICE Centre of Excellence in Katsina.');
  await owner.getByLabel('Contact email').fill('hello@kirkira.ng');
  await owner.getByLabel('State').selectOption('Katsina');
  await owner.getByLabel('Colour code').fill('#0F766E');
  await owner.getByRole('button', { name: 'Save profile' }).click();
  await expect(owner.getByText('Profile saved. Your hub page is live.')).toBeVisible();

  // 3. Owner creates a programme, adds details and a document question, and opens it.
  await owner.goto('/dashboard/kirkira/programmes/new');
  await owner.getByLabel('Programme title').fill('iDICE Centre of Excellence Cohort 1');
  await owner.getByRole('button', { name: 'Create programme' }).click();
  await owner.waitForURL(/programmes\/[0-9a-f-]+\?created=1/);
  const programmeUrl = new URL(owner.url()).pathname;

  await owner.getByRole('button', { name: 'Open applications' }).click();
  await expect(owner.getByText('Add a short summary')).toBeVisible(); // cannot open without a summary

  await owner.getByLabel('Summary').fill('Twelve weeks of practical digital skills training with mentors.');
  await owner.getByLabel('Tracks (one per line)').fill('Digital Marketing\nSoftware Development');
  await owner.getByRole('button', { name: 'Save details' }).click();
  await expect(owner.getByText('Details saved.')).toBeVisible();

  await owner.getByRole('button', { name: 'Add a question' }).click();
  await owner.getByRole('textbox', { name: 'Question' }).fill('Upload your CV');
  await owner.getByRole('combobox', { name: 'Answer type' }).selectOption('file');
  await owner.getByRole('button', { name: 'Save form' }).click();
  await expect(owner.getByText('Form saved.')).toBeVisible();

  await owner.getByRole('button', { name: 'Open applications' }).click();
  await expect(owner.getByText('Applications are open.')).toBeVisible();

  // 4. An applicant applies from the public page.
  const applicant = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await applicant.goto('/kirkira');
  await expect(applicant.getByRole('heading', { name: 'Kirkira Innovation Hub' })).toBeVisible();
  await applicant.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).click();

  await applicant.getByRole('button', { name: 'Submit application' }).click();
  await expect(applicant.getByText('Please check the highlighted answers.')).toBeVisible();
  await expect(applicant.getByText('You must agree before you can apply.')).toBeVisible();

  await applicant.getByLabel('Full name').fill('Aisha Musa');
  await applicant.getByLabel('Email address').fill('aisha@example.com');
  await applicant.getByLabel('Phone number').fill('0803 123 4567');
  await applicant.getByLabel('Which track are you applying for?').selectOption('Software Development');
  await applicant.getByLabel('Gender').selectOption('Female');
  await applicant.getByLabel('Date of birth').fill('2001-05-14');
  await applicant.getByLabel('State of residence').selectOption('Katsina');
  await applicant.getByLabel('Local government area (LGA)').fill('Katsina');
  await applicant.getByLabel('Highest level of education').selectOption('OND / NCE');
  await applicant.getByLabel('Current employment status').selectOption('Unemployed');
  await applicant.getByLabel('Why do you want to join this programme?').fill('I want to become a software developer and build tools for farmers.');
  await applicant.getByLabel('Upload your CV').setInputFiles({ name: 'aisha-cv.pdf', mimeType: 'application/pdf', buffer: PDF });
  await applicant.getByRole('checkbox', { name: /I agree that/ }).check();
  await applicant.getByRole('button', { name: 'Submit application' }).click();

  await applicant.waitForURL(/submitted\?ref=/);
  const reference = (await applicant.getByTestId('reference').textContent())!.trim();
  expect(reference).toMatch(/^KIR-\d{2}-[0-9A-Z]{5}$/);
  const confirmation = await lastMail('aisha@example.com', /Application received/);
  expect(confirmation.text).toContain(reference);

  // Applying twice with the same email is refused.
  await applicant.goBack();
  await applicant.goto('/kirkira/apply/idice-centre-of-excellence-cohort-1');
  await applicant.getByLabel('Full name').fill('Aisha Musa');
  await applicant.getByLabel('Email address').fill('AISHA@example.com');
  await applicant.getByLabel('Phone number').fill('0803 123 4567');
  await applicant.getByLabel('Which track are you applying for?').selectOption('Software Development');
  await applicant.getByLabel('Gender').selectOption('Female');
  await applicant.getByLabel('Date of birth').fill('2001-05-14');
  await applicant.getByLabel('State of residence').selectOption('Katsina');
  await applicant.getByLabel('Local government area (LGA)').fill('Katsina');
  await applicant.getByLabel('Highest level of education').selectOption('OND / NCE');
  await applicant.getByLabel('Current employment status').selectOption('Unemployed');
  await applicant.getByLabel('Why do you want to join this programme?').fill('Second try.');
  await applicant.getByRole('checkbox', { name: /I agree that/ }).check();
  await applicant.getByRole('button', { name: 'Submit application' }).click();
  await expect(applicant.getByText('You have already applied to this programme.')).toBeVisible();

  // 5. The owner scores the application, shortlists in bulk with an email, then offers a place.
  await owner.goto('/dashboard/kirkira');
  await expect(owner.getByText('Applications').first()).toBeVisible();
  await owner.goto('/dashboard/kirkira/applications');
  await owner.getByRole('link', { name: 'Aisha Musa' }).click();
  await expect(owner.getByText(reference)).toBeVisible();
  await expect(owner.getByRole('link', { name: /aisha-cv.pdf/ })).toBeVisible();

  // Default rubric: motivation 5 (x3), readiness 4 (x2), fit 3 (x2), impact 5 (x1) = 34 / 40 = 85%.
  await owner.getByLabel('Motivation and commitment: 5 of 5').check({ force: true });
  await owner.getByLabel('Digital readiness: 4 of 5').check({ force: true });
  await owner.getByLabel('Fit with the track: 3 of 5').check({ force: true });
  await owner.getByLabel('Potential impact: 5 of 5').check({ force: true });
  await owner.getByPlaceholder('Why this score?').fill('Clear plan and a strong CV.');
  await owner.getByRole('button', { name: 'Save score' }).click();
  await expect(owner.getByText('Score saved: 85%.')).toBeVisible();
  await owner.reload();
  await expect(owner.getByText('Current: Under review')).toBeVisible(); // the first score starts the review

  await owner.goto('/dashboard/kirkira/applications?sort=score');
  await expect(owner.getByRole('cell', { name: /85%/ })).toBeVisible();
  await owner.getByLabel('Select Aisha Musa').check();
  await owner.getByLabel('Move selected to').selectOption('shortlisted');
  await owner.getByRole('button', { name: 'Apply to 1' }).click();
  await expect(owner.getByText('1 moved to Shortlisted; 1 applicant emailed.')).toBeVisible();
  const shortlisted = await lastMail('aisha@example.com', /shortlisted/);
  expect(shortlisted.text).toContain(reference);
  expect(shortlisted.replyTo).toBe('hello@kirkira.ng');

  await owner.getByRole('link', { name: 'Aisha Musa' }).click();
  await owner.getByRole('button', { name: 'Mark as offered a place' }).click();
  await expect(owner.getByText('Moved to Offered a place. The applicant has been emailed.')).toBeVisible();
  await lastMail('aisha@example.com', /offered a place/);

  const download = owner.waitForEvent('download');
  await owner.goto('/dashboard/kirkira/applications');
  await owner.getByRole('link', { name: 'Download CSV' }).click();
  const csv = await (await (await download).createReadStream()).toArray();
  const text = Buffer.concat(csv).toString('utf8');
  expect(text).toContain(reference);
  expect(text).toContain('Offered a place');
  expect(text).toContain('85.0');
  expect(text).toContain('Why do you want to join this programme?');

  // 6. Participants selected on another platform are imported from a spreadsheet.
  await owner.goto(`${programmeUrl}/import`);
  const sheet = [
    'S/N,Full Name,E-mail Address,Phone No.,Sex,Course',
    '1,Ibrahim Sani,ibrahim@example.com,8031234567,male,digital marketing',
    '2,Fatima Bello,fatima@example.com,0803 555 1234,Female,Software Development',
    '3,No Email,,0803 000 0000,Female,Software Development',
    '4,Aisha Musa,aisha@example.com,,Female,Software Development',
  ].join('\n');
  await owner.waitForLoadState('networkidle'); // the importer reads the file on the client once hydrated
  await owner.getByLabel('Participants file').setInputFiles({ name: 'idice-selected.csv', mimeType: 'text/csv', buffer: Buffer.from(sheet) });
  await expect(owner.getByText('idice-selected.csv')).toBeVisible();
  await expect(owner.getByLabel('Column Full Name')).toHaveValue('full_name');
  await expect(owner.getByLabel('Column Sex')).toHaveValue('answer:gender');
  await expect(owner.getByText('Row 4: Email is missing.')).toBeVisible();
  await owner.getByRole('checkbox', { name: /I confirm these participants agreed/ }).check();
  await owner.getByRole('button', { name: 'Import 3 participants' }).click();
  await expect(owner.getByRole('heading', { name: '2 participants imported' })).toBeVisible();
  await expect(owner.getByText('1 skipped because they are already in this programme')).toBeVisible();
  await expect(owner.getByText('1 not imported because of problems in the file')).toBeVisible();

  await owner.goto('/dashboard/kirkira/applications?q=ibrahim');
  await expect(owner.getByText('Imported', { exact: true })).toBeVisible();
  await owner.getByRole('link', { name: 'Ibrahim Sani' }).click();
  await expect(owner.getByText('Current: Accepted')).toBeVisible();
  await expect(owner.getByText('+2348031234567')).toBeVisible();

  // An Excel file: first sheet in workbook order, a numeric phone and a date stored as a serial.
  await owner.goto(`${programmeUrl}/import`);
  await owner.getByLabel('Participants file').setInputFiles('e2e/fixtures/selected.xlsx');
  await expect(owner.getByText('selected.xlsx')).toBeVisible();
  await expect(owner.getByText('ready to import')).toBeVisible();
  await owner.getByLabel('Start them as').selectOption('shortlisted');
  await owner.getByRole('checkbox', { name: /I confirm these participants agreed/ }).check();
  await owner.getByRole('button', { name: 'Import 2 participants' }).click();
  await expect(owner.getByRole('heading', { name: '2 participants imported' })).toBeVisible();
  await owner.goto('/dashboard/kirkira/applications?q=khadija');
  await owner.getByRole('link', { name: 'Khadija Ahmed' }).click();
  await expect(owner.getByText('Current: Shortlisted')).toBeVisible();
  await expect(owner.getByText('+2348035550000')).toBeVisible();
  await expect(owner.getByText('9 Mar 2000')).toBeVisible();

  // 7. A personalised message to everyone offered a place, by email and SMS.
  await owner.goto('/dashboard/kirkira/applications?status=offered');
  await owner.getByRole('link', { name: 'Message these applicants' }).click();
  await expect(owner.getByText(/^1 person/)).toBeVisible();
  await owner.getByRole('checkbox', { name: /Text message/ }).check();
  await owner.getByLabel('Subject').fill('Next steps for {programme}');
  await owner.getByRole('textbox', { name: 'Message', exact: true }).fill('Dear {first_name},\n\nPlease confirm your place by Friday.');
  await owner.getByRole('textbox', { name: 'Text message' }).fill('{hub}: Hi {first_name}, confirm your place by Friday. Ref {reference}');
  await owner.getByRole('button', { name: 'Send to 1 person' }).click();
  await expect(owner.getByText('Sent to 1 person: 1 emailed, 1 by SMS.')).toBeVisible();
  const note = await lastMail('aisha@example.com', /Next steps for iDICE Centre of Excellence Cohort 1/);
  expect(note.text).toContain('Dear Aisha,');
  const texts = readdirSync(join(process.cwd(), '.sms')).map((f) => JSON.parse(readFileSync(join(process.cwd(), '.sms', f), 'utf8')));
  expect(texts).toEqual([{ to: '+2348031234567', text: `Kirkira Innovation Hub: Hi Aisha, confirm your place by Friday. Ref ${reference}` }]);
  await expect(owner.getByText('1 recipient · 1 emailed · 1 by SMS')).toBeVisible();

  // 8. The milestone report: 1 applied here, 4 imported; 3 selected (1 offered, 2 accepted).
  await owner.goto('/dashboard/kirkira/reports');
  await expect(owner.getByRole('heading', { name: 'iDICE Centre of Excellence Cohort 1' })).toBeVisible();
  await expect(owner.getByText('1 applied here, 4 imported')).toBeVisible();
  await expect(owner.getByText('2 accepted, 1 offered')).toBeVisible();
  await expect(owner.getByText(/4 participants were selected on an external platform/)).toBeVisible();
  await expect(owner.getByText('100%').first()).toBeVisible(); // selection rate: the one applicant here was selected
  await expect(owner.getByText('to this programme or all applicants')).toBeVisible();
  if (process.env.REPORT_SHOT) {
    await owner.setViewportSize({ width: 900, height: 1200 });
    await owner.emulateMedia({ media: 'print' });
    await owner.screenshot({ path: process.env.REPORT_SHOT, fullPage: true });
  }
});

test('applicant data stays private', async ({ page }) => {
  // Anonymous visitors cannot open the dashboard, exports or files.
  await page.goto('/dashboard/kirkira/applications');
  await expect(page).toHaveURL(/\/sign-in/);
  const res = await page.request.get('/dashboard/kirkira/applications/export');
  expect(res.url()).toContain('/sign-in');
  const file = await page.request.get('/files/00000000-0000-0000-0000-000000000000');
  expect(file.status()).toBe(404);
});

test('a hub registers interest and the platform team sees it', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'I run a hub' }).click();
  await page.getByLabel('Hub or organisation').fill('Arewa Tech Hub');
  await page.getByLabel('Your name').fill('Musa Idris');
  await page.getByLabel('Email').fill('musa@arewatech.ng');
  await page.getByLabel('Phone (WhatsApp)').fill('0803 999 1234');
  await page.getByLabel('State').selectOption('Kano');
  await page.getByLabel('Learners per cohort').selectOption('50 to 100');
  await page.getByRole('button', { name: 'Register interest' }).last().click();
  await expect(page.getByText('Enquiry received')).toBeVisible();
  const alert = await lastMail('ops@talentral.ng', /New hub enquiry: Arewa Tech Hub/);
  expect(alert.replyTo).toBe('musa@arewatech.ng');

  const ops = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(ops, 'ops@talentral.ng');
  await ops.goto('/platform');
  await expect(ops.getByText('Arewa Tech Hub')).toBeVisible();
  await ops.getByRole('button', { name: 'contacted' }).first().click();
  await expect(ops.getByText('0 new')).toBeVisible();
});

test('a cohort runs from admission to the completion report', async ({ page, browser }) => {
  await signIn(page, 'owner@kirkira.ng');
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByLabel('Cohort name').fill('Cohort 1');
  await page.getByRole('button', { name: 'Create cohort' }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  const cohortUrl = new URL(page.url()).pathname;

  // Ibrahim and Fatima were imported as Accepted; Aisha is only offered, so she waits.
  await page.getByRole('button', { name: 'Add 2 accepted applicants' }).click();
  await expect(page.getByText('2 learners added to the cohort.')).toBeVisible();

  // A session that started ten minutes ago (the form takes West Africa Time).
  const wat = new Date(Date.now() + 60 * 60_000 - 10 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel('Session title').fill('Week 1: Kick-off');
  await page.getByLabel('Starts (WAT)').fill(wat);
  await page.getByLabel('Venue').fill('Kirkira training room');
  await page.getByRole('button', { name: 'Add session' }).click();
  await expect(page.getByText('“Week 1: Kick-off” added to the timetable.')).toBeVisible();
  await page.getByRole('link', { name: /Week 1: Kick-off/ }).click();
  await page.getByRole('button', { name: 'Open check-in' }).click();
  await expect(page.getByText('Open', { exact: true })).toBeVisible();
  const code = (await page.getByLabel(/^Check-in code/).textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // A learner checks in on their own phone with the code and the phone number they applied with.
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await learner.goto('/kirkira/checkin');
  await learner.getByLabel('Class code').fill(code.toLowerCase());
  await learner.getByLabel('Reference number or phone').fill('0806 000 0000');
  await learner.getByRole('button', { name: 'Check in' }).click();
  await expect(learner.getByText(/We could not find you in this class/)).toBeVisible();
  await learner.getByLabel('Reference number or phone').fill('0803 123 4567');
  await learner.getByRole('button', { name: 'Check in' }).click();
  await expect(learner.getByRole('heading', { name: "You're checked in, Ibrahim" })).toBeVisible();
  await expect(learner.getByText('Marked present')).toBeVisible();

  // The facilitator sees the check-in and marks the other learner absent.
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Attendance for Ibrahim Sani' }).getByRole('radio', { name: 'Present' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Attendance for Fatima Bello' }).getByRole('radio', { name: 'Absent' }).click();
  await expect(page.getByText('Absent 1')).toBeVisible();
  if (process.env.SHOTS) {
    await page.screenshot({ path: `${process.env.SHOTS}/register.png`, fullPage: true });
    await learner.screenshot({ path: `${process.env.SHOTS}/checkin.png`, fullPage: true });
  }

  // Completion: only Ibrahim meets the 75% bar.
  await page.goto(cohortUrl);
  await expect(page.getByText('1 active learner meets the 75% attendance bar.')).toBeVisible();
  await page.getByRole('button', { name: 'Select everyone who meets the bar' }).click();
  await page.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByText('1 learner marked as completed.')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cohort.png`, fullPage: true });

  await page.getByRole('link', { name: 'Completion report' }).click();
  await expect(page.getByRole('heading', { name: 'iDICE Centre of Excellence Cohort 1: Cohort 1' })).toBeVisible();
  await expect(page.getByText('2 selected on an external platform')).toBeVisible();
  await expect(page.getByText('50%').first()).toBeVisible(); // completion rate: 1 of 2
  await expect(page.getByRole('cell', { name: 'Week 1: Kick-off' })).toBeVisible();
});

test('assessments, then a verifiable certificate that can be revoked', async ({ page, browser }) => {
  await signIn(page, 'owner@kirkira.ng');

  // The programme's funder and partner go on its page and on its certificates.
  await page.goto('/dashboard/kirkira/programmes');
  await page.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).first().click();
  for (const [name, role, color] of [['iDICE', 'funder', '#1D4ED8'], ['Katsina ICT Agency', 'partner', '#047857'], ['Temporary Sponsor', 'sponsor', '#B45309']] as const) {
    await page.getByLabel('Organisation name').fill(name);
    await page.getByLabel('Role').selectOption(role);
    await page.getByLabel('Partner logo').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: await logoPng(page, name, color) });
    await page.getByRole('button', { name: 'Add partner' }).click();
    await expect(page.getByText(`${name} added.`)).toBeVisible();
  }
  const partnerList = page.getByRole('list', { name: 'Partners and sponsors' });
  await page.getByRole('button', { name: 'Move Katsina ICT Agency later' }).click();
  await expect(partnerList.getByRole('listitem').last()).toContainText('Katsina ICT Agency');
  page.once('dialog', (d) => d.accept());
  await partnerList.getByRole('listitem').filter({ hasText: 'Temporary Sponsor' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Partner removed.')).toBeVisible();
  await expect(partnerList.getByRole('listitem')).toHaveCount(2);
  if (process.env.SHOTS) await partnerList.locator('xpath=ancestor::div[contains(@class,"rounded")][1]').screenshot({ path: `${process.env.SHOTS}/partners.png` });
  await page.goto('/kirkira/apply/idice-centre-of-excellence-cohort-1');
  await expect(page.getByRole('heading', { name: 'Supported by' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'iDICE logo' })).toHaveJSProperty('complete', true);
  expect(await page.getByRole('img', { name: 'iDICE logo' }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(10);
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();

  await page.getByLabel('Assessment title').fill('Final project');
  await page.getByLabel('Scored out of').fill('20');
  await page.getByRole('button', { name: 'Add assessment' }).click();
  await expect(page.getByText('“Final project” added. Open it to enter scores.')).toBeVisible();
  await page.getByRole('link', { name: /Final project/ }).click();
  await page.getByLabel('Score for Ibrahim Sani').fill('16');
  await page.getByLabel('Feedback for Ibrahim Sani').click(); // moving on saves the score
  await expect(page.getByText('✓ Saved').first()).toBeVisible();
  await page.getByLabel('Score for Fatima Bello').fill('25');
  await page.getByLabel('Feedback for Fatima Bello').click();
  await expect(page.getByText('0 to 20')).toBeVisible(); // above the maximum is refused
  await page.getByLabel('Score for Fatima Bello').fill('5');
  await page.getByLabel('Feedback for Fatima Bello').fill('Resubmit with a working contact form.');
  await page.getByLabel('Score for Ibrahim Sani').click();
  await expect(page.getByText('✓ Saved')).toHaveCount(2);

  // Ibrahim completed in the previous journey: issue his certificate.
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await expect(page.getByRole('cell', { name: /80%/ })).toBeVisible();
  await page.getByRole('button', { name: 'Issue 1 certificate' }).click();
  await expect(page.getByText('1 certificate issued and emailed.')).toBeVisible();
  const mail = await lastMail('ibrahim@example.com', /Your certificate from Kirkira Innovation Hub/);
  const link = linkIn(mail.text);
  const serial = link.split('/').pop()!;
  expect(serial).toMatch(/^TAL-KIR-\d{2}-[0-9A-HJKMNP-TV-Z]{6}$/);

  // Anyone can verify it, by link or by number.
  const stranger = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await stranger.goto('/verify');
  await stranger.getByLabel('Certificate number').fill(serial.toLowerCase());
  await stranger.getByRole('button', { name: 'Verify' }).click();
  await expect(stranger.getByText('Verified: this certificate is genuine')).toBeVisible();
  await expect(stranger.getByText('Ibrahim Sani', { exact: true })).toBeVisible();
  await expect(stranger.getByText('80%')).toBeVisible();
  await expect(stranger.getByRole('img', { name: /QR code/ }).locator('svg')).toBeVisible();
  await expect(stranger.getByText('Revoke this certificate')).toHaveCount(0);
  await expect(stranger.getByText('Supported by')).toBeVisible();
  for (const alt of ['iDICE (Funder)', 'Katsina ICT Agency (Partner)']) {
    const img = stranger.getByRole('img', { name: alt });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(10);
  }
  if (process.env.SHOTS) {
    await stranger.setViewportSize({ width: 1280, height: 1000 });
    await stranger.screenshot({ path: `${process.env.SHOTS}/certificate.png`, fullPage: true });
  }

  // The certificate keeps the partners it was issued with, even if the programme's list changes.
  await page.goto('/dashboard/kirkira/programmes');
  await page.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('list', { name: 'Partners and sponsors' }).getByRole('listitem').filter({ hasText: 'Katsina ICT Agency' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Partner removed.')).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByRole('img', { name: 'Katsina ICT Agency (Partner)' })).toBeVisible();

  // The issuing hub can revoke it; the verification page then says so.
  await page.goto(new URL(link).pathname);
  await page.getByRole('button', { name: 'Revoke this certificate' }).click();
  await page.getByLabel('Reason for revoking').fill('Issued before final grading');
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('This certificate has been revoked')).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByText(/Reason: Issued before final grading/)).toBeVisible();
});

test('a learner publishes a Passport, is put forward, and is placed', async ({ page, browser }) => {
  const ctx = () => browser.newContext({ baseURL: 'http://localhost:3100' });

  // The hub confirms Fatima's completion and issues her certificate; the email invites her to a Passport.
  await signIn(page, 'owner@kirkira.ng');
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  const cohortUrl = new URL(page.url()).pathname;
  await page.getByLabel('Select Fatima Bello').check();
  await page.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByText('1 learner marked as completed.')).toBeVisible();
  await page.getByRole('button', { name: 'Issue 1 certificate' }).click();
  await expect(page.getByText('1 certificate issued and emailed.')).toBeVisible();
  const certMail = await lastMail('fatima@example.com', /Your certificate/);
  expect(certMail.html).toContain('/passport');

  // Fatima signs in with the email she applied with and lands on her Passport.
  const learner = await (await ctx()).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.goto('/passport');
  await expect(learner.getByRole('heading', { name: 'Fatima Bello' })).toBeVisible();
  await expect(learner.getByText('Ready', { exact: true }).first()).toBeVisible();
  await expect(learner.getByText('View certificate', { exact: false })).toBeVisible();
  await learner.getByRole('switch', { name: 'Visible to Talentral talent officers' }).click();
  await expect(learner.getByText(/Complete your Passport first/)).toBeVisible(); // not until it is complete

  await learner.getByLabel('Headline').fill('Junior frontend developer');
  await learner.getByLabel('About you').fill('I build responsive websites with HTML, CSS and React. My capstone was a booking site for a Katsina salon.');
  await learner.getByLabel('State').selectOption('Katsina');
  for (const skill of ['HTML and CSS', 'JavaScript', 'React']) {
    await learner.getByLabel('Skills').fill(skill);
    await learner.getByLabel('Skills').press('Enter');
  }
  await learner.getByText('Remote', { exact: true }).click();
  await learner.getByText('Full time', { exact: true }).click();
  await learner.locator('label', { hasText: /^English$/ }).click();
  await learner.locator('label', { hasText: /^Hausa$/ }).click();
  await learner.getByLabel('Link 1 name').fill('Portfolio');
  await learner.getByLabel('Link 1 address').fill('https://fatima.dev');
  await learner.getByLabel(/Show my attendance and assessment scores/).uncheck();
  await learner.getByRole('button', { name: 'Save Passport' }).click();
  await expect(learner.getByText('Passport saved.')).toBeVisible();
  await learner.getByRole('switch', { name: 'Visible to Talentral talent officers' }).click();
  await expect(learner.getByRole('switch', { name: 'Visible to Talentral talent officers' })).toHaveAttribute('aria-checked', 'true');
  await learner.getByRole('switch', { name: 'Share with employers I say yes to' }).click();
  await expect(learner.getByRole('switch', { name: 'Share with employers I say yes to' })).toHaveAttribute('aria-checked', 'true');
  await expect(learner.getByText('Visible to talent officers')).toBeVisible();
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/passport.png`, fullPage: true });

  // A talent officer finds her, records an employer and a role, and puts her forward.
  const officer = await (await ctx()).newPage();
  await signIn(officer, 'ops@talentral.ng');
  await officer.goto('/platform/talent?q=react');
  await expect(officer.getByRole('list', { name: 'Talent' }).getByText('Fatima Bello')).toBeVisible();
  if (process.env.SHOTS) await officer.screenshot({ path: `${process.env.SHOTS}/talent-search.png`, fullPage: true });
  await officer.goto('/platform/talent/employers');
  await officer.getByLabel('Employer name').fill('Arewa Tech Studio');
  await officer.getByLabel('Sector').fill('Software agency');
  await officer.getByLabel('Contact email').fill('hiring@arewatech.ng');
  await officer.getByRole('button', { name: 'Add employer' }).click();
  await officer.waitForURL(/employers\/[0-9a-f-]+$/);
  await officer.getByLabel('Role title').fill('Junior frontend developer');
  await officer.getByLabel('Required skills').fill('JavaScript, React, HTML');
  await officer.getByLabel('Pay from (₦ a month)').fill('150000');
  await officer.getByLabel('Pay up to (₦ a month)').fill('250000');
  await officer.getByRole('button', { name: 'Add role' }).click();
  await officer.waitForURL(/roles\/[0-9a-f-]+$/);
  const roleUrl = new URL(officer.url()).pathname;
  const suggestion = officer.getByRole('list', { name: 'Suggested matches' }).getByRole('listitem').filter({ hasText: 'Fatima Bello' });
  await expect(suggestion.getByText('Has 3 of 3 required skills: JavaScript, React, HTML')).toBeVisible();
  await expect(officer.getByRole('button', { name: 'Create employer link' })).toBeDisabled(); // nobody has said yes
  await suggestion.getByRole('button', { name: 'Put forward Fatima Bello' }).click();
  await expect(officer.getByRole('list', { name: 'Candidates' }).getByText('Awaiting reply')).toBeVisible();

  // She says yes from her Passport.
  const offer = await lastMail('fatima@example.com', /You have been put forward for Junior frontend developer/);
  expect(offer.text).toContain('Arewa Tech Studio');
  await learner.reload();
  await learner.getByRole('button', { name: 'I am interested in Junior frontend developer' }).click();
  await expect(learner.getByText(/You said yes/)).toBeVisible();

  // The officer shares a private link; the employer sees only what she consented to.
  await officer.reload();
  await officer.getByLabel('Stage for Fatima Bello').selectOption('interviewed');
  await officer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(officer.getByText('Saved.')).toBeVisible();
  await officer.getByRole('button', { name: 'Create employer link' }).click();
  const shareUrl = await officer.getByRole('textbox', { name: 'Employer link' }).inputValue();
  expect(shareUrl).toMatch(/\/shortlist\/[\w-]{40,}$/);
  if (process.env.SHOTS) await officer.screenshot({ path: `${process.env.SHOTS}/role.png`, fullPage: true });

  const employer = await (await ctx()).newPage();
  await employer.goto(new URL(shareUrl).pathname);
  await expect(employer.getByRole('heading', { name: 'Junior frontend developer' })).toBeVisible();
  await expect(employer.getByRole('heading', { name: 'Fatima Bello' })).toBeVisible();
  await expect(employer.getByRole('article').getByText('Platform-evidenced').first()).toBeVisible();
  await expect(employer.getByRole('link', { name: /TAL-KIR-\d{2}-/ })).toBeVisible();
  await expect(employer.getByText('fatima@example.com')).toHaveCount(0);
  await expect(employer.getByText('attendance')).toHaveCount(0); // she chose to hide scores
  if (process.env.SHOTS) await employer.screenshot({ path: `${process.env.SHOTS}/shortlist.png`, fullPage: true });
  await learner.reload();
  await expect(learner.getByText(/The employer has opened your Passport/)).toBeVisible();

  // Placement is recorded with its details and flows into the hub's completion report as a count.
  await officer.reload();
  await officer.getByLabel('Stage for Fatima Bello').selectOption('placed');
  await officer.getByLabel('Type of work').selectOption('full_time');
  await officer.getByLabel('Start date').fill('2026-11-02');
  await officer.getByLabel('Pay band').fill('₦200k a month');
  await officer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(officer.getByText('Placement recorded.')).toBeVisible();
  await officer.getByRole('button', { name: 'Revoke' }).click();
  await expect(officer.getByRole('list', { name: 'Shared links' }).getByText('Revoked')).toBeVisible();
  await employer.reload();
  await expect(employer.getByText('This link is no longer available')).toBeVisible();

  await page.goto(`${cohortUrl}/report`);
  await expect(page.getByText('Placed in work')).toBeVisible();

  // Withdrawing visibility takes her out of search at once.
  await learner.reload();
  await learner.getByRole('switch', { name: 'Visible to Talentral talent officers' }).click();
  await expect(learner.getByText('Private', { exact: true })).toBeVisible();
  await officer.goto('/platform/talent');
  await expect(officer.getByText('No visible Passports yet')).toBeVisible();
  await officer.goto(roleUrl);
  await expect(officer.getByText('Withdrew visibility')).toBeVisible();
});

test('skills evidence, employer self-service, and the impact dashboard', async ({ page, browser }) => {
  const ctx = () => browser.newContext({ baseURL: 'http://localhost:3100', acceptDownloads: true });

  // The hub adds its own skill to the shared list, then tags an assessment with skills.
  await signIn(page, 'owner@kirkira.ng');
  await page.goto('/dashboard/kirkira/skills');
  await expect(page.getByRole('heading', { name: 'Software Development' })).toBeVisible();
  await page.getByLabel('Skill name').fill('Booking sites for local businesses');
  await page.getByRole('combobox', { name: /^Track/ }).fill('Software Development');
  await page.getByLabel('Counts as (platform skill)').selectOption({ label: 'HTML and CSS' });
  await page.getByRole('button', { name: 'Add skill' }).click();
  await expect(page.getByText('“Booking sites for local businesses” added to Software Development.')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/skills.png`, fullPage: true });

  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  await page.getByLabel('Assessment title').fill('Capstone: a booking site');
  await page.getByLabel('Scored out of').fill('20');
  const chip = (name: string | RegExp) => page.locator('label').filter({ has: page.getByRole('checkbox', { name }) });
  await chip('React').click();
  await chip(/Booking sites for local businesses/).click();
  await expect(page.getByRole('checkbox', { name: 'React' })).toBeChecked();
  await page.getByRole('button', { name: 'Add assessment' }).click();
  await expect(page.getByText('“Capstone: a booking site” added. Open it to enter scores.')).toBeVisible();
  await page.getByRole('link', { name: /Capstone: a booking site/ }).click();
  await page.getByLabel('Score for Fatima Bello').fill('18');
  await page.getByLabel('Feedback for Fatima Bello').click();
  await expect(page.getByText('✓ Saved').first()).toBeVisible();

  // Fatima sees the evidence and opens her Passport to verified employers.
  const learner = await (await ctx()).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.goto('/passport');
  const shown = learner.getByRole('heading', { name: 'Skills shown in graded work' }).locator('xpath=ancestor::section[1]');
  await expect(shown.getByText('React', { exact: true })).toBeVisible();
  await expect(shown.getByText('HTML and CSS', { exact: true })).toBeVisible(); // the hub skill counts as its platform skill
  await learner.getByRole('switch', { name: 'Let verified employers find me' }).click();
  await expect(learner.getByRole('switch', { name: 'Let verified employers find me' })).toHaveAttribute('aria-checked', 'true');

  // An employer registers; it stays pending until a talent officer verifies it.
  const boss = await (await ctx()).newPage();
  await boss.goto('/employers');
  if (process.env.SHOTS) await boss.screenshot({ path: `${process.env.SHOTS}/employers.png`, fullPage: true });
  await boss.getByLabel('Organisation name').fill('Sahel Digital');
  await boss.getByLabel('Sector').fill('Software agency');
  await boss.getByLabel('State').selectOption('Kano');
  await boss.getByLabel('Team size').selectOption('11-50');
  await boss.getByLabel('Your name').fill('Zainab Musa');
  await boss.getByLabel('Work email').fill('talent@saheldigital.ng');
  await boss.getByLabel('Phone').fill('0803 222 3333');
  await boss.getByLabel('Roles you hire for').fill('React developers for client projects');
  await boss.getByRole('button', { name: 'Register and get my sign-in link' }).click();
  await expect(boss.getByText(/Confirm you will use candidate information/)).toBeVisible();
  await boss.getByRole('checkbox', { name: /I will use candidate information only to recruit/ }).check();
  await boss.getByRole('button', { name: 'Register and get my sign-in link' }).click();
  await expect(boss.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await lastMail('ops@talentral.ng', /Employer to verify: Sahel Digital/);
  await signIn(boss, 'talent@saheldigital.ng', /\/employer/);
  await expect(boss.getByText('We are verifying your organisation')).toBeVisible();
  await expect(boss.getByRole('heading', { name: 'Post a job' })).toHaveCount(0);

  const officer = await (await ctx()).newPage();
  await signIn(officer, 'ops@talentral.ng');
  await officer.goto('/platform/talent/employers');
  await officer.getByRole('link', { name: /Sahel Digital/ }).click();
  await officer.getByRole('button', { name: 'Verify employer' }).click();
  await expect(officer.getByText(/Verified\. The employer has been emailed/)).toBeVisible();
  await lastMail('talent@saheldigital.ng', /Sahel Digital is verified on Talentral/);

  // Verified, the employer posts a job and sees ranked matches with reasons.
  await boss.goto('/employer');
  await boss.getByLabel('Job title').fill('React developer');
  await boss.getByLabel('Required skills').fill('React, JavaScript');
  await boss.getByLabel('Pay from (₦ a month)').fill('200000');
  await boss.getByLabel('Pay up to (₦ a month)').fill('300000');
  await boss.getByLabel('Job description').fill('Build booking and e-commerce sites for clients across Northern Nigeria. Remote, with a weekly team call.');
  await boss.getByRole('button', { name: 'Publish job and see matches' }).click();
  await boss.waitForURL(/employer\/jobs\/[0-9a-f-]+\?posted=1/);
  const match = boss.getByRole('list', { name: 'Ranked matches' }).getByRole('listitem').filter({ hasText: 'Fatima Bello' });
  await expect(match.getByText('Shown in graded work: React')).toBeVisible();
  await match.getByRole('button', { name: 'Invite Fatima Bello' }).click();
  await expect(boss.getByRole('list', { name: 'Invited' }).getByText('Fatima Bello')).toBeVisible(); // moves from matches to invited
  await expect(boss.getByRole('list', { name: 'Invited' }).getByText('Awaiting reply')).toBeVisible();
  if (process.env.SHOTS) await boss.screenshot({ path: `${process.env.SHOTS}/employer-job.png`, fullPage: true });

  await lastMail('fatima@example.com', /Sahel Digital invited you to apply: React developer/);
  await learner.reload();
  await expect(learner.getByText(/Sahel Digital found your Passport and invited you/)).toBeVisible();
  await learner.getByRole('button', { name: 'I am interested in React developer' }).click();
  await expect(learner.getByText(/You said yes/).first()).toBeVisible();

  // Contact details appear once she says yes; the hire and the 90-day check are recorded.
  await boss.reload();
  const interested = boss.getByRole('list', { name: 'Interested candidates' });
  await expect(interested.getByRole('link', { name: 'fatima@example.com' })).toBeVisible();
  await boss.getByLabel('Stage for Fatima Bello').selectOption('placed');
  await boss.getByLabel('Type of work').selectOption('full_time');
  await boss.getByLabel('Start date').fill(new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10));
  await boss.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(boss.getByText(/90-day check: is Fatima still working with you/)).toBeVisible();
  await boss.getByRole('button', { name: 'Yes, still with us' }).click();
  await expect(boss.getByText('90-day check: still working with you.')).toBeVisible();

  // The hub's Impact dashboard follows people from application to work, and exports for M&E.
  await page.goto('/dashboard/kirkira/impact');
  await expect(page.getByRole('heading', { name: 'From application to work' }).first()).toBeVisible();
  await expect(page.getByText('Placed in work').first()).toBeVisible();
  await page.getByRole('link', { name: 'LGA' }).click();
  await expect(page.getByRole('columnheader', { name: 'LGA' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/impact.png`, fullPage: true });
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^kirkira-learners-anonymised-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = readFileSync((await xlsx.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.toString('utf8')).not.toContain('Fatima');
  await page.getByLabel(/Anonymise/).uncheck();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  const text = readFileSync((await csv.path())!, 'utf8');
  expect(text).toContain('Fatima Bello');
  expect(text).toContain('Ready');

  await officer.goto('/platform/impact');
  await expect(officer.getByRole('link', { name: 'Kirkira Innovation Hub' })).toBeVisible();
});

test('a hub builds a course; a learner studies, takes a quiz offline and hands in work', async ({ page, browser }) => {
  const ctx = () => browser.newContext({ baseURL: 'http://localhost:3100' });
  await signIn(page, 'owner@kirkira.ng');

  // Build a course: reading (with Hausa), video, PDF, quiz and assignment, and a later module.
  await page.goto('/dashboard/kirkira/courses');
  await page.getByLabel('Course title').fill('Web development foundations');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.waitForURL(/courses\/[0-9a-f-]+\?created=1/);
  const courseUrl = new URL(page.url()).pathname;
  const addLesson = async (kind: string, title: string) => {
    await page.goto(courseUrl);
    await page.getByLabel('Lesson type').first().selectOption(kind);
    await page.getByLabel('New lesson title').first().fill(title);
    await page.getByRole('button', { name: 'Add lesson' }).first().click();
    await page.waitForURL(/lessons\/[0-9a-f-]+$/);
  };
  const save = async () => { await page.getByRole('button', { name: 'Save lesson' }).click(); await expect(page.getByText('Lesson saved.')).toBeVisible(); };

  await addLesson('text', 'What is HTML?');
  await page.locator('#ls-title-ha').fill('Menene HTML?');
  await page.getByLabel('Lesson text in English').fill('# Tags\n\nHTML gives a page its **structure**.\n\n- Headings\n- Paragraphs');
  await page.getByRole('tab', { name: 'Hausa' }).click();
  await page.getByLabel('Lesson text in Hausa').fill('# Alamomi\n\nHTML yana ba shafi **tsari**.');
  await page.locator('#ls-minutes').fill('10');
  await save();
  await expect(page.locator('.lesson-prose h2', { hasText: 'Tags' })).toBeVisible(); // preview

  await addLesson('video', 'Your first page');
  await page.getByLabel('YouTube or Vimeo link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await save();

  await addLesson('pdf', 'HTML cheat sheet');
  await page.locator('#ls-file').setInputFiles({ name: 'cheatsheet.pdf', mimeType: 'application/pdf', buffer: PDF });
  await save();
  await page.reload();
  await expect(page.getByText(/Current file: cheatsheet\.pdf/)).toBeVisible();

  await addLesson('quiz', 'HTML check');
  await page.getByLabel('Question', { exact: true }).fill('What does HTML stand for?');
  await page.getByLabel('Answer 1', { exact: true }).fill('HyperText Markup Language');
  await page.getByLabel('Answer 2', { exact: true }).fill('High Tech Modern Language');
  await page.getByLabel('Answer 1 is right').check();
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('1 question · 1 points')).toBeVisible();
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByLabel('Type').selectOption('true_false');
  await page.getByLabel('Question', { exact: true }).fill('A <p> tag makes a paragraph.');
  await page.getByLabel('Answer 1 is right').check();
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('2 questions · 2 points')).toBeVisible();
  await page.getByLabel('Pass mark (%)').fill('100');
  await page.getByLabel('Attempts allowed').fill('3');
  await save();

  await addLesson('assignment', 'Build your first page');
  await page.getByLabel('Instructions in English').fill('Build a one-page site about your hub and share the link.');
  await page.locator('label').filter({ has: page.getByRole('checkbox', { name: 'HTML and CSS' }) }).click();
  await save();

  await page.goto(courseUrl);
  await page.getByLabel('New module').fill('Week 9: Deploying');
  await page.getByRole('button', { name: 'Add module' }).click();
  const week9 = page.getByRole('heading', { name: 'Week 9: Deploying' }).locator('xpath=ancestor::div[contains(@class,"p-5")][1]');
  await week9.getByText('Module settings').click();
  await week9.getByLabel('Opens (days after cohort start)').fill('60');
  await week9.getByRole('button', { name: 'Save module' }).click();
  await expect(week9.getByText('Opens 60 days after the cohort starts')).toBeVisible();
  await week9.getByLabel('New lesson title').fill('Going live');
  await week9.getByRole('button', { name: 'Add lesson' }).click();
  await page.waitForURL(/lessons\//);
  await page.getByLabel('Lesson text in English').fill('Publish your site with GitHub Pages.');
  await save();
  await page.goto(courseUrl);
  await page.getByRole('button', { name: 'Publish course' }).click();
  await expect(page.getByText(/^Published\./)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-builder.png`, fullPage: true });

  // Cohort 1 follows the course; its quiz and assignment join the gradebook.
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  await page.getByLabel('Course for this cohort').selectOption({ label: 'Web development foundations' });
  await page.getByRole('button', { name: 'Use this course' }).click();
  await expect(page.getByText(/now follows the course/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /HTML check/ })).toBeVisible();
  await page.getByLabel('Cohort starts').fill(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('form').filter({ has: page.getByLabel('Cohort starts') }).getByText('✓')).toBeVisible();

  // Fatima studies: reading in Hausa and English, video, PDF.
  const learner = await (await ctx()).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await expect(learner.getByRole('link', { name: 'Web development foundations', exact: true })).toBeVisible();
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/learn.png`, fullPage: true });
  await learner.getByRole('link', { name: 'Start' }).click();
  await expect(learner.getByRole('heading', { name: 'What is HTML?' })).toBeVisible();
  await expect(learner.locator('.lesson-prose strong', { hasText: 'structure' })).toBeVisible();
  await learner.getByRole('radio', { name: 'Hausa' }).click();
  await expect(learner.getByRole('heading', { name: 'Menene HTML?' })).toBeVisible();
  await learner.getByRole('radio', { name: 'English' }).click();
  await expect(learner.getByRole('heading', { name: 'What is HTML?' })).toBeVisible();
  await learner.getByRole('button', { name: 'Mark as complete' }).click();
  await expect(learner.getByText('✓ Completed')).toBeVisible();
  await learner.getByRole('link', { name: /Next: Your first page/ }).click();
  await expect(learner.locator('iframe[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
  await learner.getByRole('link', { name: /Next: HTML cheat sheet/ }).click();
  const pdf = await learner.request.get(await learner.getByRole('link', { name: 'Open' }).getAttribute('href') as string);
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  // The quiz: a wrong first try, then a right one sent while offline and delivered on reconnect.
  await learner.getByRole('link', { name: /Next: HTML check/ }).click();
  await learner.getByRole('radio', { name: 'High Tech Modern Language' }).check();
  await learner.getByRole('radio', { name: 'True' }).check();
  await learner.getByRole('button', { name: 'Submit answers' }).click();
  await expect(learner.getByText('50% · Not yet')).toBeVisible();
  await expect(learner.getByText('Right answer')).toHaveCount(0); // answers stay hidden until passed
  await learner.getByRole('radio', { name: 'HyperText Markup Language' }).check();
  await learner.getByRole('radio', { name: 'True' }).check();
  await learner.context().setOffline(true);
  await learner.getByRole('button', { name: 'Submit answers' }).click();
  await expect(learner.getByText(/Your answers are saved on this phone/)).toBeVisible();
  await learner.context().setOffline(false);
  await expect(learner.getByText('100% · Passed')).toBeVisible();
  await expect(learner.getByText('✓ Right answer').first()).toBeVisible();
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/quiz.png`, fullPage: true });

  // The assignment: handed in, sent back with feedback, handed in again, graded.
  await learner.getByRole('link', { name: /Next: Build your first page/ }).click();
  await learner.getByLabel('Your answer').fill('My page introduces Kirkira Innovation Hub.');
  await learner.getByLabel('Link to your work').fill('https://fatima.dev/kirkira');
  await learner.getByRole('button', { name: 'Hand in', exact: true }).click();
  await expect(learner.getByText(/^Handed in\./)).toBeVisible();

  await page.goto('/dashboard/kirkira/grading');
  const work = page.getByRole('list', { name: 'Submissions' }).getByRole('listitem').filter({ hasText: 'Fatima Bello' });
  await expect(work.getByRole('link', { name: /fatima\.dev\/kirkira/ })).toBeVisible();
  await work.getByLabel('Feedback for Fatima Bello').fill('Add a contact section with the hub address.');
  await work.getByRole('button', { name: 'Ask to try again' }).click();
  await expect(page.getByText(/Sent back to Fatima/)).toBeVisible();
  await lastMail('fatima@example.com', /Please try again: Build your first page/);

  await learner.reload();
  await expect(learner.getByText('Add a contact section with the hub address.')).toBeVisible();
  await learner.getByLabel('Your answer').fill('Now with a contact section.');
  await learner.getByRole('button', { name: 'Hand in', exact: true }).click();
  await expect(learner.getByText(/^Handed in\./)).toBeVisible();

  await page.reload();
  await page.getByLabel('Score for Fatima Bello').fill('85');
  await page.getByLabel('Feedback for Fatima Bello').fill('Clear and well structured.');
  await page.getByRole('button', { name: 'Save grade' }).click();
  await expect(page.getByText(/Graded 85% and emailed to Fatima/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/grading.png`, fullPage: true });
  await lastMail('fatima@example.com', /Your work was graded: Build your first page/);

  await learner.reload();
  await expect(learner.getByText('Graded · 85%')).toBeVisible();
  await learner.goto(new URL(learner.url()).pathname.split('/').slice(0, 3).join('/'));
  await expect(learner.getByText(/Opens \d+ \w+ \d{4}/)).toBeVisible(); // week 9 is still locked
  await expect(learner.getByText('Locked')).toBeVisible();
});

test('live classes: join from Talentral, rotating QR, confirmed register, announcements and reminders', async ({ page, browser }) => {
  const ctx = () => browser.newContext({ baseURL: 'http://localhost:3100' });
  const wat = (minutesFromNow: number) => new Date(Date.now() + 60 * 60_000 + minutesFromNow * 60_000).toISOString().slice(0, 16);
  await signIn(page, 'owner@kirkira.ng');
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  const cohortUrl = new URL(page.url()).pathname;

  // A hybrid class that started five minutes ago, and an online one starting in 25 minutes.
  const addSession = async (title: string, start: number, mode: string, link: string) => {
    await page.getByLabel('Session title').fill(title);
    await page.getByLabel('Starts (WAT)').fill(wat(start));
    await page.getByLabel('Format').selectOption(mode);
    await page.getByLabel('Meeting link (online or hybrid)').fill(link);
    await page.getByRole('button', { name: 'Add session' }).click();
    await expect(page.getByText(`“${title}” added to the timetable.`)).toBeVisible();
  };
  await addSession('Live: CSS layouts', -5, 'hybrid', 'https://meet.google.com/abc-defg-hij');
  await addSession('Evening review', 25, 'online', 'https://zoom.us/j/123456789');

  await page.getByLabel('Announcement title').fill('Bring your laptop');
  await page.getByLabel('Message').fill('Today we build a responsive page together. Charge your laptop.');
  await page.getByRole('button', { name: 'Post announcement' }).click();
  await expect(page.getByText(/^Posted to \d+ learners?, \d+ emailed\./)).toBeVisible();
  await lastMail('fatima@example.com', /Kirkira Innovation Hub: Bring your laptop/);

  // Fatima sees the class is live and the announcement, and joins from Talentral.
  const learner = await (await ctx()).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await expect(learner.getByText('Live now')).toBeVisible();
  await expect(learner.getByRole('region', { name: 'Announcements' }).getByText('Bring your laptop')).toBeVisible();
  const joinHref = await learner.getByRole('region', { name: 'Class now' }).getByRole('link', { name: /Join class/ }).getAttribute('href');
  const joined = await learner.request.get(joinHref!, { maxRedirects: 0 });
  expect(joined.status()).toBe(302);
  expect(joined.headers().location).toBe('https://meet.google.com/abc-defg-hij');
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/learn-live.png`, fullPage: true });

  // The room screen shows a QR code that changes every minute; scanning it checks a learner in.
  await page.getByRole('link', { name: /Live: CSS layouts/ }).click();
  await expect(page.getByText('joined online')).toBeVisible();
  const sessionId = page.url().split('/').pop()!;
  await page.getByRole('link', { name: 'Show check-in QR' }).click();
  await expect(page.getByRole('img', { name: 'Check-in QR code' }).locator('svg')).toBeVisible();
  await expect(page.getByText(/New code in \d+s/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/qr-screen.png` });
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  const [{ t: token }] = await db`select app.qr_token(qr_secret, floor(extract(epoch from now()) / 60)::bigint) as t from class_sessions where id = ${sessionId}`;
  await learner.goto(`/learn/checkin/${sessionId}?t=deadbeef00`);
  await expect(learner.getByText('Check-in did not work')).toBeVisible();
  await learner.goto(`/learn/checkin/${sessionId}?t=${token}`);
  await expect(learner.getByRole('heading', { name: "You're checked in, Fatima" })).toBeVisible();

  // The facilitator confirms the register; the recording goes up after class.
  await page.getByRole('link', { name: 'Close' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm register' }).click();
  await expect(page.getByText('Register confirmed', { exact: true })).toBeVisible();
  await page.getByLabel('Recording link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Save links' }).click();
  await expect(page.getByText('✓ Links saved.')).toBeVisible();
  const [{ n }] = await db`select count(*)::int as n from attendance where session_id = ${sessionId} and status = 'absent'`;
  expect(n).toBeGreaterThan(0); // Ibrahim never joined: recorded absent

  // Reminders: only with the secret, and never twice.
  expect((await learner.request.get('/api/cron/reminders')).status()).toBe(401);
  const run = await learner.request.get('/api/cron/reminders', { headers: { Authorization: 'Bearer e2e-cron-secret' } });
  expect(await run.json()).toMatchObject({ ok: true, soon: 1 });
  await lastMail('fatima@example.com', /Starting soon: Evening review/);
  const again = await learner.request.get('/api/cron/reminders', { headers: { Authorization: 'Bearer e2e-cron-secret' } });
  expect(await again.json()).toMatchObject({ soon: 0 });
  await db.end();
  await page.goto(cohortUrl);
  await expect(page.getByText(/1 of \d+ read on Talentral/)).toBeVisible();
});

test('phone sign-in, Hausa screens, and studying offline from the installed app', async ({ browser, request }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const learner = await context.newPage();
  const smsTo = (phone: string) => (existsSync(join(process.cwd(), '.sms')) ? readdirSync(join(process.cwd(), '.sms')) : []).filter((f) => f.endsWith(`-${phone}.json`)).sort()
    .map((f) => JSON.parse(readFileSync(join(process.cwd(), '.sms', f), 'utf8')) as { text: string });

  // The sign-in screen switches to Hausa before signing in, and back.
  await learner.goto('/sign-in');
  await learner.getByRole('radio', { name: 'Hausa' }).click();
  await expect(learner.getByRole('heading', { name: 'Shiga' })).toBeVisible();
  await learner.getByRole('radio', { name: 'English' }).click();
  await expect(learner.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Fatima signs in with the phone number on her application.
  await learner.getByRole('tab', { name: /Phone/ }).click();
  await learner.getByLabel('Mobile number').fill('0803 555');
  await learner.getByRole('button', { name: 'Text me a code' }).click();
  await expect(learner.getByText('Enter a Nigerian mobile number')).toBeVisible();
  await learner.getByLabel('Mobile number').fill('0803 555 1234');
  await learner.getByRole('button', { name: 'Text me a code' }).click();
  await expect(learner.getByText(/a code is on its way to 0803 \*\*\* 1234/)).toBeVisible();
  await expect.poll(() => smsTo('2348035551234').length).toBeGreaterThan(0);
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/phone-sign-in.png`, fullPage: true });
  const code = /(\d{6})/.exec(smsTo('2348035551234').at(-1)!.text)![1]!;
  await learner.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
  await learner.getByRole('button', { name: 'Sign in' }).click();
  await expect(learner.getByText('That code is not right')).toBeVisible();
  await learner.getByLabel('6-digit code').fill(code);
  await learner.getByRole('button', { name: 'Sign in' }).click();
  await learner.waitForURL(/\/learn/);
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  const [linked] = await db`select phone from users where email = 'fatima@example.com'`;
  expect(linked!.phone).toBe('2348035551234');
  // A code works once.
  const [used] = await db`select count(*)::int as n from phone_codes where phone = '2348035551234' and used_at is null`;
  expect(used!.n).toBe(0);
  await db.end();

  // The whole learner area follows the language switch, and so does her Passport.
  await learner.getByRole('radio', { name: 'Hausa' }).click();
  await expect(learner.getByRole('link', { name: 'Karatuna' })).toBeVisible();
  await learner.getByRole('link', { name: 'Fasfo' }).click();
  await expect(learner.getByRole('heading', { name: 'Sirri da amincewa' })).toBeVisible();
  await expect(learner.getByRole('button', { name: 'Ajiye Fasfo' })).toBeVisible();
  await learner.getByRole('radio', { name: 'English' }).click();
  await expect(learner.getByRole('heading', { name: 'Privacy and consent' })).toBeVisible();

  // Installable: a manifest with icons, and the offline worker.
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Talentral');
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  expect((await request.get('/icons/icon-512.png')).status()).toBe(200);
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['cache-control']).toContain('no-cache');

  // She downloads the course on Wi-Fi.
  await learner.goto('/learn');
  await learner.getByRole('link', { name: 'Web development foundations', exact: true }).click();
  await learner.waitForURL(/\/learn\/[0-9a-f-]+$/);
  const courseUrl = new URL(learner.url()).pathname;
  await learner.evaluate(() => navigator.serviceWorker.ready);
  await learner.getByRole('button', { name: 'Download for offline' }).click();
  await expect(learner.getByText('Saved for offline')).toBeVisible({ timeout: 30_000 });
  await expect(learner.getByText(/1 video lesson on YouTube or Vimeo still need/)).toBeVisible();
  const pdfLesson = await learner.getByRole('link', { name: /HTML cheat sheet/ }).getAttribute('href');
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/offline-course.png`, fullPage: true });

  // No connection: saved lessons and their files still open, other pages show the offline screen.
  const cutOff = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
  await context.route('**/*', cutOff);
  await context.setOffline(true);
  await learner.goto(pdfLesson!);
  await expect(learner.getByRole('heading', { name: 'HTML cheat sheet' })).toBeVisible();
  await expect(learner.getByText('You are offline.')).toBeVisible();
  const file = await learner.evaluate(async (url) => (await fetch(url)).status, pdfLesson!.replace('/learn/', '/learn/media/'));
  expect(file).toBe(200);
  await learner.goto(courseUrl);
  await expect(learner.getByRole('heading', { name: 'Web development foundations' })).toBeVisible();
  await learner.goto('/passport/preview');
  await expect(learner.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(learner.getByRole('link', { name: /Web development foundations/ })).toBeVisible();
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/offline-page.png`, fullPage: true });
  await context.setOffline(false);
  await context.unroute('**/*', cutOff);

  // Signing out removes her saved lessons from the phone.
  await learner.goto('/learn');
  await learner.getByRole('button', { name: 'Sign out' }).click();
  await learner.waitForURL(/\/(sign-in)?$/);
  await expect.poll(() => learner.evaluate(async () => (await (await caches.open('talentral-media')).keys()).length)).toBe(0);
});

test('two-step sign-in, class discussion, audit log and a copy of your own data', async ({ page, browser }) => {
  const ctx = async () => (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  const code = (secret: string) => codeAt(secret.replace(/\s/g, ''), stepAt(Date.now()));

  // Fatima asks a question in her cohort's discussion.
  const learner = await ctx();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.getByRole('link', { name: /Class discussion/ }).first().click();
  await expect(learner.getByRole('heading', { name: 'Discussion' })).toBeVisible();
  await learner.getByLabel('Title').fill('How do I publish my page?');
  await learner.getByLabel('Your question or post').fill('I finished the HTML lesson but GitHub Pages shows a 404.');
  await learner.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(learner.getByRole('heading', { name: 'How do I publish my page?' })).toBeVisible();
  const threadPath = new URL(learner.url()).pathname;

  // The owner turns on two-step sign-in and saves her recovery codes.
  await signIn(page, 'owner@kirkira.ng');
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Set up two-step sign-in' }).click();
  await expect(page.getByRole('img', { name: 'Two-step setup QR code' })).toBeVisible();
  const ownerSecret = (await page.getByTestId('totp-secret').textContent())!;
  await page.getByLabel('Code from the app').fill('000000' === code(ownerSecret) ? '111111' : '000000');
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByText('That code is not right')).toBeVisible();
  await page.getByLabel('Code from the app').fill(code(ownerSecret));
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByText('Two-step sign-in is on')).toBeVisible();
  const recovery = await page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem').allTextContents();
  expect(recovery).toHaveLength(10);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/two-step-codes.png`, fullPage: true });

  // She requires it for the whole team and invites a reviewer.
  await page.goto('/dashboard/kirkira/team');
  const policy = page.getByRole('switch', { name: 'Require two-step sign-in for this team' });
  await policy.click();
  await expect(policy).toHaveAttribute('aria-checked', 'true');
  await page.locator('#invite-email').fill('reviewer@kirkira.ng');
  await page.getByLabel('Role').selectOption('reviewer');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('Invitation sent to reviewer@kirkira.ng.')).toBeVisible();

  // The reviewer joins and has to set up two-step sign-in before seeing the dashboard.
  const reviewer = await ctx();
  await reviewer.goto(linkIn((await lastMail('reviewer@kirkira.ng', /invited to/)).text));
  await reviewer.getByLabel('Your full name').fill('Musa Reviewer');
  await reviewer.getByRole('button', { name: 'Accept and continue' }).click();
  await reviewer.waitForURL(/\/account\/security\?required=kirkira/);
  await expect(reviewer.getByText('Your hub requires two-step sign-in')).toBeVisible();
  await reviewer.getByRole('button', { name: 'Set up two-step sign-in' }).click();
  const reviewerSecret = (await reviewer.getByTestId('totp-secret').textContent())!;
  await reviewer.getByLabel('Code from the app').fill(code(reviewerSecret));
  await reviewer.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await reviewer.getByRole('link', { name: 'Continue to your hub →' }).click();
  await reviewer.waitForURL('**/dashboard/kirkira');
  await page.reload();
  await expect(page.getByText('2 of 2 members have it on.')).toBeVisible();

  // The owner answers in the discussion and pins it; Fatima sees the reply marked as the hub team.
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByRole('link', { name: /Cohort 1/ }).click();
  await page.getByRole('link', { name: /Discussion/ }).click();
  await page.getByRole('link', { name: /How do I publish my page\?/ }).click();
  await page.getByLabel('Your reply').fill('Check the repository is public and the file is called index.html.');
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByText('1 reply')).toBeVisible();
  await page.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin' })).toBeVisible();
  await learner.goto(threadPath);
  await expect(learner.getByText('Check the repository is public')).toBeVisible();
  await expect(learner.getByText('Hub team').first()).toBeVisible();
  await expect(learner.getByText('Pinned')).toBeVisible();
  if (process.env.SHOTS) await learner.screenshot({ path: `${process.env.SHOTS}/discussion.png`, fullPage: true });

  // Signing in now takes a second step; a recovery code works once.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill('owner@kirkira.ng');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(linkIn((await lastMail('owner@kirkira.ng', /sign-in link/)).text));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/auth/two-step');
  await page.getByLabel('Authenticator code').fill(code(ownerSecret) === '123456' ? '654321' : '123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That code is not right')).toBeVisible();
  await page.getByRole('button', { name: /Use a recovery code/ }).click();
  await page.getByLabel('Recovery code').fill(recovery[0]!.toLowerCase());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/account/security');
  await expect(page.getByText('9 unused recovery codes.')).toBeVisible();

  // The audit log shows who did what, filtered and as CSV.
  await page.goto('/dashboard/kirkira/audit?group=hub');
  await expect(page.getByText(/required two-step sign-in for the team/)).toBeVisible();
  await page.goto('/dashboard/kirkira/audit?group=discussion');
  await expect(page.getByText('Nothing recorded')).toBeVisible(); // pinning is not a sensitive change
  const csv = await (await page.request.get('/dashboard/kirkira/audit/export?group=member')).text();
  expect(csv).toContain('member.invited');
  expect(csv).toContain('member.joined');
  if (process.env.SHOTS) { await page.goto('/dashboard/kirkira/audit'); await page.screenshot({ path: `${process.env.SHOTS}/audit.png`, fullPage: true }); }

  // Fatima downloads a copy of her data; the download itself is audited for the platform team.
  const mine = await (await learner.request.get('/account/export')).json();
  expect(mine.account.email).toBe('fatima@example.com');
  expect(mine.discussion_threads.map((t: { title: string }) => t.title)).toContain('How do I publish my page?');
  expect(mine.enrolments.length).toBeGreaterThan(0);
  const ops = await ctx();
  await signIn(ops, 'ops@talentral.ng');
  await ops.goto('/platform/audit?group=account');
  await expect(ops.getByText(/downloaded their own data/).first()).toBeVisible();
  await expect(ops.getByText(/turned on two-step sign-in/).first()).toBeVisible();
});

test('marking rubrics and anonymous peer review on an assignment', async ({ page, browser }) => {
  const ctx = async () => (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  // The owner now signs in with two-step codes, so the platform team (who can manage any hub) builds the rubric.
  await signIn(page, 'ops@talentral.ng');
  await support(page);
  await page.goto('/dashboard/kirkira/courses');
  await page.getByRole('link', { name: /Web development foundations/ }).first().click();
  await page.getByRole('link', { name: /Build your first page/ }).click();
  await page.waitForURL(/lessons\//);
  await expect(page.getByRole('heading', { name: 'Marking rubric' })).toBeVisible();

  const addCriterion = async (title: string, description: string) => {
    const summary = page.getByText('+ Add a criterion');
    if (!(await page.locator('details:has(> summary:text("+ Add a criterion"))').evaluate((d) => (d as HTMLDetailsElement).open))) await summary.click();
    const form = page.locator('details:has(> summary:text("+ Add a criterion")) form');
    await form.getByLabel('Criterion', { exact: true }).fill(title);
    await form.getByLabel('What you look for', { exact: true }).fill(description);
    await form.getByRole('button', { name: 'Add criterion' }).click();
    await expect(page.getByRole('list', { name: 'Rubric criteria' }).getByText(title)).toBeVisible();
  };
  await addCriterion('Page structure', 'Uses headings, paragraphs and lists correctly.');
  await addCriterion('Content', 'Tells visitors clearly what the hub does.');
  await expect(page.getByText('2 criteria · 8 points in total')).toBeVisible();
  await page.getByLabel('Each learner reviews').selectOption('1');
  await expect(page.getByText('Each learner will review 1 classmate’s work.')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rubric-builder.png`, fullPage: true });

  // Ibrahim sees how he will be marked, hands in, and reviews a classmate anonymously.
  const ibrahim = await ctx();
  await signIn(ibrahim, 'ibrahim@example.com', /\/learn/);
  await ibrahim.getByRole('link', { name: 'Web development foundations', exact: true }).click();
  await ibrahim.getByRole('link', { name: /Build your first page/ }).click();
  await expect(ibrahim.getByText('How your work will be marked')).toBeVisible();
  await expect(ibrahim.getByText('Uses headings, paragraphs and lists correctly.')).toBeVisible();
  await ibrahim.getByLabel('Your answer').fill('My page has a heading, two paragraphs and a list of our programmes.');
  await ibrahim.getByRole('button', { name: 'Hand in', exact: true }).click();
  await expect(ibrahim.getByText('Handed in.')).toBeVisible();
  const tasks = ibrahim.getByRole('region', { name: 'Peer review' });
  await expect(tasks.getByText('Classmate 1')).toBeVisible();
  await expect(tasks.getByText(/Fatima/)).toHaveCount(0); // names are hidden
  await tasks.locator('fieldset', { hasText: 'Page structure' }).getByText('Good', { exact: true }).click();
  await tasks.locator('fieldset', { hasText: 'Content' }).getByText('Excellent', { exact: true }).click();
  await tasks.getByLabel('Your comment').fill('Clear structure. Add a contact section next time.');
  await tasks.getByRole('button', { name: 'Send review' }).click();
  await expect(tasks.getByText('Your review has been sent anonymously')).toBeVisible();
  if (process.env.SHOTS) await ibrahim.screenshot({ path: `${process.env.SHOTS}/peer-review.png`, fullPage: true });

  // Fatima reads the anonymous feedback on her work, then reviews Ibrahim's.
  const fatima = await ctx();
  await signIn(fatima, 'fatima@example.com', /\/learn/);
  await fatima.getByRole('link', { name: 'Web development foundations', exact: true }).click();
  await fatima.getByRole('link', { name: /Build your first page/ }).click();
  await expect(fatima.getByText('Feedback from 1 classmate')).toBeVisible();
  await expect(fatima.getByText('Clear structure. Add a contact section next time.')).toBeVisible();
  await expect(fatima.getByText(/Ibrahim/)).toHaveCount(0);
  const hers = fatima.getByRole('region', { name: 'Peer review' });
  await hers.locator('fieldset', { hasText: 'Page structure' }).getByText('Excellent', { exact: true }).click();
  await hers.locator('fieldset', { hasText: 'Content' }).getByText('Good', { exact: true }).click();
  await hers.getByLabel('Your comment').fill('Great list of programmes, well done.');
  await hers.getByRole('button', { name: 'Send review' }).click();
  await expect(hers.getByText('Your review has been sent anonymously')).toBeVisible();

  // The grader sees the peer review, grades with the rubric, and the score is worked out.
  await page.goto('/dashboard/kirkira/grading');
  const card = page.getByRole('listitem').filter({ hasText: 'Ibrahim Sani' });
  await card.getByText(/Peer reviews · 1 of 1 done/).click();
  await expect(card.getByText('Great list of programmes, well done.')).toBeVisible();
  await card.locator('fieldset', { hasText: 'Page structure' }).getByText('Excellent · 4').click();
  await expect(card.getByText('choose a level for each criterion')).toBeVisible();
  await card.locator('fieldset', { hasText: 'Content' }).getByText('Good · 3').click();
  await expect(card.getByText('87.5%')).toBeVisible();
  await card.getByLabel('Comment on Content').fill('Say who the page is for in the first line.');
  await card.getByLabel(/Feedback for Ibrahim/).fill('Solid first page.');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rubric-grading.png`, fullPage: true });
  await card.getByRole('button', { name: 'Save grade' }).click();
  await expect(card.getByText('Graded 87.5% and emailed to Ibrahim.')).toBeVisible();

  // Ibrahim sees his marks for each criterion.
  await ibrahim.reload();
  await expect(ibrahim.getByText('Marks by criterion')).toBeVisible();
  await expect(ibrahim.getByText('Good · 3/4')).toBeVisible();
  await expect(ibrahim.getByText('Say who the page is for in the first line.')).toBeVisible();
  await expect(ibrahim.getByText('Feedback from 1 classmate')).toBeVisible();
});

test('AI drafting: programme copy, lesson text and Hausa, quiz questions and grading feedback, all reviewed before saving', async ({ page, browser }) => {
  // AI_DRIVER=fake returns fixed drafts, so this checks the flow, not Claude's writing.
  await signIn(page, 'ops@talentral.ng');
  await support(page);
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  const [{ id: tenantId }] = await db`select id from tenants where slug = 'kirkira'`;
  const used = async () => (await db`select count(*)::int as n from ai_drafts where tenant_id = ${tenantId}`)[0]!.n as number;
  expect(await used()).toBe(0);

  // Programme copy: drafted, reviewed in the panel, put into the form, then saved by the person.
  await page.goto('/dashboard/kirkira/programmes');
  await page.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).first().click();
  const summaryBefore = await page.locator('#summary').inputValue();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  const panel = page.getByRole('region', { name: 'Draft the summary and description' });
  await expect(panel.getByText('Claude drafts, you decide.')).toBeVisible();
  await panel.getByLabel(/Notes for Claude/).fill('12 weeks at the hub, three days a week, laptops provided.');
  await panel.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(panel.getByText(/gives young people in Katsina practical, job-ready skills/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ai-programme.png`, fullPage: true });
  expect(await page.locator('#summary').inputValue()).toBe(summaryBefore); // nothing changes until the person chooses
  await panel.getByRole('button', { name: 'Use both' }).click();
  await expect(page.getByText('Summary and description filled in. Review them, then save.')).toBeVisible();
  await expect(page.locator('#summary')).toHaveValue(/job-ready skills/);
  await expect(page.locator('#description')).toHaveValue(/What you will learn:/);
  await page.locator('#summary').fill('iDICE Centre of Excellence Cohort 1 gives young people in Katsina practical, job-ready digital skills.');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Details saved.')).toBeVisible();

  // Lesson text for a new assignment, then its Hausa translation.
  await page.goto('/dashboard/kirkira/courses');
  await page.getByRole('link', { name: /Web development foundations/ }).first().click();
  await page.getByLabel('Lesson type').first().selectOption('assignment');
  await page.getByLabel('New lesson title').first().fill('Describe your hub');
  await page.getByRole('button', { name: 'Add lesson' }).first().click();
  await page.waitForURL(/lessons\/[0-9a-f-]+$/);
  const lessonUrl = page.url();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  const lessonPanel = page.getByRole('region', { name: 'Draft the instructions' });
  await lessonPanel.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(lessonPanel.locator('.lesson-prose h3', { hasText: 'Key ideas' })).toBeVisible(); // previewed as learners see it
  await lessonPanel.getByRole('button', { name: 'Use this text' }).click();
  await expect(page.getByLabel('Instructions in English')).toHaveValue(/^# Describe your hub/);

  await page.getByRole('tab', { name: 'Hausa' }).click();
  await page.getByRole('button', { name: 'Translate from English' }).click();
  const hausa = page.getByRole('region', { name: 'Translate into Hausa' });
  await expect(hausa.getByText('Machine translation. Ask a Hausa speaker to check it')).toBeVisible();
  await hausa.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(hausa.getByText('Wannan darasin zai nuna maka yadda ake aiki.')).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ai-translate.png`, fullPage: true });
  await hausa.getByRole('button', { name: 'Use this translation' }).click();
  await expect(page.getByLabel('Instructions in Hausa')).toHaveValue(/Wannan darasin/);
  await expect(page.locator('#ls-title-ha')).toHaveValue('Describe your hub (Hausa)');
  await page.locator('#ls-title-ha').fill('Bayyana cibiyarku');
  await page.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByText('Lesson saved.')).toBeVisible();
  await page.goto(lessonUrl);
  await expect(page.getByLabel('Instructions in English')).toHaveValue(/Key ideas/);

  // Quiz questions from the lessons before the quiz: choose which to keep.
  await page.goto('/dashboard/kirkira/courses');
  await page.getByRole('link', { name: /Web development foundations/ }).first().click();
  await page.getByRole('link', { name: /HTML check/ }).click();
  await expect(page.getByText('2 questions · 2 points')).toBeVisible();
  await page.getByRole('button', { name: 'Draft questions with AI' }).click();
  const quiz = page.getByRole('region', { name: 'Draft quiz questions' });
  await quiz.getByLabel('How many').selectOption('3');
  await quiz.getByRole('button', { name: 'Draft questions' }).click();
  const drafted = quiz.getByRole('list', { name: 'Drafted questions' }).getByRole('checkbox');
  await expect(drafted).toHaveCount(3);
  await quiz.getByLabel('Add question 2').uncheck();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ai-quiz.png`, fullPage: true });
  await quiz.getByRole('button', { name: 'Add 2 questions' }).click();
  await expect(page.getByText('Added 2 questions. Check each one below.')).toBeVisible();
  await expect(page.getByText('4 questions · 4 points')).toBeVisible();
  await expect(page.getByText('What should you do first when a customer complains?')).toBeVisible();
  await expect(page.getByText('A budget helps you plan how to spend money.')).toBeVisible();
  await expect(page.getByText(/Which of these help a small business grow/)).toHaveCount(0);

  // Grading feedback: Ibrahim hands in the new assignment; the grader drafts feedback from short notes.
  const ibrahim = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(ibrahim, 'ibrahim@example.com', /\/learn/);
  await ibrahim.getByRole('link', { name: 'Web development foundations', exact: true }).click();
  await ibrahim.getByRole('link', { name: /Describe your hub/ }).click();
  await ibrahim.getByLabel('Your answer').fill('Kirkira is a hub in Katsina that trains young people in digital skills.');
  await ibrahim.getByRole('button', { name: 'Hand in', exact: true }).click();
  await expect(ibrahim.getByText(/^Handed in\./)).toBeVisible();

  await page.goto('/dashboard/kirkira/grading');
  const card = page.getByRole('list', { name: 'Submissions' }).getByRole('listitem').filter({ hasText: 'Describe your hub' });
  await card.getByRole('button', { name: 'Draft feedback with AI' }).click();
  const fb = card.getByRole('region', { name: 'Draft feedback' });
  await expect(fb.getByText(/never sees the learner’s name/)).toBeVisible();
  await fb.getByLabel(/Your view of the work/).fill('Clear idea, needs numbers.');
  await fb.getByRole('button', { name: 'Draft feedback' }).click();
  await expect(fb.getByText(/You explained your idea clearly/)).toBeVisible();
  await fb.getByRole('button', { name: 'Use this feedback' }).click();
  await expect(card.getByLabel('Feedback for Ibrahim Sani')).toHaveValue(/add numbers/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ai-feedback.png`, fullPage: true });
  await card.getByLabel('Score for Ibrahim Sani').fill('78');
  await card.getByRole('button', { name: 'Save grade' }).click();
  await expect(card.getByText('Graded 78% and emailed to Ibrahim.')).toBeVisible();

  // Every draft is logged against the hub, and the daily limit stops more.
  expect(await used()).toBe(5);
  const [usage] = await db`select count(*) filter (where model = 'fake')::int as fake, count(distinct kind)::int as kinds from ai_drafts where tenant_id = ${tenantId}`;
  expect(usage).toMatchObject({ fake: 5, kinds: 5 });
  await db`insert into ai_drafts (tenant_id, kind, model) select ${tenantId}, 'lesson', 'fake' from generate_series(1, 150)`;
  await page.goto(lessonUrl);
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await page.getByRole('region', { name: 'Draft the instructions' }).getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(page.getByText(/Your hub has used today’s 150 AI drafts/)).toBeVisible();
  await db`delete from ai_drafts where tenant_id = ${tenantId}`;
  await db.end();
});

test('nudges for inactive learners, a follow-up for the team, and the funder report', async ({ page, request }) => {
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  // The owner signs in with her authenticator code (two-step sign-in is on since the security test).
  const [{ secret, last_step }] = await db`select t.secret, t.last_step from user_totp t join users u on u.id = t.user_id where u.email = 'owner@kirkira.ng'`;
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill('owner@kirkira.ng');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  await page.goto(linkIn((await lastMail('owner@kirkira.ng', /sign-in link/)).text));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/auth/two-step');
  await page.waitForLoadState('networkidle'); // typed before hydration, the code would be cleared
  const box = page.getByLabel('Authenticator code');
  // Each code works once: if the security test used this 30-second step, wait for the next one.
  while (stepAt(Date.now()) <= Number(last_step)) await page.waitForTimeout(1000);
  const code = codeAt(String(secret), stepAt(Date.now()));
  await box.fill(code);
  await expect(box).toHaveValue(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);

  // Aisha (offered a place earlier) accepts it and joins a new cohort that is running.
  await db`update applications set status = 'accepted', phone = '0803 555 9999' where email = 'aisha@example.com'`;
  await page.goto('/dashboard/kirkira/cohorts');
  await page.getByLabel('Cohort name').fill('Cohort 2');
  await page.getByRole('button', { name: 'Create cohort' }).click();
  await page.waitForURL(/cohorts\/[0-9a-f-]+$/);
  const cohortUrl = new URL(page.url()).pathname;
  const cohortId = cohortUrl.split('/').pop()!;
  await page.getByRole('button', { name: 'Add 1 accepted applicant' }).click();
  await expect(page.getByText('1 learner added to the cohort.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark running' }).click();
  await page.reload();

  // She has not started yet. Nudges are off until the hub turns them on.
  const onTrack = page.getByRole('region', { name: 'Keeping learners on track' });
  await expect(onTrack.getByText('Not started').or(onTrack.getByText('Active')).first()).toBeVisible();
  await onTrack.getByRole('switch', { name: 'Nudge inactive learners automatically' }).click();
  await onTrack.getByLabel('Days without activity before a nudge').selectOption('4');
  await onTrack.getByLabel('Days after the nudge before the team is told').selectOption('2');
  await onTrack.getByRole('button', { name: 'Save nudges' }).click();
  await expect(onTrack.getByText('Nudges are on: after 4 days without activity, then the team 2 days later.')).toBeVisible();

  // The scheduler runs: at first nothing is due, then, five days in (at 10:00 WAT), Aisha is nudged.
  const cron = async (at: Date) => (await request.get(`/api/cron/reminders?at=${at.toISOString()}`, { headers: { authorization: 'Bearer e2e-cron-secret' } })).json();
  const day = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); d.setUTCHours(9, 0, 0, 0); return d; };
  expect((await cron(day(1))).nudges).toMatchObject({ learners: 0, teams: 0 });
  expect((await cron(day(5))).nudges).toMatchObject({ learners: 1, teams: 0 });
  expect((await cron(day(5))).nudges).toMatchObject({ learners: 0 }); // never twice
  const nudge = await lastMail('aisha@example.com', /pick up where you left off at Kirkira/);
  expect(nudge.text).toContain('We have not seen you on Talentral for');
  expect(nudge.text).toContain('Cohort 2');
  const texts = readdirSync(join(process.cwd(), '.sms')).filter((f) => f.endsWith('-08035559999.json')).map((f) => JSON.parse(readFileSync(join(process.cwd(), '.sms', f), 'utf8')) as { text: string });
  expect(texts.some((t) => /Hi Aisha, we have not seen you on Talentral/.test(t.text))).toBe(true);
  // Not in quiet hours (23:00 WAT), and the team is told only after the wait.
  const late = day(6); late.setUTCHours(22, 0, 0, 0);
  expect((await cron(late)).nudges).toMatchObject({ cohorts: 0, learners: 0, teams: 0 });
  expect((await cron(day(6))).nudges).toMatchObject({ teams: 0 });
  expect((await cron(day(7))).nudges).toMatchObject({ teams: 1 });
  const alert = await lastMail('owner@kirkira.ng', /1 learner needs a follow-up in Cohort 2/);
  expect(alert.text).toContain('Aisha Musa');

  await page.reload();
  await expect(page.getByText('Needs a follow-up · 1')).toBeVisible();
  await expect(page.getByRole('table').getByText('Nudged · team told')).toBeVisible();
  await page.getByText(/Nudges sent · 2/).click();
  await expect(page.getByRole('list', { name: 'Nudges sent' }).getByText(/nudged by email and text/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/nudges.png`, fullPage: true });
  const [{ n: audited }] = await db`select count(*)::int as n from audit_log where action = 'cohort.nudges_updated' and target_id = ${cohortId}`;
  expect(audited).toBe(1);

  // The funder report for Cohort 1: branded, with partners, figures and an executive summary.
  const [{ id: firstCohort }] = await db`select id from cohorts where name = 'Cohort 1'`;
  await page.goto(`/dashboard/kirkira/cohorts/${firstCohort}`);
  await page.getByRole('link', { name: 'Funder report' }).click();
  await page.waitForURL(/\/funder$/);
  const report = page.getByRole('article', { name: 'Funder report' });
  await expect(report.getByRole('heading', { name: 'iDICE Centre of Excellence Cohort 1', level: 1 })).toBeVisible();
  await expect(report.getByRole('list', { name: 'Partners' }).getByRole('img', { name: 'iDICE' })).toBeVisible();
  for (const h of ['Headline indicators', 'Who the cohort reached', 'From application to work', 'Attendance', 'Learning and assessment', 'Engagement', 'Work readiness and outcomes']) {
    await expect(report.getByRole('heading', { name: new RegExp(h) })).toBeVisible();
  }
  await expect(report.getByText('Completed', { exact: true }).first()).toBeVisible();
  await expect(report.getByRole('list', { name: 'Course progress' })).toBeVisible();
  await expect(report.getByText(/Fatima|Ibrahim/)).toHaveCount(0); // aggregates only

  await page.getByRole('button', { name: 'Draft with AI' }).click();
  const draft = page.getByRole('region', { name: 'Draft the executive summary' });
  await expect(draft.getByText(/never a learner’s name/)).toBeVisible();
  await draft.getByRole('button', { name: 'Draft', exact: true }).click();
  await draft.getByRole('button', { name: 'Use this summary' }).click();
  await expect(page.locator('#fs-summary')).toHaveValue(/This cohort reached young people in Katsina/);
  await page.locator('#fs-summary').fill('Cohort 1 trained young people in Katsina in web development. Both learners completed and earned certificates.');
  await page.getByRole('button', { name: 'Save summary' }).click();
  await expect(page.getByText('Summary saved. It now opens the report.')).toBeVisible();
  await page.reload();
  await expect(report.getByRole('region', { name: 'Executive summary' }).getByText(/Both learners completed and earned certificates/)).toBeVisible();
  if (process.env.SHOTS) {
    await page.screenshot({ path: `${process.env.SHOTS}/funder-report.png`, fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await page.pdf?.({ path: `${process.env.SHOTS}/funder-report.pdf`, format: 'A4', printBackground: true }).catch(() => {});
    await page.emulateMedia({ media: 'screen' });
  }
  await db.end();
});

test('a hub shares a programme’s application link, message and QR code', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:3100', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await signIn(page, 'ops@talentral.ng');
  await support(page);
  await page.goto('/dashboard/kirkira/programmes');
  await page.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).first().click();
  await page.waitForURL(/programmes\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Share', exact: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Share the application page' });
  await expect(panel).toBeVisible();
  const link = await panel.getByLabel('Application link').inputValue();
  expect(link).toMatch(/\/kirkira\/apply\/[a-z0-9-]+$/);

  await panel.getByRole('button', { name: 'Copy link' }).click();
  await expect(panel.getByRole('button', { name: '✓ Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // The message names the programme and the hub, and goes to WhatsApp with the link.
  const message = panel.getByLabel(/Message/);
  await expect(message).toHaveValue(/iDICE Centre of Excellence Cohort 1 with Kirkira/);
  await expect(message).toHaveValue(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const whatsapp = await panel.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  expect(whatsapp).toContain('https://wa.me/?text=');
  expect(decodeURIComponent(whatsapp!.split('text=')[1]!)).toContain(link);
  await message.fill(`Apply now: ${link}`);
  expect(decodeURIComponent((await panel.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'))!.split('text=')[1]!)).toBe(`Apply now: ${link}`);
  for (const name of ['Facebook', 'X', 'LinkedIn', 'Telegram', 'Email', 'SMS']) await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
  expect(await panel.getByRole('link', { name: 'Facebook' }).getAttribute('href')).toContain(encodeURIComponent(link));

  // A QR code for posters, downloadable as a PNG.
  await expect(panel.getByRole('img', { name: 'QR code for the application page' })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/share-programme.png` });
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download QR code' }).click();
  expect((await download).suggestedFilename()).toMatch(/-apply-qr\.png$/);

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await context.close();
});

test('hubs preview a course as learners see it, and a programme page after saving', async ({ page }) => {
  await signIn(page, 'ops@talentral.ng');
  await support(page);
  await page.goto('/dashboard/kirkira/courses');
  await page.getByRole('link', { name: /Web development foundations/ }).first().click();
  await page.getByRole('link', { name: /Preview as a learner/ }).click();
  await page.waitForURL(/\/preview/);
  await expect(page.getByText(/This is how learners see/)).toBeVisible();
  const outline = page.getByRole('navigation', { name: 'Course outline' });
  await outline.getByRole('link', { name: /What is HTML\?/ }).click();
  const lesson = page.getByRole('article', { name: 'Lesson preview' });
  await expect(lesson.locator('.lesson-prose h2', { hasText: 'Tags' })).toBeVisible();
  await page.getByRole('group', { name: 'Language' }).getByRole('link', { name: 'Hausa' }).click();
  await expect(lesson.getByRole('heading', { name: 'Menene HTML?' })).toBeVisible();
  await expect(lesson.locator('.lesson-prose h2', { hasText: 'Alamomi' })).toBeVisible();
  await page.getByRole('group', { name: 'Language' }).getByRole('link', { name: 'English' }).click();
  await outline.getByRole('link', { name: /HTML check/ }).click();
  await expect(lesson.getByText('What does HTML stand for?')).toBeVisible();
  await expect(lesson.getByText(/Right answers are hidden here/)).toBeVisible();
  await expect(lesson.getByText('✓')).toHaveCount(0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-preview.png`, fullPage: true });
  await lesson.getByRole('link', { name: /→$/ }).click(); // next lesson
  await expect(lesson).toBeVisible();
  await page.getByRole('link', { name: 'Back to editing' }).click();
  await page.waitForURL(/courses\/[0-9a-f-]+$/);

  // Saving a lesson offers its preview.
  await page.getByRole('link', { name: /What is HTML\?/ }).first().click();
  await page.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByText('Lesson saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Preview this lesson →' }).click();
  await expect(page.getByRole('article', { name: 'Lesson preview' }).getByRole('heading', { name: 'What is HTML?' })).toBeVisible();

  // Saving a programme's details offers the public page.
  await page.goto('/dashboard/kirkira/programmes');
  await page.getByRole('link', { name: /iDICE Centre of Excellence Cohort 1/ }).first().click();
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Details saved.')).toBeVisible();
  const preview = page.getByRole('link', { name: 'Preview the page ↗' });
  expect(await preview.getAttribute('href')).toMatch(/\/kirkira\/apply\/[a-z0-9-]+$/);
});

test('support access is time-limited and visible; people correct and delete their data', async ({ page, browser }) => {
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  // Support access: the reason is required and the hub's owners hear about it (opened in earlier tests).
  await signIn(page, 'ops@talentral.ng');
  await page.goto('/dashboard/kirkira');
  await expect(page.getByText(/Support access to Kirkira Innovation Hub until/)).toBeVisible();
  const notice = await lastMail('owner@kirkira.ng', /Talentral support opened Kirkira Innovation Hub/);
  expect(notice.text).toContain('Helping the hub team test the platform.');
  await expect(page.getByRole('region', { name: 'Talentral support visits' }).getByText('ops@talentral.ng').first()).toBeVisible();
  await page.getByRole('button', { name: 'End support session' }).click();
  await page.waitForURL(/\/platform$/);
  await page.goto('/dashboard/kirkira/programmes');
  await page.waitForURL(/\/platform\/support\/kirkira$/);
  await page.getByLabel('Why do you need access?').fill('short');
  await page.getByRole('button', { name: 'Open for four hours' }).click();
  await expect(page.getByText(/at least 10 characters/)).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/support-access.png`, fullPage: true });
  const [{ n: supportAudits }] = await db`select count(*)::int as n from audit_log a join tenants t on t.id = a.tenant_id where t.slug = 'kirkira' and a.action in ('support.started', 'support.ended')`;
  expect(supportAudits).toBeGreaterThanOrEqual(2);

  // Ibrahim sees his data, asks for a correction, then asks for it to be deleted.
  const ibrahim = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(ibrahim, 'ibrahim@example.com', /\/learn/);
  await ibrahim.goto('/account/security');
  await ibrahim.getByRole('link', { name: 'Manage your data' }).click();
  await ibrahim.waitForURL('**/account/privacy');
  await ibrahim.getByRole('link', { name: 'View and print (PDF)' }).click();
  const doc = ibrahim.getByRole('article', { name: 'Your data' });
  await expect(doc.getByText('Your data on Talentral')).toBeVisible();
  await expect(doc.getByText(/iDICE Centre of Excellence Cohort 1/).first()).toBeVisible();
  await ibrahim.goBack();

  await ibrahim.getByLabel('What needs correcting?').fill('typo');
  await ibrahim.getByRole('button', { name: 'Ask for a correction' }).click();
  await expect(ibrahim.getByText(/at least 10 characters/)).toBeVisible();
  await ibrahim.getByLabel('What needs correcting?').fill('My surname is Sani, spelt with one n at the end.');
  await ibrahim.getByRole('button', { name: 'Ask for a correction' }).click();
  await expect(ibrahim.getByText(/Request sent/)).toBeVisible();
  await lastMail('ibrahim@example.com', /We received your request to correct your data/);

  await expect(ibrahim.getByText('What we keep, without your name or contact details')).toBeVisible();
  await ibrahim.getByLabel('Type DELETE to confirm').fill('yes');
  await ibrahim.getByRole('button', { name: 'Ask to delete my data' }).click();
  await expect(ibrahim.getByText('Type DELETE to confirm.')).toBeVisible();
  await ibrahim.getByLabel('Type DELETE to confirm').fill('delete');
  await ibrahim.getByRole('button', { name: 'Ask to delete my data' }).click();
  await expect(ibrahim.getByText('Your deletion request is in progress')).toBeVisible();
  await ibrahim.reload();
  await expect(ibrahim.getByRole('list', { name: 'Your requests' }).getByText('In progress')).toHaveCount(2);
  const receipt = await lastMail('ibrahim@example.com', /We received your request to delete your data/);
  expect(receipt.text).toMatch(/We will handle it by/);
  await lastMail('ops@talentral.ng', /New data deletion request, due/);
  if (process.env.SHOTS) await ibrahim.screenshot({ path: `${process.env.SHOTS}/privacy-request.png`, fullPage: true });

  // The platform team corrects, then carries out the deletion.
  await page.goto('/platform/privacy');
  const openList = page.getByRole('region', { name: 'Open requests' });
  await expect(openList.getByText('i***@example.com')).toHaveCount(2);
  await expect(openList.getByText(/Due in 30 days|Due in 29 days/).first()).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/privacy-queue.png`, fullPage: true });
  await openList.getByLabel('Mark corrected: note').fill('Surname corrected on your applications.');
  await openList.getByRole('button', { name: 'Mark corrected' }).click();
  await expect(page.getByText('Marked done and the person has been emailed.')).toBeVisible();
  await lastMail('ibrahim@example.com', /Your correction request is done/);

  await page.reload();
  await page.getByRole('region', { name: 'Open requests' }).getByRole('textbox', { name: /Type DELETE to erase/ }).fill('DELETE');
  await page.getByRole('button', { name: 'Carry out deletion' }).click();
  await expect(page.getByText(/Deleted\. \d+ files? removed from storage/)).toBeVisible();
  const done = await lastMail('ibrahim@example.com', /Your Talentral data has been deleted/);
  expect(done.text).toContain('We kept only what hubs and the law need');

  expect(await db`select 1 from users where email = 'ibrahim@example.com'`).toHaveLength(0);
  const apps = await db`select full_name, email::text as email from applications where reference in (select reference from applications where full_name = 'Removed at request')`;
  expect(apps.length).toBeGreaterThan(0);
  expect(apps.every((a) => String(a.email).endsWith('@erased.invalid'))).toBe(true);
  expect(await db`select 1 from applications where email = 'ibrahim@example.com'`).toHaveLength(0);
  // His session no longer works.
  await ibrahim.goto('/learn');
  await ibrahim.waitForURL(/sign-in/);
  await db.end();
});


// WCAG 2.2 AA (B7): an automated axe scan of the main screens for applicants, learners, hub teams and
// the platform team. Automated checks catch about a third of issues; the rest need manual review.
test('pilot health: learners and staff answer NPS, and the platform tracks Gate G2', async ({ page, browser }) => {
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  // Fatima has been learning for three weeks, so she is asked whether she would recommend the hub.
  await db`update enrolments e set enrolled_at = now() - interval '21 days' from applications a where a.id = e.application_id and a.email = 'fatima@example.com'`;
  await db`update cohorts set starts_on = current_date - 21 where name = 'Cohort 1'`;
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  const survey = learner.getByRole('region', { name: /How likely are you to recommend learning with Kirkira/ });
  await expect(survey).toBeVisible();
  await expect(survey.getByRole('button', { name: 'Send' })).toBeDisabled();
  await survey.getByText('9', { exact: true }).click();
  await survey.getByLabel(/What do you like most\?/).fill('The mentors explain things clearly');
  await survey.getByRole('button', { name: 'Send' }).click();
  await expect(learner.getByText('Thank you!')).toBeVisible();
  await learner.reload();
  await expect(learner.getByRole('region', { name: /How likely are you to recommend/ })).toHaveCount(0);

  // A mentor who joined the team a month ago is asked on the hub overview, and chooses "Not now" first.
  await db`update tenants set require_two_step = false where slug = 'kirkira'`;
  const [mentor] = await db`insert into users (email, full_name) values ('mentor@kirkira.ng', 'Bala Mentor') returning id`;
  await db`insert into memberships (tenant_id, user_id, role, created_at) select id, ${mentor!.id}, 'reviewer', now() - interval '30 days' from tenants where slug = 'kirkira'`;
  const staff = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(staff, 'mentor@kirkira.ng');
  await staff.goto('/dashboard/kirkira');
  const staffSurvey = staff.getByRole('region', { name: /recommend Talentral to another hub/ });
  await staffSurvey.getByRole('button', { name: 'Not now' }).click();
  await expect(staffSurvey).toHaveCount(0);
  await staff.reload();
  await expect(staff.getByRole('region', { name: /recommend Talentral to another hub/ })).toHaveCount(0);
  // Two weeks later it comes back; this time the mentor answers.
  await db`update nps_responses set created_at = now() - interval '15 days' where score is null and audience = 'staff'`;
  await staff.reload();
  await staff.getByRole('region', { name: /recommend Talentral to another hub/ }).getByText('6', { exact: true }).click();
  await staff.getByLabel(/What would make it better\?/).fill('Grading on a phone is slow');
  await staff.getByRole('button', { name: 'Send' }).click();
  await expect(staff.getByText('Thank you!')).toBeVisible();
  await db`update tenants set require_two_step = true where slug = 'kirkira'`;

  // The platform team sees Gate G2 across hubs, with the answers and comments, and keeps an incident log.
  await signIn(page, 'ops@talentral.ng');
  await page.goto('/platform/health');
  await expect(page.getByRole('heading', { name: 'Pilot health' })).toBeVisible();
  await expect(page.getByText(/criteria on target/)).toBeVisible();
  for (const label of ['Activation within 7 days', 'Weekly active', 'Attendance', 'Learner NPS', 'Staff NPS', 'Cross-tenant incidents']) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('+100').first()).toBeVisible(); // one promoter among learners
  await expect(page.getByText('-100').first()).toBeVisible(); // one detractor among staff
  await expect(page.getByText('The mentors explain things clearly')).toBeVisible();
  await expect(page.getByText('Grading on a phone is slow')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pilot health by hub' }).getByText('Kirkira Innovation Hub')).toBeVisible();

  await page.getByText('Record an incident').click();
  await page.getByLabel('What happened').fill('A phishing email imitating Talentral reached two hub admins. No data was exposed.');
  await page.getByRole('button', { name: 'Record incident' }).click();
  await expect(page.getByText('Incident recorded and added to the audit log.')).toBeVisible();
  await expect(page.getByText('A phishing email imitating Talentral reached two hub admins.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.getByText(/^Resolved /)).toBeVisible();
  const [{ n }] = await db`select count(*)::int as n from audit_log where action in ('security.incident_recorded', 'security.incident_resolved')`;
  expect(n).toBe(2);

  // A hub owner or admin sees the same view for their own cohorts (here through a support session).
  await support(page);
  await page.goto('/dashboard/kirkira/health');
  await expect(page.getByRole('heading', { name: 'Pilot health' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pilot health by cohort' }).getByText('Cohort 1')).toBeVisible();
  await expect(page.getByText('Cross-tenant incidents')).toHaveCount(0);
  await db.end();
});

test('WhatsApp for learners who choose it, with STOP and START; lesson video streamed in lighter versions', async ({ page, browser, request }) => {
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  const [{ phone: raw }] = await db`select phone from applications where email = 'fatima@example.com'`;
  const phone = `234${String(raw).replace(/\D/g, '').slice(-10)}`;
  const waFiles = () => (existsSync(join(process.cwd(), '.whatsapp')) ? readdirSync(join(process.cwd(), '.whatsapp')) : [])
    .map((f) => JSON.parse(readFileSync(join(process.cwd(), '.whatsapp', f), 'utf8')) as { to: string; kind: string; text?: string; payload: { template?: { name: string; components: { parameters: { text: string }[] }[] } } });

  // Fatima chooses WhatsApp from My learning.
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  const card = learner.getByRole('region', { name: 'Get class reminders on WhatsApp?' });
  await card.getByRole('button', { name: 'Yes, use WhatsApp' }).click();
  await expect(learner.getByText(/now come to 0\d{3} ••• \d{4} on WhatsApp/)).toBeVisible();
  expect(await db`select opted_in, source from whatsapp_optins where phone = ${phone}`).toEqual([{ opted_in: true, source: 'account' }]);

  // The hub posts an announcement by text: Fatima gets it on WhatsApp, classmates by SMS.
  await signIn(page, 'ops@talentral.ng');
  await support(page);
  const [{ id: cohort }] = await db`select id from cohorts where name = 'Cohort 1'`;
  await page.goto(`/dashboard/kirkira/cohorts/${cohort}`);
  await page.getByLabel('Announcement title').fill('Room change');
  await page.locator('#an-body').fill('Thursday class moves to Room 2.\n\nBring your laptop.');
  await page.getByLabel('Text: WhatsApp or SMS').check();
  await page.getByRole('button', { name: 'Post announcement' }).click();
  await expect(page.getByText(/1 on WhatsApp/)).toBeVisible();
  const wa = waFiles().find((m) => m.to === phone && m.kind === 'update');
  expect(wa?.payload.template?.name).toBe('talentral_update');
  expect(wa?.payload.template?.components[0]!.parameters.map((p) => p.text)).toEqual(['Kirkira Innovation Hub', 'Room change. Thursday class moves to Room 2. Bring your laptop.']);
  const sms = readdirSync(join(process.cwd(), '.sms')).filter((f) => f.endsWith(`-${phone}.json`)).map((f) => JSON.parse(readFileSync(join(process.cwd(), '.sms', f), 'utf8')) as { text: string });
  expect(sms.some((m) => m.text.includes('Room change'))).toBe(false);

  // Meta's webhook: verification, then a signed STOP reply turns WhatsApp off and is confirmed.
  expect(await (await request.get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=e2e-verify&hub.challenge=abc123')).text()).toBe('abc123');
  const stop = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: phone, type: 'text', text: { body: 'STOP' } }] } }] }] });
  const sign = (body: string) => `sha256=${createHmac('sha256', 'e2e-whatsapp-secret').update(body).digest('hex')}`;
  expect((await request.post('/api/whatsapp/webhook', { data: stop, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=forged' } })).status()).toBe(401);
  expect(await (await request.post('/api/whatsapp/webhook', { data: stop, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(stop) } })).json()).toMatchObject({ handled: 1 });
  expect(await db`select opted_in, source from whatsapp_optins where phone = ${phone}`).toEqual([{ opted_in: false, source: 'reply' }]);
  expect(waFiles().some((m) => m.to === phone && m.kind === 'reply' && /no longer get WhatsApp messages/.test(m.text ?? ''))).toBe(true);

  // She turns it back on from her account page.
  await learner.goto('/account/security');
  const sw = learner.getByRole('switch', { name: /WhatsApp messages/ });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(learner.getByText(/Reminders and hub messages now come to/)).toBeVisible();
  expect((await db`select opted_in from whatsapp_optins where phone = ${phone}`)[0]!.opted_in).toBe(true);

  // Streamed video: the hub uploads a video to a lesson; it goes up in resumable chunks and is prepared in lighter versions.
  const [{ id: course }] = await db`select id from courses where title = 'Web development foundations'`;
  const [{ id: mod }] = await db`select id from course_modules where course_id = ${course} order by position, created_at limit 1`;
  const [{ id: lesson }] = await db`insert into lessons (tenant_id, course_id, module_id, kind, title, position)
    select tenant_id, ${course}, ${mod}, 'video', 'Welcome from the mentors', 99 from courses where id = ${course} returning id`;
  await page.goto(`/dashboard/kirkira/courses/${course}/lessons/${lesson}`);
  const panel = page.getByRole('region', { name: 'Streamed video' });
  const video = Buffer.alloc(7 * 1024 * 1024, 7); // two chunks
  await panel.locator('input[type=file]').setInputFiles({ name: 'welcome.mp4', mimeType: 'video/mp4', buffer: video });
  await expect(panel.getByText('✓ Learners can watch this video')).toBeVisible({ timeout: 30_000 });
  for (const r of ['240p', '360p', '720p']) await expect(panel.getByText(r, { exact: true })).toBeVisible();
  const [row] = await db`select stream_id, stream_status from lessons where id = ${lesson}`;
  expect(row).toMatchObject({ stream_status: 'ready' });

  // Bunny's webhook needs the secret, and only refreshes the status.
  expect((await request.post('/api/stream/webhook?secret=wrong', { data: { VideoGuid: row!.stream_id } })).status()).toBe(401);
  expect(await (await request.post('/api/stream/webhook?secret=e2e-stream-secret', { data: { VideoGuid: row!.stream_id, Status: 3 } })).json()).toMatchObject({ updated: 1 });

  // The learner watches it; the small version comes from the lesson's media address, only for her.
  await learner.goto(`/learn/${cohort}/${lesson}`);
  const player = learner.locator('video[aria-label="Welcome from the mentors"]');
  await expect(player).toBeVisible();
  const got = await learner.evaluate(async (src) => { const r = await fetch(src); return { status: r.status, type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength }; }, `/learn/media/${cohort}/${lesson}`);
  expect(got).toEqual({ status: 200, type: 'video/mp4', size: video.length });
  expect((await request.get(`/learn/media/${cohort}/${lesson}`)).status()).toBe(404); // signed out
  await db.end();
});

test('employers: verification with reasons, teams, drafts and the jobs board; Passport v2 portfolio with labels', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const ctx = async () => (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  const db = postgres(E2E_DATABASE_URL, { max: 1 });

  // A new employer registers; the talent team sends it back with a reason.
  const arewa = await ctx();
  await arewa.goto('/employers');
  await arewa.getByLabel('Organisation name').fill('Arewa Logistics');
  await arewa.getByLabel('Sector').fill('Logistics');
  await arewa.getByLabel('State').selectOption('Kaduna');
  await arewa.getByLabel('Team size').selectOption('51-200');
  await arewa.getByLabel('Your name').fill('Usman Garba');
  await arewa.getByLabel('Work email').fill('hr@arewalogistics.ng');
  await arewa.getByLabel('Phone').fill('0805 444 5555');
  await arewa.getByLabel('Roles you hire for').fill('Dispatch coordinators');
  await arewa.getByRole('checkbox', { name: /I will use candidate information only to recruit/ }).check();
  await arewa.getByRole('button', { name: 'Register and get my sign-in link' }).click();
  await expect(arewa.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await signIn(arewa, 'hr@arewalogistics.ng', /\/employer/);

  await signIn(page, 'ops@talentral.ng');
  await page.goto('/platform/talent/employers');
  await page.getByRole('link', { name: /Arewa Logistics/ }).click();
  const checks = page.getByRole('list', { name: 'Verification checks' });
  await expect(checks.getByText('CAC registration number: needs checking')).toBeVisible();
  await page.getByRole('button', { name: 'Needs changes' }).click();
  await page.getByLabel('What should the employer fix?').fill('Please add your CAC registration number and company website.');
  await page.getByRole('button', { name: 'Send back to the employer' }).click();
  await expect(page.getByText(/Sent back with your note/)).toBeVisible();
  await lastMail('hr@arewalogistics.ng', /Arewa Logistics: we need a few more details/);

  // The employer sees the reason, fixes the details and asks again.
  await arewa.reload();
  await expect(arewa.getByText('Please add your CAC registration number and company website.')).toBeVisible();
  await expect(arewa.getByRole('heading', { name: 'Post a job' })).toHaveCount(0);
  await arewa.getByLabel('CAC registration number').fill('rc 7654321');
  await arewa.getByLabel('Website').fill('https://arewalogistics.ng');
  await arewa.getByRole('button', { name: 'Save profile' }).click();
  await expect(arewa.getByText('Profile saved.')).toBeVisible();
  await arewa.getByRole('button', { name: /ask for another review/ }).click();
  await expect(arewa.getByText(/review your organisation again/)).toBeVisible();
  await lastMail('ops@talentral.ng', /Review again: Arewa Logistics/);
  await page.reload();
  await expect(page.getByText('Asked for another review')).toBeVisible();
  await expect(checks.getByText('RC 7654321. Check it on the CAC public search.')).toBeVisible();
  await expect(checks.getByText('arewalogistics.ng matches the website.')).toBeVisible();
  await page.getByRole('button', { name: 'Verify employer' }).click();
  await expect(page.getByText(/Verified\. The employer has been emailed/)).toBeVisible();

  // Sahel Digital's owner adds a colleague, who signs in with their own email.
  const boss = await ctx();
  await signIn(boss, 'talent@saheldigital.ng', /\/employer/);
  await boss.goto('/employer/team');
  await boss.getByLabel('Work email').fill('ibrahim@saheldigital.ng');
  await boss.getByLabel('Name').fill('Ibrahim Sani');
  await boss.getByRole('button', { name: 'Add to team' }).click();
  await expect(boss.getByText('Ibrahim Sani was added and emailed a link to sign in.')).toBeVisible();
  await lastMail('ibrahim@saheldigital.ng', /You have been added to Sahel Digital on Talentral/);
  const colleague = await ctx();
  await signIn(colleague, 'ibrahim@saheldigital.ng', /\/employer/);
  await colleague.goto('/employer/team');
  await expect(colleague.getByRole('list', { name: 'Team members' }).getByText('talent@saheldigital.ng', { exact: false })).toBeVisible();
  await expect(colleague.getByRole('heading', { name: 'Add a colleague' })).toHaveCount(0);
  await expect(boss.getByRole('button', { name: 'Leave' })).toBeVisible();

  // A job saved as a draft stays off the board until it is published.
  await boss.goto('/employer');
  await boss.getByLabel('Job title').fill('UI developer');
  await boss.getByLabel('Required skills').fill('React, Figma');
  await boss.getByLabel('Pay from (₦ a month)').fill('180000');
  await boss.getByLabel('Pay up to (₦ a month)').fill('260000');
  await boss.getByLabel('Job description').fill('Design and build interfaces for client apps. Remote, with a weekly team call.');
  await boss.getByLabel('Requirements').fill('A laptop and a portfolio of past work.');
  await boss.getByLabel('Closing date').fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
  await boss.getByRole('button', { name: 'Save as draft' }).click();
  await boss.waitForURL(/employer\/jobs\/[0-9a-f-]+\?draft=1/);
  await expect(boss.getByText('Draft saved')).toBeVisible();
  const visitor = await ctx();
  await visitor.goto('/jobs');
  await expect(visitor.getByRole('heading', { name: 'UI developer' })).toHaveCount(0);
  await boss.getByRole('button', { name: 'Save and publish' }).click();
  await boss.waitForURL(/employer\/jobs\/[0-9a-f-]+\?posted=1/);
  await expect(boss.getByText('Your job is live')).toBeVisible();
  await visitor.reload();
  const card = visitor.getByRole('list', { name: 'Jobs' }).getByRole('listitem').filter({ hasText: 'UI developer' });
  await expect(card.getByText('₦180,000 to ₦260,000 a month')).toBeVisible();
  await expect(card.getByText('Verified employer')).toBeVisible();
  await expect(card.getByText('Closes 20', { exact: false }).or(card.getByText(/Closes /))).toBeVisible();

  // Fatima sees which of the job's skills she has proven, and what to do about the rest.
  const learner = await ctx();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.goto('/jobs');
  const mine = learner.getByRole('list', { name: 'Jobs' }).getByRole('listitem').filter({ hasText: 'UI developer' });
  await expect(mine.getByText('React: Proven in graded work')).toBeVisible();
  await expect(mine.getByText('Figma: Not shown yet')).toBeVisible();
  await mine.getByRole('link').click();
  await expect(learner.getByRole('heading', { name: 'Your skills for this job' })).toBeVisible();
  await expect(learner.getByText(/Ask your hub about learning Figma/)).toBeVisible();
  await expect(learner.getByText('A laptop and a portfolio of past work.')).toBeVisible();

  // Passport v2: a portfolio item and availability details.
  await learner.goto('/passport');
  await learner.getByRole('button', { name: '+ Add a project' }).click();
  await learner.getByLabel('Project title').fill('Booking site for a Katsina salon');
  await learner.getByLabel('What you did').fill('Built a booking site with React so customers can choose a time.');
  await learner.getByLabel('Link (optional)').fill('https://fatima.dev/salon');
  await learner.getByLabel('Skills it shows').fill('React, Figma');
  await learner.getByRole('button', { name: 'Add to portfolio' }).click();
  await expect(learner.getByText('Added to your portfolio.')).toBeVisible();
  await learner.getByLabel('Available from (optional)').fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await learner.getByLabel('Roles you are looking for (optional)').fill('Frontend developer, UI developer');
  await learner.getByRole('checkbox', { name: /open to relocating/ }).check();
  await learner.getByRole('button', { name: 'Save Passport' }).click();
  await expect(learner.getByText('Passport saved.')).toBeVisible();
  // She lets talent officers see her Passport again, so one can check her work.
  await learner.getByRole('switch', { name: 'Visible to Talentral talent officers' }).click();
  await expect(learner.getByRole('switch', { name: 'Visible to Talentral talent officers' })).toHaveAttribute('aria-checked', 'true');

  // A talent officer checks the item and marks it verified; Figma now counts as verified for the job.
  const [{ id: fatima }] = await db`select id from users where email = 'fatima@example.com'`;
  await page.goto(`/platform/talent/people/${fatima}`);
  await page.getByRole('button', { name: 'Verify Booking site for a Katsina salon' }).click();
  await expect(page.getByRole('button', { name: 'Remove verification from Booking site for a Katsina salon' })).toBeVisible();
  await learner.goto('/passport/preview');
  await expect(learner.getByText(/Checked by a Talentral talent officer on/)).toBeVisible();
  await expect(learner.getByText(/Open to relocating/)).toBeVisible();
  await expect(learner.getByText('Frontend developer, UI developer')).toBeVisible();
  await learner.goto('/jobs');
  await expect(learner.getByRole('list', { name: 'Jobs' }).getByRole('listitem').filter({ hasText: 'UI developer' }).getByText('Figma: Verified')).toBeVisible();
  // Editing the item clears the verification.
  await learner.goto('/passport');
  await learner.getByRole('button', { name: 'Edit Booking site for a Katsina salon' }).click();
  await learner.getByLabel('What you did').fill('Built a booking site with React and Figma prototypes.');
  await learner.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(learner.getByText('Saved.', { exact: true })).toBeVisible();
  expect((await db`select verified_at from portfolio_items where user_id = ${fatima}`)[0]!.verified_at).toBeNull();
  await db.end();
});

test('learners apply with their Passport; employers rank, interview and hire; the 90-day check and Gate G3', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const ctx = async () => (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();

  // Fatima applies to the UI developer job with a note, seeing how she matches first.
  const learner = await ctx();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.goto('/jobs');
  await learner.getByRole('list', { name: 'Jobs' }).getByRole('listitem').filter({ hasText: 'UI developer' }).getByRole('link').click();
  await expect(learner.getByRole('list', { name: 'How you match' }).getByText(/required skills/)).toBeVisible();
  const apply = async (note: string) => {
    await learner.getByLabel(/A short note to the employer/).fill(note);
    const share = learner.getByRole('checkbox', { name: /Share my Passport with employers/ });
    if (await share.count()) await share.check();
    await learner.getByRole('button', { name: 'Apply with my Passport' }).click();
    await expect(learner.getByText(/You applied on/)).toBeVisible();
  };
  await apply('First try.');
  await expect(learner.getByText('Being reviewed')).toBeVisible();
  await lastMail('talent@saheldigital.ng', /New applicant for UI developer: Fatima Bello/);

  // She withdraws, changes her mind and applies again from My applications.
  await learner.getByRole('button', { name: 'Withdraw application for UI developer' }).click();
  await learner.getByRole('button', { name: 'Yes, withdraw' }).click();
  await expect(learner.getByText(/You withdrew on .*You can apply again/)).toBeVisible();
  await learner.goto('/jobs/applications');
  const closedApps = learner.getByRole('list', { name: 'Closed applications' });
  await expect(closedApps.getByRole('listitem').filter({ hasText: 'UI developer' }).getByText('You withdrew')).toBeVisible();
  await closedApps.getByRole('link', { name: 'Changed your mind? Apply again' }).click();
  await apply('I built a booking site with React for a salon in Katsina, and I design in Figma first.');
  await learner.goto('/jobs');
  await expect(learner.getByRole('list', { name: 'Jobs' }).getByRole('listitem').filter({ hasText: 'UI developer' }).getByText('Applied', { exact: true })).toBeVisible();

  // The employer sees the new applicant with the reasons and her note, and invites her to interview.
  const boss = await ctx();
  await signIn(boss, 'talent@saheldigital.ng', /\/employer/);
  await expect(boss.getByText('1 new applicant')).toBeVisible();
  await boss.getByRole('link', { name: /UI developer/ }).click();
  const fatima = boss.getByRole('list', { name: 'Interested candidates' }).getByRole('listitem').filter({ hasText: 'Fatima Bello' });
  await expect(fatima.getByText('Applied', { exact: true })).toBeVisible();
  await expect(fatima.getByText(/booking site with React for a salon/)).toBeVisible();
  await expect(fatima.getByRole('list', { name: 'Why Fatima Bello may fit' }).getByText(/required skills/)).toBeVisible();
  await expect(fatima.getByRole('link', { name: 'fatima@example.com' })).toBeVisible();
  await boss.getByLabel('Stage for Fatima Bello').selectOption('interviewed');
  await boss.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(boss.getByText('Saved. We emailed the candidate.')).toBeVisible();
  await lastMail('fatima@example.com', /Sahel Digital wants to interview you/);

  await learner.goto('/jobs/applications');
  const progress = learner.getByRole('list', { name: 'Applications in progress' }).getByRole('listitem').filter({ hasText: 'UI developer' });
  await expect(progress.getByText('Interviewing')).toBeVisible();
  await expect(progress.getByText('Interview (current)')).toBeVisible();
  await progress.getByText('What the employer sees').click();
  await expect(progress.getByText(/Your note:/)).toBeVisible();

  // The hire: confirmed by the employer, emailed to Fatima, then the scheduler asks for the 90-day check once.
  await boss.reload();
  await boss.getByLabel('Stage for Fatima Bello').selectOption('placed');
  await boss.getByLabel('Type of work').selectOption('full_time');
  await boss.getByLabel('Start date').fill(new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10));
  await boss.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(boss.getByText(/90-day check: is Fatima still working with you/)).toBeVisible();
  await lastMail('fatima@example.com', /Sahel Digital hired you/);
  const at = new Date(); at.setUTCHours(9, 0, 0, 0); // 10:00 in Lagos, outside quiet hours
  const cron = async () => (await request.get(`/api/cron/reminders?at=${at.toISOString()}`, { headers: { authorization: 'Bearer e2e-cron-secret' } })).json();
  expect((await cron()).retention.asked).toBeGreaterThanOrEqual(1);
  await lastMail('talent@saheldigital.ng', /90-day check for Fatima Bello/);
  expect((await cron()).retention).toEqual({ asked: 0, reminded: 0, emails: 0 });
  await boss.getByRole('button', { name: 'Yes, still with us' }).click();
  await expect(boss.getByText('90-day check: still working with you.')).toBeVisible();
  await learner.reload();
  await expect(learner.getByRole('list', { name: 'Applications in progress' }).getByRole('listitem').filter({ hasText: 'UI developer' }).getByText('Hired', { exact: true })).toBeVisible();

  // The talent team confirms the hire it recorded earlier, with a note of how the employer confirmed it.
  await signIn(page, 'ops@talentral.ng');
  await page.goto('/platform/talent/placements?show=confirm');
  const waiting = page.getByRole('list', { name: 'Placements' }).getByRole('listitem').filter({ hasText: 'Junior frontend developer' });
  await waiting.getByRole('button', { name: 'Confirm on their behalf' }).click();
  await expect(waiting.getByText(/Say how you know/)).toBeVisible();
  await waiting.getByLabel('How the employer confirmed hiring Fatima Bello').fill('Hiring manager confirmed by phone.');
  await waiting.getByRole('button', { name: 'Confirm on their behalf' }).click();
  await expect(page.getByText('Nothing needs attention in this list.')).toBeVisible();
  await page.goto('/platform/talent/placements');
  await expect(page.getByRole('list', { name: 'Placements' }).getByRole('listitem').filter({ hasText: 'UI developer' }).getByText('Still in the job at 90 days', { exact: true })).toBeVisible();

  // Gate G3 for the platform, and for the hub.
  await page.goto('/platform/outcomes');
  await expect(page.getByText('Gate G3 · Pilot outcomes')).toBeVisible();
  await expect(page.getByText('Employers engaged').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Employers engaged' }).getByRole('row').filter({ hasText: 'Sahel Digital' }).getByText('Engaged')).toBeVisible();
  await support(page);
  await page.goto('/dashboard/kirkira/outcomes');
  await expect(page.getByRole('heading', { name: 'Pilot outcomes' })).toBeVisible();
  await expect(page.getByText('Readiness assessed').first()).toBeVisible();
});

test('a hub’s own domain and branded emails; a learning path of courses in order', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  // The Kirkira owner now uses two-step sign-in, so the platform team helps through a support session.
  await signIn(page, 'ops@talentral.ng');
  await support(page);

  // White-label emails: sender name, reply address and footer, with a live preview.
  await page.goto('/dashboard/kirkira/branding');
  await page.getByLabel('Sender name').fill('Kirkira Academy');
  await page.getByLabel('Replies go to').fill('hello@kirkira.ng');
  await page.getByLabel('Footer line').fill('No 12 Zaria Road, Kano');
  await page.getByRole('button', { name: 'Save email settings' }).click();
  await expect(page.getByText('Email settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText(/No 12 Zaria Road, Kano/)).toBeVisible();
  await expect(page.getByText('From: Kirkira Academy via Talentral', { exact: false })).toBeVisible();

  // A custom domain: saved, proven with DNS, then it serves the hub's pages.
  await page.getByLabel('Your domain').fill('https://Apply.Kirkira.test/');
  await page.getByRole('button', { name: 'Save domain' }).click();
  await expect(page.getByText('Saved. Add the two DNS records below, then check.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'DNS records' }).getByText('_talentral.apply.kirkira.test')).toBeVisible();
  await expect(page.getByRole('region', { name: 'DNS records' }).getByText('hubs.talentral.ng')).toBeVisible();
  await page.getByRole('button', { name: 'Check DNS now' }).click();
  await expect(page.getByText(/^Verified\./)).toBeVisible();
  const home = await request.get('/', { headers: { 'x-test-host': 'apply.kirkira.test' } });
  expect(home.status()).toBe(200);
  expect(await home.text()).toMatch(/<title>Kirkira Innovation Hub/);
  const account = await request.get('/sign-in', { headers: { 'x-test-host': 'apply.kirkira.test' }, maxRedirects: 0 });
  expect(account.status()).toBe(307);
  expect(account.headers().location).toMatch(/\/sign-in$/); // same origin in tests, so Next shortens it
  const unknown = await request.get('/', { headers: { 'x-test-host': 'apply.someone-else.test' } });
  expect(await unknown.text()).toMatch(/<title>Talentral · Verified skills/); // unknown domains get Talentral's own home page

  // Hub emails now come from the hub, with its footer.
  const [{ id: cohort }] = await db`select id from cohorts where name = 'Cohort 1'`;
  await page.goto(`/dashboard/kirkira/cohorts/${cohort}`);
  await page.getByLabel('Announcement title').fill('Path ahead');
  await page.locator('#an-body').fill('Next we move on to JavaScript.');
  await page.getByRole('button', { name: 'Post announcement' }).click();
  await expect(page.getByText(/^Posted to \d+ learners?, \d+ emailed\./)).toBeVisible();
  const mail = await lastMail('fatima@example.com', /Kirkira Innovation Hub: Path ahead/);
  expect(mail.from).toBe('"Kirkira Academy via Talentral" <no-reply@talentral.ng>');
  expect(mail.replyTo).toBe('hello@kirkira.ng');
  expect(mail.html).toContain('No 12 Zaria Road, Kano');
  expect(mail.text).toContain('Sent for Kirkira Innovation Hub by Talentral');

  // A second course, then a learning path of both, in order.
  await page.goto('/dashboard/kirkira/courses');
  await page.getByLabel('Course title').fill('JavaScript basics');
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.waitForURL(/courses\/[0-9a-f-]+\?created=1/);
  const jsUrl = new URL(page.url()).pathname;
  await page.getByLabel('Lesson type').first().selectOption('text');
  await page.getByLabel('New lesson title').first().fill('Variables');
  await page.getByRole('button', { name: 'Add lesson' }).first().click();
  await page.waitForURL(/lessons\/[0-9a-f-]+$/);
  await page.getByLabel('Lesson text in English').fill('A variable holds a value you can use later.');
  await page.getByRole('button', { name: 'Save lesson' }).click();
  await expect(page.getByText('Lesson saved.')).toBeVisible();
  await page.goto(jsUrl);
  await page.getByRole('button', { name: 'Publish course' }).click();
  await expect(page.getByText(/^Published\./)).toBeVisible();

  await page.goto('/dashboard/kirkira/paths');
  await page.getByLabel('Path title').fill('Frontend developer');
  await page.getByLabel('Leads to (optional)').fill('Junior frontend developer');
  await page.getByRole('button', { name: 'Create path' }).click();
  await page.waitForURL(/paths\/[0-9a-f-]+\?created=1/);
  for (const c of ['JavaScript basics', 'Web development foundations']) {
    await page.getByLabel('Add a course').selectOption({ label: c });
    await page.getByRole('button', { name: 'Add to path' }).click();
    await expect(page.getByRole('list', { name: 'Courses in this path' }).getByText(c)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Move Web development foundations earlier' }).click();
  await expect(page.getByRole('list', { name: 'Courses in this path' }).getByRole('listitem').first()).toContainText('Web development foundations');
  await page.getByRole('button', { name: 'Publish path' }).click();
  await expect(page.getByText(/^Published\. Cohorts following this path/)).toBeVisible();

  await page.goto(`/dashboard/kirkira/cohorts/${cohort}`);
  await page.getByLabel('Learning path for this cohort').selectOption({ label: 'Frontend developer' });
  await page.getByRole('button', { name: 'Use this path' }).click();
  await expect(page.getByText(/now follows the learning path/)).toBeVisible();
  expect((await db`select count(*)::int as n from assessments a join lessons l on l.id = a.lesson_id join courses c on c.id = l.course_id where a.cohort_id = ${cohort} and c.title = 'Web development foundations'`)[0]!.n).toBeGreaterThan(0);

  // Fatima studies the path: the second course waits until she finishes the first.
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await expect(learner.getByText(/Learning path · course 1 of 2: Web development foundations/)).toBeVisible();
  await learner.goto(`/learn/${cohort}`);
  await expect(learner.getByRole('heading', { name: 'Frontend developer' })).toBeVisible();
  const steps = learner.getByRole('list', { name: 'Courses in this path' });
  await expect(steps.getByRole('listitem').nth(1)).toContainText('Opens after the course before');
  await expect(learner.getByRole('heading', { name: 'Course 2: JavaScript basics' })).toBeVisible();
  await expect(learner.getByText('Variables').locator('xpath=ancestor::div[@aria-disabled]')).toHaveCount(1);

  // The hub page shows the published path.
  const visitor = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await visitor.goto('/kirkira');
  await expect(visitor.getByRole('heading', { name: 'Learning paths' })).toBeVisible();
  await expect(visitor.getByText('Leads to: Junior frontend developer')).toBeVisible();
  await expect(visitor.getByRole('list', { name: 'Courses in Frontend developer' }).getByRole('listitem')).toHaveText(['1Web development foundations', '2JavaScript basics']);
  await db.end();
});

test('credentials by API with signatures; signed webhooks to a hub’s own system; the AI course tutor', async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const db = postgres(E2E_DATABASE_URL, { max: 1 });

  // 1. The public verification API: JSON for any system, signed, open to other sites, never guessing.
  const [{ serial }] = await db`select serial from certificates where revoked_at is null order by issued_at limit 1`;
  const res = await request.get(`/api/v1/public/credentials/${serial.toLowerCase()}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['access-control-allow-origin']).toBe('*');
  const body = await res.json();
  expect(body).toMatchObject({ object: 'credential', serial, status: 'valid', issuer: { slug: 'kirkira' } });
  expect(body.holder.name).toBeTruthy();
  const { signature, ...credential } = body;
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
  const { keys } = await (await request.get('/api/v1/public/keys')).json();
  expect(keys).toHaveLength(1);
  expect(signature.kid).toBe(keys[0].kid);
  const pub = createPublicKey({ key: keys[0], format: 'jwk' });
  expect(verifySignature(null, Buffer.from(canonical(credential)), pub, Buffer.from(signature.value, 'base64url'))).toBe(true);
  expect(verifySignature(null, Buffer.from(canonical({ ...credential, status: 'revoked' })), pub, Buffer.from(signature.value, 'base64url'))).toBe(false);
  const missing = await request.get('/api/v1/public/credentials/TAL-KIR-26-ZZZZZZ');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('not_found');
  await page.goto(`/verify/${serial}`);
  await expect(page.getByRole('link', { name: `/api/v1/public/credentials/${serial}` })).toBeVisible();

  // 2. Outbound webhooks to a receiver the hub runs (here, a local server that records requests).
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { received.push({ headers: req.headers, body: raw }); res.writeHead(204).end(); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    await signIn(page, 'ops@talentral.ng');
    await support(page);
    await page.goto('/dashboard/kirkira/webhooks');
    await expect(page.getByText('No endpoints yet')).toBeVisible();
    await page.getByLabel('Endpoint URL').fill(`http://127.0.0.1:${port}/talentral`);
    await page.getByLabel('Description').fill('Hub CRM');
    await page.getByRole('checkbox', { name: /certificate\.issued/ }).check();
    await page.getByRole('button', { name: 'Add endpoint' }).click();
    await expect(page.getByText('Endpoint added.')).toBeVisible();
    await page.getByRole('button', { name: 'Show signing secret' }).click();
    const secret = (await page.getByLabel('Signing secret', { exact: true }).textContent())!.trim();
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    const signedBy = (r: { headers: Record<string, string | string[] | undefined>; body: string }) => {
      const { t, v1 } = Object.fromEntries(String(r.headers['talentral-signature']).split(',').map((p) => p.split('='))) as { t: string; v1: string };
      return createHmac('sha256', secret).update(`${t}.${r.body}`).digest('hex') === v1;
    };

    // A test event goes out at once, signed.
    await page.getByRole('button', { name: 'Send test event' }).click();
    await expect(page.getByText('Delivered. Your endpoint answered 204.')).toBeVisible();
    expect(received).toHaveLength(1);
    expect(received[0]!.headers['talentral-event']).toBe('ping');
    expect(signedBy(received[0]!)).toBe(true);
    expect(signedBy({ ...received[0]!, body: received[0]!.body.replace('Test', 'Fake') })).toBe(false);

    // Real events are queued by the database and delivered by the scheduler.
    const [app] = await db`select id, reference, status from applications where email = 'umar@example.com'`;
    await db`update applications set status = 'under_review' where id = ${app!.id}`;
    const run = await request.get('/api/cron/reminders', { headers: { Authorization: 'Bearer e2e-cron-secret' } });
    expect((await run.json()).webhooks.delivered).toBeGreaterThanOrEqual(1);
    const changed = received.find((r) => r.headers['talentral-event'] === 'application.status_changed')!;
    expect(signedBy(changed)).toBe(true);
    expect(JSON.parse(changed.body)).toMatchObject({ type: 'application.status_changed', hub: 'kirkira',
      data: { application: { reference: app!.reference, status: 'under_review', previous_status: app!.status } } });
    await page.reload();
    await expect(page.getByRole('list', { name: /Recent deliveries/ }).getByText('application.status_changed')).toBeVisible();
    // Paused endpoints receive nothing.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await db`update applications set status = ${app!.status} where id = ${app!.id}`;
    await request.get('/api/cron/reminders', { headers: { Authorization: 'Bearer e2e-cron-secret' } });
    expect(received.filter((r) => r.headers['talentral-event'] === 'application.status_changed')).toHaveLength(1);
    await page.goto('/dashboard/kirkira/audit');
    await expect(page.getByText('Added a webhook endpoint')).toBeVisible();
  } finally {
    server.close();
  }

  // 3. The AI course tutor answers from the learner's own lessons and says when they do not cover it.
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  await learner.getByRole('link', { name: /Frontend developer/ }).first().click();
  await learner.getByRole('link', { name: /What is HTML\?/ }).click();
  const tutor = learner.getByRole('region', { name: /Ask the tutor/ });
  await learner.waitForLoadState('networkidle'); // the question box is a client component
  await tutor.getByRole('textbox', { name: 'Your question' }).fill('What does HTML do on a page?');
  await tutor.getByRole('button', { name: 'Ask' }).click();
  const answers = tutor.getByRole('list', { name: 'Your questions' });
  await expect(answers.getByText(/^From “/)).toBeVisible();
  await expect(answers.getByRole('link', { name: /What is HTML\?/ })).toBeVisible();
  await tutor.getByRole('textbox', { name: 'Your question' }).fill('How do I bake bread at home?');
  await tutor.getByRole('button', { name: 'Ask' }).click();
  await expect(answers.getByText(/Your lessons do not cover this yet/)).toBeVisible();
  // Kept for the learner only, and in their copy of their data.
  await learner.reload();
  await expect(learner.getByRole('list', { name: 'Your questions' }).getByText('How do I bake bread at home?')).toBeVisible();
  const mine = await (await learner.request.get('/account/export')).json();
  expect(mine.tutor_questions.map((q: { question: string }) => q.question)).toContain('What does HTML do on a page?');
  await db.end();
});

test('launch readiness: health, search engines, security headers, legal pages and founding-hub stories', async ({ page, request }) => {
  // Health for uptime monitors; robots and sitemap for search engines.
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', database: 'ok' });
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /dashboard');
  expect(robots).toContain('Sitemap: http://localhost:3100/sitemap.xml');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('http://localhost:3100/kirkira</loc>');
  expect(sitemap).toContain('/kirkira/apply/');

  // Security headers on every page, and the CSP report endpoint.
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(home.headers()['content-security-policy-report-only']).toContain('report-uri /api/csp-report');
  expect(home.headers()['strict-transport-security']).toContain('max-age=');
  const report = await request.post('/api/csp-report', { data: { 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://example.com/x.png', 'document-uri': 'http://localhost:3100/' } } });
  expect(report.status()).toBe(204);

  // Privacy notice and terms, linked from the landing page.
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy notice', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your rights' })).toBeVisible();
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Terms of use', level: 1 })).toBeVisible();

  // A founding-hub story: drafted by the platform team, private until published with the hub's agreement.
  await page.goto('/stories');
  await expect(page.getByText('The first stories are on their way')).toBeVisible();
  await signIn(page, 'ops@talentral.ng');
  await page.goto('/platform/stories');
  await page.getByLabel('Title').fill('Kirkira’s first iDICE cohort');
  await page.getByLabel('Hub').selectOption({ label: 'Kirkira Innovation Hub' });
  await page.getByLabel('Summary').fill('How Kirkira Innovation Hub ran its first iDICE cohort on Talentral, from the call for applications to learners in work.');
  await page.getByLabel('Headline figures').fill('Learners completed: 2 of 3\nOne figure without a value');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText(/Write each figure as "Label: value"/)).toBeVisible();
  await page.getByLabel('Headline figures').fill('Learners completed: 2 of 3\nPlaced in work: 1');
  await page.getByRole('textbox', { name: 'Story' }).fill('## The call\n\nApplications came in from across **Katsina**.');
  await page.getByLabel('Quote', { exact: true }).fill('We saw every step, from application to hire.');
  await page.getByLabel('Quote by').fill('Programme lead, Kirkira Innovation Hub');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Draft created. It stays private until you publish it.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Record who at the hub agreed to publication, and when.')).toBeVisible();
  await page.getByLabel('Hub’s agreement').fill('Approved by the Kirkira programme lead by email, 4 Oct 2026');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

  await page.goto('/stories');
  await page.getByRole('link', { name: /Kirkira’s first iDICE cohort/ }).click();
  await expect(page.getByRole('heading', { name: 'Kirkira’s first iDICE cohort', level: 1 })).toBeVisible();
  await expect(page.getByText('Placed in work', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The call' })).toBeVisible();
  await expect(page.getByText('Programme lead, Kirkira Innovation Hub')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From founding hubs' })).toBeVisible();
  await page.goto('/platform/audit');
  await expect(page.getByText('Published a case study')).toBeVisible();
});

test('accepted applicants get a welcome link, see their place, and an email to start learning when added to a cohort', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  // A second hub with its own lead, so other tests' applicants stay out of the way: Zainab holds an offer.
  const [{ id: hub }] = await db`insert into tenants (slug, name, status, contact_email, contact_phone, state, profile_completed_at)
    values ('arewa-data', 'Arewa Data Academy', 'active', 'hello@arewadata.ng', '0803 222 3333', 'Kano', now()) returning id`;
  await db`insert into users (email, full_name) values ('lead@arewadata.ng', 'Amina Lawal')`;
  await db`insert into memberships (tenant_id, user_id, role) select ${hub}, id, 'owner' from users where email = 'lead@arewadata.ng'`;
  const [{ id: programme }] = await db`insert into programmes (tenant_id, slug, title, status, reference_prefix)
    values (${hub}, 'welcome-call', 'Data skills for youth', 'closed', 'WEL') returning id`;
  const [{ id: application }] = await db`insert into applications (tenant_id, programme_id, reference, email, full_name, phone, consent_at, status)
    values (${hub}, ${programme}, 'WEL-26-ZAIN1', 'zainab@example.com', 'Zainab Umar', '0809 111 2222', now(), 'offered') returning id`;

  // 1. The hub accepts her. The email carries a one-click link to her learner account.
  await signIn(page, 'lead@arewadata.ng');
  await page.goto(`/dashboard/arewa-data/applications/${application}`);
  await page.getByRole('button', { name: 'Mark as accepted' }).click();
  await expect(page.getByText('Moved to Accepted. We emailed the applicant a link to their learner account.')).toBeVisible();
  const accepted = await lastMail('zainab@example.com', /Your place is confirmed: Data skills for youth/);
  expect(accepted.text).toContain('Open my learner account: ');
  expect(accepted.html).toContain('Open my learner account');
  const welcome = linkIn(accepted.text);
  expect(welcome).toMatch(/\/auth\/verify\?token=.+&welcome=1$/);

  // 2. One click opens her account on the learner home, with her place and what happens next.
  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await learner.goto(welcome);
  await expect(learner.getByRole('heading', { name: 'Welcome to Talentral' })).toBeVisible();
  await learner.getByRole('button', { name: 'Open my account' }).click();
  await learner.waitForURL(/\/learn$/);
  await expect(learner.getByRole('heading', { name: 'Welcome, Zainab' })).toBeVisible();
  const place = learner.getByRole('region', { name: 'Confirmed places' });
  await expect(place.getByText('Place confirmed')).toBeVisible();
  await expect(place.getByRole('heading', { name: 'Data skills for youth' })).toBeVisible();
  await expect(place.getByText('WEL-26-ZAIN1')).toBeVisible();
  await expect(place.getByText('Waiting for your hub')).toBeVisible();
  await expect(learner.getByText('No courses yet')).toHaveCount(0);
  const axe = await new AxeBuilder({ page: learner }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  // The link works once.
  const again = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await again.goto(welcome);
  await again.getByRole('button', { name: 'Open my account' }).click();
  await expect(again.getByText(/Welcome links work once and expire after 7 days/)).toBeVisible();

  // She completes her Passport from the checklist, and that step shows as done.
  await place.getByRole('link', { name: 'Open Passport' }).click();
  await learner.waitForURL(/\/passport$/);
  await db`insert into passports (user_id, headline, skills) select id, 'Aspiring data analyst', array['Excel'] from users where email = 'zainab@example.com'
    on conflict (user_id) do update set headline = excluded.headline, skills = excluded.skills`;
  await learner.goto('/learn');
  await expect(place.getByRole('link', { name: 'Open Passport' })).toHaveCount(0);

  // 3. Welcome links never open staff accounts: they sign in the usual way.
  await page.goto(`/dashboard/arewa-data/applications/${application}`);
  await expect(page.getByText('Not in a cohort yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Send welcome email again' }).click();
  await expect(page.getByText('Welcome email sent with a new link.')).toBeVisible();
  const resent = linkIn((await lastMail('zainab@example.com', /Your place is confirmed/)).text);
  expect(resent).not.toBe(welcome);
  await db`update sign_in_tokens set email = 'ops@talentral.ng' where token_hash = (select token_hash from sign_in_tokens where purpose = 'welcome' order by created_at desc limit 1)`;
  const staff = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await staff.goto(resent);
  await staff.getByRole('button', { name: 'Open my account' }).click();
  await staff.waitForURL(/\/sign-in\?notice=staff/);
  await expect(staff.getByText(/Your account has team access, so welcome links do not open it/)).toBeVisible();

  // 4. The hub adds her to a cohort; she gets an email to start learning and the place becomes her class.
  const [{ id: cohort }] = await db`insert into cohorts (tenant_id, programme_id, name, starts_on) values (${hub}, ${programme}, 'Data Cohort A', '2026-11-02') returning id`;
  await page.goto(`/dashboard/arewa-data/cohorts/${cohort}`);
  await expect(page.getByLabel('Email each learner a link to start learning')).toBeChecked();
  await page.getByRole('button', { name: 'Add 1 accepted applicant' }).click();
  await expect(page.getByText('1 learner added to the cohort. We emailed them a link to start learning.')).toBeVisible();
  const start = await lastMail('zainab@example.com', /Start learning: Data skills for youth/);
  expect(start.text).toContain('Data Cohort A');
  expect(start.text).toContain('2 Nov 2026');
  await learner.goto(linkIn(start.text));
  await learner.getByRole('button', { name: 'Open my account' }).click();
  await learner.waitForURL(/\/learn$/);
  await expect(learner.getByRole('region', { name: 'Confirmed places' })).toHaveCount(0);
  await expect(learner.getByText('Data Cohort A')).toBeVisible();
  await page.goto(`/dashboard/arewa-data/applications/${application}`);
  await expect(page.getByRole('link', { name: 'Data Cohort A' })).toBeVisible();
  await db.end();
});

test('main screens pass an automated accessibility scan (WCAG 2.2 AA)', async ({ browser }) => {
  test.setTimeout(420_000); // about 40 pages; CI runners are slower than a laptop
  const db = postgres(E2E_DATABASE_URL, { max: 1 });
  const [{ slug: programme }] = await db`select slug from programmes where title = 'iDICE Centre of Excellence Cohort 1'`;
  const [{ serial }] = await db`select serial from certificates where revoked_at is null order by issued_at limit 1`;
  const [{ id: cohort }] = await db`select id from cohorts where name = 'Cohort 1'`;
  const [{ id: course }] = await db`select id from courses where title = 'Web development foundations'`;
  await db.end();
  const results: { page: string; id: string; impact: string | null; help: string; nodes: string[] }[] = [];
  const scan = async (page: Page, label: string) => {
    await page.waitForLoadState('load');
    await page.waitForTimeout(300); // let client components settle
    // The branding page's email preview is a sandboxed iframe with scripts blocked, so axe cannot run
    // inside it and stalls until the frame times out. It shows an email, not a Talentral screen.
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('iframe[title="Email preview"]').analyze();
    for (const v of r.violations) results.push({ page: label, id: v.id, impact: v.impact ?? null, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) });
    if (process.env.AXE_REPORT) writeFileSync(process.env.AXE_REPORT, JSON.stringify(results, null, 2));
  };
  const visit = async (page: Page, path: string) => { await page.goto(path); await scan(page, path); };

  const visitor = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  for (const path of ['/', '/sign-in', '/privacy', '/stories', '/kirkira', `/kirkira/apply/${programme}`, `/verify/${serial}`, '/employers', '/jobs', '/this-page-does-not-exist']) await visit(visitor, path);

  const learner = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(learner, 'fatima@example.com', /\/learn/);
  for (const path of ['/learn', `/learn/${cohort}`, '/passport', '/jobs', '/jobs/applications', '/account/security', '/account/privacy', '/account/data']) await visit(learner, path);

  const staff = await (await browser.newContext({ baseURL: 'http://localhost:3100' })).newPage();
  await signIn(staff, 'ops@talentral.ng');
  await support(staff);
  for (const path of ['/dashboard/kirkira', '/dashboard/kirkira/applications', '/dashboard/kirkira/programmes', `/dashboard/kirkira/cohorts/${cohort}`,
    `/dashboard/kirkira/courses/${course}`, `/dashboard/kirkira/courses/${course}/preview`, '/dashboard/kirkira/grading', '/dashboard/kirkira/impact',
    `/dashboard/kirkira/cohorts/${cohort}/funder`, '/dashboard/kirkira/audit', '/dashboard/kirkira/health', '/dashboard/kirkira/outcomes', '/dashboard/kirkira/branding', '/dashboard/kirkira/paths', '/dashboard/kirkira/webhooks', '/platform', '/platform/privacy', '/platform/stories', '/platform/talent', '/platform/talent/placements', '/platform/health', '/platform/outcomes']) await visit(staff, path);

  if (process.env.AXE_REPORT) writeFileSync(process.env.AXE_REPORT, JSON.stringify(results, null, 2));
  const serious = results.filter((r) => r.impact === 'serious' || r.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
