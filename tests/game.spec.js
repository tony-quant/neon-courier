// tests/game.spec.js — end-to-end checks in headless Chromium.
// Run with: npm test
const { test, expect } = require('@playwright/test');

const state = (page) => page.evaluate(() => window.__game.state());
const waitGame = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForTimeout(300);
};

// Waits (real time) until the predicate on game state holds.
async function waitState(page, pred, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await state(page);
    if (pred(s)) return s;
    await page.waitForTimeout(40);
  }
  throw new Error('timed out waiting for state; last: ' + JSON.stringify(await state(page)));
}

test('loads with no console errors and draws the canvas', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await waitGame(page);
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  const box = await page.locator('#screen').boundingBox();
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(200);
  const s = await state(page);
  expect(s.levelWidth).toBe(1536);
  expect(s.rows).toBe(14);
});

test('keyboard: player runs right and stops at a wall', async ({ page }) => {
  await waitGame(page);
  const s0 = await state(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const s1 = await state(page);
  expect(s1.x).toBeGreaterThan(s0.x + 25);
  expect(s1.source).toBe('keyboard');

  // Wall at columns 33-34 (x = 528). Start just left of it and push right.
  await page.evaluate(() => window.__game.setPlayer(500, 178));
  await waitState(page, (s) => s.onGround);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  const s2 = await state(page);
  expect(s2.x + 10).toBeLessThanOrEqual(528.01);
  expect(s2.x).toBeGreaterThan(500);
});

test('keyboard: jump rises, releases early for a short hop, and lands', async ({ page }) => {
  await waitGame(page);
  const spawn = (await state(page)).spawn;
  await waitState(page, (s) => s.onGround);
  await page.keyboard.down('Space');
  const held = await waitState(page, (s) => s.y < spawn.y - 40);
  await page.keyboard.up('Space');
  expect(held.y).toBeLessThan(spawn.y - 40);
  const landed = await waitState(page, (s) => s.onGround && s.vy === 0 && s.y > spawn.y - 2, 3000);
  expect(Math.abs(landed.y - spawn.y)).toBeLessThan(2);
  // Short hop: tap jump, so the peak height is lower than a held jump.
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(350);
  const shortHopTop = (await state(page)).y;
  await waitState(page, (s) => s.onGround && s.y > spawn.y - 2, 3000);
  expect(shortHopTop).toBeGreaterThan(spawn.y - 40);
});

test('gamepad: stick runs, Cross jumps, and it is picked up automatically', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Fake DualSense (Standard Gamepad)', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
  });
  await waitGame(page);
  const spawn = (await state(page)).spawn;
  await waitState(page, (s) => s.onGround);
  await page.evaluate(() => { window.__pad.axes[0] = 1; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__pad.axes[0] = 0; });
  const ran = await state(page);
  expect(ran.x).toBeGreaterThan(spawn.x + 25);
  expect(ran.source).toBe('gamepad');

  await page.evaluate(() => { window.__pad.buttons[0].pressed = true; });
  await waitState(page, (s) => s.y < s.spawn.y - 30, 2000);
  await page.evaluate(() => { window.__pad.buttons[0].pressed = false; });
  expect(await page.evaluate(() => window.Input.gamepadConnected())).toBe(true);
  expect(await page.evaluate(() => window.Input.padNotice())).toBeGreaterThan(0);
});

test('enemy: stomping from above defeats the walker and bounces the player', async ({ page }) => {
  await waitGame(page);
  const s0 = await state(page);
  const enemy = s0.enemies[0];
  await page.evaluate(([x, y]) => window.__game.setPlayer(x + 1, y - 10, 0, 0), [enemy.x, enemy.y]);
  const s = await waitState(page, (st) => st.stomps === 1, 3000);
  expect(s.enemies[0].alive).toBe(false);
  expect(s.deaths).toBe(0);
});

test('enemy: side contact hurts and respawns at the last checkpoint', async ({ page }) => {
  await waitGame(page);
  // Touch the checkpoint at column 45 first.
  await page.evaluate(() => window.__game.setPlayer(724, 178, 0, 0));
  const withCp = await waitState(page, (s) => s.checkpointIdx === 0);
  const cpX = withCp.checkpointSpawn.x;
  // Then walk into the first walker from the side.
  const enemy = withCp.enemies[0];
  await page.evaluate(([x, y]) => window.__game.setPlayer(x + 2, y + 0, 0, 0), [enemy.x, 178]);
  const hit = await waitState(page, (s) => s.deaths === 1, 3000);
  expect(Math.abs(hit.x - cpX)).toBeLessThan(0.5);
  expect(hit.y).toBeCloseTo(178, 0);
});

test('checkpoint: falling in a pit respawns at the checkpoint', async ({ page }) => {
  await waitGame(page);
  await page.evaluate(() => window.__game.setPlayer(724, 178, 0, 0));
  const cp = await waitState(page, (s) => s.checkpointIdx === 0);
  // Pit at columns 52-54 is after the checkpoint.
  await page.evaluate(() => window.__game.setPlayer(833, 60, 0, 0));
  const s = await waitState(page, (st) => st.deaths === 1, 4000);
  expect(Math.abs(s.x - cp.checkpointSpawn.x)).toBeLessThan(0.5);
});

