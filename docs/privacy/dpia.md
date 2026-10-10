# Data Protection Impact Assessment (DPIA): Talentral pilot

**Status:** Draft for legal review. Not yet approved.
**Scope:** The Talentral platform as used in the pilot with Kirkira Innovation Hub's iDICE Centre of Excellence (Katsina), MVP-1.
**Law:** Nigeria Data Protection Act 2023 (NDPA) and the General Application and Implementation Directive (GAID) 2025.
**Owner:** Talentral data protection lead. **Review:** before the pilot opens, then every six months or on any significant change.

Items marked **[confirm]** need a fact checked or a decision made before sign-off.

## 1. What the platform does and why a DPIA is needed

Talentral runs skills programmes for innovation hubs from application to work. People apply, hubs select and teach them, learners study and are assessed, earn verifiable certificates, and may choose to be put forward to employers.

A DPIA is needed because the platform:

- processes personal data of many young people, some of whom may be under 18;
- collects sensitive data where hubs ask for it (disability, and gender and age for funder reporting);
- matches people to jobs, which affects their opportunities;
- uses an AI assistant for staff; and
- stores data with providers outside Nigeria.

## 2. Roles

| Party | Role |
| --- | --- |
| Each hub (tenant), for example Kirkira Innovation Hub | Controller for its applicants, learners and programme data |
| Talentral | Processor for hubs; controller for platform accounts, the Passport, talent matching and platform security |
| Employers | Separate controllers for candidate data they receive with the learner's consent |
| Vendors (section 7) | Sub-processors to Talentral |

A controller-processor agreement with each hub is required before it goes live **[confirm: template agreed with legal]**.

## 3. Personal data processed

| Category | Examples | Where it comes from | Special or sensitive? |
| --- | --- | --- | --- |
| Identity and contact | Name, email, phone | Application form, CSV import | No |
| Application answers | Date of birth, gender, state, LGA, education, employment, motivation, uploaded documents | Application form | Disability status where the hub asks for it: **yes (health)** |
| Learning records | Attendance, lesson progress, quiz answers, assignments, grades, feedback, peer reviews, discussion posts | Use of the platform | No |
| Certificates | Name, programme, dates, score, serial | Issued by the hub | No, but public by design (verification page) |
| Passport and matching | Skills, readiness, portfolio items (title, description, link, skills, link to graded work, officer verification), availability date, relocation, target roles, consents, employer outcomes | Learner, hub, talent team | No |
| Employer accounts | Organisation details, CAC number, team members' names and work emails, verification notes from the talent team | Employer, talent team | No |
| Hub branding and domains | Email sender name, reply-to address and footer chosen by the hub; custom domain and its DNS check results (no personal data) | Hub, talent team | No |
| AI course tutor (beta) | A learner's questions about their course and the tutor's answers, with the lessons cited. Questions and the relevant lesson text go to Anthropic (Claude) to write the answer; no name, contact details or other learner data is sent. Kept 30 days, visible only to the learner, included in their data export | Learner, Anthropic as processor [confirm transfer terms] | No |
| Outbound webhooks | Events a hub chooses to send to its own systems: applicant and learner name, email and reference, application status, cohort, certificate details. Sent only to HTTPS endpoints the hub's owners or admins add; deliveries and their payloads are kept 30 days | Hub (controller of its own copy) | No |
| Public credential API | What a certificate already shows publicly (holder name, programme, cohort, hub, dates, attendance and score) for anyone with the certificate number; rate-limited; callers' IP addresses are counted for one day to limit abuse | Anyone with the number | No |
| Job applications and placements | Applications to jobs (optional note to the employer, the rule-based match and its reasons at the time), stages, withdrawal, hire details (type, start date, pay band), who confirmed the hire, the 90-day retention answer and notes from the talent team | Learner, employer, talent team | No |
| Shortlists and reply links | When an employer asks for a shortlist and when it is due and sent; a private one-tap link per candidate (only a hash is stored, it lasts 14 days, and it shows the person only the role, the employer, the place and the pay band); the person's yes or no | Employer, talent team, the candidate | No |
| Job alerts | Whether the person turned job alerts on and when; which jobs they were told about, when, and the match score at the time | The person, platform | No |
| Placement invoices | Invoice number, employer name, role, the hired person's name and start date, the fee terms (percentage and first-year pay, or a flat fee), VAT, due date, the 60-day replacement window, payment status and reference, and who issued it | Talent team | No; kept as financial records |
| Account security | Sign-in tokens, two-step secrets, recovery codes, sessions | Platform | No (security data) |
| Staff records | Hub team names and emails, audit trail of actions | Platform | No |
| Messaging preferences | Whether each phone number chose WhatsApp, where and when (form, account, STOP/START reply) | The person | No |
| Usage | Last activity per learner (for nudges), days with learning activity (for pilot health), AI draft counts (no text) | Platform | No |
| Feedback (NPS) | A 0 to 10 score and an optional comment, per cohort (learners) or hub (staff); shown to hub owners and admins without names | The person, when asked | No; comments are removed when the person's account is deleted |
| Security incidents | Date, description, whether personal data or more than one hub was involved | Platform team | May describe personal data; platform team only |

