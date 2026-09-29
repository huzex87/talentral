// Builds the HTML for the Talentral brand guide (1280 x 720 pages, printed to PDF by export.js).
const fs = require('fs');
const path = require('path');

const LOGO = path.join(__dirname, '..', 'logo');
const FONTS = path.join(__dirname, 'fonts');

const PALETTE = [
  // name, hex, role, text colour on the swatch
  ['Midnight', '#0D1230', 'Dark brand surfaces, covers, app icon', '#FFFFFF'],
  ['Ink', '#101733', 'Headings and body text on light', '#FFFFFF'],
  ['Blue', '#2E5BFF', 'Primary actions, links, focus', '#FFFFFF'],
  ['Violet', '#7C3AED', 'Section labels, highlights', '#FFFFFF'],
  ['Teal', '#14B8A6', 'Success and emphasis on dark', '#0D1230'],
  ['Indigo', '#5B49F2', 'Gradient and illustration', '#FFFFFF'],
  ['Sky', '#1D8FD4', 'Gradient and illustration', '#FFFFFF'],
  ['Teal 700', '#0F766E', 'Success text on light', '#FFFFFF'],
  ['Muted', '#5B6482', 'Secondary text on light', '#FFFFFF'],
  ['Mist', '#C7CCE0', 'Secondary text on dark', '#0D1230'],
  ['Line', '#E3E7F2', 'Borders and dividers', '#101733'],
  ['Canvas', '#F7F8FC', 'App background', '#101733'],
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const b64 = (file) => fs.readFileSync(file).toString('base64');
const img = (file, style = '') => `<img src="data:image/svg+xml;base64,${b64(path.join(LOGO, file))}" style="${style}" alt="">`;
const rawSvg = (file) => fs.readFileSync(path.join(LOGO, file), 'utf8');
const inlineSvg = (svg, style = '') => `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="${style}" alt="">`;

module.exports = function guideHtml(name, slug, company) {
  const font = (family, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/ttf;base64,${b64(path.join(FONTS, `${family}-${weight}.ttf`))}) format('truetype')}`;
  const faces = [400, 500, 600, 700].map((w) => font('Outfit', w) + font('Inter', w)).join('');
  let page = 0;
  const foot = () => { page += 1; return `<div class="foot"><span>${name} Brand Guidelines · v1.0</span><span>${String(page).padStart(2, '0')}</span></div>`; };
  const head = (label, title) => `<div class="label">${label}</div><h1>${title}</h1><div class="rule"></div>`;

  const horizontal = `${slug}-logo-horizontal.svg`;
  const noHead = rawSvg(horizontal).replace(/<circle[^>]*\/>/, '');
  const pairs = [
    ['Blue on White', '#2E5BFF', '#FFFFFF'], ['Ink on White', '#101733', '#FFFFFF'], ['Muted on White', '#5B6482', '#FFFFFF'],
    ['Teal 700 on White', '#0F766E', '#FFFFFF'], ['White on Midnight', '#FFFFFF', '#0D1230'], ['Teal on Midnight', '#14B8A6', '#0D1230'],
    ['Teal on White', '#14B8A6', '#FFFFFF'],
  ];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
@page{size:1280px 720px;margin:0}
:root{--midnight:#0D1230;--ink:#101733;--blue:#2E5BFF;--violet:#7C3AED;--teal:#14B8A6;--teal7:#0F766E;--muted:#5B6482;--mist:#C7CCE0;--line:#E3E7F2;--canvas:#F7F8FC;
  --grad:linear-gradient(90deg,#7C3AED 0%,#2E5BFF 52%,#14B8A6 100%)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.page{width:1280px;height:720px;position:relative;overflow:hidden;padding:56px 72px;background:#fff;page-break-after:always}
.page.dark{background:var(--midnight);color:#fff}
.bar{position:absolute;top:0;left:0;right:0;height:8px;background:var(--grad)}
.label{font:700 13px/1 'Inter';letter-spacing:.14em;text-transform:uppercase;color:var(--violet)}
h1{font:600 40px/1.15 'Outfit';letter-spacing:-.01em;margin-top:12px}
.rule{width:72px;height:5px;border-radius:3px;background:var(--grad);margin:16px 0 26px}
p{font-size:16px;line-height:1.6;color:var(--muted)}
.dark p{color:var(--mist)}
.foot{position:absolute;left:72px;right:72px;bottom:26px;display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
.dark .foot{color:var(--mist)}
.card{border:1.5px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 2px 10px rgba(16,23,51,.05)}
.cap{font-size:12.5px;color:var(--muted);margin-top:10px}
.cap b{color:var(--ink);font-weight:600}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;font:600 14px 'Inter';color:#fff}
.x{position:absolute;top:10px;left:10px;width:26px;height:26px;border-radius:50%;background:#E11D48;color:#fff;font:700 15px/26px 'Inter';text-align:center}
table{border-collapse:collapse;width:100%;font-size:13.5px}
td,th{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left}
th{font:700 11.5px 'Inter';letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
</style></head><body>

<section class="page dark">
  <div class="bar"></div>
  <div style="display:flex;height:100%;align-items:center;gap:80px">
    <div style="flex:0 0 520px;display:flex;justify-content:center">${img(`${slug}-logo-stacked-dark.svg`, 'width:440px')}</div>
    <div>
      <div class="label" style="color:var(--teal)">Brand guidelines</div>
      <div style="font:600 60px/1.05 'Outfit';margin-top:16px">The ${name}<br>identity</div>
      <div class="rule" style="margin:26px 0"></div>
      <p style="font-size:18px">Logo, colour, typography, interface<br>foundations and voice.</p>
      <p style="margin-top:28px;font-size:14px">Version 1.0 · September 2026<br>${company} (proposed)</p>
    </div>
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('01 · The idea', 'A person, open-armed, ready for work')}
  <div style="display:grid;grid-template-columns:420px 1fr;gap:56px;align-items:start">
    <div class="card" style="height:400px;display:flex;align-items:center;justify-content:center;background:var(--canvas)">${img(`${slug}-mark.svg`, 'height:300px')}</div>
    <div>
      <p style="font-size:18px;color:var(--ink);line-height:1.55">The mark is the <b>T</b> of ${name} drawn as a person: arms open, head up. It stands for every learner who proves what they can do and steps into work.</p>
      <p style="margin-top:18px">The <b style="color:var(--ink)">dot</b> is the individual. It sits a step ahead of the arms, the way a person moves forward into opportunity.</p>
      <p style="margin-top:14px">The <b style="color:var(--ink)">gradient</b> is the journey the platform exists for: violet for learning, blue for proof, teal for work.</p>
      <div style="display:flex;gap:10px;margin-top:34px;flex-wrap:wrap">
        <span class="chip" style="background:#7C3AED">1 · Train</span><span class="chip" style="background:#5B49F2">2 · Prove</span>
        <span class="chip" style="background:#2E5BFF">3 · Connect</span><span class="chip" style="background:#0F766E">4 · Work</span>
      </div>
      <p style="margin-top:22px;font-size:14px">Heritage: the mark refines the June 2026 founding-partner identity, redrawn as clean vector geometry for every size, from a 16 px favicon to a building sign.</p>
    </div>
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('02 · Logo system', 'Four lockups, one mark')}
  <div class="grid2" style="grid-template-rows:170px 250px">
    <div><div class="card" style="height:150px;display:flex;align-items:center;justify-content:center">${img(horizontal, 'height:70px')}</div><div class="cap"><b>Primary · horizontal.</b> Websites, documents, email signatures.</div></div>
    <div><div class="card" style="height:150px;display:flex;align-items:center;justify-content:center;background:var(--midnight);border-color:var(--midnight)">${img(`${slug}-logo-horizontal-dark.svg`, 'height:70px')}</div><div class="cap"><b>Horizontal on Midnight.</b> Dark headers, slides, event screens.</div></div>
    <div><div class="card" style="height:220px;display:flex;align-items:center;justify-content:center">${img(`${slug}-logo-stacked.svg`, 'height:180px')}</div><div class="cap"><b>Stacked with tagline.</b> Covers, certificates, banners.</div></div>
    <div><div class="card" style="height:220px;display:flex;align-items:center;justify-content:space-evenly">${img(`${slug}-mark.svg`, 'height:150px')}${img(`${slug}-app-icon.svg`, 'height:150px')}</div><div class="cap"><b>Mark and app icon.</b> Favicon, app icon, social avatar, stamps.</div></div>
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('03 · Clear space and size', 'Give the logo room to breathe')}
  <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:56px;align-items:center">
    <div style="position:relative;padding:44px;border:2px dashed #9DB1FF;border-radius:14px;background:var(--canvas)">
      <div style="border:1.5px solid #C9D3FF;border-radius:6px;padding:0;display:flex;justify-content:center;background:#fff">${img(horizontal, 'height:110px')}</div>
      <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);font:700 13px 'Inter';color:var(--blue)">x</div>
      <div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font:700 13px 'Inter';color:var(--blue)">x</div>
      <div style="position:absolute;left:16px;top:50%;transform:translateY(-50%);font:700 13px 'Inter';color:var(--blue)">x</div>
      <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);font:700 13px 'Inter';color:var(--blue)">x</div>
    </div>
    <div>
      <p style="color:var(--ink);font-size:17px"><b>Clear space x</b> equals the diameter of the dot. Keep text, edges and other graphics at least x away on every side.</p>
      <table style="margin-top:26px">
        <tr><th>Lockup</th><th>Screen</th><th>Print</th></tr>
        <tr><td>Horizontal</td><td>120 px wide</td><td>30 mm</td></tr>
        <tr><td>Stacked with tagline</td><td>160 px wide</td><td>40 mm</td></tr>
        <tr><td>Stacked, no tagline</td><td>96 px wide</td><td>24 mm</td></tr>
        <tr><td>Mark or app icon</td><td>16 px</td><td>8 mm</td></tr>
      </table>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:30px">
    ${[
      ['White', '#FFFFFF', horizontal, 'Primary logo'],
      ['Canvas', '#F7F8FC', horizontal, 'Primary logo'],
      ['Midnight', '#0D1230', `${slug}-logo-horizontal-dark.svg`, 'Horizontal on Midnight'],
      ['Blue', '#2E5BFF', `${slug}-logo-horizontal-mono-white.svg`, 'One-colour white'],
    ].map(([n, bg, file, use]) => `<div><div style="height:74px;border-radius:12px;background:${bg};border:1.5px solid ${bg === '#FFFFFF' || bg === '#F7F8FC' ? 'var(--line)' : bg};display:flex;align-items:center;justify-content:center">${img(file, 'height:34px')}</div><div class="cap"><b>${n}.</b> ${use}</div></div>`).join('')}
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('04 · Misuse', 'Keep the logo exactly as drawn')}
  <div class="grid3">
    ${[
      ['Don\'t stretch or squash it', img(horizontal, 'height:56px;transform:scaleX(1.45)')],
      ['Don\'t recolour the gradient', img(horizontal, 'height:56px;filter:hue-rotate(150deg) saturate(1.4)')],
      ['Don\'t rotate or tilt it', img(horizontal, 'height:56px;transform:rotate(-11deg)')],
      ['Don\'t add shadows, glows or outlines', img(horizontal, 'height:56px;filter:drop-shadow(0 6px 5px rgba(0,0,0,.55)) drop-shadow(0 0 8px #F5A623)')],
      ['Don\'t place it on low-contrast colour', `<div style="background:#3B63F5;padding:22px 26px;border-radius:10px">${img(horizontal, 'height:48px')}</div>`],
      ['Don\'t move or remove the dot', inlineSvg(noHead, 'height:56px')],
    ].map(([cap, el]) => `<div><div class="card" style="position:relative;height:190px;display:flex;align-items:center;justify-content:center;overflow:hidden"><div class="x">✕</div>${el}</div><div class="cap">${cap}</div></div>`).join('')}
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('05 · Colour', 'Midnight, Blue and the journey gradient')}
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px">
    ${PALETTE.map(([n, hex, role, fg]) => `<div><div style="height:96px;border-radius:12px;background:${hex};border:1px solid ${hex === '#F7F8FC' || hex === '#E3E7F2' ? '#D5DAE8' : hex};padding:12px;color:${fg};font:600 14px 'Inter';display:flex;align-items:flex-end">${n}</div>
      <div style="font:600 12.5px 'Inter';margin-top:8px">${hex} <span style="color:var(--muted);font-weight:500">· RGB ${rgb(hex)}</span></div><div class="cap" style="margin-top:3px;font-size:11.5px;line-height:1.35">${role}</div></div>`).join('')}
  </div>
  <div style="margin-top:22px;display:grid;grid-template-columns:1.1fr 1fr;gap:28px;align-items:center">
    <div style="height:60px;border-radius:12px;background:var(--grad);display:flex;align-items:center;padding:0 18px;color:#fff;font:600 14px 'Inter'">Journey gradient · #7C3AED → #2E5BFF → #14B8A6</div>
    <p style="font-size:14px">Use the gradient for brand moments only: the mark, hero bars, covers and dividers. Interface controls use solid Blue. Text is never set in the gradient.</p>
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('06 · Typography', 'Outfit for voice, Inter for work')}
  <div class="grid2" style="gap:28px">
    <div class="card" style="padding:26px 28px">
      <div style="display:flex;align-items:baseline;gap:18px"><span style="font:600 76px/1 'Outfit'">Aa</span><div><div style="font:600 20px 'Outfit'">Outfit</div><div class="cap" style="margin:2px 0 0">SemiBold 600 · Bold 700</div></div></div>
      <div style="font:600 30px/1.2 'Outfit';margin-top:18px">Verified skills. Real work.</div>
      <p style="margin-top:10px;font-size:14px">Display, headings and the wordmark. Tight tracking (-1%) at large sizes.</p>
    </div>
    <div class="card" style="padding:26px 28px">
      <div style="display:flex;align-items:baseline;gap:18px"><span style="font:500 76px/1 'Inter'">Aa</span><div><div style="font:600 20px 'Inter'">Inter</div><div class="cap" style="margin:2px 0 0">Regular 400 · Medium 500 · SemiBold 600</div></div></div>
      <div style="font:400 16px/1.6 'Inter';margin-top:18px">Your Passport shows the evidence behind every skill. Share it with employers only when you choose to.</div>
      <p style="margin-top:10px;font-size:14px">Interface, body text, tables and forms. Excellent at small sizes on low-end screens.</p>
    </div>
  </div>
  <table style="margin-top:22px">
    <tr><th>Style</th><th>Font</th><th>Size / line height</th><th>Use</th></tr>
    <tr><td style="font:600 20px 'Outfit'">Display</td><td>Outfit 600</td><td>56 / 64</td><td>Covers, hero headlines</td></tr>
    <tr><td style="font:600 17px 'Outfit'">Heading 1 · 2 · 3</td><td>Outfit 600</td><td>40 / 48 · 28 / 36 · 20 / 28</td><td>Page and section titles</td></tr>
    <tr><td>Body · Small</td><td>Inter 400</td><td>16 / 24 · 14 / 20</td><td>Running text, table cells</td></tr>
    <tr><td style="font:700 11.5px 'Inter';letter-spacing:.14em">LABEL</td><td>Inter 700, +14% tracking</td><td>12 / 16, upper case</td><td>Section labels, overlines</td></tr>
  </table>
  ${foot()}
</section>

<section class="page" style="background:var(--canvas)">
  ${head('07 · Interface foundations', 'Light, calm and easy on low-end phones')}
  <div style="display:grid;grid-template-columns:1fr 1.05fr;gap:28px">
    <div class="card" style="padding:24px">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <span style="background:var(--blue);color:#fff;padding:12px 20px;border-radius:12px;font:600 15px 'Inter'">Continue learning</span>
        <span style="background:#fff;color:var(--blue);border:1.5px solid var(--blue);padding:11px 19px;border-radius:12px;font:600 15px 'Inter'">View Passport</span>
        <span style="background:var(--canvas);color:var(--ink);padding:12px 20px;border-radius:12px;font:600 15px 'Inter'">Cancel</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
        <span style="background:#E6F6F3;color:var(--teal7);padding:6px 12px;border-radius:999px;font:600 13px 'Inter'">Ready and Verified</span>
        <span style="background:#EEF1FF;color:#2442CC;padding:6px 12px;border-radius:999px;font:600 13px 'Inter'">Platform-evidenced</span>
        <span style="background:#F3ECFE;color:#6D28D9;padding:6px 12px;border-radius:999px;font:600 13px 'Inter'">Developing</span>
      </div>
      <div style="margin-top:20px;border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--muted)">Search skills, cohorts or learners</div>
      <table style="margin-top:16px;font-size:13px">
        <tr><td style="width:40%;color:var(--muted)">Radius</td><td>12 px controls · 16 px cards</td></tr>
        <tr><td style="color:var(--muted)">Shadow</td><td>0 2 10 rgba(16, 23, 51, 0.06)</td></tr>
        <tr><td style="color:var(--muted)">Overlay</td><td>White at 70% with backdrop blur, never dark</td></tr>
        <tr><td style="color:var(--muted)">Focus ring</td><td>3 px Blue at 35% opacity</td></tr>
      </table>
    </div>
    <div>
      <div class="card" style="padding:20px 22px;display:flex;gap:16px;align-items:center">
        <div style="width:58px;height:58px;border-radius:50%;padding:3px;background:var(--grad)"><div style="width:100%;height:100%;border-radius:50%;background:#FFE9C7;display:flex;align-items:center;justify-content:center;font:700 18px 'Outfit';color:#7A4B00">AM</div></div>
        <div style="flex:1"><div style="font:600 18px 'Outfit'">Aisha Musa</div><div style="font-size:13px;color:var(--muted)">Digital Marketing · Katsina · Available now</div></div>
        <span style="background:#E6F6F3;color:var(--teal7);padding:6px 12px;border-radius:999px;font:600 12.5px 'Inter'">Ready and Verified</span>
      </div>
      <table style="margin-top:16px">
        <tr><th>Pair</th><th>Contrast</th><th>Use</th></tr>
        ${pairs.map(([n, fg, bg]) => { const c = contrast(fg, bg); return `<tr><td><span style="display:inline-block;padding:1px 7px;border-radius:5px;background:${bg};color:${fg};border:1px solid var(--line);font:700 12px/18px 'Inter';margin-right:10px">Aa</span>${n}</td><td>${c.toFixed(1)} : 1</td><td>${c >= 4.5 ? 'Text' : c >= 3 ? 'Large text only' : 'Decoration only'}</td></tr>`; }).join('')}
      </table>
    </div>
  </div>
  ${foot()}
</section>

<section class="page">
  ${head('08 · Voice and naming', 'Clear, warm and credible')}
  <div class="grid3" style="gap:26px">
    <div><div style="font:600 19px 'Outfit';margin-bottom:10px">How we sound</div>
      <p style="font-size:14.5px"><b style="color:var(--ink)">Clear.</b> Short sentences, plain words, no jargon.<br><b style="color:var(--ink)">Warm.</b> We speak to people, not users.<br><b style="color:var(--ink)">Credible.</b> Evidence before claims; numbers with sources.<br><b style="color:var(--ink)">Respectful.</b> Dignity for every learner and worker.<br><b style="color:var(--ink)">Bilingual.</b> English and Hausa are equals.</p></div>
    <div><div style="font:600 19px 'Outfit';margin-bottom:10px">Product names</div>
      <p style="font-size:14.5px">Always <b style="color:var(--ink)">${name}</b> plus the module: ${name} Academy, Learn, Cohort, Assess, Certify, Impact, Passport, AI, Verify, Match, Work, Employer, Global.<br><br>Capital T, one word, never abbreviated. Upper case only inside the logo tagline.</p></div>
    <div><div style="font:600 19px 'Outfit';margin-bottom:10px">Lines we use</div>
      <p style="font-size:14.5px"><b style="color:var(--ink)">Tagline:</b> Verified skills. Real work.<br><b style="color:var(--ink)">Proposition:</b> Train. Prove. Connect. Work.<br><b style="color:var(--ink)">${name} Global:</b> Global opportunities. Exceptional talent.<br><br>The Global line carries forward the original founding-partner identity for international campaigns.</p></div>
  </div>
  <div class="grid2" style="margin-top:30px;gap:20px">
    <div class="card" style="padding:18px 22px;border-left:5px solid var(--teal7)"><div class="label" style="color:var(--teal7)">Write like this</div>
      <p style="font-size:14.5px;color:var(--ink);margin-top:10px">"Your certificate is ready. Add it to your Passport and choose which employers can see it."</p>
      <p style="font-size:14.5px;color:var(--ink);margin-top:8px">"3 employers viewed your profile this week."</p></div>
    <div class="card" style="padding:18px 22px;border-left:5px solid #E11D48"><div class="label" style="color:#BE123C">Not like this</div>
      <p style="font-size:14.5px;margin-top:10px">"Congratulations!!! Unlock limitless global opportunities today!"</p>
      <p style="font-size:14.5px;margin-top:8px">"Guaranteed jobs abroad for every graduate."</p></div>
  </div>
  <p style="font-size:13.5px;margin-top:16px">Hausa copy is written by native speakers, never machine-translated, and reviewed like any other copy.</p>
  ${foot()}
</section>

<section class="page" style="background:var(--canvas)">
  ${head('09 · Applications', 'The identity at work')}
  <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:24px">
    <div class="card" style="overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1.5px solid var(--line)">${img(horizontal, 'height:30px')}<div style="display:flex;gap:18px;font:500 13.5px 'Inter';color:var(--muted)"><span>Courses</span><span>Cohorts</span><span>Passport</span></div><span style="background:var(--blue);color:#fff;padding:8px 14px;border-radius:10px;font:600 13px 'Inter'">Sign in</span></div>
      <div style="padding:20px 22px"><div class="label">Kirkira Academy · on ${name}</div><div style="font:600 28px/1.2 'Outfit';margin-top:10px">Digital Marketing Cohort 3</div><p style="font-size:14px;margin-top:6px">12 weeks · English and Hausa · Offline lessons</p>
        <div style="height:10px;border-radius:6px;background:#E8ECF8;margin-top:18px"><div style="width:64%;height:100%;border-radius:6px;background:var(--blue)"></div></div><div class="cap">64% complete · next live session Thursday 16:00</div></div>
    </div>
    <div class="card" style="padding:20px 26px;position:relative">
      <div style="position:absolute;top:0;left:0;right:0;height:6px;background:var(--grad);border-radius:16px 16px 0 0"></div>
      ${img(horizontal, 'height:28px')}
      <div class="label" style="margin-top:18px;color:var(--muted)">Certificate of completion</div>
      <div style="font:600 30px/1.15 'Outfit';margin-top:10px">Aisha Musa</div>
      <p style="font-size:14px;margin-top:6px">Digital Marketing Professional<br>Kirkira Innovation Hub · iDICE Centre of Excellence</p>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:22px">
        <div style="font-size:12px;color:var(--muted)">Verify at /verify/7KQ4M2XP9T</div>
        <div style="width:64px;height:64px;border-radius:8px;background:repeating-conic-gradient(var(--ink) 0 25%,#fff 0 50%) 0 0/16px 16px;opacity:.85"></div>
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:230px 150px 1fr;gap:24px;margin-top:20px">
    <div><div class="card" style="overflow:hidden;padding:0;height:122px">${img(`${slug}-social-card.svg`, 'height:122px;display:block')}</div><div class="cap"><b>Link preview.</b> 1200 x 630 card</div></div>
    <div><div class="card" style="height:122px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(160deg,#1B2350,#0D1230);border-color:#0D1230">${img(`${slug}-app-icon.svg`, 'width:60px')}<span style="color:#fff;font:500 11.5px 'Inter'">${name}</span></div><div class="cap"><b>Home screen.</b> PWA icon</div></div>
    <div><div class="card" style="height:122px;padding:16px 20px;display:flex;flex-direction:column;justify-content:center"><div style="font:600 15px 'Inter'">Huzaifa Yakubu Musa</div><div style="font-size:12.5px;color:var(--muted);margin:2px 0 10px">Founder, ${name}</div>${img(horizontal, 'height:22px;align-self:flex-start')}</div><div class="cap"><b>Email signature.</b> Horizontal logo, 120 px or wider</div></div>
  </div>
  ${foot()}
</section>
</body></html>`;
};
