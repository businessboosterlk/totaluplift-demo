/* Total Uplift member app service worker.
   NETWORK-FIRST for the page itself, so a new build always wins and we never
   recreate the stale-cache problem that already cost us a debugging session.
   Cache is a FALLBACK for when there is no signal, which is the actual point:
   a gym basement with no data still opens the app. */
const CACHE = 'tu-member-v2';
const SHELL = ['./', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* never touch third-party requests */
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./')))
  );
});

/* ── NOTIFICATIONS ────────────────────────────────────────────────────────
   Inert until a server sends something, so shipping them early costs nothing
   and the sender can go live later without redeploying the app.

   A push with no readable body must STILL show something. A silent failure
   here looks identical to no notification at all, which is the worst outcome
   to debug on somebody else's phone. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Total Uplift';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Open the app to see what changed.',
    icon: './icon-192.png',
    badge: './icon-mono-512.png',
    tag: d.tag || 'tu-general',        /* same tag replaces, never stacks up */
    renotify: !!d.renotify,
    data: { url: d.url || './' }
  }));
});

/* Tapping it must land INSIDE the app. If a window is already open, focus that
   one rather than opening a second copy of the same app. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => {
      for (const c of list) {
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }));
});
