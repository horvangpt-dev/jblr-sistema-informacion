const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openRegionalWithAssertion(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: 'ESTADO REGIONAL' }).click();
  await expect(page.locator('#regionalStatusView')).toBeVisible();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#regionalAssertionList .regional-assertion-card').count() === 0) {
    await page.getByRole('button', { name: 'Crear / reutilizar estado regional demo' }).click();
    await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
  }
}

test('MVP11 stale RegionalTaxonAssertion response cannot replace newer regional-status navigation', async ({ page }) => {
  await openRegionalWithAssertion(page);

  let releaseAssertion;
  const gate = new Promise((resolve) => { releaseAssertion = resolve; });
  let intercepted = false;

  await page.route('**/mvp11-api/regional-assertions/**', async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    await gate;
    await route.continue();
  });

  await page.locator('#regionalAssertionList .regional-assertion-card').first().click();
  await expect(page.locator('#regionalAssertionDetailView')).toBeVisible();
  await expect(page.locator('#regionalAssertionDetail')).toContainText('Cargando RegionalTaxonAssertion…');

  await page.locator('#backAssertionToRegionalBtn').click();
  await expect(page.locator('#regionalStatusView')).toBeVisible();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');

  releaseAssertion();
  await expect(page.locator('#regionalStatusView')).toBeVisible();
  await expect(page.locator('#regionalAssertionDetailView')).toBeHidden();
  await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
});
