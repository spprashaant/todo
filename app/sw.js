// Service worker (shared): network-first for everything same-origin, with the app shell
// cached so the app opens offline. Paths are relative to this file, so any base path works.
const VERSION = 'todos-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css', './css/sidebar.css', './css/project.css', './css/rows.css',
  './css/detail.css', './css/composer.css', './css/when.css', './css/quickfind.css',
  './css/repeat.css', './css/account.css',
  './js/app.js', './js/store.js', './js/router.js', './js/dates.js', './js/view.js', './js/icons.js',
  './js/rows.js', './js/project.js', './js/sidebar.js', './js/detail.js', './js/when.js', './js/quickfind.js', './js/composer.js',
  './js/recur.js', './js/repeat.js', './js/config.js', './js/sync.js', './js/account.js', './js/native.js', './vendor/supabase.mjs',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/**
 * The same response, marked "ask again next time". A reload otherwise reuses the page's own copy of a file
 * for as long as the host called it fresh, without asking this worker at all.
 */
function recheck(res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return res;
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      // Always ask the server (a 304 when nothing changed): the browser's own cache may hold a copy the
      // host marked fresh for hours (a CDN's browser TTL), which would hide a new deploy.
      const res = await fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' }));
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return req.mode === 'navigate' ? res : recheck(res);
    } catch (err) {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./')) || (await cache.match('./index.html'));
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
