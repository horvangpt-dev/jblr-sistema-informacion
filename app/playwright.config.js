const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.js',
  timeout: 30_000,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
  },
  reporter: 'line',
});
