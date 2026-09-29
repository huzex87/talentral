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
