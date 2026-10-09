// Low-end phone performance check (docs/usability-test-plan.md, section 8).
//
// Loads the learner screens and the public application form on a Pixel 7 sized screen with the
// CPU slowed four times and a "slow 4G" network, then reports Largest Contentful Paint, Total
// Blocking Time, Cumulative Layout Shift and the bytes transferred, against the budgets.
//
// Usage (with the app running, mail written to files):
//   BASE=http://localhost:3200 LEARNER=learner@example.com HUB=idice-katsina-demo \
//   PROGRAMME=digital-skills-cohort-3 node scripts/perf-check.mjs
// CHROMIUM_PATH chooses the browser binary; MAILDIR is where the file mail driver writes.
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3200';
const LEARNER = process.env.LEARNER ?? 'learner@example.com';
const HUB = process.env.HUB ?? 'idice-katsina-demo';
const PROGRAMME = process.env.PROGRAMME ?? 'digital-skills-cohort-3';
const MAILDIR = process.env.MAILDIR ?? join(process.cwd(), '.mail');
const BUDGET = { lcp: 2500, tbt: 300, cls: 0.1, kb: 600 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signInLink(email, since) {
  for (let i = 0; i < 60; i++) {
    for (const f of readdirSync(MAILDIR).filter((x) => x.includes(email)).sort().reverse()) {
      const m = JSON.parse(readFileSync(join(MAILDIR, f), 'utf8'));
      if (/sign-in link/i.test(m.subject) && Number(f.split('-')[0]) >= since - 1000) return m.text.match(/https?:\/\/\S+/)[0];
    }
    await sleep(250);
  }
  throw new Error(`No sign-in email for ${email}`);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// Service workers blocked: this measures a first visit, not the installed app's cached return.
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();

// Sign the learner in at full speed; only the measured loads are throttled.
const since = Date.now();
await page.goto(`${BASE}/sign-in`);
await page.getByLabel('Email address').fill(LEARNER);
await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
await page.getByText('Check your email').waitFor();
await page.goto(await signInLink(LEARNER, since));
await page.getByRole('button', { name: /Continue|Open my account/ }).click();
await page.waitForURL(/learn|passport/);
const course = await page.locator('a[href^="/learn/"]').first().getAttribute('href');
await page.goto(`${BASE}${course}`);
const lesson = await page.locator(`a[href^="${course}/"]:not([href$="discussion"])`).first().getAttribute('href');

const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

let bytes = 0;
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });

const pages = [['Learner home', '/learn'], ['Course', course], ['Lesson', lesson], ['Passport', '/passport'], ['Application form', `/${HUB}/apply/${PROGRAMME}`]];
const rows = [];
// Registered once; it runs on every page load that follows.
await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
});
for (const [name, path] of pages) {
  if (!path) continue;
  bytes = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120_000 });
  await sleep(3000); // let late layout shifts and long tasks land
  const m = await page.evaluate(() => window.__perf);
  rows.push({ page: name, lcp: Math.round(m.lcp), tbt: Math.round(m.tbt), cls: Number(m.cls.toFixed(3)), kb: Math.round(bytes / 1024) });
}
await browser.close();

const ok = (r) => r.lcp <= BUDGET.lcp && r.tbt <= BUDGET.tbt && r.cls <= BUDGET.cls && r.kb <= BUDGET.kb;
console.log('Pixel 7 size, CPU 4x slower, slow 4G (1.6 Mbps, 150 ms), cache off');
console.log('Page'.padEnd(18), 'LCP ms'.padStart(7), 'TBT ms'.padStart(7), 'CLS'.padStart(6), 'KB'.padStart(6), '  Within budget');
for (const r of rows) console.log(r.page.padEnd(18), String(r.lcp).padStart(7), String(r.tbt).padStart(7), String(r.cls).padStart(6), String(r.kb).padStart(6), ok(r) ? '  yes' : '  NO');
console.log(`Budgets: LCP ${BUDGET.lcp} ms, TBT ${BUDGET.tbt} ms, CLS ${BUDGET.cls}, ${BUDGET.kb} KB`);
process.exitCode = rows.every(ok) ? 0 : 1;
