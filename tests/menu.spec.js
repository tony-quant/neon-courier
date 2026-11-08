// tests/menu.spec.js — the sector menu and progress. A fresh game shows only sector 1 open. Finishing a sector opens the
// next one. A locked sector cannot be started. With storage blocked the game still starts sector 1.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function openMenu(page) {
  await page.waitForFunction(() => !!window.__game);
  await page.locator('#menu-open').click();
  await expect(page.locator('#menu')).toHaveClass(/show/);
}

async function finishCurrentSector(page) {
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.state();
    g.manual(true);
    g.setPlayer(s.exit.x, s.exit.y, 0, 0);
    g.stepFrames(1);
  });
  await expect(page.locator('#win')).toHaveClass(/show/);
  await page.locator('#restart').click();
  await expect(page.locator('#menu')).toHaveClass(/show/);
}

test('a fresh game shows only sector 1 unlocked', async ({ page }) => {
  await page.goto('/');
  await openMenu(page);
  const buttons = page.locator('#menu-list button');
  await expect(buttons).toHaveCount(5);
  await expect(buttons.nth(0)).toBeEnabled();
  for (let i = 1; i < 5; i++) await expect(buttons.nth(i)).toBeDisabled();
  await expect(buttons.nth(1)).toContainText('LOCKED');
});

test('finishing sector 1 unlocks sector 2 and leaves sector 3 locked', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await finishCurrentSector(page);
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
