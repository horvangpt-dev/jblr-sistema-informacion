const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const LOCATION_NAME = 'JBLR STAGING · Localización demo MVP2';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';

async function openDemoLocation(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: /^Poblaciones:/ }).click();
  await expect(page.locator('#populationsStatus')).not.toHaveText('Cargando…');
  const edited = page.getByText(POPULATION_EDITED, { exact: true });
  const target = (await edited.count()) ? edited : page.getByText(POPULATION_BASE, { exact: true });
  await target.click();
  await expect(page.getByText(LOCATION_NAME, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GEORREFERENCIACIÓN' })).toBeVisible();
}

async function openGeoreference(page) {
  await openDemoLocation(page);
  await page.getByRole('button', { name: 'GEORREFERENCIACIÓN' }).click();
  await expect(page.locator('#georeferenceMessage')).not.toHaveText('Cargando…');
}

test.describe.serial('MVP_PRODUCTIVO_14 versioned location georeference', () => {
  test('creates/reuses one synthetic preferred geometry and exposes traceable detail', async ({ page }) => {
    await openGeoreference(page);
    await expect(page.getByText('Sitio sintético STAGING sin coordenadas reales', { exact: false })).toBeVisible();

    if (await page.locator('#locationGeometryVersionList .location-geometry-version-card').count() === 0) {
      await page.getByRole('button', { name: 'CREAR GEOMETRÍA DEMO' }).click();
      await expect(page.locator('#locationGeometryVersionList .location-geometry-version-card')).toHaveCount(1);
    }

    await expect(page.getByRole('button', { name: 'VERSIÓN DEMO YA CREADA' })).toBeDisabled();
    const card = page.locator('#locationGeometryVersionList .location-geometry-version-card').first();
    await expect(card).toContainText('Versión 1');
    await expect(card).toContainText('POINT');
    await expect(card).toContainText('SRID 4326');
    await expect(card).toContainText('interpreted');
    await expect(card).toContainText('PREFERIDA');
    await expect(card).toContainText('Longitud (X): 0');
    await expect(card).toContainText('Latitud (Y): 0');
    await expect(card).toContainText('Incertidumbre: NO REGISTRADO');

    await card.click();
    await expect(page.locator('#locationGeometryVersionDetail')).not.toContainText('Cargando LocationGeometryVersion…');
    const detail = page.locator('#locationGeometryVersionDetail');
    await expect(detail).toContainText('STAGING / DEMO / NO REAL LOCATION');
    await expect(detail).toContainText('Longitud (X, EPSG:4326): 0');
    await expect(detail).toContainText('Latitud (Y, EPSG:4326): 0');
    await expect(detail).toContainText('source_srid: 4326');
    await expect(detail).toContainText('interpreted');
    await expect(detail).toContainText('INCERTIDUMBRE');
    await expect(detail).toContainText('NO REGISTRADO');
    await expect(detail).toContainText('STAGING / DEMO / MVP14 SYNTHETIC GEOREFERENCE');
    await expect(detail).toContainText('PREFERIDA');
    await expect(detail).toContainText('STAGING / DEMO / NO REAL LOCATION / NO SCIENTIFIC MEANING');
    await expect(detail).toContainText('LocationGeometryVersion → Location');
    await expect(detail).toContainText('Location → PopulationLocation → Population');
    await expect(detail).toContainText('Geometría ≠ presencia del taxón');
    await expect(detail).toContainText('Preferred geometry ≠ scientifically validated geometry');
    await expect(detail).not.toContainText('GPS');

    await page.screenshot({ path: 'evidence/mvp14-location-georeference-desktop.png', fullPage: true });
  });

  test.describe('mobile georeference UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('location geometry remains usable without horizontal overflow', async ({ page }) => {
      await openGeoreference(page);
      const card = page.locator('#locationGeometryVersionList .location-geometry-version-card').first();
      await expect(card).toBeVisible();
      await card.click();
      await expect(page.locator('#locationGeometryVersionDetail')).not.toContainText('Cargando LocationGeometryVersion…');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp14-location-georeference-mobile.png', fullPage: true });
    });
  });
});
