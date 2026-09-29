const { P, H1, H2, H3, bullets, numbered, table, callout, figure, partDivider } = require('./h');

module.exports = () => [
  ...partDivider('Part A: Strategic Concept',
    'Part A sets out what {{B}} is, who it serves, how it makes money and how it grows. This version resolves the brand transition started in Version 2.0: {{B}} is the single master brand, {{CO}} is the proposed commercial entity, and every product capability is a {{B}} module. Parts B and C translate this concept into a buildable MVP.'),

  // A1
  H1('A1. Corporate, Brand and Product Architecture'),
  H2('A1.1 Strategic decision'),
  ...callout('Decision adopted in this Master Plan', [
    '{{B}} is the **single master commercial brand**, positioned as a **Skills-to-Work Platform**. A dedicated company, provisionally **{{CO}}**, owns the software, intellectual property, brand, domains, commercial contracts and platform operations, subject to Nigerian legal, tax, CAC and trademark due diligence.',
    'The earlier two-brand structure (Koyo for learning and a separate brand for workforce) is retired. **Koyo** survives only as an optional internal codename for the platform engine and never appears in customer-facing material unless later brand validation justifies it.',
  ]),
  P('One brand with two product suites gives the market a single, memorable promise from classroom to paycheque. It also concentrates marketing spend, avoids a confusing hand-off between two companies at the most valuable moment in the learner journey (graduation), and keeps one cap table for future investors.'),

  H2('A1.2 Product suites and modules'),
  P('{{B}} is organised into two suites that share one identity, one data platform and one consent system. A customer can buy the Academy Suite alone. The Workforce Suite draws its strongest supply from the Academy Suite but can also accept verified talent from approved external sources.'),
  ...figure('brand-architecture', '{{B}} company, product and ecosystem architecture. Every module carries the {{B}} name, for example {{B}} Learn.'),
  ...table(['Suite', 'Module', 'Purpose'], [
    ['Academy Suite', '{{B}} Academy', 'The white-label academy an organisation runs: storefront, catalogue, branding, custom domain'],
    ['', '{{B}} Learn', 'Learner experience: courses, lessons, media, offline packs, progress'],
    ['', '{{B}} Cohort', 'Cohorts, schedules, live sessions, attendance, announcements, mentors, learning circles'],
    ['', '{{B}} Assess', 'Quizzes, assignments, projects, rubrics and competency evidence'],
    ['', '{{B}} Certify', 'Certificates, badges and a public verification service'],
    ['', '{{B}} Impact', 'Programme analytics, M&E dashboards and funder reporting'],
    ['', '{{B}} Admin', 'Tenant administration, roles, billing and platform controls'],
    ['Shared layer', '{{B}} AI', 'Course-grounded tutoring, summaries, question generation, feedback assistance'],
    ['', '{{B}} Passport', 'Learner-owned professional profile built from verified evidence'],
    ['Workforce Suite', '{{B}} Verify', 'Identity, credential and skills verification with labelled verification levels'],
    ['', '{{B}} Match', 'Structured matching of verified talent to employer requirements'],
    ['', '{{B}} Work', 'Remote, local, freelance and internship opportunities with placement tracking'],
    ['', '{{B}} Employer', 'Employer portal: jobs, talent search, shortlists, interviews, placements'],
    ['', '{{B}} Global', 'International opportunities, GCC corridor and compliant mobility pathways'],
  ], [2, 2.2, 6], { group: true }),

  H2('A1.3 Ecosystem relationships'),
  ...table(['Party', 'Relationship to {{CO}}'], [
    ['Kirkira Innovation Hub / iDICE Centre of Excellence', 'Flagship customer, reference implementation and ecosystem partner. Operates its academy on {{B}} under a pilot agreement. Does not own the commercial platform.'],
    ['KISDC (Kirkira Innovation and Sustainable Development Center)', 'Development, impact and implementation partner where its mandate and funding allow. The commercial technology does not sit on its balance sheet.'],
    ['Partner hubs, TVET centres, universities, NGOs, academies', 'Academy Suite customers operating their own branded academies. Optional contributors to the shared talent network.'],
    ['Employers and clients', 'Demand side. Workforce Suite customers who search, shortlist, engage and place talent.'],
    ['Learners and talent', 'Users who own their Passport and control what employers see.'],
    ['Donors and government', 'Programme funders and buyers of outcome reporting.'],
  ], [3.2, 6.8]),

  H2('A1.4 Corporate and IP structure'),
  ...bullets([
    '**Ownership.** Founder(s) and shareholders own {{CO}}. The company owns the {{B}} brand, source code, platform IP, domains, data-processing agreements and commercial contracts.',
    '**IP assignment from day one.** Every developer, contractor and agency signs an IP assignment in favour of {{CO}} before writing code. Work done before incorporation is assigned by deed on incorporation.',
    '**Kirkira pilot agreement.** A written agreement covers the iDICE deployment: scope, service levels, fees or in-kind value, data-controller and data-processor roles, case-study rights and exit terms.',
    '**Separation from other ventures.** Huzex Lab, Disbursify Technologies Limited and other ventures stay outside {{B}}\'s cap table and IP unless a documented investment, licence or related-party agreement says otherwise. Shared services (for example design or engineering support) are invoiced at arm\'s length.',
    '**No separate Koyo company.** A spin-out is considered only if market, investment or governance needs later justify it.',
    '**Investment readiness.** The company is structured so founder equity, an employee share option pool, strategic investors and institutional investors can be added without restructuring the Kirkira ecosystem. Financing follows non-interest principles: equity, Musharakah or Mudarabah partnership structures and grants. No interest-bearing debt.',
  ]),

  H2('A1.5 Brand due diligence before launch'),
  ...callout('Working name: {{B}}', [
    'The name used in Version 2.0 was found to be registered with CAC by another party in September 2026. **{{B}}** ("talent central": the hub where talent is trained, proven and connected) is the working name from this version, subject to the clearance steps below. The name is set in one place in the document source, so a further change is a one-line edit.',
    'Domain check (September 2026): the .co, .io, .app, .work and .net domains were available; the .com was registered by another party.',
  ]),
  P('Before incorporation or public launch, complete a CAC name availability search and reservation, a Nigerian trademark search and filing (classes 9, 35, 41 and 42 at minimum), domain and social-handle registration, and an international conflict review in the GCC and key African markets. Domain or CAC availability does not establish legal availability of the mark.'),

  // A2
  H1('A2. Vision, Mission and Strategic Ambition'),
  H2('Vision'),
  P('Digital infrastructure that moves people across Africa from learning to verified skills, and from verified skills to sustainable economic opportunity.'),
  H2('Mission'),
  P('Give training organisations and employers the technology, talent intelligence and operational infrastructure to train, assess, credential, match and place skilled people.'),
  H2('Strategic ambition'),
  ...bullets([
    'Make the {{B}} Academy Suite a leading African platform for running cohort-based skills academies.',
    'Make the {{B}} Workforce Suite a trusted network connecting verified African talent to employers locally and globally.',
    'Establish Kirkira\'s iDICE Centre of Excellence as the flagship demonstration and validation environment.',
    'Build a Northern Nigeria-originated product with Africa-wide and global applicability.',
    'Shift programme success measurement from training volume toward demonstrated skills, placements and income.',
  ]),
  H2('Core proposition'),
  ...callout(null, [
    '**TRAIN → PROVE → CONNECT → WORK.** {{B}} for organisations: "Run your entire skills programme from one platform." {{B}} for talent and employers: "Turn verified skills into real work."',
  ]),
  ...figure('skills-to-work-journey', 'The skills-to-work journey and the modules behind each step.'),

  // A3
  H1('A3. Problem Statement'),
  ...bullets([
    'Many digital-skills programmes end at certificates, not employment outcomes.',
    'Training organisations stitch together separate tools for registration, learning, attendance, assessment, certificates, community and reporting. Data is lost between them and funder reports are assembled by hand.',
    'Conventional LMS products target generic education, not cohort-based African skills programmes with mentors, live sessions and practical projects.',
    'Low bandwidth, data costs and entry-level Android devices make video-first platforms hard to use outside strong urban connectivity.',
    'Employers cannot distinguish a certificate from demonstrated competence, so they discount local talent or rely on personal networks.',
    'Training providers lack a systematic pipeline from graduation to employers.',
    'International employers need trustworthy, structured information on skills, availability, communication ability and work readiness.',
    'Programme operators need auditable evidence for funders and government.',
  ]),

  // A4
  H1('A4. Value Proposition by Customer'),
  ...table(['Customer', 'What {{B}} gives them', 'Why they pay or participate'], [
    ['Learners', 'One place for lessons, live classes, assignments, projects, credentials and opportunities. Offline learning. English and Hausa. A portable Passport based on evidence.', 'Free to the learner in funded programmes. Better access to work.'],
    ['Hubs and training organisations', 'A branded academy without building an LMS. Cohorts, attendance, assessment, certificates and funder reports in one system. Optional route to employers.', 'Lower operating cost per learner, stronger funder reporting, better graduate outcomes, course revenue.'],
    ['Employers', 'Searchable, verified talent with evidence alongside CVs. Curated shortlists. Remote and managed-team options.', 'Faster, lower-risk hiring. Access to talent outside personal networks.'],
    ['Donors and government', 'Visibility from enrolment to placement. Demographic, geographic and skills analytics. Auditable outcomes.', 'Proof of impact per naira spent.'],
  ], [2, 5, 3]),

  // A5
  H1('A5. Ideal Customer Profiles and Beachhead'),
  P('A focused beachhead matters more than a broad feature list. The MVP serves three buyer types in this order.'),
  ...table(['Priority', 'Customer profile', 'Buying trigger', 'Evidence of fit'], [
    ['1. Beachhead', 'Donor-funded digital-skills programmes in Northern Nigeria running 100 to 1,000 learners per cohort (iDICE CoE first)', 'Funder KPIs on completion and placement; reporting deadlines', 'Kirkira pilot results; renewal of the programme'],
    ['2. Expansion', 'Innovation hubs and ESOs (ecosystem support organisations) in the iDICE network and North-West Nigeria', 'Need for a professional academy without in-house engineering', 'Paid subscriptions from founding hubs'],
    ['3. Demand side', 'Employers hiring for remote-compatible roles: digital marketing, customer support, virtual assistance, design, software, data', 'Hard-to-fill entry-level roles; cost pressure', 'Employer shortlists requested and interviews held'],
    ['Later', 'Universities, TVET institutions, corporate academies, state agencies, GCC employers', 'Institutional mandates; workforce programmes', 'Enterprise contracts'],
  ], [1.4, 3.6, 2.6, 2.4]),

  // A6
  H1('A6. Product Concept'),
  H2('A6.1 The Academy Suite as an academy operating system'),
  P('{{B}} Academy is a multi-tenant SaaS platform. Each organisation (a tenant) receives a logically isolated academy with its own users, courses, cohorts, instructors, branding, certificates, reports and, where subscribed, custom domain. The platform is cohort-first: a course is content, and a cohort is a scheduled group of people moving through that content with instructors, mentors, live sessions and deadlines.'),
  H2('A6.2 Learner experience'),
  ...bullets([
    '**Action-first dashboard:** continue learning, next live session, pending assignments, announcements, progress, achievements and career readiness.',
    '**Formats:** video, audio, text, PDF and resources, quizzes, assignments, projects, live classes, recordings, transcripts and downloadable offline lessons.',
    '**Microlearning:** units of 5 to 10 minutes combining a short lesson, reading, knowledge check and practical task.',
    '**Learning paths:** career pathways instead of isolated courses, for example Digital Marketing → Social Media → Content Creation → Analytics → Client Simulation → Capstone.',
    '**Learning circles:** study groups, peer review, discussions, challenges and mentor interaction inside each cohort.',
  ]),
  H2('A6.3 Localisation and low-bandwidth design'),
  ...bullets([
    '**Mobile-first:** designed for entry-level Android phones and mobile browsers as an installable Progressive Web App (PWA). Desktop is supported, not primary.',
    '**Offline-first:** downloadable lesson packs, compressed media, audio-only alternatives, local caching, offline quiz completion where safe, and automatic sync when connectivity returns.',
    '**Language:** English as the professional language with Hausa as a first-class interface and content language. Arabic and other African languages follow demand.',
    '**Voice (later):** a {{B}} AI voice tutor that answers questions asked in Hausa or English.',
  ]),
  H2('A6.4 {{B}} AI principles'),
  P('AI augments instructors and never replaces human judgement on consequential decisions.'),
  ...bullets([
    'Answers are grounded in approved course material and cite the source lesson.',
    'Instructors review AI-generated questions, summaries and feedback before learners see them.',
    'Grading, certification and employment decisions always keep a human decision-maker.',
    'The AI layer is provider-agnostic so models can change on cost, quality or data-residency grounds.',
    'AI usage is metered per tenant so it can be priced and capped.',
  ]),

  // A7
  H1('A7. Skills Evidence and Employment Readiness'),
  P('{{B}} moves beyond certificate issuance. Each learner accumulates evidence across knowledge tests, practical assignments, projects, attendance, communication tasks and capstones. The evidence feeds a transparent Employment Readiness status.'),
  ...table(['Dimension', 'Evidence', 'Source module'], [
    ['Knowledge', 'Quizzes, examinations, module tests', 'Assess'],
    ['Practical skill', 'Rubric-graded assignments and practical tasks', 'Assess'],
    ['Project capability', 'Portfolio items and capstone', 'Assess, Passport'],
    ['Communication', 'Presentation, written work or structured assessment', 'Assess'],
    ['Professional behaviour', 'Attendance, on-time submission, peer and mentor feedback', 'Cohort'],
    ['Tool proficiency', 'Practical demonstration graded against a rubric', 'Assess'],
    ['Interview readiness', 'Mock interview or structured simulation', 'Assess'],
    ['Credential status', 'Verified course or programme completion', 'Certify'],
  ], [2.2, 5, 2]),
  ...callout('Readiness is a status, not a score', [
    '{{B}} shows four plain levels (**Not yet assessed, Developing, Ready, Ready and Verified**) with the evidence behind each dimension. The rules are published to learners and employers. {{B}} never presents readiness as a hidden algorithmic score or as a guarantee of employment.',
  ]),

  // A8
  H1('A8. {{B}} Passport'),
  P('The Passport is the bridge between learning records and work. It belongs to the learner, not to the academy that trained them, so it travels with the learner across tenants and programmes.'),
  H3('Profile contents'),
  ...bullets([
    'Professional identity, location, languages and headline.',
    'Skills, each linked to the evidence behind it and its verification level.',
    'Credentials issued on {{B}} (auto-attached) and external credentials (self-declared until verified).',
    'Projects, portfolio links and work samples.',
    'Experience, availability, work-mode and relocation preferences, target roles.',
    'Work-authorisation information where relevant (never shown by default).',
    'Assessment records and references where the learner consents.',
  ]),
  H3('Control and privacy'),
  ...bullets([
    'The Passport is private by default. The learner chooses visibility per section: private, shared with specific employers, or discoverable by approved employers.',
    'Sensitive data (date of birth, NIN, exact address, work authorisation) never appears in employer search results.',
    'Every share and every employer view is logged and visible to the learner.',
    'The learner can withdraw consent at any time. Withdrawal removes the profile from search immediately.',
  ]),

  // A9
  H1('A9. Workforce Suite'),
  ...table(['Module', 'Scope'], [
    ['{{B}} Verify', 'Identity and credential checks, skills evidence verification. Every claim carries a label: **Self-declared**, **Platform-evidenced** (earned on {{B}}), **Verified** (checked by a {{B}} officer or trusted issuer). {{B}} never implies all information is independently verified.'],
    ['{{B}} Match', 'Matches structured job requirements with verified skills, experience, availability, language, location and work mode. Every match shows its reasons. Matching recommends; employers decide.'],
    ['{{B}} Work', 'Remote jobs, freelance and project engagements, internships and local employment, with application, interview and placement tracking.'],
    ['{{B}} Employer', 'Employer organisation accounts, job posting, talent search, curated shortlists, interview scheduling and placement confirmation.'],
    ['{{B}} Global', 'International opportunities, starting with remote cross-border service delivery. Physical placement only through lawful work-authorisation routes and licensed partners.'],
    ['Managed teams (later)', '{{B}}-managed delivery teams for clients (digital marketing, customer support, creative production, software, virtual assistance), invoiced as a service.'],
  ], [2.2, 7.8]),

  // A10
  H1('A10. GCC and International Strategy'),
  P('The GCC corridor (Saudi Arabia, UAE, Qatar) is a strategic market. {{B}} enters it through verified employer demand, never through promises to applicants.'),
  ...numbered([
    'Start with remote and cross-border service delivery, which needs no migration.',
    'Secure employer relationships and signed demand before scaling candidate acquisition.',
    'Build occupation-specific talent pools against real job descriptions.',
    'Use only lawful recruitment, immigration and employment structures, with licensed local partners where required.',
    'Publish transparent contracts, job descriptions and conditions. Candidates never pay recruitment fees: employers pay, in line with the employer-pays principle of ethical recruitment.',
    'Maintain safeguarding and anti-exploitation controls, including post-placement check-ins and a grievance channel.',
  ]),

  // A11
  H1('A11. iDICE Centre of Excellence as Flagship Pilot'),
  P('The Centre is the Academy Suite\'s first production environment and the Workforce Suite\'s first structured talent pipeline.'),
  H3('Pilot objectives'),
  ...bullets([
    'Run selected iDICE programmes end to end on {{B}}.',
    'Create verified learner and skills records for every enrolled learner.',
    'Produce a portfolio-ready graduate pipeline and first employer engagements.',
    'Measure conversion from enrolment to completion to opportunity.',
    'Produce case studies and data for external hub sales.',
  ]),
  H3('Illustrative pilot targets'),
  ...table(['Indicator', 'Illustrative target'], [
    ['Learners', '300 to 500'],
    ['Programmes', '2 to 3'],
    ['Completion tracking', '100% of enrolled learners'],
    ['Portfolio evidence', 'At least one capstone or project per applicable track'],
    ['Readiness assessment', 'All eligible completers'],
    ['Employer engagement', '10 to 25 employers or clients'],
    ['External hubs signed after pilot', '5 to 10'],
    ['Placement objective', 'Set after baseline and employer-demand validation'],
  ], [4, 6]),
  P('These figures are planning assumptions, not guaranteed results. Final targets follow confirmation of iDICE programme scope, cohort sizes and contractual KPIs.'),

  // A12
  H1('A12. Multi-Hub SaaS Strategy'),
  H2('A12.1 Founding hub model'),
  P('Kirkira is the first reference customer. Five to ten selected hubs then join as founding customers on preferential pricing in exchange for structured feedback, product testing and case-study permission.'),
  H2('A12.2 White-label features'),
  ...bullets(['Logo, brand colours and academy name', 'Academy subdomain, then custom domain', 'Organisation-specific certificate templates', 'Organisation-specific catalogue and communications', 'Branded PWA install name and icon (later)']),
  H2('A12.3 Hub onboarding sequence'),
  ...numbered([
    'Organisation registration and verification.',
    'Branding and roles configured.',
    'Courses imported or created.',
    'First cohort created.',
    'Administrators and instructors trained (two live sessions plus guides).',
    'Learner onboarding launched by invite link, CSV import or public enrolment page.',
    'Assessments and certificates configured.',
    'Impact dashboard activated.',
    'Workforce integration optionally activated.',
  ]),

  // A13
  H1('A13. Business Model and Pricing'),
  H2('A13.1 Academy Suite subscriptions'),
  ...table(['Tier', 'Illustrative pricing', 'Target customer', 'Included (proposed)'], [
    ['Community', 'Free', 'Individual instructors, small community programmes', 'Up to 50 active learners, {{B}} branding, core learning'],
    ['Hub', '₦50,000 to ₦150,000 per month', 'Small and medium hubs and academies', 'Up to 500 active learners, white-label, certificates, Impact dashboard'],
    ['Programme', 'Custom per cohort', 'Donor-funded programmes and large cohorts', 'Priced per enrolled learner, funder reporting pack, implementation support'],
    ['Professional', '₦150,000 to ₦400,000+ per month', 'Established training organisations', 'Custom domain, advanced analytics, AI allowance, priority support'],
    ['Enterprise', 'Custom', 'Government, universities, large NGOs and corporates', 'SSO, SLAs, data-residency options, dedicated success manager'],
  ], [1.5, 2.3, 3, 3.2]),
  P('Pricing is indicative and must be validated in customer interviews and pilots. Usage components: active learners above plan, video storage and streaming, AI usage, SMS and WhatsApp messages, premium support. The unit of value is the **active learner per month**, which aligns price with the customer\'s own programme size.'),
  H2('A13.2 Workforce Suite revenue'),
  ...bullets([
    'Employer subscriptions for talent search and shortlists.',
    'Success fees on placement where legally permissible, charged to employers.',
    'Managed outsourcing margin on {{B}}-managed teams.',
    'Recruitment and selection services.',
    'Verification services.',
    'International mobility services only through compliant, licensed structures.',
  ]),

  // A14
  H1('A14. Go-to-Market'),
  ...table(['Stage', 'Focus', 'Exit signal'], [
    ['1. Proof through Kirkira', 'Run iDICE programmes on {{B}} and measure outcomes', 'Pilot completion data and first placements'],
    ['2. Founding hubs', '5 to 10 hubs in North-West and wider Northern Nigeria', 'Paid subscriptions and renewals'],
    ['3. Nigeria', 'Hubs, TVET providers, NGOs, universities, corporate academies', 'Repeatable sales cycle under 90 days'],
    ['4. Africa', 'African hub networks and skills organisations', 'First tenants outside Nigeria'],
    ['5. Global corridors', 'Employer and talent corridors beyond Nigeria, including the GCC', 'Recurring cross-border placements'],
  ], [2.2, 4.4, 3.4]),
  H2('Employer acquisition'),
  ...bullets([
    'Run a structured employer CRM from day one, even before the employer portal exists.',
    'Start with remote-compatible sectors: digital marketing, customer support, virtual assistance, design, software, data and creative production.',
    'Form an employer advisory group that reviews curricula and rubrics.',
    'Offer curated shortlists of three to five candidates instead of raw CV dumps.',
    'Use talent showcases, demo days and sector talent pools.',
    'Use pilot placements to build references and case studies.',
  ]),

  // A15
  H1('A15. Competitive Positioning'),
  ...table(['Alternative', '{{B}} differentiation'], [
    ['Generic LMS (Moodle, Canvas, Teachable, Thinkific)', 'Cohort-first, skills-first, offline-capable and linked to employment'],
    ['Course marketplaces (Coursera, Udemy)', 'Organisation-owned academies with programme management'],
    ['Video meeting tools', 'The full learning lifecycle, not only live classes'],
    ['Recruitment platforms and job boards', 'Verified learning evidence and skills provenance'],
    ['Traditional recruitment agencies', 'A digital talent network fed by a learning pipeline'],
    ['Government programme portals', 'Reusable infrastructure serving many organisations'],
    ['Generic AI tutors', 'Course-grounded AI connected to real learner records'],
  ], [4, 6]),

  // A16
  H1('A16. Partnerships'),
  ...bullets([
    'iDICE ecosystem and participating ESOs.',
    'Government digital-skills agencies and state ministries.',
    'Innovation hub networks, universities and TVET institutions.',
    'Development partners and NGOs.',
    'Employer associations and chambers of commerce.',
    'Cloud, video, AI, payment and messaging providers.',
    'GCC employers and appropriately licensed recruitment partners.',
  ]),

  // A17
  H1('A17. Operating Model and Governance'),
  H2('A17.1 Operating teams'),
  ...bullets([
    'Product and engineering build and run the platform.',
    'Customer success onboards and supports tenants.',
    'Programme implementation supports large deployments such as iDICE.',
    'Workforce team (talent officers and employer partnerships) develops demand and runs matching.',
    'Partnerships develops hubs, donors and government relationships.',
    'M&E produces impact reporting.',
    'Legal and compliance oversees data protection, recruitment and mobility.',
  ]),
  H2('A17.2 Governance bodies'),
  ...table(['Body', 'Members', 'Mandate'], [
    ['{{B}} Board', 'Founder(s), shareholder representatives, independent adviser(s)', 'Strategy, budget, fundraising, risk'],
    ['Pilot Steering Committee', '{{B}} product lead, Kirkira/iDICE programme lead, M&E lead, finance/legal representative', 'Pilot scope, KPIs, escalation, fortnightly review'],
    ['Product Council', 'Product lead, tech lead, design lead, customer success', 'Roadmap, change control, release approval, quarterly user feedback'],
    ['Talent Governance Panel', 'Workforce lead, safeguarding officer, legal adviser', 'Verification rules, employer access, consent, disputes, suspensions, placement reporting'],
  ], [2.2, 4.3, 3.5]),

  // A18
  H1('A18. Impact Framework'),
  ...callout('North Star Metric: Verified Opportunity Outcomes', [
    'The number of learners who hold a {{B}} credential **and** start a paid engagement (employment, paid internship, freelance or project contract) within 180 days of completion, confirmed by the employer or by documentary evidence.',
  ]),
  ...table(['Area', 'Key indicators'], [
    ['Learning', 'Enrolment, activation (first lesson within 7 days), weekly active learners, attendance rate, completion rate, assessment completion, project completion, satisfaction, time to completion'],
    ['Talent', 'Passports created, Passports discoverable, skills assessed, portfolio-ready learners, readiness levels, employer profile views, shortlists, interviews'],
    ['Employment', 'Applications, matches, offers, placements, 90-day retention, remote engagements, international placements, income generated where ethically and legally measurable'],
    ['SaaS', 'Paying tenants, MRR, ARR, active learners, net revenue retention, tenant churn, CAC, LTV, support tickets per tenant, uptime'],
  ], [1.6, 8.4]),

  // A19
  H1('A19. Risks and Mitigation'),
  ...table(['Risk', 'Mitigation'], [
    ['Low willingness to pay', 'Validate pricing in pilots; programme-based pricing tied to funder budgets; clear cost-per-learner ROI'],
    ['Low learner engagement', 'Cohort design, WhatsApp and SMS nudges, mentors, microlearning, practical projects'],
    ['Bandwidth and device limits', 'Offline-first PWA, low-bitrate media, audio and text alternatives, performance budgets enforced in CI'],
    ['AI inaccuracy', 'Retrieval-grounded AI with citations, instructor review, clear limits, no AI-only grading'],
    ['Slow employer demand', 'Employer CRM and advisory group from month 1; remote-work sectors first; human-assisted matching before automation'],
    ['International placement harm', 'Licensed partners only, transparent contracts, no candidate fees, safeguarding officer, grievance channel'],
    ['Data protection breach', 'Privacy by design, NDPA 2023 compliance, tenant isolation enforced in the database, audits, encryption'],
    ['Scope creep', 'Strict MVP phasing (Part B), change control through the Product Council'],
    ['Competition from established LMSs', 'Differentiate on localisation, cohorts, evidence and employment linkage'],
    ['Dependence on one programme', 'Use iDICE as pilot while building a multi-tenant commercial pipeline from month 6'],
    ['Key-person dependency', 'Documented architecture, code review, shared ownership of critical systems'],
  ], [3, 7]),

  // A20
  H1('A20. Investment and Funding Proposition'),
  P('Funding separates into three uses: product development, pilot deployment and workforce-market development. All sources follow non-interest principles.'),
  ...bullets([
    'Grant or programme funding for the iDICE pilot implementation.',
    'Donor-funded programme deployments on the Programme tier.',
    'Strategic technology partnerships (cloud credits, AI credits, video credits).',
    'Employer-funded talent programmes.',
    'Academy Suite subscriptions and Workforce Suite fees.',
    'Equity-based impact or venture investment, or Musharakah and Mudarabah partnership financing, after evidence of product-market fit.',
  ]),
  P('The investment narrative rests on measurable outcomes, recurring SaaS revenue, a two-sided network effect (more academies bring more verified talent, which attracts more employers, which makes academies more valuable) and the potential to scale across Africa.'),

  // A21
  H1('A21. Success Definition'),
  P('{{B}} succeeds when the Academy Suite is independently valuable to training organisations, the Workforce Suite is independently valuable to employers, and the connection between them creates additional value for both.'),
  ...bullets([
    'Kirkira runs its major programmes digitally without fragmented tools.',
    'External hubs pay for the Academy Suite and renew.',
    'Learners produce verifiable skills evidence and portfolios.',
    'Employers use {{B}} to discover and engage talent, and return.',
    'Programmes report measurable progression toward employment.',
    'Remote and physical placement pipelines operate compliantly.',
    'Revenue is diversified across SaaS and workforce services.',
    'The platform scales beyond Northern Nigeria without redesigning its core architecture.',
  ]),
];
