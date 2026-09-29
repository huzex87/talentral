// The Week 0 journey end to end, on a phone-sized screen:
// platform admin creates a hub -> owner accepts, completes the profile and opens a call ->
// an applicant applies with a document -> the owner reviews, shortlists and exports.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { lastMail, linkIn } from './mail';

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

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const mail = await lastMail(email, /sign-in link/);
  await page.goto(linkIn(mail.text));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/\/dashboard|\/platform/);
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
  await applicant.getByRole('checkbox').first().check();
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
  await applicant.getByRole('checkbox').first().check();
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
  await owner.getByRole('checkbox', { name: /SMS/ }).check();
  await owner.getByLabel('Subject').fill('Next steps for {programme}');
  await owner.getByRole('textbox', { name: 'Message' }).fill('Dear {first_name},\n\nPlease confirm your place by Friday.');
  await owner.getByRole('textbox', { name: 'SMS' }).fill('{hub}: Hi {first_name}, confirm your place by Friday. Ref {reference}');
  await owner.getByRole('button', { name: 'Send to 1 person' }).click();
  await expect(owner.getByText('Sent to 1 person: 1 emailed, 1 texted.')).toBeVisible();
  const note = await lastMail('aisha@example.com', /Next steps for iDICE Centre of Excellence Cohort 1/);
  expect(note.text).toContain('Dear Aisha,');
  const texts = readdirSync(join(process.cwd(), '.sms')).map((f) => JSON.parse(readFileSync(join(process.cwd(), '.sms', f), 'utf8')));
  expect(texts).toEqual([{ to: '+2348031234567', text: `Kirkira Innovation Hub: Hi Aisha, confirm your place by Friday. Ref ${reference}` }]);
  await expect(owner.getByText('1 recipient · 1 emailed · 1 texted')).toBeVisible();

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
  await page.getByLabel('Venue or link').fill('Kirkira training room');
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
