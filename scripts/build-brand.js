'use strict';

/**
 * Build every brand asset from the supplied logo.
 *
 *   npm run build:brand
 *
 * The source is public/assets/img/smb-logo.webp: STANDARD in a roman serif,
 * MERCHANT BANK spaced wide beneath it and a short rule, white on the bank's
 * navy (#002445). The site uses that navy as its own ground wherever the logo
 * appears, so the lockup is always seen on the background it was drawn for.
 *
 * From it this writes -
 *
 *   logo-light.png     the lockup in white, transparent, for navy grounds
 *   logo-dark.png      the same in navy, for paper
 *   logomark-light.png the S alone, white
 *   logomark-dark.png  the S alone, navy
 *   favicon.png / apple-touch-icon.png / favicon.ico / og-image.png
 *
 * Transparency is unmixed from the navy rather than keyed: each pixel's alpha
 * is how far it has moved from the background towards white, so the hairline
 * rule and the serifs keep their soft edges.
 *
 * Pixels are read in Chromium, the one image toolchain this project can
 * assume. Nothing here runs on a normal build: the outputs are committed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'assets', 'bank');
const SOURCE = path.join(PUBLIC, 'assets', 'img', 'smb-logo.webp');

const NAVY = '#002445';

/* ------------------------------------------------------------ in-page -- */

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

  // The background, from the four corners.
  const corner = (x, y) => { const o = (y * width + x) * 4; return [px[o], px[o + 1], px[o + 2]]; };
  const samples = [corner(4, 4), corner(width - 5, 4), corner(4, height - 5), corner(width - 5, height - 5)];
  const bg = [0, 1, 2].map((i) => samples.reduce((t, s) => t + s[i], 0) / samples.length);

  // White over navy: alpha is the distance travelled towards white, read on
  // the channel with the most room to travel.
  const ch = bg.indexOf(Math.min(...bg));
  const FLOOR = 0.06;
  const alpha = new Float32Array(width * height);
  for (let i = 0, p = 0; i < px.length; i += 4, p += 1) {
    let a = (px[i + ch] - bg[ch]) / (255 - bg[ch]);
    a = a < FLOOR ? 0 : Math.min(1, (a - FLOOR) / (1 - FLOOR));
    alpha[p] = a;
  }

  const rows = new Float32Array(height);
  const cols = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rows[y] += alpha[y * width + x];
      cols[x] += alpha[y * width + x];
    }
  }
  const first = (arr, from, to, step) => { for (let i = from; step > 0 ? i < to : i > to; i += step) if (arr[i] > 0.5) return i; return -1; };
  const full = { top: first(rows, 0, height, 1), bottom: first(rows, height - 1, -1, -1), left: first(cols, 0, width, 1), right: first(cols, width - 1, -1, -1) };

  // The S: the first glyph of the top line, bounded by the first empty
  // column after it starts.
  let lineBottom = full.top;
  while (lineBottom < full.bottom && rows[lineBottom + 1] > 0.5) lineBottom += 1;
  const lineCols = new Float32Array(width);
  for (let y = full.top; y <= lineBottom; y += 1) for (let x = 0; x < width; x += 1) lineCols[x] += alpha[y * width + x];
  const sLeft = first(lineCols, 0, width, 1);
  let sRight = sLeft;
  while (sRight < width - 1 && lineCols[sRight + 1] > 0.3) sRight += 1;
  const mark = { top: full.top, bottom: lineBottom, left: sLeft, right: sRight };

  function cut(box, rgb, pad = 0) {
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
        dest.data[o] = rgb[0];
        dest.data[o + 1] = rgb[1];
        dest.data[o + 2] = rgb[2];
        dest.data[o + 3] = sx >= 0 && sx < width && sy >= 0 && sy < height ? Math.round(alpha[sy * width + sx] * 255) : 0;
      }
    }
    octx.putImageData(dest, 0, 0);
    return out.toDataURL('image/png');
  }

  const navy = [0, 36, 69];
  return {
    bounds: { full, mark, bg: bg.map(Math.round) },
    logoLight: cut(full, [255, 255, 255], 6),
    logoDark: cut(full, navy, 6),
    markLight: cut(mark, [255, 255, 255], 4),
    markDark: cut(mark, navy, 4),
  };
}

/* ---------------------------------------------------------------- ICO -- */

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

const dataUrlToBuffer = (url) => Buffer.from(url.split(',')[1], 'base64');

/**
 * The icon tile: a white S on the logo's navy.
 *
 * Set in Playfair Display, the site's headline face and the nearest match to
 * the logo's serif, rather than cut from the artwork: the S in the supplied
 * file is under ninety pixels tall, and a 512px icon scaled up from that is
 * soft at every edge.
 */
function iconHtml(size) {
  const font = fs.readFileSync(path.join(PUBLIC, 'assets', 'fonts', 'playfair-display-600-latin.woff2')).toString('base64');
  return `<!doctype html><html><head><style>
    @font-face { font-family: 'Playfair Display'; font-weight: 600; src: url(data:font/woff2;base64,${font}) format('woff2'); }
  </style></head><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:${NAVY};border-radius:${Math.round(size * 0.2)}px;
                display:flex;align-items:center;justify-content:center;color:#fff;
                font:600 ${Math.round(size * 0.74)}px/1 'Playfair Display',Georgia,serif;padding-bottom:${Math.round(size * 0.06)}px;box-sizing:border-box">S</div>
  </body></html>`;
}

/** The link card: the lockup on its navy, as supplied. */
function cardHtml(logoUrl) {
  return `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;background:${NAVY};display:flex;align-items:center;justify-content:center">
      <img src="${logoUrl}" style="width:600px" />
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
    const art = await page.evaluate(extract, `data:image/webp;base64,${fs.readFileSync(SOURCE).toString('base64')}`);
    await page.close();
    const { full, mark, bg } = art.bounds;
    console.log(`  background rgb(${bg.join(', ')}); lockup x ${full.left}-${full.right}, y ${full.top}-${full.bottom}; S x ${mark.left}-${mark.right}`);

    for (const [name, url] of [['logo-light.png', art.logoLight], ['logo-dark.png', art.logoDark], ['logomark-light.png', art.markLight], ['logomark-dark.png', art.markDark]]) {
      const buf = dataUrlToBuffer(url);
      fs.writeFileSync(path.join(BRAND, name), buf);
      console.log(`  wrote assets/bank/${name} (${(buf.length / 1024).toFixed(1)}kB)`);
    }

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

    const card = await shoot(cardHtml(art.logoLight), 1200, 630);
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
