// tests/levelflow.spec.js — finishing a sector opens the menu, and the next sector starts from it by itself. No console errors.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('completing a sector: the menu shows, then the next sector starts', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForTimeout(300);

  const s0 = await page.evaluate(() => window.__game.state());
  expect(s0.levelIndex).toBe(0);
  // Step onto the exit of the current sector with the real physics step.
  await page.evaluate(() => {
    const g = window.__game;
    const s = g.state();
    g.manual(true);
    g.setPlayer(s.exit.x, s.exit.y, 0, 0);
    g.stepFrames(1);
    g.manual(false);
  });
  await expect(page.locator('#menu')).toHaveClass(/show/);
  await expect(page.locator('#menu-status')).toHaveText('LEVEL COMPLETE');
  await page.waitForFunction(() => window.__game.state().levelIndex === 1, null, { timeout: 9000 });
  const s1 = await page.evaluate(() => window.__game.state());
  expect(s1.levelName).not.toBe(s0.levelName);
  expect(s1.won).toBe(false);
  expect(errors).toEqual([]);
});
