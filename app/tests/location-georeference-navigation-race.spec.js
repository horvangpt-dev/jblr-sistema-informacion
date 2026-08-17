const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';

async function openGeoreference(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: /^Poblaciones:/ }).click();
  await expect(page.locator('#populationsStatus')).not.toHaveText('Cargando…');
  const edited = page.getByText(POPULATION_EDITED, { exact: true });
  const target = (await edited.count()) ? edited : page.getByText(POPULATION_BASE, { exact: true });
  await target.click();
  await page.getByRole('button', { name: 'GEORREFERENCIACIÓN' }).click();
  await expect(page.locator('#georeferenceMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#locationGeometryVersionList .location-geometry-version-card').count() === 0) {
    await page.getByRole('button', { name: 'CREAR GEOMETRÍA DEMO' }).click();
    await expect(page.locator('#locationGeometryVersionList .location-geometry-version-card')).toHaveCount(1);
  }
}

test('MVP14 stale LocationGeometryVersion response cannot replace newer georeference navigation', async ({ page }) => {
  await openGeoreference(page);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted = false;
  await page.route('**/mvp14-api/location-geometry-versions/**', async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    await gate;
    await route.continue();
  });

  await page.locator('#locationGeometryVersionList .location-geometry-version-card').first().click();
  await expect(page.locator('#locationGeometryVersionDetailView')).toBeVisible();
  await expect(page.locator('#locationGeometryVersionDetail')).toContainText('Cargando LocationGeometryVersion…');

  await page.getByRole('button', { name: '← Volver a georreferenciación' }).click();
  await expect(page.locator('#locationGeoreferenceView')).toBeVisible();
  await expect(page.locator('#georeferenceMessage')).not.toHaveText('Cargando…');

  release();
  await expect(page.locator('#locationGeoreferenceView')).toBeVisible();
  await expect(page.locator('#locationGeometryVersionDetailView')).toBeHidden();
  await expect(page.locator('#locationGeometryVersionList .location-geometry-version-card')).toHaveCount(1);
});
