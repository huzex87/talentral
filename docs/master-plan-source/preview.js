// Renders the built .docx in Chromium (docx-preview) and saves page-sized PNG slices for review.
// Usage: node preview.js <section> [firstSlice] [count]
//   Sections are the blocks between explicit page breaks (0 = cover).
// Output: .preview/s<section>-<slice>.png   (set CHROMIUM_PATH to use a preinstalled browser)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const brand = require('./brand');

const DOC = process.env.DOC || path.join(__dirname, '..', `${brand.name}_Master_Plan_v3.docx`);
const OUT = path.join(__dirname, '.preview');
const SLICE = 1000;

(async () => {
  const [section = 0, from = 0, count = 3] = process.argv.slice(2).map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.setContent('<html><body style="background:#ddd;margin:0"><div id=c></div></body></html>');
  await page.addScriptTag({ path: path.join(__dirname, 'node_modules/jszip/dist/jszip.min.js') });
  await page.addScriptTag({ path: path.join(__dirname, 'node_modules/docx-preview/dist/docx-preview.min.js') });
  await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await window.docx.renderAsync(bin, document.getElementById('c'), null, { breakPages: true, ignoreLastRenderedPageBreak: true });
  }, fs.readFileSync(DOC).toString('base64'));
  const sections = await page.$$('section.docx');
  console.log(`${sections.length} sections`);
  const box = await sections[section].boundingBox();
  console.log(`section ${section}: height ${Math.round(box.height)}px, ${Math.ceil(box.height / SLICE)} slices`);
  for (let i = from; i < from + count && i * SLICE < box.height; i++) {
    await page.screenshot({
      path: path.join(OUT, `s${section}-${i}.png`),
      fullPage: true,
      clip: { x: box.x, y: box.y + i * SLICE, width: box.width, height: Math.min(SLICE, box.height - i * SLICE) },
    });
  }
  await browser.close();
})();
