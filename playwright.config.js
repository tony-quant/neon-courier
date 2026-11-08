// playwright.config.js — runs the game tests in headless Chromium against tests/serve.js.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 960, height: 540 } } }],
  webServer: { command: 'node tests/serve.js', url: 'http://localhost:4173', reuseExistingServer: true },
});
