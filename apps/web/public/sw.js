// Talentral service worker: keeps learner pages and downloaded lessons working without a
// connection. Pages come from the network first (so they are fresh when online) and fall back
// to the copy saved on the phone. Downloaded lesson files are served from the phone, which also
// saves data when online. Everything personal is removed when the learner signs out.
const VERSION = 'v1';
const SHELL = `talentral-shell-${VERSION}`;
const STATIC = 'talentral-static';
const PAGES = 'talentral-pages';
const MEDIA = 'talentral-media';
const PRECACHE = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];
const NETWORK_TIMEOUT_MS = 6000;
const MAX_PAGES = 120;

// Learner pages that are worth keeping for offline use.
const LEARNER = /^\/(learn(\/(?!join\/|checkin\/|media\/|submission\/)[^?]*)?|passport)\/?$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE);
    // The offline screen's own scripts and styles, so its list of downloads works offline.
    const html = await (await shell.match('/offline')).text();
    const assets = await caches.open(STATIC);
    for (const src of new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])) {
      if (!(await assets.match(src))) await assets.add(src).catch(() => {});
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('talentral-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function clearPersonal() {
  await Promise.all([caches.delete(PAGES), caches.delete(MEDIA)]);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear') event.waitUntil(clearPersonal());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method !== 'GET') {
    // Signing out removes the learner's saved pages and files from this phone.
    if (req.method === 'POST' && url.pathname === '/sign-out') event.waitUntil(clearPersonal());
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (url.pathname.startsWith('/learn/media/')) {
    event.respondWith(media(req));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(LEARNER.test(url.pathname) ? learnerPage(req) : otherPage(req));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function offlinePage() {
  return (await caches.match('/offline', { cacheName: SHELL })) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

async function learnerPage(req) {
  const cache = await caches.open(PAGES);
  const key = new URL(req.url);
  key.search = '';
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    // Only a real page for this learner is kept: not a redirect to sign-in or an error.
    if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(key.href, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    return (await cache.match(key.href)) || offlinePage();
  }
}

async function otherPage(req) {
  try {
    return await fetch(req);
  } catch {
    return offlinePage();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]);
}

// Downloaded lesson files are stored under their path. Video and audio players ask for byte
// ranges, so those are cut from the saved file.
async function media(req) {
  const url = new URL(req.url);
  if (url.searchParams.has('offline') || url.searchParams.has('stream')) return fetch(req);
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(url.origin + url.pathname);
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const blob = await hit.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : blob.size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, blob.size - Number(m[2])); end = blob.size - 1; }
  if (start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
  end = Math.min(end, blob.size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
