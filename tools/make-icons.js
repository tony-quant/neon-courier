// tools/make-icons.js — draws the app icons (192 and 512 px) with the same pixel style as the game.
// Uses Playwright's Chromium to draw on a canvas and save PNG files. Run: npm run icons
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'icons');

const DRAW = `
(size) => {
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  const g = c.getContext('2d');
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(0, 0, 24, 24, '#16123a');
  px(0, 0, 24, 6, '#120e2e');
  px(0, 18, 24, 6, '#2a1650');
  // Ruined skyline
  px(0, 16, 5, 8, '#2a2257'); px(6, 12, 4, 12, '#2a2257'); px(18, 14, 6, 10, '#2a2257');
  px(10, 17, 5, 7, '#1b1842');
  // Courier robot
  px(7, 6, 10, 8, '#d6dff0');           // head
  px(9, 9, 6, 2, '#38f2ff');            // visor
  px(8, 14, 8, 6, '#d6dff0');           // body
  px(6, 15, 2, 4, '#ff8a3d');           // bag
  px(8, 20, 3, 2, '#5a6480'); px(13, 20, 3, 2, '#5a6480');  // legs
  px(10, 3, 2, 3, '#ff3b9a');           // antenna
  px(9, 2, 2, 1, '#ffd23f');
  // Neon edge line
  px(0, 19, 24, 1, '#38f2ff');
  const out = document.createElement('canvas');
  out.width = size; out.height = size;
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, size, size);
  return out.toDataURL('image/png');
}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  for (const size of [192, 512]) {
    const dataUrl = await page.evaluate(`(${DRAW})(${size})`);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), buf);
    console.log('wrote icons/icon-' + size + '.png (' + buf.length + ' bytes)');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
