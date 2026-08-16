const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const LOCATION_NAME = 'JBLR STAGING · Localización demo MVP2';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';
const PROSPECTION_BASE = 'JBLR STAGING · Prospección demo MVP3';
const PROSPECTION_EDITED = 'JBLR STAGING · Prospección demo MVP3 · editada';
const VISIT_BASE = 'JBLR STAGING · Visita demo MVP3';
const VISIT_EDITED = 'JBLR STAGING · Visita demo MVP3 · editada';

async function openPlantago(page) {
  await page.goto(baseURL);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
}

async function openDemoPopulation(page) {
  await openPlantago(page);
  await page.getByRole('button', { name: /^Poblaciones:/ }).click();
  await expect(page.locator('#populationsStatus')).not.toHaveText('Cargando…');
  let population = page.getByText(POPULATION_EDITED, { exact: true });
  if (!(await population.count())) population = page.getByText(POPULATION_BASE, { exact: true });
  await expect(population).toBeVisible();
  await population.click();
  await expect(page.getByRole('heading', { name: 'POBLACIÓN' })).toBeVisible();
}

async function openFieldActivity(page) {
  await page.getByRole('button', { name: 'Prospecciones / visitas' }).click();
  await expect(page.getByText('Prospection y FieldVisit se mantienen como entidades distintas. El taxón se deriva de la Identification existente de la población.')).toBeVisible();
  await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
}

async function currentProspectionLabel(page) {
  if (await page.getByText(PROSPECTION_EDITED, { exact: true }).count()) return PROSPECTION_EDITED;
  if (await page.getByText(PROSPECTION_BASE, { exact: true }).count()) return PROSPECTION_BASE;
  return null;
}

async function currentVisitLabel(page) {
  if (await page.getByText(VISIT_EDITED, { exact: true }).count()) return VISIT_EDITED;
  if (await page.getByText(VISIT_BASE, { exact: true }).count()) return VISIT_BASE;
  return null;
}

test.describe.serial('MVP_PRODUCTIVO_3 field activity workflow', () => {
  test('creates or reuses one prospection and field visit, links canonical entities, edits and persists', async ({ page }) => {
    await openDemoPopulation(page);
    await openFieldActivity(page);

    let prospectionLabel = await currentProspectionLabel(page);
    if (!prospectionLabel) {
      await page.getByRole('button', { name: 'Nueva prospección' }).click();
      await page.locator('#prospectionPurpose').fill(PROSPECTION_BASE);
      await page.locator('#prospectionNotes').fill('Dato sintético MVP3 sin información sensible');
      await page.getByRole('button', { name: 'Crear prospección' }).click();
      await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
      await expect(page.getByText(PROSPECTION_BASE, { exact: true })).toBeVisible();
      prospectionLabel = PROSPECTION_BASE;
    }

    let visitLabel = await currentVisitLabel(page);
    if (!visitLabel) {
      await page.getByRole('button', { name: 'Nueva visita' }).click();
      await page.locator('#fieldVisitProspectionId').selectOption({ label: prospectionLabel });
      await page.locator('#fieldVisitLocationId').selectOption({ label: LOCATION_NAME });
      await page.locator('#fieldVisitPurpose').fill(VISIT_BASE);
      await page.locator('#fieldVisitNotes').fill('Dato sintético MVP3 sin información sensible');
      await page.getByRole('button', { name: 'Crear visita' }).click();
      await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
      await expect(page.getByText(VISIT_BASE, { exact: true })).toBeVisible();
      visitLabel = VISIT_BASE;
    }

    await page.getByText(visitLabel, { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'VISITA DE CAMPO' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'PROSPECCIÓN' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'LOCALIZACIÓN' })).toBeVisible();
    await expect(page.getByText(LOCATION_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
    await expect(page.getByText(/la visita no crea validación taxonómica/i)).toBeVisible();

    await page.getByRole('button', { name: 'Editar visita' }).click();
    await page.locator('#fieldVisitEditPurpose').fill(VISIT_EDITED);
    await page.locator('#fieldVisitEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('#fieldVisitDetail h1')).toHaveText(VISIT_EDITED);

    await page.getByRole('button', { name: 'Abrir prospección' }).click();
    await expect(page.locator('#prospectionDetail h1')).toContainText(/Prospección demo MVP3/);
    await page.getByRole('button', { name: 'Editar prospección' }).click();
    await page.locator('#prospectionEditPurpose').fill(PROSPECTION_EDITED);
    await page.locator('#prospectionEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('#prospectionDetail h1')).toHaveText(PROSPECTION_EDITED);

    await page.reload();
    await openDemoPopulation(page);
    await openFieldActivity(page);
    await expect(page.getByText(PROSPECTION_EDITED, { exact: true })).toBeVisible();
    await expect(page.getByText(VISIT_EDITED, { exact: true })).toBeVisible();
    await page.getByText(VISIT_EDITED, { exact: true }).click();
    await expect(page.getByText(PROSPECTION_EDITED, { exact: true })).toBeVisible();
    await expect(page.getByText(LOCATION_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'evidence/mvp3-field-activity-desktop.png', fullPage: true });
  });

  test.describe('mobile field activity UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('field activity navigation, entity separation and edit form fit mobile viewport', async ({ page }) => {
      await openDemoPopulation(page);
      await openFieldActivity(page);
      await expect(page.getByRole('button', { name: 'Nueva prospección' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nueva visita' })).toBeVisible();
      await expect(page.getByText(VISIT_EDITED, { exact: true })).toBeVisible();
      await page.getByText(VISIT_EDITED, { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'VISITA DE CAMPO' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'PROSPECCIÓN' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'LOCALIZACIÓN' })).toBeVisible();
      await page.getByRole('button', { name: 'Editar visita' }).click();
      await expect(page.locator('#fieldVisitEditPurpose')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.locator('#fieldVisitEditDialog').getByRole('button', { name: 'Cancelar' }).click();
      await page.screenshot({ path: 'evidence/mvp3-field-activity-mobile.png', fullPage: true });
    });
  });
});
