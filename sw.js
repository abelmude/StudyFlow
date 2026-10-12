/* StudyFlow service worker.
 *
 * The app holds a student's deadlines and keeps everything in localStorage, so
 * it has no reason to need the network once it has loaded. Precaching the shell
 * means it opens on a bus with no signal.
 *
 * CACHE must change whenever a precached file does, or the stale entry survives
 * activate and keeps being served. Bumping it by hand was load-bearing and
 * easy to forget — forgetting it once pinned everyone to an old build and cost
 * a day of looking for a deploy that had worked all along. Two things now stop
 * that happening again:
 *
 *   1. scripts/write-config.js appends the deployed commit to this name at
 *      build time, so every deploy gets a fresh cache automatically.
 *   2. Assets are stale-while-revalidate rather than cache-first, so even an
 *      unstamped build (a local checkout) self-corrects after one load instead
 *      of being stuck forever.
 *
 * Bump the number below only when the cache layout itself changes.
 */
var CACHE = 'studyflow-v4';

var SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/app/',
  '/app/index.html',
  '/app/app.css',
  '/app/config.js',
  '/app/dom.js',
  '/app/store.js',
  '/app/auth.js',
  '/app/sync.js',
  '/app/ical.js',
  '/app/onboarding.js',
  '/app/authview.js',
  '/app/app.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // A single missing file must not fail the whole install, or the app
      // silently loses offline support.
      .then(function (c) { return Promise.allSettled(SHELL.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                               .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  /* Anything off-origin — the account provider above all — goes straight to
     the network. Caching an authenticated API response here would be both
     wrong and a way to serve one person's data to the next. */
  if (url.origin !== self.location.origin) return;

  /* The accounts backend is same-origin, so without this it would fall into
     the asset strategy below and be cached — which would mean serving one
     student's diploma to whoever used the browser next, and answering a login
     from cache. Never cache it, never serve it from cache. */
  if (url.pathname.indexOf('/api/') === 0) return;

  /* version.json exists to answer "which build is live?". An answer from cache
     would defeat the entire point of asking. */
  if (url.pathname === '/version.json') return;

  /* Navigations: network first, so a deploy is picked up as soon as the user is
     online, falling back to the cached page (then a plain offline notice). */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req)
            .then(function (hit) { return hit || caches.match('/offline.html'); });
        })
    );
    return;
  }

  /* Assets: stale-while-revalidate. The cached copy is served immediately, so
     the app still opens instantly and works offline, while a background fetch
     refreshes the cache for next time. A deploy therefore lands on the next
     load even if CACHE was not bumped. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Offline: the cached copy is the answer, if there is one.
        return hit;
      });

      return hit || fresh;
    })
  );
});
