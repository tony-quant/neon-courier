// tests/menu.spec.js — the sector menu, progress, and the flow after a sector is finished. A fresh game shows only sector 1
// open. Finishing a sector opens the menu with it marked done; the next sector blinks with a countdown and starts by itself.
// Cancel during the blink keeps the menu open. The last sector shows the menu and does not start anything.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function openMenu(page) {
  await page.waitForFunction(() => !!window.__game);
  await page.locator('#menu-open').click();
  await expect(page.locator('#menu')).toHaveClass(/show/);
}

// Reach the current sector's exit with the real physics step. The menu opens at once.
async function finishCurrentSector(page) {
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.state();
    g.manual(true);
    g.setPlayer(s.exit.x, s.exit.y, 0, 0);
    g.stepFrames(1);
    g.manual(false);
  });
  await expect(page.locator('#menu')).toHaveClass(/show/, { timeout: 4000 });
}

test('a fresh game shows only sector 1 unlocked', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const buttons = page.locator('#menu-list button');
  const n = await page.evaluate(() => window.LEVELS.length);
  await expect(buttons).toHaveCount(n);
  await expect(buttons.nth(0)).toBeEnabled();
  for (let i = 1; i < n; i++) await expect(buttons.nth(i)).toBeDisabled();
  await expect(buttons.nth(1)).toContainText('LOCKED');
});

test('finishing sector 1 marks it done and unlocks sector 2; sector 3 stays locked', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await finishCurrentSector(page);
  await expect(page.locator('#menu-status')).toHaveText('LEVEL COMPLETE');
  const buttons = page.locator('#menu-list button');
  await expect(buttons.nth(0)).toContainText('DONE');
  await expect(buttons.nth(1)).toBeEnabled();
  await expect(buttons.nth(2)).toBeDisabled();
  const m = await page.evaluate(() => window.__game.menu());
  expect(m.unlocked.slice(0, 3)).toEqual([true, true, false]);
});

test('a locked sector cannot be started', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const locked = page.locator('#menu-list button').nth(1);
  await expect(locked).toBeDisabled();
  await page.evaluate(() => window.__game.startSector(1));   // the game refuses a locked sector
  const s = await page.evaluate(() => window.__game.state());
  expect(s.levelIndex).toBe(0);
  await expect(page.locator('#menu')).toHaveClass(/show/);
});

test('with storage blocked, sector 1 still starts from the menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await openMenu(page);
  await expect(page.locator('#menu-list button').nth(0)).toBeEnabled();
  await page.locator('#menu-list button').nth(0).click();
  await expect(page.locator('#menu')).not.toHaveClass(/show/);
  const s = await page.evaluate(() => window.__game.state());
  expect(s.levelIndex).toBe(0);
  expect(s.won).toBe(false);
  expect(errors).toEqual([]);
});

test('after a sector is finished, the next one starts by itself after about 5 seconds', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  const t0 = Date.now();
  await finishCurrentSector(page);
  await page.waitForFunction(() => window.__game.state().levelIndex === 1, null, { timeout: 9000 });
  const dt = Date.now() - t0;
  expect(dt).toBeGreaterThan(4500);
  expect(dt).toBeLessThan(7000);
  await expect(page.locator('#menu')).not.toHaveClass(/show/);
});

test('the countdown is visible during the blink, counting 3, 2, 1, and the next tile blinks', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await finishCurrentSector(page);
  const countdown = page.locator('#menu-countdown');
  await expect(countdown).toBeVisible({ timeout: 4000 });
  await expect(countdown).toHaveText(/Starting in [123]/);
  await expect(page.locator('#menu-list button').nth(1)).toHaveClass(/blink/);
});

test('cancel during the blink keeps the menu open and the next sector does not start', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await finishCurrentSector(page);
  const countdown = page.locator('#menu-countdown');
  await expect(countdown).toBeVisible({ timeout: 4000 });
  await page.locator('#menu-close').click();            // CANCEL during the countdown
  await expect(countdown).toBeHidden();
  await page.waitForTimeout(3500);                      // past the time the countdown would have taken
  await expect(page.locator('#menu')).toHaveClass(/show/);
  const s = await page.evaluate(() => window.__game.state());
  expect(s.levelIndex).toBe(0);
  const m = await page.evaluate(() => window.__game.menu());
  expect(m.flow).toBeNull();
});

test('the last sector shows the menu and does not start anything', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  const n = await page.evaluate(() => window.LEVELS.length);
  // Finish every sector but the last, so the last one is open, then reload.
  await page.evaluate((n) => {
    const done = [];
    for (let i = 0; i < n - 1; i++) done.push(i);
    localStorage.setItem('neon-courier-progress-v1', JSON.stringify(done));
  }, n);
  await page.reload();
  await openMenu(page);
  await page.locator('#menu-list button').nth(n - 1).click();
  await expect(page.locator('#menu')).not.toHaveClass(/show/);
  let s = await page.evaluate(() => window.__game.state());
  expect(s.levelIndex).toBe(n - 1);
  await finishCurrentSector(page);
  await expect(page.locator('#menu-status')).toHaveText('ALL SECTORS CLEAR');
  await page.waitForTimeout(7000);
  s = await page.evaluate(() => window.__game.state());
  expect(s.levelIndex).toBe(n - 1);
  await expect(page.locator('#menu')).toHaveClass(/show/);
  await expect(page.locator('#menu-countdown')).toBeHidden();
});
