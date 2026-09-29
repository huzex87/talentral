// Exports PNG sizes, favicon.ico and the PDF brand guide from the SVG logo set.
// Run after `python3 build_brand.py`. Set CHROMIUM_PATH to use a preinstalled Chromium.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const guideHtml = require('./guide');

const brandJs = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'master-plan-source', 'brand.js'), 'utf8');
const NAME = /name:\s*'([^']+)'/.exec(brandJs)[1];
const COMPANY = /company:\s*'([^']+)'/.exec(brandJs)[1];
const SLUG = NAME.toLowerCase();
const LOGO = path.join(__dirname, '..', 'logo');
const PNG = path.join(LOGO, 'png');
const PREVIEW = path.join(__dirname, '.preview');

const EXPORTS = [
  ['logo-horizontal', [600, 1200, 2400]], ['logo-horizontal-dark', [600, 1200, 2400]],
  ['logo-horizontal-mono-ink', [1200]], ['logo-horizontal-mono-white', [1200]],
  ['logo-stacked', [800, 1600]], ['logo-stacked-dark', [800, 1600]],
  ['logo-stacked-no-tagline', [800]], ['logo-stacked-no-tagline-dark', [800]],
  ['mark', [256, 512, 1024]], ['mark-dark', [256, 512, 1024]],
  ['mark-mono-ink', [512]], ['mark-mono-white', [512]],
  ['wordmark', [1200]], ['wordmark-dark', [1200]],
  ['app-icon', [1024, 512, 192, 180, 48, 32, 16]],
  ['social-card', [1200, 2400]],
];

// Minimal .ico writer: PNG-compressed entries, supported by every current browser and OS.
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

(async () => {
  fs.mkdirSync(PNG, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  const icons = {};
  for (const [base, widths] of EXPORTS) {
    const svg = fs.readFileSync(path.join(LOGO, `${SLUG}-${base}.svg`)).toString('base64');
    for (const w of widths) {
      await page.setViewportSize({ width: Math.max(w, 64), height: 1600 });
      await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,${svg}" style="width:${w}px;display:block"></body></html>`);
      await page.waitForFunction(() => document.getElementById('i').complete);
      const buf = await (await page.$('#i')).screenshot({ omitBackground: true });
      fs.writeFileSync(path.join(PNG, `${SLUG}-${base}-${w}.png`), buf);
      if (base === 'app-icon') icons[w] = buf;
    }
    console.log('png', base, widths.join(', '));
  }
  fs.writeFileSync(path.join(LOGO, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, buf: icons[size] }))));
  fs.copyFileSync(path.join(PNG, `${SLUG}-app-icon-180.png`), path.join(LOGO, 'apple-touch-icon.png'));
  console.log('favicon.ico, apple-touch-icon.png');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(guideHtml(NAME, SLUG, COMPANY), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const guide = path.join(__dirname, '..', `${SLUG}-brand-guide.pdf`);
  await page.pdf({ path: guide, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
  const pages = await page.$$('section.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(PREVIEW, `guide-${String(i + 1).padStart(2, '0')}.png`) });
  console.log('guide', path.relative(process.cwd(), guide), `${pages.length} pages`);
  await browser.close();
})();
