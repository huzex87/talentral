// Renders the master plan figures (HTML + CSS on Huzex Light tokens) to PNG.
// Usage: node diagrams.js   (writes ../assets/*.png)
// Needs Playwright with a Chromium build; set CHROMIUM_PATH to use a preinstalled browser.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { fill } = require('./h');

const OUT = path.join(__dirname, '..', 'assets');
const FONT_FILE = path.join(__dirname, 'fonts', 'Inter.woff2');

const fontFace = fs.existsSync(FONT_FILE)
  ? `@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${fs.readFileSync(FONT_FILE).toString('base64')}) format('woff2');font-weight:100 900;font-style:normal}`
  : '';
if (!fontFace) console.warn('fonts/Inter.woff2 not found: figures fall back to a system sans-serif font.');

const arrowRight = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" stroke="#409EF2" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrowDown = '<svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M10 1v18M4 13l6 6 6-6" stroke="#409EF2" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chips = (list) => `<div class="chips">${list.map((c) => `<span class="chip">${c}</span>`).join('')}</div>`;

const base = `
${fontFace}
*{box-sizing:border-box}
body{margin:0;background:#fff;font-family:'Inter','Liberation Sans','Helvetica Neue',Arial,sans-serif;color:#072435;-webkit-font-smoothing:antialiased}
#d{width:760px;padding:22px;background:#fff}
.lbl{font-size:12px;font-weight:700;letter-spacing:.14em;color:#409EF2;text-transform:uppercase}
.card{background:#fff;border:1.5px solid #D6E6F5;border-radius:16px;box-shadow:0 2px 10px rgba(7,36,53,.06)}
.t{font-weight:700;font-size:17.5px;line-height:1.25}
.s{font-size:14px;color:#4A6275;line-height:1.4;margin-top:3px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{display:inline-flex;align-items:center;padding:5px 11px;border-radius:999px;background:#EAF4FE;color:#072435;font-weight:600;font-size:14.5px;line-height:1.25}
`;

