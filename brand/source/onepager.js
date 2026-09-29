// Founding-hub partnership one-pager (A4 PDF) in the Talentral brand.
// Usage: node onepager.js   -> ../../docs/partners/talentral-founding-hub-offer.pdf
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const brandJs = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'master-plan-source', 'brand.js'), 'utf8');
const NAME = /name:\s*'([^']+)'/.exec(brandJs)[1];
const SLUG = NAME.toLowerCase();
const FONTS = path.join(__dirname, 'fonts');
const LOGO = path.join(__dirname, '..', 'logo');
const OUT = path.join(__dirname, '..', '..', 'docs', 'partners');

const b64 = (f) => fs.readFileSync(f).toString('base64');
const font = (family, w) => `@font-face{font-family:'${family}';font-weight:${w};src:url(data:font/ttf;base64,${b64(path.join(FONTS, `${family}-${w}.ttf`))}) format('truetype')}`;
const logo = (file, h) => `<img src="data:image/svg+xml;base64,${b64(path.join(LOGO, file))}" style="height:${h}px;display:block" alt="${NAME}">`;

const offer = [
  ['Your branded academy', `Your own space at <b>yourhub.${SLUG}.ng</b> with your logo, colours and programme pages.`],
  ['Applications and screening', 'Configurable application forms, scoring, shortlists, and email and SMS updates to every applicant.'],
  ['Cohorts and learning', 'Lessons, live sessions, attendance and announcements. Built for low bandwidth, in English and Hausa.'],
  ['Assessment and certificates', 'Quizzes, rubric-graded projects and certificates anyone can verify by QR code.'],
  ['Funder-ready reporting', 'Live dashboards and exports, disaggregated by gender, age, LGA and state.'],
  ['A route to work', `With learner consent, graduates join the ${NAME} talent pool that employers search.`],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${[400, 500, 600, 700].map((w) => font('Outfit', w) + font('Inter', w)).join('')}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter';color:#101733;-webkit-font-smoothing:antialiased}
.page{width:210mm;height:297mm;position:relative;overflow:hidden}
.hero{background:#0D1230;color:#fff;padding:11mm 16mm 8mm;position:relative}
.bar{position:absolute;top:0;left:0;right:0;height:2.2mm;background:linear-gradient(90deg,#7C3AED,#2E5BFF 52%,#14B8A6)}
.label{font:700 9pt 'Inter';letter-spacing:.14em;text-transform:uppercase}
h1{font:600 23pt/1.12 'Outfit';letter-spacing:-.01em;margin-top:4mm}
.lead{font-size:11pt;line-height:1.5;color:#C7CCE0;margin-top:3.5mm;max-width:160mm}
.body{padding:6mm 16mm 0}
h2{font:600 13.5pt 'Outfit';margin:0 0 3mm}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.card{border:1.2px solid #E3E7F2;border-radius:3.5mm;padding:2.8mm 4mm;background:#fff}
.card b.t{display:block;font:600 10.5pt 'Outfit';margin-bottom:1mm}
.card p{font-size:8.9pt;line-height:1.45;color:#5B6482}
.card p b{color:#101733}
.two{display:grid;grid-template-columns:1.05fr 1fr;gap:5mm;margin-top:5mm}
ul{list-style:none}
li{font-size:9pt;line-height:1.4;padding:1.1mm 0 1.1mm 5mm;position:relative;border-bottom:1px solid #EEF0F6}
li:before{content:'';position:absolute;left:0;top:3mm;width:2mm;height:2mm;border-radius:50%;background:#2E5BFF}
.terms li:before{background:#0F766E}
.time{margin-top:5mm;background:#F7F8FC;border-radius:3.5mm;padding:4mm 5mm;display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.time div{font-size:8.8pt;color:#5B6482;line-height:1.4}
.time b{display:block;font:600 10pt 'Outfit';color:#101733;margin-bottom:.8mm}
.foot{position:absolute;left:16mm;right:16mm;bottom:7mm;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #E3E7F2;padding-top:4mm}
.foot .who{font-size:8.8pt;color:#5B6482;line-height:1.5}
.foot .who b{color:#101733;font-size:9.6pt}
</style></head><body><div class="page">
  <div class="hero"><div class="bar"></div>
    <div style="display:flex;justify-content:space-between;align-items:center">${logo(`${SLUG}-logo-horizontal-dark.svg`, 30)}<span class="label" style="color:#14B8A6">Founding hub partnership</span></div>
    <h1>Run your programmes on ${NAME}<br>from day one. Pay when your cohort completes.</h1>
    <p class="lead">${NAME} is the skills-to-work platform for Northern Nigeria and beyond: one place to recruit applicants, train cohorts, prove skills and connect graduates to work. We are inviting ten founding hubs, with Kirkira Innovation Hub and the iDICE Centre of Excellence as the first.</p>
  </div>
  <div class="body">
    <h2>What your hub gets</h2>
    <div class="grid">${offer.map(([t, p]) => `<div class="card"><b class="t">${t}</b><p>${p}</p></div>`).join('')}</div>
    <div class="two">
      <div><h2>Founding terms</h2><ul class="terms">
        <li><b>50% off your first cohort</b> as a founding hub.</li>
        <li><b>Pay after completion:</b> invoiced when your cohort completes, in step with milestone-based funding such as iDICE.</li>
        <li><b>Founding-hub pricing</b> held for your next cohorts for 12 months.</li>
        <li><b>You shape the product:</b> a monthly feedback session with our team.</li>
        <li><b>Your data stays yours:</b> a data-processing agreement under the Nigeria Data Protection Act 2023. Learners own their Passports.</li>
      </ul></div>
      <div><h2>What we ask</h2><ul>
        <li>One named admin contact: we create your hub account and invite them</li>
        <li>Your team completes your hub profile: logo, colours, description and programmes</li>
        <li>Honest feedback and permission to share results as a case study</li>
        <li>A signed data-processing agreement</li>
      </ul></div>
    </div>
    <div class="time">
      <div><b>October 2026</b>iDICE Centre of Excellence applications open on ${NAME} with Kirkira.</div>
      <div><b>From sign-up</b>Your account is created and your admin sets up your profile and first call.</div>
      <div><b>From November</b>Cohorts, attendance, assessment, then certificates and reporting.</div>
    </div>
  </div>
  <div class="foot">
    <div class="who"><b>Huzaifa Yakubu Musa</b><br>Founder, ${NAME} · huzexng@gmail.com</div>
    <div class="who" style="text-align:right">Founding partner<br><b>Kirkira Innovation Hub · iDICE Centre of Excellence</b></div>
  </div>
</div></body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const pdf = path.join(OUT, `${SLUG}-founding-hub-offer.pdf`);
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.screenshot({ path: path.join(__dirname, '.preview', 'onepager.png'), fullPage: true });
  await browser.close();
  console.log('wrote', pdf);
})();