**Children:** the application form lets hubs collect date of birth. Programmes are for young adults, but under-18 applicants are possible. **[confirm]** Hubs must obtain parent or guardian consent for applicants under 18. An age check on the form is a planned control.

## 4. Purposes and lawful bases (NDPA s. 25)

| Purpose | Lawful basis |
| --- | --- |
| Receiving and reviewing applications | Contract (steps at the applicant's request) |
| Running cohorts: attendance, teaching, grading, certificates | Contract |
| Class reminders and nudges to inactive learners | Legitimate interest (helping learners complete); learners can ask the hub to stop |
| Messages on WhatsApp instead of SMS | Consent: an unticked box on the form, a choice on My learning or the account page, withdrawn by switch or by replying STOP |
| Disaggregated funder reporting (gender, age band, LGA, disability) | Legitimate interest of the hub and funder; aggregated only; disability data needs **explicit consent [confirm wording on forms]** |
| Talentral Passport and being put forward to employers | Consent, recorded and withdrawable (`consent_events`) |
| Applying to a job | Consent to share with that employer (Passport sharing must be on; the form says what the employer sees); withdrawable at any time before a hire |
| Recording hires and the 90-day retention check | Legitimate interest of the learner's hub and funders in outcomes; hubs see counts only, never employers; the learner sees their own record |
| Telling a candidate about a role (email and text with a one-tap reply link) and their yes or no | Consent: the person turned on discoverability or applied; the employer sees contact details only after the person says yes |
| Job alerts by email, WhatsApp or SMS | Consent: an off-by-default switch on the Passport, withdrawn by the same switch; texts follow the WhatsApp choice above |
| Placement invoices to employers | Contract with the employer, and legal obligation (tax and accounting records) |
| Certificate verification by third parties | Legitimate interest; the learner is told at issue |
| Security, audit log, fraud prevention | Legal obligation and legitimate interest |
| AI drafting help for staff | Legitimate interest; see section 6.4 |
| Pilot health: activation, weekly use, attendance and NPS | Legitimate interest of hubs and funders in knowing whether the programme works; figures are aggregated; answering NPS is optional and "Not now" is always offered |
| Security incident log | Legal obligation (NDPA breach notification) |

## 5. Data flows (summary)

1. An applicant submits a form on the hub's page. Data is stored in Postgres with row-level security, and files go to object storage.
2. Hub staff review, score and select. Selected people are enrolled in a cohort.
3. Learners sign in by email link or SMS code. They study, attend, submit work and are graded.
4. A certificate is issued, with a public verification page showing name, programme and dates.
5. With consent, the Passport is visible to the talent team and, if the learner allows, to verified employers. Shortlists go out by expiring links. Learners apply to jobs on the board; the employer then sees the Passport, the note and contact details. Employers can ask the talent team for a shortlist, which is due within three working days. A candidate who is put forward or invited gets an email and a text with a private one-tap link to answer yes or no; the employer sees contact details only after a yes. Employers record stages and hires; the scheduler asks them for a 90-day retention check. The talent team invoices the employer for a confirmed hire, and the invoice names the person hired.
6. Emails go through Resend and SMS through Termii. The scheduled job sends reminders, nudges and, to people who turned them on, up to three job alerts a day between 07:00 and 21:00 West Africa Time.

## 6. Risks and controls

Likelihood and impact are rated Low, Medium or High **after** the controls listed.

### 6.1 One hub seeing another hub's data
**Controls:** tenant isolation in the database (row-level security on every tenant table, covered by automated isolation tests), request code that runs as the signed-in person, and system access limited to sign-in, scheduling and privacy processing. **Residual: Low.**

### 6.2 Staff access beyond need
**Controls:**
- **Roles:** owner, admin, reviewer and facilitator, with owners and admins only for sensitive actions. Facilitators teach and never see applications, applicants' documents, scores, notes or messages to applicants; they see the names of learners enrolled in the hub's cohorts only (`app.can_select`, migration 0028).
- **Platform staff:** they enter a hub only through a support session. This needs a reason, lasts four hours, emails the hub's owners, and shows in the hub's overview and audit log.
- **Two-step sign-in:** available for everyone and can be required per hub.
- **Audit log:** covers exports, grade changes, consents, status changes, support access and privacy actions.

**Gap:** platform administrators can still read data directly in the database. This is controlled administratively and by audit, not technically. **Residual: Medium [confirm acceptable for pilot].**

### 6.3 Account takeover
**Controls:**
- Single-use, short-lived email links and SMS codes, both rate-limited.
- Two-step sign-in, with replay-protected codes and hashed recovery codes.
- Sessions are revoked when a person's data is deleted.

**Residual: Low.**

### 6.4 AI processing
**Controls:**
- **Staff drafting:** drafts are shown for review and nothing is saved without a person pressing Save. AI never sets grades.
- **Learner tutor (beta, MVP-2 month 11):** learners can ask questions about their course. The tutor answers only from the lessons they can open, cites them, declines when the lessons do not cover the question and never gives quiz or assignment answers. No name or contact details are sent; questions are kept 30 days for the learner only and included in their data export. It is labelled as AI and as beta, and tells learners to check important points with their facilitator.
- **Least data sent:** grading feedback sends the work and rubric only, never the learner's name. Funder summaries send aggregate figures only.
- **Nothing stored for drafts:** no prompt or draft text is kept, only counts. Tutor questions are kept 30 days, as above.
- **Provider terms:** under Anthropic's commercial terms, API data is not used to train models **[confirm current terms and region]**.

**Residual: Low.**

### 6.5 Automated decisions (NDPA s. 37)
**Controls:**
- Readiness levels follow published rules and are not a hidden score.
- Matching gives its reasons.
- Selection, grading and placement are always decided by people.
- Protected characteristics are never inputs to readiness or matching.

**Residual: Low.**

### 6.6 Sensitive data (disability) and disaggregation
**Controls:** optional questions, reports only in aggregate, and an anonymised export option. **Gaps:** consent wording on forms **[confirm]**, and small-number suppression in reports (hide groups under 5) is planned. **Residual: Medium.**

### 6.7 Public certificate verification
**Controls:** a certificate shows only name, programme, dates and hub, and the learner is told this. Certificates can be revoked, and they are withdrawn when a person's data is deleted. **Residual: Low.**

### 6.8 Messages reaching the wrong person
**Controls:**
- Phone and email come from the person's own application.
- Phone numbers are stored in one normalised format.
- A number found on applications from two different people is never used to link an account.

**Residual: Low.**

### 6.8a Reply links and job alerts
**Controls:**
- **Reply links:** the token is random and only its hash is stored, in a table no signed-in user can read. A link expires after 14 days, is replaced when a new one is issued, stops working once the person is hired, and is rate-limited. It shows only the person's first name, the role, the employer, the place and the pay band, never the Passport.
- **Job alerts:** off by default; each person hears about each job once and gets at most three alerts a day, only in daytime. The record of alerts sent is system-only and is deleted with the account.

**Residual: Low.**

### 6.8b Invoices naming the hired person
**Controls:** invoices are visible only to platform administrators and to members of the employer that made the hire (row-level security), and only administrators issue them or change their status. The invoice copies the person's name and start date at issue, because an issued invoice must not change. Waiving or voiding needs a written reason, and every change is in the audit log. Fees are a one-off service fee (ujrah) for a hire; there is no interest and no late-payment charge. **Residual: Low.**

### 6.9 Offline copies on shared phones
**Controls:**
- Offline copies are only the learner's own lesson pages and files.
- Signing out clears saved pages and files.

**Gap:** no device-level encryption beyond the phone's own; advise learners on shared phones. **Residual: Medium.**

### 6.10 Breach
**Controls:**
- **Response:** a breach runbook (`breach-runbook.md`) sets out a 72-hour notification to the NDPC.
- **Detection:** the audit log, plus error and uptime monitoring **[confirm Sentry and uptime monitoring in production]**.

**Residual: Medium.**

### 6.11 Transfers outside Nigeria
See section 7. **Controls:** vendor terms with standard contractual safeguards, data minimisation, and encryption in transit and at rest. **Residual: Medium [confirm GAID transfer mechanism].**

## 7. Sub-processors and locations

| Vendor | Purpose | Data | Location |
| --- | --- | --- | --- |
| Vercel | Web hosting | All request data in transit | Global edge; functions **[confirm region]** |
| Supabase | Database and file storage | All stored data | **[confirm region, for example eu-west]** |
| Resend | Email | Email address, message content | USA/EU **[confirm]** |
| Termii | SMS | Phone number, message content | Nigeria |
| Meta (WhatsApp Business Cloud API) | WhatsApp messages to people who opted in | Phone number, message content, sign-in codes | USA/EU **[confirm]** |
| Bunny.net (Bunny Stream) | Lesson video hosting, encoding and delivery | Lesson videos uploaded by hubs (course content, not learner data); viewer IP addresses in delivery logs | EU (Slovenia) with a global CDN **[confirm]** |
| Anthropic | AI drafting for staff (optional) | Staff notes, course text, anonymous work, aggregate figures | USA **[confirm]** |

## 8. Rights of the people involved

| Right | How it works |
| --- | --- |
| Information | A privacy notice on application forms and the site **[confirm final text, English and Hausa]** |
| Access | Account, Your data: download (JSON) or view and print (PDF) at any time; each download is audited |
| Correction | Account, Your data: correction request, handled by the platform team, with an email on completion; hubs can also correct application details |
| Erasure | Account, Your data: deletion request, answered within 30 days (section 9) |
| Withdraw consent | Passport settings (discoverability and employer sharing), recorded with time |
| Object to nudges or reminders | Ask the hub; per-learner opt-out is planned |
| Complaint | Data protection lead at privacy@talentral.ng, then the NDPC |

## 9. Retention and deletion

| Data | Kept for |
| --- | --- |
| Applications not selected | **[confirm: proposed 12 months after the call closes]**, then deleted or anonymised |
| Learner records | For the programme and funder reporting period **[confirm with iDICE contract, proposed 5 years]** |
| Certificates | Until revoked or the holder asks for deletion |
| Audit log | 5 years **[confirm]** |
| Sign-in tokens and codes | Minutes to days, then unusable |
| Reply links | 14 days, then unusable; deleted with the candidate record |
| Record of job alerts sent | Until the account is deleted **[confirm: proposed 12 months]** |
| Placement invoices | 6 years from the end of the tax year, as accounting records **[confirm with the accountant]** |

**On a deletion request,** the platform team carries it out from the privacy queue, and `app.erase_person` runs in a single database transaction:
- It deletes the account, contact details, free-text answers, notes, uploaded files, written work, quiz answers, peer review comments and discussion posts.
- It keeps anonymous records needed for funders and the law: participation, attendance, grades and completion, and gender, year of birth, state, LGA and disability. Certificates are withdrawn.
- The person is told exactly what was kept, both before they confirm and in the confirmation email.
- Reply links and the record of job alerts sent are deleted with the account. A placement invoice stays as an accounting record: its link to the candidate record is removed, and the name and start date on it are kept because tax law requires the issued invoice to stay as it was.
- If the person is a hub's only owner, it is refused until another owner is added.

## 10. Outcome and sign-off

| Item | Decision |
| --- | --- |
| Residual risk overall | Medium, acceptable for a supervised pilot once the **[confirm]** items are closed |
| Open actions before pilot | Controller-processor agreements; privacy notice in English and Hausa; disability consent wording; guardian consent for under-18s; retention periods agreed with iDICE; transfer mechanism for vendors; production monitoring |
| DPO or legal sign-off | Name, date |
| Talentral lead sign-off | Name, date |
| Hub (controller) sign-off | Kirkira Innovation Hub: name, date |
