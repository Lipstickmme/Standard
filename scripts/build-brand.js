'use strict';

/**
 * Build every brand asset from the supplied logo artwork.
 *
 *   npm run build:brand
 *
 * The source is public/assets/img/smblogo.png: the navy-and-gold SMB monogram,
 * its key, and the STANDARD MERCHANT BANK wordmark on an opaque white square,
 * which is the wrong shape for most of the places it has to appear. This turns
 * it into the set the site actually needs -
 *
 *   logo-dark.png      the full lockup in its own colours, transparent, for
 *                      light backgrounds
 *   logo-light.png     the same with the navy painted white and the gold kept,
 *                      for the navy panels
 *   logomark-dark.png  the monogram and key alone, for square and compact spots
 *   logomark-light.png the same, white and gold
 *   favicon.png / apple-touch-icon.png / favicon.ico / og-image.png
 *
 * - and does it by reading pixels in Chromium, which is the only image
 * toolchain this project can assume and the same one the browser tests use.
 * Nothing here runs on a normal build: the outputs are committed, because they
 * change about as often as the bank changes its name.
 *
 * The artwork is in colour, so transparency is unmixed from the white rather
 * than read off luminance: each pixel's alpha is how far its lightest channel
 * sits below white, and its colour is recovered by taking the white back out.
 * The anti-aliased edges stay soft and keep their hue instead of greying.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'assets', 'bank');
const SOURCE = path.join(PUBLIC, 'assets', 'img', 'smblogo.png');

const NAVY = '#0e2148';

/* ------------------------------------------------------------ in-page -- */

/**
 * Runs inside Chromium, where there is a canvas to read pixels from.
 *
 * Returns the cut-outs as data URLs plus the bounds used to find the gap
 * between the monogram and the wordmark, so the caller can report it.
 */
async function extract(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const { width, height } = img;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, width, height).data;

  // Anything under this is paper texture or compression noise, not ink.
  const FLOOR = 0.05;

  // Colour-to-alpha against white.
  const alpha = new Float32Array(width * height);
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0, p = 0; i < px.length; i += 4, p += 1) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    let a = 1 - Math.min(r, g, b);
    a = a < FLOOR ? 0 : Math.min(1, (a - FLOOR) / (1 - FLOOR));
    alpha[p] = a;
    const k = Math.max(a, 1e-3);
    rgb[p * 3] = Math.min(1, Math.max(0, (r - (1 - a)) / k));
    rgb[p * 3 + 1] = Math.min(1, Math.max(0, (g - (1 - a)) / k));
    rgb[p * 3 + 2] = Math.min(1, Math.max(0, (b - (1 - a)) / k));
  }

  const rows = new Float32Array(height);
  const cols = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alpha[y * width + x];
      rows[y] += a;
      cols[x] += a;
    }
  }

  const firstAbove = (arr, from, to, step) => {
    for (let i = from; step > 0 ? i < to : i > to; i += step) if (arr[i] > 0.5) return i;
    return -1;
  };

  const top = firstAbove(rows, 0, height, 1);
  const bottom = firstAbove(rows, height - 1, -1, -1);
  const left = firstAbove(cols, 0, width, 1);
  const right = firstAbove(cols, width - 1, -1, -1);

  /**
   * Cut a box out of the artwork.
   *
   * `light` repaints the navy white for dark grounds and leaves the gold
   * alone. Gold is told from navy by how much warmer than blue it is, with a
   * soft ramp between so the edges where the two meet do not band.
   */
  function cut(box, light = false, maxWidth = 640) {
    const pad = 0;
    const w = box.right - box.left + 1 + pad * 2;
    const h = box.bottom - box.top + 1 + pad * 2;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    const dest = octx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sx = box.left - pad + x;
        const sy = box.top - pad + y;
        const o = (y * w + x) * 4;
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) { dest.data[o + 3] = 0; continue; }
        const p = sy * width + sx;
        let r = rgb[p * 3];
        let g = rgb[p * 3 + 1];
        let b = rgb[p * 3 + 2];
        let a = alpha[p];
        if (light) {
          // Unmixed from white, gold comes out as a dark bronze - which is
          // right over paper and muddy over navy. So on the light version the
          // gold takes the colour it shows on paper, at nearly full strength,
          // and only the navy is unmixed and repainted white.
          const gold = Math.min(1, Math.max(0, ((r - b) - 0.18) / 0.22));
          const shown = [px[p * 4] / 255, px[p * 4 + 1] / 255, px[p * 4 + 2] / 255];
          const lift = 1.12;
          r = Math.min(1, shown[0] * lift) * gold + (1 - gold);
          g = Math.min(1, shown[1] * lift) * gold + (1 - gold);
          b = Math.min(1, shown[2] * lift) * gold + (1 - gold);
          a = Math.min(1, a * (1 + 0.35 * gold));
        }
        dest.data[o] = Math.round(r * 255);
        dest.data[o + 1] = Math.round(g * 255);
        dest.data[o + 2] = Math.round(b * 255);
        dest.data[o + 3] = Math.round(a * 255);
      }
    }
    octx.putImageData(dest, 0, 0);
    // Twice the largest size any of these is shown at is plenty, and keeps the
    // nav's mark from weighing more than the page around it.
    if (w <= maxWidth) return out.toDataURL('image/png');
    const small = document.createElement('canvas');
    small.width = maxWidth;
    small.height = Math.round((h * maxWidth) / w);
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(out, 0, 0, small.width, small.height);
    return small.toDataURL('image/png');
  }

  // The monogram sits above the wordmark with a band of clear paper between
  // them. A second, narrower band separates the wordmark from the rule under
  // it, so the search is limited to the upper part of the artwork and takes
  // the widest band it finds there.
  let gapStart = -1;
  let best = null;
  for (let y = top; y <= bottom; y += 1) {
    const empty = rows[y] <= 0.5;
    if (empty && gapStart === -1) gapStart = y;
    if ((!empty || y === bottom) && gapStart !== -1) {
      const run = { from: gapStart, to: y - 1 };
      const span = run.to - run.from;
      const upper = run.from < top + (bottom - top) * 0.85;
      if (upper && (!best || span > best.to - best.from)) best = run;
      gapStart = -1;
    }
  }
  const split = best ? best.from : Math.round((top + bottom) / 2);

  // The monogram's own left/right bounds, which are narrower than the
  // wordmark's.
  let markLeft = width;
  let markRight = 0;
  for (let y = top; y < split; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] > FLOOR) {
        if (x < markLeft) markLeft = x;
        if (x > markRight) markRight = x;
      }
    }
  }

  const full = { top, bottom, left, right };
  const mark = { top, bottom: split - 1, left: markLeft, right: markRight };

  return {
    bounds: { full, mark, split },
    logoDark: cut(full),
    logoLight: cut(full, true),
    markDark: cut(mark, false, 360),
    markLight: cut(mark, true, 360),
    // Full size for the icon tiles, which scale it down themselves.
    markIcon: cut(mark, true, 1024),
  };
}

