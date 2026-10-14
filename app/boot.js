/* The app's first and last scripts, in one file.
 *
 * Both used to be inline. They live here so the site can carry a Content
 * Security Policy with no 'unsafe-inline' for scripts — which is the single
 * most useful thing a page handling passwords can do about cross-site
 * scripting, and matters more here because the session token is in
 * localStorage where injected script could read it.
 */
(function () {
  'use strict';

  /* Before first paint: hands styling permission to CSS only when there is
     something running to take it back. */
  document.documentElement.classList.add('js');

  if ('serviceWorker' in navigator) {
    // Registered after load so it never competes with first paint. The app
    // keeps its data locally, so caching the shell makes it usable offline.
    addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* unsupported or blocked */ });
    });

    /* The worker calls skipWaiting() and clients.claim(), so a new build takes
       over this page as soon as it installs — but the scripts and styles this
       page is already running came from the old one. Saying so is the whole
       difference between "the update never shipped" and "you have not reloaded
       yet", which from inside the app used to look identical. */
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // On a first-ever visit there is nothing stale to warn about: this page
      // came from the network a moment ago.
      if (!hadController) { hadController = true; return; }
      var bar = document.getElementById('sw-update');
      if (bar) bar.hidden = false;
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#sw-update-go')) return;
    location.reload();
  });
})();
