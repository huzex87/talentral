// The Week 0 journey end to end, on a phone-sized screen:
// platform admin creates a hub -> owner accepts, completes the profile and opens a call ->
// an applicant applies with a document -> the owner reviews, shortlists and exports.
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

  // 5. The owner reviews, shortlists and exports.
  await owner.goto('/dashboard/kirkira');
  await expect(owner.getByText('Applications').first()).toBeVisible();
  await owner.goto('/dashboard/kirkira/applications');
  await owner.getByRole('link', { name: 'Aisha Musa' }).click();
  await expect(owner.getByText(reference)).toBeVisible();
  await expect(owner.getByRole('link', { name: /aisha-cv.pdf/ })).toBeVisible();
  await owner.getByRole('button', { name: 'Mark as shortlisted' }).click();
  await expect(owner.getByText('Current: Shortlisted')).toBeVisible();

  const download = owner.waitForEvent('download');
  await owner.goto('/dashboard/kirkira/applications');
  await owner.getByRole('link', { name: 'Download CSV' }).click();
  const csv = await (await (await download).createReadStream()).toArray();
  const text = Buffer.concat(csv).toString('utf8');
  expect(text).toContain(reference);
  expect(text).toContain('Shortlisted');
  expect(text).toContain('Why do you want to join this programme?');
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
