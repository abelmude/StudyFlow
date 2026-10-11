const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

(async () => {
  const b = await chromium.launch();
  const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');

  // Square app icons, rendered from the same SVG so they never drift apart.
  for (const size of [180, 192, 512]) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await p.screenshot({ path: path.join(ROOT, `icon-${size}.png`), omitBackground: false });
    await p.close();
  }

  // Maskable: the same mark inset so Android's circle crop never clips it.
  const m = await b.newPage({ viewport: { width: 512, height: 512 } });
  await m.setContent(`<body style="margin:0;background:#1b3a5c;display:grid;place-items:center;width:512px;height:512px">
    <div style="width:320px;height:320px">${svg.replace('<svg ', '<svg width="320" height="320" ')
      .replace('<rect width="512" height="512" rx="96" fill="#1b3a5c"/>','')}</div></body>`);
  await m.screenshot({ path: path.join(ROOT, 'icon-maskable-512.png') });
  await m.close();

  // Open Graph card, 1200x630, in the site's own type and palette.
  const og = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(`<body style="margin:0;width:1200px;height:630px;background:#f2f5f4;
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    display:grid;grid-template-rows:auto 1fr auto;padding:64px 72px;box-sizing:border-box;
    background-image:repeating-linear-gradient(to bottom,#d8e0de 0 1px,transparent 1px 42px)">
    <div style="display:flex;align-items:center;gap:16px">
      <div style="width:56px;height:56px">${svg.replace('<svg ', '<svg width="56" height="56" ')}</div>
      <span style="font-size:30px;font-weight:700;color:#0f1518;letter-spacing:-.01em">Study<span style="color:#1b3a5c">Flow</span></span>
    </div>
    <div style="display:flex;align-items:center">
      <h1 style="margin:0;font-family:ui-serif,Georgia,'Times New Roman',serif;font-weight:600;
        font-size:76px;line-height:1.06;letter-spacing:-.02em;color:#0f1518;max-width:17ch">
        The IB deadline tracker for Diploma students.</h1>
    </div>
    <div style="display:flex;gap:28px;font-size:23px;color:#4a5861">
      <span>Assignments · IAs · EE · CAS · TOK</span>
      <span style="color:#1b3a5c;font-weight:600">No account needed</span>
    </div>
  </body>`);
  await og.screenshot({ path: path.join(ROOT, 'og-image.png') });
  await og.close();

  await b.close();
  console.log('generated:', fs.readdirSync(ROOT).filter(f => f.endsWith('.png')).join(', '));
})();
