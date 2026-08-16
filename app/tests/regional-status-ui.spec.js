const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openPlantago(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ESTADO REGIONAL' })).toBeVisible();
}

async function openRegional(page) {
  await page.getByRole('button', { name: 'ESTADO REGIONAL' }).click();
  await expect(page.locator('#regionalStatusView')).toBeVisible();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');
}

async function createOrReuse(page) {
  await page.getByRole('button', { name: 'Crear / reutilizar estado regional demo' }).click();
  await expect(page.locator('#regionalStatusMessage')).not.toContainText('Creando / reutilizando');
  await expect(page.locator('#regionalAreaBlock .regional-area-card')).toHaveCount(1);
  await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
}

test.describe.serial('MVP_PRODUCTIVO_11 regional taxon status', () => {
  test('creates or reuses La Rioja and a safe unknown RegionalTaxonAssertion', async ({ page }) => {
    await openPlantago(page);
    await openRegional(page);
    await createOrReuse(page);

    const areaCard = page.locator('#regionalAreaBlock .regional-area-card');
    await expect(areaCard).toContainText('La Rioja');
    await expect(areaCard).toContainText('GeographicArea ≠ Location');
    await areaCard.click();
    await expect(page.locator('#geographicAreaDetailView')).toBeVisible();
    await expect(page.locator('#geographicAreaDetail')).toContainText('La Rioja');
    await expect(page.locator('#geographicAreaDetail')).toContainText('GeographicArea ≠ Location');

    await page.locator('#backAreaToRegionalBtn').click();
    await expect(page.locator('#regionalStatusView')).toBeVisible();
    const assertionCard = page.locator('#regionalAssertionList .regional-assertion-card');
    await expect(assertionCard).toHaveCount(1);
    await assertionCard.click();

    await expect(page.locator('#regionalAssertionDetailView')).toBeVisible();
    await expect(page.locator('#regionalAssertionDetail')).toContainText('RegionalTaxonAssertion ≠ Observation');
    await expect(page.locator('#regionalAssertionDetail .presence-status')).toContainText('value_status: unknown');
    await expect(page.locator('#regionalAssertionDetail .presence-status')).toContainText('term_key: NULL');
    await expect(page.locator('#regionalAssertionDetail .presence-status')).toContainText('DESCONOCIDO ≠ AUSENCIA');
    await expect(page.locator('#regionalAssertionDetail')).toContainText('value_status: not_recorded');
    await expect(page.locator('#regionalAssertionDetail')).toContainText('NO REGISTRADO ≠ AUSENCIA');
    await expect(page.locator('#regionalAssertionDetail')).toContainText('source_resource_id: NULL');
    await expect(page.locator('#regionalAssertionDetail')).toContainText('Sin fuente: no se inventa Reference, Snapshot ni Asset.');
    await expect(page.locator('#regionalAssertionDetail')).toContainText('TaxonConcept validation_status: unreviewed');

    await page.locator('#editRegionalAssertionBtn').click();
    await expect(page.locator('#regionalAssertionEditDialog')).toBeVisible();
    await page.locator('#regionalAssertionNote').fill('Nota editorial MVP11 persistida');
    await page.locator('#regionalAssertionEditForm').getByRole('button', { name: 'Guardar nota' }).click();
    await expect(page.locator('#regionalAssertionEditDialog')).toBeHidden();
    await expect(page.locator('#regionalAssertionDetail .regional-note')).toHaveText('Nota editorial MVP11 persistida');

    await page.locator('#backAssertionToRegionalBtn').click();
    await expect(page.locator('#regionalStatusView')).toBeVisible();
    await createOrReuse(page);
    await expect(page.locator('#regionalAreaBlock .regional-area-card')).toHaveCount(1);
    await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
    await page.screenshot({ path: 'evidence/mvp11-regional-status-desktop.png', fullPage: true });
  });

  test.describe('mobile regional status UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('TaxonConcept to GeographicArea and RegionalTaxonAssertion remains usable without horizontal overflow', async ({ page }) => {
      await openPlantago(page);
      await openRegional(page);
      await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);

      await page.locator('#regionalAreaBlock .regional-area-card').click();
      await expect(page.locator('#geographicAreaDetailView')).toBeVisible();
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      await page.locator('#backAreaToRegionalBtn').click();
      await page.locator('#regionalAssertionList .regional-assertion-card').click();
      await expect(page.locator('#regionalAssertionDetail .presence-status')).toContainText('unknown');
      await expect(page.locator('#regionalAssertionDetail .presence-status')).toContainText('NULL');
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp11-regional-status-mobile.png', fullPage: true });
    });
  });
});
