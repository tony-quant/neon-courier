// tests/levelflow.spec.js — completing a sector shows the right screen and moves on correctly, with no console errors.
// After the last sector the screen is ALL SECTORS CLEAR and its button goes back to sector 1.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('completing a sector: NEXT SECTOR loads the next one, or ALL SECTORS CLEAR after the last', async ({ page }) => {
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
  });
  await expect(page.locator('#win')).toHaveClass(/show/);

  const last = s0.levelCount === 1;
  if (last) {
    await expect(page.locator('#win-title')).toHaveText('ALL SECTORS CLEAR');
    await expect(page.locator('#restart')).toHaveText('PLAY AGAIN');
  } else {
    await expect(page.locator('#win-title')).toHaveText('LEVEL COMPLETE');
    await expect(page.locator('#restart')).toHaveText('NEXT SECTOR');
  }
  await page.locator('#restart').click();
  await expect(page.locator('#win')).not.toHaveClass(/show/);
  const s1 = await page.evaluate(() => window.__game.state());
  if (last) {
    expect(s1.levelIndex).toBe(0);
  } else {
    expect(s1.levelIndex).toBe(1);
    expect(s1.levelName).not.toBe(s0.levelName);
  }
  expect(s1.won).toBe(false);
  expect(errors).toEqual([]);
});
