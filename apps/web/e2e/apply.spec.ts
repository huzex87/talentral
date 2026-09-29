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
  await expect(employer.getByRole('article').getByText('Platform-evidenced')).toBeVisible();
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
  await expect(officer.getByText('Verified', { exact: true })).toBeVisible();
  await lastMail('talent@saheldigital.ng', /Sahel Digital is verified on Talentral/);

  // Verified, the employer posts a job and sees ranked matches with reasons.
  await boss.goto('/employer');
  await boss.getByLabel('Job title').fill('React developer');
  await boss.getByLabel('Required skills').fill('React, JavaScript');
  await boss.getByLabel('Pay from (₦ a month)').fill('200000');
  await boss.getByLabel('Pay up to (₦ a month)').fill('300000');
  await boss.getByLabel('Job description').fill('Build booking and e-commerce sites for clients across Northern Nigeria. Remote, with a weekly team call.');
  await boss.getByRole('button', { name: 'Post job and see matches' }).click();
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
