const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['ui.spec.js','population-ui.spec.js','field-activity-ui.spec.js','material-flow-ui.spec.js','material-navigation-ui.spec.js','processing-flow-ui.spec.js','evidence-flow-ui.spec.js','field-monitoring-ui.spec.js','individual-traceability-ui.spec.js','external-data-ui.spec.js','navigation-race.spec.js','analysis-flow-ui.spec.js','analysis-navigation-race.spec.js','regional-status-ui.spec.js','regional-status-navigation-race.spec.js','quality-review-ui.spec.js','quality-review-navigation-race.spec.js','review-request-ui.spec.js','review-request-navigation-race.spec.js'],
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: { browserName: 'chromium', headless: true },
  reporter: 'line',
});
