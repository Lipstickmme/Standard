'use strict';

/**
 * Build every brand asset from the logo's geometry.
 *
 *   npm run build:brand
 *
 * The logo is drawn here, as vector shapes, rather than cut out of a picture:
 *
 *   - the mark is an S built from slanted slabs - an upper Γ in royal blue, a
 *     lower ⅃ in midnight navy, and a light-blue bar across the middle where
 *     the two meet, which is what turns two blocks into a letter;
 *   - the wordmark is STANDARD, heavy, over MERCHANT BANK, spaced wide, both
 *     in Plus Jakarta Sans - the same face the site is set in.
 *
 * From that it renders, in Chromium (the only image toolchain this project
 * can assume, and the one the browser tests already use) -
 *
 *   logo-dark.png      the lockup, transparent, for light backgrounds
 *   logo-light.png     the same in white and pale blue, for navy
 *   logomark-dark.png  the mark alone
 *   logomark-light.png the mark alone, for navy
 *   favicon.png / apple-touch-icon.png / favicon.ico / og-image.png
 *
 * Nothing here runs on a normal build: the outputs are committed, because
 * they change about as often as the bank changes its name. Change a shape or
 * a colour below, run it again, and every size follows.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'assets', 'bank');
const FONTS = path.join(PUBLIC, 'assets', 'fonts');

const NAVY = '#0a1a3f';

/* ------------------------------------------------------------ the mark -- */

/**
 * The mark, on a 100 x 100 grid, slanted as a whole.
 *
 * `tone` picks the palette: 'dark' for paper, 'light' for navy grounds, where
 * the navy half would otherwise disappear into the background.
 */
function markSvg(tone = 'dark', size = 100) {
  const c = tone === 'dark'
    ? { a1: '#2f74e0', a2: '#123f9a', b1: '#0b2257', b2: '#0a1a3f', bar: '#8cbcff', barOpacity: 0.92 }
    : { a1: '#7fb2ff', a2: '#3b82f6', b1: '#dbe9ff', b2: '#a9c6f5', bar: '#ffffff', barOpacity: 0.9 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <linearGradient id="a-${tone}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.a1}"/><stop offset="1" stop-color="${c.a2}"/></linearGradient>
    <linearGradient id="b-${tone}" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c.b2}"/><stop offset="1" stop-color="${c.b1}"/></linearGradient>
  </defs>
  <g transform="translate(9 0) skewX(-12)">
    <path fill="url(#a-${tone})" d="M38 6 H86 V24 H40 V54 H22 V22 Q22 6 38 6 Z"/>
    <path fill="url(#b-${tone})" d="M70 94 H22 V76 H68 V46 H86 V78 Q86 94 70 94 Z"/>
    <path fill="${c.bar}" fill-opacity="${c.barOpacity}" d="M22 41 H86 V59 H22 Z"/>
  </g>
</svg>`;
}

/** The full lockup: mark, then the two-line wordmark. */
function lockupHtml(tone, fontCss) {
  const ink = tone === 'dark' ? NAVY : '#ffffff';
  const sub = tone === 'dark' ? '#1a56c4' : '#a9c6f5';
  return `<!doctype html><html><head><style>${fontCss}
    body { margin: 0; background: transparent; }
    .lockup { display: inline-flex; align-items: center; gap: 22px; padding: 6px 10px 6px 4px; font-family: 'Plus Jakarta Sans', sans-serif; }
    .words { display: flex; flex-direction: column; line-height: 1; }
    .top { font-weight: 800; font-size: 62px; letter-spacing: -.01em; color: ${ink}; }
    .sub { font-weight: 600; font-size: 21.5px; letter-spacing: .42em; color: ${sub}; margin-top: 10px; padding-left: 3px; }
  </style></head><body>
    <div class="lockup">${markSvg(tone, 112)}<div class="words"><span class="top">STANDARD</span><span class="sub">MERCHANT BANK</span></div></div>
  </body></html>`;
}

function markHtml(tone) {
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div class="m" style="display:inline-block;padding:4px">${markSvg(tone, 360)}</div>
  </body></html>`;
}

