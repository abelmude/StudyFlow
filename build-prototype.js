/* Bundles the StudyFlow app into one self-contained HTML file.
   Usage: node build-prototype.js [outfile]

   The app is normally served as separate files; a single inlined page is what
   an Artifact (or any share-by-link host) needs, since external requests are
   blocked and relative paths do not resolve. */

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, 'app');
const out = process.argv[2] || path.join(__dirname, 'studyflow-prototype.html');

const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

const shell = read('index.html');
const css = read('app.css');
// Order matters: dom defines the helpers, store the data, the rest consume both.
const scripts = ['dom.js', 'store.js', 'ical.js', 'onboarding.js', 'app.js']
  .map(f => ({ f, src: read(f) }));

const bodyMatch = shell.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error('could not find <body> in app/index.html');

let body = bodyMatch[1]
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  // The "back to the marketing site" link has nowhere to go in a single file.
  .replace(/href="\.\.\/index\.html" title="Back to the StudyFlow site"/,
           'href="#/dashboard" title="StudyFlow"')
  .trim();

const page = `<title>StudyFlow — IB student organizer</title>

<style>
${css.trim()}
</style>

${body}

${scripts.map(s => `<script>\n/* ${s.f} */\n${s.src.trim()}\n</script>`).join('\n\n')}
`;

fs.writeFileSync(out, page);

const kb = n => (n / 1024).toFixed(1) + 'KB';
console.log(`wrote ${out}  (${kb(page.length)})`);
scripts.forEach(s => console.log(`  inlined ${s.f.padEnd(15)} ${kb(s.src.length)}`));
console.log(`  inlined ${'app.css'.padEnd(15)} ${kb(css.length)}`);

const leftover = page.match(/<(script|link)[^>]+(src|href)="(?!#|data:)[^"]+"/g);
if (leftover) {
  console.error('\nERROR: unresolved external references:\n  ' + leftover.join('\n  '));
  process.exit(1);
}
// \b matters here: without it, <header> reads as <head>.
if (/<\/?(html|head|body)\b|<!DOCTYPE/i.test(page)) {
  console.error('\nERROR: document scaffolding leaked into the bundle');
  process.exit(1);
}
console.log('\nno external references, no document scaffolding — self-contained');
