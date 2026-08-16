const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['ui.spec.js', 'population-ui.spec.js', 'field-activity-ui.spec.js', 'material-flow-ui.spec.js', 'material-navigation-ui.spec.js'],
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: true,
  },
  reporter: 'line',
});