/* ---------------------------------------------------------------- ICO -- */

/**
 * Wrap PNGs in an ICO container.
 *
 * The format allows a PNG payload per entry rather than a bitmap, which every
 * browser since IE11 reads, and which saves writing a BMP encoder by hand.
 * Layout: a 6-byte directory header, one 16-byte entry per image, then the
 * payloads. A size of 256 is written as 0, which is the format's way of
 * saying "not 1..255".
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
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
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

const dataUrlToBuffer = (url) => Buffer.from(url.split(',')[1], 'base64');

/** The icon tile: the monogram in white and gold on a navy square. */
function iconHtml(size, art) {
  // The monogram is wide and short, so it is given most of the tile's width.
  // Below 64px it gets nearly all of it: the letters need every pixel.
  const inset = Math.round(size * (size < 64 ? 0.06 : 0.12));
  return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:${NAVY};border-radius:${Math.round(size * 0.22)}px;
                display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:${inset}px">
      <img src="${art.markIcon}" style="max-width:100%;max-height:100%;object-fit:contain" />
    </div>
  </body></html>`;
}

/** The link card: what a shared URL unfurls into. */
function cardHtml(logoLightUrl) {
  return `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;background:${NAVY};position:relative;overflow:hidden;
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                font-family:Georgia,'Liberation Serif','Times New Roman',serif">
      <div style="position:absolute;inset:0;
                  background:radial-gradient(60% 50% at 78% 12%, rgba(184,146,67,.30), transparent 70%),
                             radial-gradient(50% 45% at 8% 92%, rgba(41,74,140,.55), transparent 70%)"></div>

      <img src="${logoLightUrl}" style="position:relative;width:520px;object-fit:contain" />

      <div style="position:relative;color:#c3d0e2;font-size:30px;margin-top:30px">Banking that feels like home.</div>

      <div style="position:absolute;bottom:40px;color:#7f91ab;
                  font-family:Helvetica,'Liberation Sans',Arial,sans-serif;font-size:16px;letter-spacing:3px">
        MEMBER FDIC &middot; EQUAL HOUSING LENDER
      </div>
    </div>
  </body></html>`;
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`[brand] ${path.relative(ROOT, SOURCE)} is missing. That file is the logo; nothing here can be built without it.`);
    process.exit(1);
  }
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

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage();
    const sourceUrl = `data:image/png;base64,${fs.readFileSync(SOURCE).toString('base64')}`;
    const cut = await page.evaluate(extract, sourceUrl);
    await page.close();

    const { full, mark, split } = cut.bounds;
    console.log(`  read ${path.relative(PUBLIC, SOURCE)}`);
    console.log(`  artwork occupies x ${full.left}-${full.right}, y ${full.top}-${full.bottom}; monogram/wordmark split at y ${split}`);
    console.log(`  monogram cropped at x ${mark.left}-${mark.right}, y ${mark.top}-${mark.bottom}`);

    const files = [
      ['logo-dark.png', cut.logoDark],
      ['logo-light.png', cut.logoLight],
      ['logomark-dark.png', cut.markDark],
      ['logomark-light.png', cut.markLight],
    ];
    for (const [name, url] of files) {
      const buf = dataUrlToBuffer(url);
      fs.writeFileSync(path.join(BRAND, name), buf);
      console.log(`  wrote assets/bank/${name} (${(buf.length / 1024).toFixed(1)}kB)`);
    }

    const shoot = async (html, width, height) => {
      const p = await browser.newPage({ viewport: { width, height } });
      await p.setContent(html);
      const buffer = await p.screenshot({ omitBackground: true });
      await p.close();
      return buffer;
    };

    const icons = {};
    for (const size of [512, 180, 48, 32, 16]) {
      icons[size] = await shoot(iconHtml(size, cut), size, size);
      console.log(`  rendered ${size}x${size} icon (${(icons[size].length / 1024).toFixed(1)}kB)`);
    }
    fs.writeFileSync(path.join(PUBLIC, 'favicon.png'), icons[512]);
    fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), icons[180]);
    fs.writeFileSync(path.join(BRAND, 'icon-512.png'), icons[512]);
    fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, png: icons[size] }))));

    const card = await shoot(cardHtml(cut.logoLight), 1200, 630);
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