test('level: reaching the exit opens the menu with the sector done, and the next sector starts after the countdown', async ({ page }) => {
  await waitGame(page);
  await page.evaluate(() => window.__game.setPlayer(1474, 178, 0, 0));
  await waitState(page, (s) => s.won);
  await expect(page.locator('#menu')).toHaveClass(/show/);
  await expect(page.locator('#menu-status')).toHaveText('LEVEL COMPLETE');
  await expect(page.locator('#menu-list button').nth(0)).toContainText('DONE');
  const s = await waitState(page, (st) => st.levelIndex === 1, 9000);
  await expect(page.locator('#menu')).not.toHaveClass(/show/);
  expect(s.won).toBe(false);
});

test.describe('jump feel (deterministic, fixed steps)', () => {
  const manual = (page, on) => page.evaluate((v) => window.__game.manual(v), on);
  const steps = (page, n) => page.evaluate((k) => window.__game.stepFrames(k), n);
  const st = (page) => state(page);

  test('holding jump jumps higher than a quick tap', async ({ page }) => {
    await waitGame(page);
    await manual(page, true);
    const spawn = (await st(page)).spawn;
    const peakOf = async (hold) => {
      await page.evaluate(([x, y]) => window.__game.setPlayer(x, y, 0, 0), [spawn.x, spawn.y]);
      await steps(page, 3);
      if (hold) await page.keyboard.down('Space'); else await page.keyboard.press('Space');
      let min = 1e9;
      for (let i = 0; i < 60; i++) {
        await steps(page, 1);
        min = Math.min(min, (await st(page)).y);
      }
      if (hold) await page.keyboard.up('Space');
      return min;
    };
    const heldPeak = await peakOf(true);
    const tapPeak = await peakOf(false);
    expect(spawn.y - heldPeak).toBeGreaterThan(45);   // about 60 px for a full jump
    expect(spawn.y - tapPeak).toBeLessThan(35);       // about 23 px for a short hop
    await manual(page, false);
  });

  test('coyote time: can still jump about 100 ms after walking off a ledge', async ({ page }) => {
    await waitGame(page);
    await manual(page, true);
    // Ground ends at column 21 (x = 336). Run right off the ledge.
    await page.evaluate(() => window.__game.setPlayer(322, 178, 0, 0));
    await steps(page, 1);                     // become grounded first
    expect((await st(page)).onGround).toBe(true);
    await page.keyboard.down('ArrowRight');   // run off the ledge
    let guard = 0;
    while ((await st(page)).onGround && guard++ < 60) await steps(page, 1);
    expect(guard).toBeLessThan(60);
    expect((await st(page)).onGround).toBe(false);
    await steps(page, 3);                     // 50 ms after leaving the ground
    await page.keyboard.press('Space');
    await steps(page, 1);
    await page.keyboard.up('ArrowRight');
    expect((await st(page)).vy).toBeLessThan(0);
    await manual(page, false);
  });

  test('coyote time expires after about 100 ms', async ({ page }) => {
    await waitGame(page);
    await manual(page, true);
    await page.evaluate(() => window.__game.setPlayer(322, 178, 0, 0));
    await steps(page, 1);
    expect((await st(page)).onGround).toBe(true);
    await page.keyboard.down('ArrowRight');
    let guard = 0;
    while ((await st(page)).onGround && guard++ < 60) await steps(page, 1);
    expect((await st(page)).onGround).toBe(false);
    await steps(page, 12);                    // 200 ms after leaving the ground
    await page.keyboard.press('Space');
    await steps(page, 1);
    await page.keyboard.up('ArrowRight');
    expect((await st(page)).vy).toBeGreaterThanOrEqual(0);
    await manual(page, false);
  });

  test('jump buffer: a press just before landing still jumps on landing', async ({ page }) => {
    await waitGame(page);
    await manual(page, true);
    const spawn = (await st(page)).spawn;
    await page.evaluate(([x, y]) => window.__game.setPlayer(x, y, 0, 0), [spawn.x, spawn.y - 30]);
    let s = await st(page);
    let guard = 0;
    // Stop about 3 steps above the ground (falling speed is about 5 px per step here).
    while (!(s.y > spawn.y - 14 && s.vy > 0) && guard++ < 120) { await steps(page, 1); s = await st(page); }
    expect(s.onGround).toBe(false);
    await page.keyboard.press('Space');       // pressed in the air, released at once
    let stepsToJump = -1;
    for (let i = 1; i <= 20; i++) {
      await steps(page, 1);
      s = await st(page);
      if (s.vy < 0) { stepsToJump = i; break; }
    }
    // The jump fires on landing, within the 6-step buffer window.
    expect(stepsToJump).toBeGreaterThan(0);
    expect(stepsToJump).toBeLessThanOrEqual(6);
    await manual(page, false);
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  async function touchController(page) {
    const cdp = await page.context().newCDPSession(page);
    const active = new Map();
    const send = (type) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...active.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })),
    });
    return {
      down: async (id, x, y) => { active.set(id, { x, y }); await send('touchStart'); },
      move: async (id, x, y) => { active.set(id, { x, y }); await send('touchMove'); },
      up: async (id) => { active.delete(id); await send(active.size ? 'touchMove' : 'touchEnd'); },
    };
  }

  test('left-half drag runs, and the ring shows only while the thumb is down', async ({ page }) => {
    await waitGame(page);
    const t = await touchController(page);
    const s0 = await state(page);
    await t.down(1, 100, 300);
    await expect(page.locator('#touch-ring')).toHaveClass(/on/);
    for (let i = 1; i <= 15; i++) { await t.move(1, 100 + i * 4, 300); await page.waitForTimeout(30); }
    await page.waitForTimeout(400);
    const during = await state(page);
    expect(during.x).toBeGreaterThan(s0.x + 25);
    expect(during.source).toBe('touch');
    await t.up(1);
    await expect(page.locator('#touch-ring')).not.toHaveClass(/on/);
  });

  test('right-half tap jumps, and holding gives a higher jump', async ({ page }) => {
    await waitGame(page);
    const spawn = (await state(page)).spawn;
    await waitState(page, (s) => s.onGround);
    const t = await touchController(page);
    // Held: the thumb stays down until the peak has passed.
    await t.down(2, 700, 300);
    const held = await waitState(page, (s) => s.y < spawn.y - 40, 2000);
    await page.waitForTimeout(200);
    await t.up(2);
    expect(held.source).toBe('touch');
    await waitState(page, (s) => s.onGround && s.y > spawn.y - 2, 3000);
    // Quick tap: the peak should be clearly lower than the held jump.
    await t.down(3, 700, 300);
    await page.waitForTimeout(30);
    await t.up(3);
    const tapped = await waitState(page, (s) => s.y < spawn.y - 4, 1000);
    const tapPeak = await page.evaluate(() => new Promise((resolve) => {
      let min = 1e9;
      const start = performance.now();
      const tick = () => {
        min = Math.min(min, window.__game.state().y);
        if (performance.now() - start < 900) requestAnimationFrame(tick); else resolve(min);
      };
      requestAnimationFrame(tick);
    }));
    expect(tapped.y).toBeLessThan(spawn.y);
    expect(tapPeak).toBeGreaterThan(spawn.y - 40);
  });

  test('multi-touch: run with the left thumb while jumping with the right', async ({ page }) => {
    await waitGame(page);
    const spawn = (await state(page)).spawn;
    await waitState(page, (s) => s.onGround);
    const t = await touchController(page);
    await t.down(10, 100, 300);
    for (let i = 1; i <= 10; i++) { await t.move(10, 100 + i * 5, 300); await page.waitForTimeout(25); }
    await t.down(11, 700, 300);
    const both = await waitState(page, (s) => s.y < spawn.y - 30 && s.x > spawn.x + 15, 2500);
    await t.up(11);
    await t.up(10);
    expect(both.x).toBeGreaterThan(spawn.x + 15);
    expect(both.y).toBeLessThan(spawn.y - 30);
  });

  test('quick upward swipe on the right half jumps', async ({ page }) => {
    await waitGame(page);
    const spawn = (await state(page)).spawn;
    await waitState(page, (s) => s.onGround);
    const t = await touchController(page);
    await t.down(20, 700, 400);
    for (let i = 1; i <= 4; i++) { await t.move(20, 700, 400 - i * 25); await page.waitForTimeout(15); }
    await t.up(20);
    const s = await waitState(page, (st) => st.y < spawn.y - 15, 2000);
    expect(s.source).toBe('touch');
  });
});

