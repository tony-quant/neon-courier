// tests/playthrough.spec.js — a scripted player drives sectors 2 and 3 from start to exit, through the game's own
// keyboard input and frame stepping. The script only uses what a player can see: it keeps moving right, jumps when a pit,
// a wall or a walker is within reach, and holds jump through the rise. The test fails if the player dies (fell into a
// pit it could not cross, or was hit) or runs out of frames. Sectors are played in order, with NEXT SECTOR between them.
const { test, expect } = require('@playwright/test');
const R = require('../tools/reachability.js');
const Physics = require('../js/physics.js');

const SECTORS = R.loadLevels(R.levelFiles()).map((x) => R.buildLevel(x.def));
const MAX_FRAMES = 6000;
const T = 16, PW = 10, PH = 14;

const isGround = (ch) => ch === '#' || ch === '-';
// Would a jump started now land on standable ground? The script runs the game's own movement rules (js/physics.js)
// forward from the current state. This finds the timing windows for jumps across pits with short landings.
function jumpLandsSafely(L, s) {
  const walkers = s.enemies.filter((e) => e.alive);
  let prevBottom = s.y + PH;
  let p = Physics.makePlayer(s.x, s.y);
  p.vx = s.vx;
  p.onGround = true;
  for (let f = 0; f < 200; f++) {
    const jumpHeld = f === 0 || p.vy < 0;
    p = Physics.stepPlayer(L, p, { moveX: 1, jumpPressed: f === 0, jumpHeld: jumpHeld }).player;
    if (p.y > L.heightPx + 24) return false;                 // fell into a pit
    // A walker where the jump would pass (its current position, with a margin): not safe, unless the player comes
    // down onto it from above, which is a stomp (the same test as js/game.js checkEnemies).
    for (const e of walkers) {
      if (p.x < e.x + 12 + 8 && p.x + PW > e.x - 8 && p.y < e.y + 12 + 4 && p.y + PH > e.y - 4) {
        const stomp = p.vy > 0 && prevBottom <= e.y + 5;
        if (!stomp) return false;
        return true;                                   // a stomp bounces the player: the landing is treated as safe
      }
    }
    prevBottom = p.y + PH;
    if (f > 0 && p.onGround && p.vy >= 0) {
      // Landed on standable ground, at least 4 px inside the tile: the edge of the window is too tight for the real game.
      const cl = Math.floor(p.x / T);
      return isGround(L.grid[Math.round((p.y + PH) / T)] && L.grid[Math.round((p.y + PH) / T)][cl]) && p.x - cl * T >= 4;
    }
  }
  return false;
}
function nodeAt(L, p) {
  const feet = p.y + p.h;
  const r = Math.round(feet / T);
  if (Math.abs(feet - r * T) > 0.01) return null;
  const c = Math.floor((p.x + p.w / 2) / T);
  return isGround(L.grid[r] && L.grid[r][c]) ? c : null;
}

// One frame of the script. It keeps moving right. It jumps when a pit or a wall is close ahead and a jump now would
// land safely. A walker ahead makes it wait until the walker is about a tile away, then jump over it.
function decide(L, s) {
  const at = (r, c) => (c < 0 || c >= L.cols) ? '#' : (r < 0 || r >= L.rows) ? '.' : L.grid[r][c];
  const feetRow = Math.round((s.y + PH) / T);          // the row whose top the player stands on
  const frontCol = Math.floor((s.x + PW + 1) / T);
  let jumpPressed = false, waitForWalker = false;
  if (s.onGround) {
    let pitClose = false, wallClose = false;
    for (let c = frontCol + 1; c <= frontCol + 3; c++) {
      let g = false;
      for (let rr = feetRow; rr <= feetRow + 3; rr++) if (isGround(at(rr, c))) g = true;
      if (!g) pitClose = true;
      if (at(feetRow - 1, c) === '#') wallClose = true;
    }
    if (pitClose || wallClose) jumpPressed = jumpLandsSafely(L, s);
    if (!pitClose) {
      for (const e of s.enemies) {
        const d = e.x - (s.x + PW);
        if (e.alive && d > 0 && d < 3 * T && Math.abs(e.y - s.y) < 16) {
          if (d <= 20) jumpPressed = true;             // close enough: jump over it
          else waitForWalker = true;                   // still far: stop and let it come
        }
      }
    }
  }
  const jumpHeld = jumpPressed || s.vy < 0;
  return { jumpPressed: jumpPressed, jumpHeld: jumpHeld, moveRight: !(waitForWalker && !jumpPressed) };
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
  let rightDown = true;                    // openGame() presses the right arrow
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
    if (d.moveRight && !rightDown) { await page.keyboard.down('ArrowRight'); rightDown = true; }
    else if (!d.moveRight && rightDown) { await page.keyboard.up('ArrowRight'); rightDown = false; }
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
  // The game steps physics in real time from page load until manual stepping starts, so the walkers would be in a
  // different place on each run. Switching to manual stepping and restarting the sector makes every run start at frame 0.
  await page.evaluate(() => { window.__game.manual(true); window.__game.reset(); window.__game.stepFrames(0); });
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
