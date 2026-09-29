// Downloads the Inter variable font (SIL Open Font License) used by the figures.
// Optional: without it, diagrams.js falls back to a system sans-serif font.
const fs = require('fs');
const path = require('path');

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap';
const OUT = path.join(__dirname, 'fonts', 'Inter.woff2');

(async () => {
  const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36' } })).text();
  const latin = css.split('/* latin */')[1];
  const url = latin && latin.match(/url\((https:[^)]+\.woff2)\)/);
  if (!url) throw new Error('Could not find the Inter latin woff2 URL');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(await (await fetch(url[1])).arrayBuffer()));
  console.log('saved', OUT);
})();