const figures = {
  'brand-architecture': `
<style>${base}
.top{margin:0 auto;width:max-content;background:#409EF2;color:#fff;border-radius:14px;padding:13px 28px;text-align:center;box-shadow:0 6px 18px rgba(64,158,242,.28)}
.tt{font-weight:800;font-size:19px}
.ts{font-size:13.5px;opacity:.93;margin-top:3px}
.v{width:2px;height:20px;background:#9CC9F5;margin:0 auto}
.platform{background:#F4F9FE;border:1.5px solid #D6E6F5;border-radius:18px;padding:14px}
.ph{display:flex;align-items:baseline;gap:10px;margin:0 2px 12px}
.ph b{font-size:16.5px}
.cols{display:grid;grid-template-columns:1.3fr .82fr 1.3fr;gap:10px}
.col{padding:13px}
.shared{border-style:dashed;background:#FBFDFF}
.eco{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:8px}
.eco .card{padding:11px 11px 12px 13px;border-left:4px solid #409EF2;border-radius:12px}
.eco .t{font-size:14.5px}
.eco .s{font-size:12.8px}
.el{text-align:center;margin-bottom:2px}
</style>
<div id="d">
  <div class="top"><div class="tt">{{CO}}</div><div class="ts">Proposed company · owns the brand, software, IP and contracts</div></div>
  <div class="v"></div>
  <div class="platform">
    <div class="ph"><span class="lbl">{{B}}</span><b>Skills-to-Work Platform</b></div>
    <div class="cols">
      <div class="card col"><div class="t">Academy Suite</div><div class="s">Run cohort-based skills programmes</div>${chips(['Academy', 'Learn', 'Cohort', 'Assess', 'Certify', 'Impact', 'Admin'])}</div>
      <div class="card col shared"><div class="t">Shared</div><div class="s">Learner-owned identity and AI</div>${chips(['Passport', 'AI'])}</div>
      <div class="card col"><div class="t">Workforce Suite</div><div class="s">Turn verified skills into work</div>${chips(['Verify', 'Match', 'Work', 'Employer', 'Global'])}</div>
    </div>
  </div>
  <div class="v"></div>
  <div class="el lbl">Ecosystem</div>
  <div class="eco">
    <div class="card"><div class="t">Kirkira · iDICE CoE</div><div class="s">Flagship customer and reference implementation</div></div>
    <div class="card"><div class="t">KISDC</div><div class="s">Impact and implementation partner</div></div>
    <div class="card"><div class="t">Hubs, TVET, NGOs</div><div class="s">Academy Suite customers</div></div>
    <div class="card"><div class="t">Employers</div><div class="s">Workforce Suite customers</div></div>
  </div>
</div>`,

  'skills-to-work-journey': `
<style>${base}
.flow{display:flex;align-items:stretch;gap:5px}
.step{flex:1;padding:14px 12px 13px;display:flex;flex-direction:column}
.num{width:26px;height:26px;border-radius:50%;background:#409EF2;color:#fff;font-weight:700;font-size:13.5px;display:flex;align-items:center;justify-content:center}
.st{font-weight:800;font-size:19px;letter-spacing:.07em;margin:10px 0 2px}
.step .s{flex:1}
.ar{display:flex;align-items:center}
.band{margin-top:9px;background:#EAF4FE;border-radius:12px;padding:10px 14px;font-size:14px;color:#072435}
.band b{color:#072435}
</style>
<div id="d">
  <div class="flow">
    <div class="card step"><div class="num">1</div><div class="st">TRAIN</div><div class="s">Cohort learning online and offline, in English and Hausa</div>${chips(['Academy', 'Learn', 'Cohort'])}</div>
    <div class="ar">${arrowRight}</div>
    <div class="card step"><div class="num">2</div><div class="st">PROVE</div><div class="s">Assessed work becomes verified evidence and credentials</div>${chips(['Assess', 'Certify'])}</div>
    <div class="ar">${arrowRight}</div>
    <div class="card step"><div class="num">3</div><div class="st">CONNECT</div><div class="s">Consented Passports matched to employer needs</div>${chips(['Passport', 'Verify', 'Match'])}</div>
    <div class="ar">${arrowRight}</div>
    <div class="card step"><div class="num">4</div><div class="st">WORK</div><div class="s">Interviews, placements and retention, tracked</div>${chips(['Work', 'Employer', 'Global'])}</div>
  </div>
  <div class="band"><b>{{B}} AI</b> supports learners and instructors at every step</div>
  <div class="band"><b>{{B}} Impact</b> measures every step for programmes, funders and government</div>
</div>`,

  'system-architecture': `
<style>${base}
.rl{margin:0 0 6px 2px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.box{padding:12px 13px}
.conn{display:flex;align-items:center;justify-content:center;gap:8px;margin:7px 0 9px;font-size:13px;color:#4A6275}
.conn2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:7px 0 9px}
.conn2 div{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#4A6275}
.app{border-color:#409EF2;border-width:2px}
.svc{display:flex;flex-wrap:wrap;gap:7px}
.svc .chip{background:#fff;border:1.5px solid #D6E6F5}
.note{margin-top:10px;font-size:12.8px;color:#4A6275}
</style>
<div id="d">
  <div class="rl lbl">Clients</div>
  <div class="g3">
    <div class="card box"><div class="t">Learner PWA</div><div class="s">Installable in the phone browser · offline lesson packs · outbox sync</div></div>
    <div class="card box"><div class="t">Staff and employer web</div><div class="s">Academy admin · authoring · grading · talent console · employer portal</div></div>
    <div class="card box"><div class="t">Public verification</div><div class="s">The QR code on every certificate opens its verification page</div></div>
  </div>
  <div class="conn">${arrowDown}<span>HTTPS · idempotent offline sync</span></div>
  <div class="rl lbl">Application</div>
  <div class="card box app"><div class="t">apps/web · Next.js on Vercel</div>${chips(['React Server Components', 'Server Actions', '/api/v1: sync, packs, uploads, webhooks', 'Tenant resolution'])}</div>
  <div class="conn2"><div>${arrowDown}<span>SQL as the signed-in user · RLS enforced</span></div><div>${arrowDown}<span>Jobs queued in Postgres (pg-boss)</span></div></div>
  <div class="rl lbl">Data and jobs</div>
  <div class="g2">
    <div class="card box"><div class="t">Supabase</div>${chips(['PostgreSQL + Row-Level Security', 'Auth: OTP, magic link, TOTP', 'Storage', 'pgvector · pg_trgm'])}</div>
    <div class="card box"><div class="t">apps/worker · Node on Railway</div>${chips(['Media', 'Certificates', 'Messaging', 'Readiness', 'AI', 'Exports'])}</div>
  </div>
  <div class="conn">${arrowDown}<span>Managed services</span></div>
  <div class="rl lbl">Services</div>
  <div class="svc">${['Bunny Stream · video', 'Resend · email', 'Termii · SMS', 'WhatsApp Cloud API', 'Claude API · AI', 'Paystack · billing (MVP-2)', 'Sentry · PostHog · Better Stack'].map((c) => `<span class="chip">${c}</span>`).join('')}</div>
  <div class="note">Video uploads and playback go directly between devices and Bunny Stream through short-lived signed URLs, never through the web server.</div>
</div>`,

  'roadmap-12-months': (() => {
    const lanes = [
      ['Discovery and design', 1, 2, 'tint', 'Scope · UX'],
      ['MVP-1 build', 1, 4, 'pri', 'Sprints S0 to S7'],
      ['Pilot launch and hardening', 5, 6, 'ink', 'S8 to S11'],
      ['iDICE pilot cohorts', 5, 12, 'tint', 'Cohorts live · evidence · outcomes'],
      ['Employer development', 2, 12, 'tint', 'CRM · advisory group · shortlists · placements'],
      ['MVP-2 build', 7, 12, 'pri', 'Employer portal · matching · billing'],
      ['Founding hubs', 9, 12, 'tint', 'Onboarding · case studies'],
    ];
    const gates = [[2, 'G0'], [4, 'G1'], [6, 'G2'], [8, 'G3'], [12, 'G4']];
    const LW = 186;
    const row = (inner) => `<div class="row">${inner}</div>`;
    return `
<style>${base}
.rm{position:relative;padding-right:18px}
.row{display:grid;grid-template-columns:${LW}px repeat(12,1fr);align-items:center;min-height:38px}
.hdr .ph{grid-row:1;text-align:center;font-size:12.5px;font-weight:700;padding:6px 0;border-radius:10px;margin:0 2px}
.p1{background:#409EF2;color:#fff}
.p2{background:#072435;color:#fff}
.m{text-align:center;font-size:12.5px;color:#4A6275;font-weight:600;padding:6px 0}
.ln{font-size:14px;font-weight:600;padding-right:10px;line-height:1.25}
.bar{height:28px;border-radius:9px;display:flex;align-items:center;padding:0 10px;font-size:12.3px;font-weight:600;white-space:nowrap;overflow:hidden;margin:0 2px;position:relative;z-index:2}
.pri{background:#409EF2;color:#fff}
.ink{background:#072435;color:#fff}
.tint{background:#EAF4FE;color:#072435;border:1.5px solid #BFDDF9}
.lanes{position:relative;border-top:1.5px solid #E3EEF8;border-bottom:1.5px solid #E3EEF8;padding:4px 0}
.gl{position:absolute;top:0;bottom:0;border-left:2px dashed #9CC9F5;z-index:1}
.gates{position:relative;height:40px}
.gate{position:absolute;top:8px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center}
.dia{width:15px;height:15px;background:#072435;transform:rotate(45deg);border-radius:2px}
.gt{font-size:12.5px;font-weight:700;margin-top:5px}
.legend{font-size:12.8px;color:#4A6275;margin-top:12px}
.legend b{color:#072435}
</style>
<div id="d"><div class="rm">
  <div class="row hdr"><div></div><div class="ph p1" style="grid-column:2 / span 6">MVP-1 · Pilot Core</div><div class="ph p2" style="grid-column:8 / span 6">MVP-2 · Workforce and Commercial</div></div>
  ${row(`<div></div>${Array.from({ length: 12 }, (_, i) => `<div class="m">M${i + 1}</div>`).join('')}`)}
  <div class="lanes">
    ${gates.map(([m]) => `<div class="gl" style="left:calc(${LW}px + (100% - ${LW}px) * ${m} / 12)"></div>`).join('')}
    ${lanes.map(([name, s, e, cls, txt]) => row(`<div class="ln">${name}</div><div class="bar ${cls}" style="grid-column:${s + 1} / ${e + 2}">${txt}</div>`)).join('')}
  </div>
  <div class="gates">${gates.map(([m, g]) => `<div class="gate" style="left:calc(${LW}px + (100% - ${LW}px) * ${m} / 12)"><div class="dia"></div><div class="gt">${g}</div></div>`).join('')}</div>
  <div class="legend"><b>Validation gates:</b> G0 Discovery · G1 Pilot readiness · G2 Pilot health · G3 Pilot outcomes · G4 Commercial fit</div>
</div></div>`;
  })(),
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2.5 });
  for (const [name, body] of Object.entries(figures)) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${fill(body)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('#d');
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('figure', name);
  }
  await browser.close();
})();
