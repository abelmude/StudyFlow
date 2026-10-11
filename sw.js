/* StudyFlow service worker.
 *
 * The app holds a student's deadlines and keeps everything in localStorage, so
 * it has no reason to need the network once it has loaded. Precaching the shell
 * means it opens on a bus with no signal.
 *
 * Bump CACHE when a precached file changes. That alone used to be load-bearing:
 * assets were served cache-first and returned straight from the cache without
 * ever consulting the network, so a forgotten bump pinned users to an old build
 * permanently — which is exactly what happened once. Assets are now
 * stale-while-revalidate, so a missed bump costs one stale load instead of
 * stranding the app forever.
 */
var CACHE = 'studyflow-v3';

var SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/app/',
  '/app/index.html',
  '/app/app.css',
  '/app/dom.js',
  '/app/store.js',
  '/app/ical.js',
  '/app/onboarding.js',
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
  if (url.origin !== self.location.origin) return;

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
