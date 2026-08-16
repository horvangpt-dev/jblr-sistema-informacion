const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const LOCATION_NAME = 'JBLR STAGING · Localización demo MVP2';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';

async function openPlantago(page) {
  await page.goto(baseURL);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
}

function detailLocation(page) {
  return page.locator('#populationDetail .location-card strong').filter({ hasText: LOCATION_NAME });
}

test.describe.serial('MVP_PRODUCTIVO_2 population workflow', () => {
  test('creates or reuses one STAGING location/population, links them and persists an edit', async ({ page }) => {
    await openPlantago(page);
    const initialPopulationCount = Number(await page.getByRole('button', { name: /^Poblaciones:/ }).locator('strong').textContent());

    await page.getByRole('button', { name: /^Poblaciones:/ }).click();
    await expect(page.getByText('La población y su localización se mantienen como entidades distintas.')).toBeVisible();

    let existing = page.getByText(POPULATION_EDITED, { exact: true });
    if (!(await existing.count())) existing = page.getByText(POPULATION_BASE, { exact: true });

    if (!(await existing.count())) {
      await page.getByRole('button', { name: 'Nueva población' }).click();
      const options = await page.locator('#populationLocationId option').allTextContents();
      if (!options.includes(LOCATION_NAME)) {
        await page.getByRole('button', { name: 'Crear localización nueva' }).click();
        await page.getByLabel('Nombre de localización').fill(LOCATION_NAME);
        await page.getByLabel('Localidad literal').fill('Sitio sintético STAGING sin coordenadas reales');
        await page.getByLabel('Tipo de localización').fill('staging_demo');
        await page.locator('#locationNotes').fill('Dato de demostración no sensible');
        await page.getByRole('button', { name: 'Guardar localización' }).click();
        await expect(page.getByRole('heading', { name: 'Nueva población' })).toBeVisible();
      } else {
        await page.locator('#populationLocationId').selectOption({ label: LOCATION_NAME });
      }
      await page.getByLabel('Etiqueta de población').first().fill(POPULATION_BASE);
      if ((await page.locator('#populationLocationId').inputValue()) === '') {
        await page.locator('#populationLocationId').selectOption({ label: LOCATION_NAME });
      }
      await page.locator('#populationNotes').fill('Dato de demostración no sensible');
      await page.getByRole('button', { name: 'Crear población' }).click();
      await expect(page.getByText(POPULATION_BASE, { exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: '← Volver al taxón' }).click();
    const afterPopulationCount = Number(await page.getByRole('button', { name: /^Poblaciones:/ }).locator('strong').textContent());
    expect(afterPopulationCount).toBeGreaterThanOrEqual(initialPopulationCount);
    expect(afterPopulationCount).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Poblaciones:/ }).click();
    const populationCard = (await page.getByText(POPULATION_EDITED, { exact: true }).count())
      ? page.getByText(POPULATION_EDITED, { exact: true })
      : page.getByText(POPULATION_BASE, { exact: true });
    await populationCard.click();

    await expect(page.getByRole('heading', { name: 'POBLACIÓN' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'LOCALIZACIÓN' })).toBeVisible();
    await expect(detailLocation(page)).toBeVisible();
    await expect(page.getByText('Identification ≠ validación taxonómica')).toBeVisible();

    await page.getByRole('button', { name: 'Editar población' }).click();
    await page.locator('#populationEditLabel').fill(POPULATION_EDITED);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { name: POPULATION_EDITED })).toBeVisible();

    await page.reload();
    await openPlantago(page);
    await page.getByRole('button', { name: /^Poblaciones:/ }).click();
    await expect(page.getByText(POPULATION_EDITED, { exact: true })).toBeVisible();
    await page.getByText(POPULATION_EDITED, { exact: true }).click();
    await expect(detailLocation(page)).toBeVisible();

    await page.screenshot({ path: 'evidence/mvp2-populations-desktop.png', fullPage: true });
  });

  test.describe('mobile population UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('population and location views fit the mobile viewport', async ({ page }) => {
      await openPlantago(page);
      await page.getByRole('button', { name: /^Poblaciones:/ }).click();
      await expect(page.getByText(POPULATION_EDITED, { exact: true })).toBeVisible();
      await page.getByText(POPULATION_EDITED, { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'LOCALIZACIÓN' })).toBeVisible();
      await expect(detailLocation(page)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp2-populations-mobile.png', fullPage: true });
    });
  });
});