/** The icon tile: the light mark on a deep navy square. */
function iconHtml(size) {
  const inset = Math.round(size * (size < 64 ? 0.1 : 0.17));
  return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;box-sizing:border-box;padding:${inset}px;
                background:linear-gradient(135deg,#0b2257 0%,${NAVY} 100%);display:flex;align-items:center;justify-content:center">
      ${markSvg('light', size - inset * 2)}
    </div>
  </body></html>`;
}

/** The link card: what a shared URL unfurls into. */
function cardHtml(lockupLightUrl) {
  return `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;position:relative;overflow:hidden;
                background:linear-gradient(135deg,#07142f 0%,#0b2257 45%,#123f9a 100%);
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif">
      <div style="position:absolute;inset:0;
                  background:radial-gradient(40% 50% at 82% 14%, rgba(59,130,246,.45), transparent 70%),
                             radial-gradient(45% 50% at 10% 92%, rgba(96,165,250,.3), transparent 70%)"></div>
      <img src="${lockupLightUrl}" style="position:relative;width:640px" />
      <div style="position:relative;color:#d9e5f8;font-size:30px;font-weight:600;margin-top:34px">Banking that feels like home.</div>
      <div style="position:absolute;bottom:40px;color:#8aa3cc;font-size:16px;letter-spacing:3px;font-weight:600">
        MEMBER FDIC &middot; EQUAL HOUSING LENDER
      </div>
    </div>
  </body></html>`;
}

/* ---------------------------------------------------------------- ICO -- */

/**
 * Wrap PNGs in an ICO container.
 *
 * The format allows a PNG payload per entry rather than a bitmap, which every
 * browser since IE11 reads, and which saves writing a BMP encoder by hand.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  const payloads = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...payloads]);
}

/* ---------------------------------------------------------------- run -- */

/** The site's own font files, inlined so the render needs no server. */
function fontCss() {
  return [600, 800].map((w) => {
    const file = path.join(FONTS, `plus-jakarta-sans-${w}-latin.woff2`);
    if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing - run npm run build:fonts first`);
    const data = fs.readFileSync(file).toString('base64');
    return `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: ${w}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
  }).join('\n');
}

(async () => {
  fs.mkdirSync(BRAND, { recursive: true });

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (err) {
    console.error('[brand] playwright-core is not installed. npm i -D playwright-core, then run this again.');
    process.exit(1);
  }
  const executablePath = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']
    .concat(process.env.CHROME_PATH || [])
    .find((candidate) => { try { return fs.existsSync(candidate); } catch (e) { return false; } });

  const fonts = fontCss();
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    /** Render some HTML and capture one element of it, background transparent. */
    const capture = async (html, selector, scale = 2) => {
      const p = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: scale });
      await p.setContent(html);
      await p.evaluate(() => document.fonts.ready);
      const buffer = await p.locator(selector).first().screenshot({ omitBackground: true });
      const box = await p.locator(selector).first().boundingBox();
      await p.close();
      return { buffer, width: Math.round(box.width), height: Math.round(box.height) };
    };
    const write = (name, { buffer, width, height }) => {
      fs.writeFileSync(path.join(BRAND, name), buffer);
      console.log(`  wrote assets/bank/${name} (${width}x${height} css px, ${(buffer.length / 1024).toFixed(1)}kB)`);
    };

    const lockupDark = await capture(lockupHtml('dark', fonts), '.lockup');
    const lockupLight = await capture(lockupHtml('light', fonts), '.lockup');
    write('logo-dark.png', lockupDark);
    write('logo-light.png', lockupLight);
    write('logomark-dark.png', await capture(markHtml('dark'), '.m', 1));
    write('logomark-light.png', await capture(markHtml('light'), '.m', 1));

    const shoot = async (html, width, height) => {
      const p = await browser.newPage({ viewport: { width, height } });
      await p.setContent(html);
      await p.evaluate(() => document.fonts.ready);
      const buffer = await p.screenshot({ omitBackground: true });
      await p.close();
      return buffer;
    };
    const icons = {};
    for (const size of [512, 180, 48, 32, 16]) icons[size] = await shoot(iconHtml(size), size, size);
    fs.writeFileSync(path.join(PUBLIC, 'favicon.png'), icons[512]);
    fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), icons[180]);
    fs.writeFileSync(path.join(BRAND, 'icon-512.png'), icons[512]);
    fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, png: icons[size] }))));
    console.log('  wrote favicon.png, apple-touch-icon.png, favicon.ico, assets/bank/icon-512.png');

    const lightUrl = `data:image/png;base64,${lockupLight.buffer.toString('base64')}`;
    const card = await shoot(`<style>${fonts}</style>${cardHtml(lightUrl)}`, 1200, 630);
    fs.writeFileSync(path.join(BRAND, 'og-image.png'), card);
    console.log(`  wrote assets/bank/og-image.png (${(card.length / 1024).toFixed(1)}kB)`);
  } finally {
    await browser.close();
  }
  console.log('[brand] done');
})().catch((err) => {
  console.error('[brand] failed:', err);
  process.exit(1);
});