test('mute toggle changes label and is saved between visits', async ({ page }) => {
  await waitGame(page);
  await expect(page.locator('#mute')).toHaveText('SOUND ON');
  await page.locator('#mute').click();
  await expect(page.locator('#mute')).toHaveText('SOUND OFF');
  expect(await page.evaluate(() => localStorage.getItem('platformer.muted'))).toBe('1');
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#mute')).toHaveText('SOUND OFF');
});

test('service worker caches the game so it loads with the network off', async ({ page, context }) => {
  await waitGame(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find((n) => n.startsWith('platformer-'));
    const keys = name ? await (await caches.open(name)).keys() : [];
    return { names, count: keys.length };
  });
  expect(cacheInfo.names.some((n) => n.startsWith('platformer-'))).toBe(true);
  expect(cacheInfo.count).toBeGreaterThanOrEqual(11);

  await context.setOffline(true);
  try {
    await page.reload();
    await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
    await expect(page.locator('#screen')).toBeVisible();
    const s = await state(page);
    expect(s.levelWidth).toBe(1536);
  } finally {
    await context.setOffline(false);
  }
});

test.describe('phone in portrait', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  test('shows the rotate message', async ({ page }) => {
    await waitGame(page);
    await expect(page.locator('#rotate')).toBeVisible();
  });
});

