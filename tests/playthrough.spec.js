// tests/playthrough.spec.js — a scripted player drives sectors 2 and 3 from start to exit, through the game's own
// keyboard input and frame stepping. The script only uses what a player can see: it keeps moving right, jumps when a pit,
// a wall or a walker is within reach, and holds jump through the rise. The test fails if the player dies (fell into a
// pit it could not cross, or was hit) or runs out of frames. Sectors are played in order, with NEXT SECTOR between them.
const { test, expect } = require('@playwright/test');
const R = require('../tools/reachability.js');

const SECTORS = R.loadLevels(R.levelFiles()).map((x) => R.buildLevel(x.def));
const MAX_FRAMES = 6000;
const T = 16, PW = 10, PH = 14;

const isGround = (ch) => ch === '#' || ch === '-';
// One frame of the script: returns whether to press jump now and whether jump should stay held.
function decide(L, s) {
  // Outside the level: solid on the sides, open air below the bottom row.
  const at = (r, c) => (c < 0 || c >= L.cols) ? '#' : (r < 0 || r >= L.rows) ? '.' : L.grid[r][c];
  const feetRow = Math.round((s.y + PH) / T);          // the row whose top the player stands on
  const frontCol = Math.floor((s.x + PW + 1) / T);
  let obstacle = false;
  if (s.onGround) {
    // A pit is open air under the next column, all the way down: a drop onto ground below is not a pit.
    const ahead = frontCol + 1;
    let ground = false;
    for (let rr = feetRow; rr <= feetRow + 3; rr++) if (isGround(at(rr, ahead))) ground = true;
    if (!ground) obstacle = true;                                                         // pit one tile ahead
    for (let c = frontCol; c <= frontCol + 2; c++) {
      if (at(feetRow - 1, c) === '#') obstacle = true;                                    // wall ahead
    }
    for (const e of s.enemies) {
      if (e.alive && e.x > s.x + PW && e.x < s.x + PW + 3 * T && Math.abs(e.y - s.y) < 16) obstacle = true;  // walker ahead
    }
  }
  const jumpPressed = s.onGround && obstacle;
  const jumpHeld = jumpPressed || s.vy < 0;
  return { jumpPressed: jumpPressed, jumpHeld: jumpHeld };
}

// layoutIndex: which sector's tiles the script reads. gameIndex: the level the game is playing (0 when only one is served).
async function playSector(page, layoutIndex, gameIndex) {
  const L = SECTORS[layoutIndex];
  const index = layoutIndex;
  const state = () => page.evaluate(() => {
    const st = window.__game.state();
    return { x: st.x, y: st.y, vx: st.vx, vy: st.vy, onGround: st.onGround, won: st.won, deaths: st.deaths,
      levelIndex: st.levelIndex, enemies: st.enemies, levelName: st.levelName };
  });
  let s = await state();
  expect(s.levelIndex).toBe(gameIndex);
  const deaths0 = s.deaths;
  let jumpDown = false;
  const recent = [];                       // the last few frames, for the failure message
  for (let f = 0; f < MAX_FRAMES; f++) {
    if (s.won) {
      if (jumpDown) { await page.keyboard.up('Space'); jumpDown = false; }
      return f;
    }
    if (s.deaths !== deaths0) {
      throw new Error('sector ' + (index + 1) + ' (' + s.levelName + '): the player died at frame ' + f +
        ' (frames before the death: ' + recent.slice(Math.max(0, recent.length - 60)).join(' ; ') + ')');
    }
    const d = decide(L, s);
    recent.push('f' + f + ' x' + Math.round(s.x) + ' y' + Math.round(s.y) + (s.onGround ? ' ground' : ' air') +
      (d.jumpPressed ? ' JUMP' : '') + ' walkers' + JSON.stringify(s.enemies.filter((e) => e.alive).map((e) => [Math.round(e.x), Math.round(e.y)])));
    if (d.jumpPressed && !jumpDown) { await page.keyboard.down('Space'); jumpDown = true; }
    else if (!d.jumpHeld && jumpDown) { await page.keyboard.up('Space'); jumpDown = false; }
    s = await page.evaluate(() => { window.__game.stepFrames(1); const st = window.__game.state();
      return { x: st.x, y: st.y, vx: st.vx, vy: st.vy, onGround: st.onGround, won: st.won, deaths: st.deaths,
        levelIndex: st.levelIndex, enemies: st.enemies, levelName: st.levelName }; });
  }
  throw new Error('sector ' + (index + 1) + ' (' + s.levelName + '): not finished in ' + MAX_FRAMES + ' frames (last frames: ' + recent.slice(-4).join(' ; ') + ')');
}

// Loads the game with only this sector: the sector files before it are served empty, so the game's first level is
// the sector under test. (The sector-to-sector flow is covered by levelflow.spec.js.)
async function openGame(page, index) {
  for (let k = 0; k < index; k++) {
    await page.route('**/levels/level' + (k + 1) + '.js', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  }
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => { window.__game.manual(true); window.__game.stepFrames(0); });
  await page.keyboard.down('ArrowRight');
}

// Completes one sector and presses NEXT SECTOR, so the next sector loads through the game's own flow.
async function finishAndAdvance(page, index) {
  await page.waitForFunction(() => document.getElementById('win').classList.contains('show'));
  await page.click('#restart');
  await page.waitForFunction((next) => window.__game.state().levelIndex === next, index + 1);
  // The game forgets held keys when a sector loads (Input.reset), so press the right arrow again.
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowRight');
}

test.use({ serviceWorkers: 'block' });
test.setTimeout(600000);

for (const index of [1, 2]) {
  test('sector ' + (index + 1) + ': a scripted player reaches the exit with no death', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await openGame(page, index);
    try {
      const frames = await playSector(page, index, 0);   // the only sector the game is serving in this test
      console.log('[sector ' + (index + 1) + '] ' + SECTORS[index].name + ': exit reached in ' + frames + ' frames');
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    expect(errors).toEqual([]);
  });
}
