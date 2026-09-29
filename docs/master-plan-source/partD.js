const { d, C, P, H1, bullets, table, callout, partDivider, mdBlock } = require('./h');

const { Paragraph, TextRun, AlignmentType } = d;

module.exports = () => [
  ...partDivider('Part D: Action Plan and Recommendation',
    'Part D converts the plan into immediate actions, closes with the strategic recommendation, and lists the assumptions and terms the plan depends on.'),

  H1('D1. The First 90 Days'),
  ...table(['#', 'Action', 'Owner', 'By'], [
    ['1', 'Clear the working name: CAC name search and reservation for {{CO}}, trademark search and filing (classes 9, 35, 41, 42), domains and social handles. Then incorporate and sign IP assignments', 'Founder, legal', 'Week 4'],
    ['2', 'Sign the Kirkira / iDICE pilot agreement (scope, KPIs, data roles, case-study rights)', 'Founder, Kirkira', 'Week 4'],
    ['3', 'Hire or contract the technical lead, designer and first two engineers', 'Founder', 'Week 3'],
    ['4', 'Run 15 to 25 discovery interviews with hubs, instructors, learners and employers', 'Product lead', 'Week 6'],
    ['5', 'Confirm iDICE programme tracks, cohort sizes and contractual KPIs in writing', 'Product lead, Kirkira', 'Week 6'],
    ['6', 'Sign off MVP-1 scope and acceptance criteria (Part B) through the Product Council', 'Product lead', 'Week 6'],
    ['7', 'Sprint 0: repository, CI, environments, design system, tenancy with RLS tests', 'Technical lead', 'Week 2 of build'],
    ['8', 'Complete the video provider spike (Bunny vs Mux) from Katsina, Kano and Abuja', 'Technical lead', 'Week 4 of build'],
    ['9', 'Build skills taxonomies and readiness rubrics for the first 3 to 5 tracks with employer advisers', 'Programme lead, employer advisers', 'Week 10'],
    ['10', 'Recruit an employer advisory group of at least 3 employers and start the employer CRM', 'Workforce lead', 'Week 8'],
    ['11', 'Prepare privacy notice, consent texts (English and Hausa), DPIA and safeguarding policy', 'Legal, compliance', 'Week 10'],
    ['12', 'Select pilot cohorts and schedule staff training; hold weekly product reviews from week 1', 'Pilot Steering Committee', 'Week 12'],
  ], [0.5, 5.8, 2.2, 1.5]),

  H1('D2. First Pilot User Journey'),
  P('A learner registers through the {{B}}-powered iDICE academy page, chooses Hausa or English and joins a cohort. They attend live and in-person sessions, download lessons to study offline, submit assignments and complete assessments. {{B}} records every piece of evidence. On completion the learner receives a verifiable credential and an evidence-based readiness status, then publishes a {{B}} Passport. With explicit consent, a talent officer includes them in a shortlist for a matched employer. The learner confirms interest, interviews and, if selected, starts work. The placement is recorded and flows into the programme\'s impact report.'),
  ...callout(null, ['This journey is the product\'s central design test. Every MVP feature must serve learning, evidence, opportunity or measurable impact.']),

  H1('D3. Strategic Narrative for Partners'),
  P('Kirkira and {{B}} are building digital infrastructure for the full skills-to-work lifecycle. The Academy Suite lets organisations deliver high-quality, measurable training. The Workforce Suite turns verified skills into a structured talent supply that employers can discover and engage. Together they create a pathway from learning to economic opportunity.'),
  P('The iDICE Centre of Excellence is the ideal launch environment because it combines training delivery, ecosystem partnerships, technology adoption and employment-oriented outcomes. Other hubs can then run their own branded academies on {{B}} and contribute to a wider talent network while keeping their own brand and programme identity.'),

  H1('D4. Final Strategic Recommendation'),
  P('Proceed with {{B}} as one ecosystem initiative under one brand and one company. Build the Academy Suite first, architected from day one to produce structured, consent-based skills evidence that the Workforce Suite consumes. Start workforce operations in parallel through a human-assisted talent officer process and an employer CRM, so employer demand exists by the time the first cohort graduates.'),
  P('Use the iDICE Centre of Excellence as the flagship implementation and validation environment. Launch a focused MVP, run real programmes, measure learner and employment outcomes, and iterate against the validation gates. Once results are credible, sell the proven operation to other hubs as a SaaS product.'),
  P('The long-term position: **{{B}} connects skills development to verified talent and global work, with technology that any training organisation can use, and Kirkira is its first proof.**'),

  H1('Conclusion'),
  P('{{B}} should be developed as one strategic ecosystem with clear product boundaries. The Academy Suite creates the learning and evidence layer. The Workforce Suite creates the employment layer. Kirkira provides the first operating environment, ecosystem relationships and Centre of Excellence platform. Together, the model serves learners, innovation hubs, development programmes, employers and international workforce markets.'),
  P('The immediate objective is the smallest credible system that demonstrates the complete journey from training to verified skills to real economic opportunity, then scaling that system through other hubs and employers. Parts B and C define that system precisely enough to begin building it.'),

  H1('Appendix A. Product Naming Registry'),
  ...table(['Name', 'Type', 'Description'], [
    ['{{B}}', 'Master brand (working name)', 'Skills-to-Work Platform; subject to CAC and trademark clearance'],
    ['{{CO}}', 'Company (proposed)', 'Owns platform, IP, brand and contracts'],
    ['{{B}} Academy Suite', 'Product suite', 'Academy, Learn, Cohort, Assess, Certify, Impact, Admin'],
    ['{{B}} Workforce Suite', 'Product suite', 'Verify, Match, Work, Employer, Global'],
    ['{{B}} Passport', 'Shared module', 'Learner-owned professional profile'],
    ['{{B}} AI', 'Shared module', 'Course-grounded AI layer'],
    ['Koyo', 'Internal codename (optional)', 'Not used in customer-facing material'],
  ], [3, 2.6, 4.4]),

  H1('Appendix B. Key Assumptions'),
  ...bullets([
    'The working name {{B}} clears CAC and trademark searches; if not, the name changes in one place in the document source.',
    'The iDICE Centre of Excellence selection and its KPIs provide a legitimate pilot environment; exact requirements will be confirmed contractually.',
    'Other hubs have enough operational pain and willingness to pay for programme-management infrastructure; this needs validation.',
    'Employer demand can be developed in parallel with the training pipeline.',
    'International physical placement is subject to applicable recruitment, employment, immigration and safeguarding rules.',
    'Pricing and budget figures are planning estimates, not market-validated quotations.',
    'Vendor capabilities and prices named in Part C are current at the time of writing and will be confirmed in Sprint 0.',
    'Employment outcomes cannot be guaranteed and will be communicated transparently.',
  ]),

  H1('Appendix C. Glossary'),
  ...table(['Term', 'Meaning'], [
    ['ADR', 'Architecture Decision Record'],
    ['CAC', 'Corporate Affairs Commission (Nigeria)'],
    ['Cohort', 'A scheduled group of learners taking a course together with staff and live sessions'],
    ['DPIA', 'Data Protection Impact Assessment'],
    ['ESO', 'Ecosystem Support Organisation, such as an innovation hub or accelerator'],
    ['iDICE', 'Investment in Digital and Creative Enterprises programme'],
    ['KISDC', 'Kirkira Innovation and Sustainable Development Center'],
    ['M&E', 'Monitoring and Evaluation'],
    ['MVP', 'Minimum Viable Product'],
    ['NDPA', 'Nigeria Data Protection Act 2023'],
    ['PWA', 'Progressive Web App: a website installable on a phone that can work offline'],
    ['RBAC', 'Role-Based Access Control'],
    ['RLS', 'Row-Level Security: database rules that restrict which rows each user can read or write'],
    ['Tenant', 'An organisation running its own academy on {{B}}'],
    ['TVET', 'Technical and Vocational Education and Training'],
    ['Verified Opportunity Outcome', 'A credentialed learner starting paid work within 180 days, confirmed by evidence'],
  ], [3, 7]),
  (mdBlock('*End of document.*'), new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'END OF DOCUMENT', bold: true, color: C.muted, size: 18, characterSpacing: 80 })] })),
];
