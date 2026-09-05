/* PocketSeeds offline cache — the app itself works fully offline;
   data lives in localStorage on the device. */
const CACHE = 'pocketseeds-v36';
/* The fonts are precached because they are now ours to serve: an offline-first
   Telugu app that falls back to whatever face the device happens to have is
   not the same app. addAll is all-or-nothing, so everything listed here must
   exist in the repo. */
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'privacy/', 'seedbox/', 'moneybox/', 'box/',
  'fonts/fonts.css',
  'fonts/noto-sans-telugu-telugu.woff2', 'fonts/noto-sans-telugu-latin.woff2',
  'fonts/noto-sans-telugu-latin-ext.woff2',
  'fonts/plus-jakarta-sans-latin.woff2', 'fonts/plus-jakarta-sans-latin-ext.woff2',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Network first, then cache. The cache key includes the query string, which is
   why the second lookup ignores it: the routes people actually arrive on carry
   one. /box/?id=BOX0001 is printed on every physical box, /seedbox/?ref=BOX0001
   comes off the tracker, /moneybox/ forwards whatever it was given, and
   config.json and rates.json are fetched with a daily cache-buster. Matching
   only the exact URL meant all of those missed offline and fell through to
   index.html — so scanning your own box with no signal opened the app's home
   screen instead of your tracker, and config/rates quietly returned HTML that
   failed to parse.

   The index.html fallback is now limited to navigations. Handing a page back
   to a failed image or JSON request was never useful: the caller gets HTML
   where it expected bytes, which is a confusing failure rather than an honest
   one. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      })
      .catch(async () => {
        const exact = await caches.match(req);
        if(exact) return exact;
        const loose = await caches.match(req, { ignoreSearch:true });
        if(loose) return loose;
        if(req.mode === 'navigate'){
          const shell = await caches.match('index.html');
          if(shell) return shell;
        }
        return Response.error();
      })
  );
});
