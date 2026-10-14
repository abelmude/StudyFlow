/* Runs before first paint.
 *
 * Scroll-reveal starts elements at opacity 0, so without this the page would be
 * blank for anyone with JavaScript off or still loading. The class is what
 * hands that styling permission to CSS, and only once something is running to
 * take it back again.
 *
 * It lives in its own file rather than inline so the site can carry a Content
 * Security Policy with no 'unsafe-inline' for scripts — which is the single
 * most useful thing a page handling passwords can do about cross-site
 * scripting.
 */
document.documentElement.classList.add('js');

/* Registered after load so it never competes with first paint. The pages keep
   their data locally, so caching the shell makes the site usable offline. */
if ('serviceWorker' in navigator) {
  addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* unsupported or blocked */ });
  });
}
