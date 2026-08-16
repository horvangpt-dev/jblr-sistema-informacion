const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';
const VISIT_BASE = 'JBLR STAGING · Visita demo MVP3';
const VISIT_EDITED = 'JBLR STAGING · Visita demo MVP3 · editada';
const COLLECTION_BASE = 'JBLR STAGING · Recolección demo MVP4';
const COLLECTION_EDITED = 'JBLR STAGING · Recolección demo MVP4 · editada';
const SAMPLE_NOTE = 'JBLR STAGING · Muestra demo MVP4';
const SAMPLE_NOTE_EDITED = 'JBLR STAGING · Muestra demo MVP4 · editada';
const ACCESSION_NOTE = 'JBLR STAGING · Accesión demo MVP4';
const ACCESSION_NOTE_EDITED = 'JBLR STAGING · Accesión demo MVP4 · editada';

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
  const list = page.locator('#populationList');
  let population = list.getByText(POPULATION_EDITED, { exact: true });
  if (!(await population.count())) population = list.getByText(POPULATION_BASE, { exact: true });
  await expect(population).toBeVisible();
  await population.click();
  await expect(page.getByRole('heading', { name: 'POBLACIÓN' })).toBeVisible();
}

async function openDemoVisit(page) {
  await openDemoPopulation(page);
  await page.getByRole('button', { name: 'Prospecciones / visitas' }).click();
  await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
  const list = page.locator('#fieldVisitList');
  let visit = list.getByText(VISIT_EDITED, { exact: true });
  if (!(await visit.count())) visit = list.getByText(VISIT_BASE, { exact: true });
  await expect(visit).toBeVisible();
  await visit.click();
  await expect(page.locator('#fieldVisitDetail').getByRole('heading', { name: 'VISITA DE CAMPO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recolección / material' })).toBeVisible();
}

async function openMaterial(page) {
  await page.getByRole('button', { name: 'Recolección / material' }).click();
  await expect(page.locator('#materialFlowStatus')).not.toHaveText('Cargando…');
  await expect(page.getByText('CollectionEvent, Sample y Accession son entidades distintas. La trazabilidad científica deriva de la Population y su Identification existente.')).toBeVisible();
}

async function openOnlyCollection(page) {
  const card = page.locator('#collectionEventList .collection-card').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('#collectionEventDetail').getByText('RECOLECCIÓN', { exact: true }).first()).toBeVisible();
}

async function openOnlySample(page) {
  const card = page.locator('#collectionEventDetail .sample-card').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('#sampleDetail').getByText('MUESTRA', { exact: true }).first()).toBeVisible();
}

async function openOnlyAccession(page) {
  const card = page.locator('#sampleDetail .accession-card').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('#accessionDetail').getByText('ACCESIÓN', { exact: true }).first()).toBeVisible();
}

test.describe.serial('MVP_PRODUCTIVO_4 material flow', () => {
  test('creates or reuses CollectionEvent, Sample and Accession, edits and persists canonical links', async ({ page }) => {
    await openDemoVisit(page);
    await openMaterial(page);

    if (!(await page.locator('#collectionEventList .collection-card').count())) {
      await page.getByRole('button', { name: 'Nueva recolección' }).click();
      await page.locator('#collectionMethod').fill(COLLECTION_BASE);
      await page.locator('#collectionAt').fill('2026-08-16T12:00');
      await page.locator('#collectionPermit').fill('STAGING-DEMO-NO-PERMIT');
      await page.locator('#collectionNotes').fill('Dato sintético MVP4 sin información sensible');
      await page.locator('#collectionEventDialog').getByRole('button', { name: 'Crear recolección' }).click();
      await expect(page.locator('#collectionEventDialog')).not.toBeVisible();
      await expect(page.locator('#collectionEventList .collection-card')).toHaveCount(1);
    }
    await expect(page.locator('#collectionEventList .collection-card')).toHaveCount(1);
    await openOnlyCollection(page);
    await expect(page.locator('#collectionEventDetail').getByText('Plantago major L.', { exact: true })).toBeVisible();
    await expect(page.locator('#collectionEventDetail')).toContainText('Visita demo MVP3');

    if (!(await page.locator('#collectionEventDetail .sample-card').count())) {
      await page.getByRole('button', { name: 'Crear muestra' }).click();
      await page.locator('#sampleKind').fill('seed_demo');
      await page.locator('#sampleQuantity').fill('');
      await page.locator('#sampleUnit').fill('');
      await page.locator('#sampleState').fill('field_demo_unvalidated');
      await page.locator('#sampleNotes').fill(SAMPLE_NOTE);
      await page.locator('#sampleDialog').getByRole('button', { name: 'Crear muestra' }).click();
      await expect(page.locator('#sampleDialog')).not.toBeVisible();
      await expect(page.locator('#collectionEventDetail .sample-card')).toHaveCount(1);
    }
    await expect(page.locator('#collectionEventDetail .sample-card')).toHaveCount(1);
    await openOnlySample(page);
    await expect(page.locator('#sampleDetail')).toContainText('Cantidad: desconocida / no registrada');
    await expect(page.locator('#sampleDetail')).toContainText('SampleOrigin mantiene la procedencia');
    await expect(page.locator('#sampleDetail').getByText('Plantago major L.', { exact: true })).toBeVisible();

    if (!(await page.locator('#sampleDetail .accession-card').count())) {
      await page.getByRole('button', { name: 'Crear accesión' }).click();
      await page.locator('#accessionDate').fill('2026-08-16');
      await page.locator('#accessionStatus').fill('staging_demo_unvalidated');
      await page.locator('#accessionNotes').fill(ACCESSION_NOTE);
      await page.locator('#accessionDialog').getByRole('button', { name: 'Crear accesión' }).click();
      await expect(page.locator('#accessionDialog')).not.toBeVisible();
      await expect(page.locator('#sampleDetail .accession-card')).toHaveCount(1);
    }
    await expect(page.locator('#sampleDetail .accession-card')).toHaveCount(1);
    await openOnlyAccession(page);
    await expect(page.locator('#accessionDetail')).toContainText('Accession representa la entrada/gestión institucional');
    await expect(page.locator('#accessionDetail')).toContainText('seed_demo');

    await page.getByRole('button', { name: 'Editar accesión' }).click();
    await page.locator('#accessionEditStatusValue').fill('staging_demo_unvalidated_edited');
    await page.locator('#accessionEditNotes').fill(ACCESSION_NOTE_EDITED);
    await page.locator('#accessionEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('#accessionEditDialog')).not.toBeVisible();
    await expect(page.locator('#accessionDetail')).toContainText('staging_demo_unvalidated_edited');

    await page.locator('#backToSampleBtn').click();
    await page.getByRole('button', { name: 'Editar muestra' }).click();
    await page.locator('#sampleEditState').fill('field_demo_unvalidated_edited');
    await page.locator('#sampleEditNotes').fill(SAMPLE_NOTE_EDITED);
    await page.locator('#sampleEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('#sampleEditDialog')).not.toBeVisible();
    await expect(page.locator('#sampleDetail')).toContainText('field_demo_unvalidated_edited');

    await page.locator('#backToCollectionEventBtn').click();
    await page.getByRole('button', { name: 'Editar recolección' }).click();
    await page.locator('#collectionEditMethod').fill(COLLECTION_EDITED);
    await page.locator('#collectionEditPermit').fill('STAGING-DEMO-NO-PERMIT');
    await page.locator('#collectionEditNotes').fill('JBLR STAGING · Recolección MVP4 · editada');
    await page.locator('#collectionEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('#collectionEditDialog')).not.toBeVisible();
    await expect(page.locator('#collectionEventDetail h1')).toHaveText(COLLECTION_EDITED);

    await page.reload();
    await openDemoVisit(page);
    await openMaterial(page);
    await expect(page.locator('#collectionEventList .collection-card')).toHaveCount(1);
    await expect(page.locator('#collectionEventList')).toContainText(COLLECTION_EDITED);
    await openOnlyCollection(page);
    await expect(page.locator('#collectionEventDetail .sample-card')).toHaveCount(1);
    await expect(page.locator('#collectionEventDetail')).toContainText('field_demo_unvalidated_edited');
    await openOnlySample(page);
    await expect(page.locator('#sampleDetail .accession-card')).toHaveCount(1);
    await expect(page.locator('#sampleDetail')).toContainText('staging_demo_unvalidated_edited');
    await openOnlyAccession(page);
    await expect(page.locator('#accessionDetail').getByText('Plantago major L.', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'evidence/mvp4-material-flow-desktop.png', fullPage: true });
  });

  test.describe('mobile material flow UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('FieldVisit to collection, sample and accession is usable without horizontal overflow', async ({ page }) => {
      await openDemoVisit(page);
      await openMaterial(page);
      await openOnlyCollection(page);
      await expect(page.locator('#collectionEventDetail').getByText('RECOLECCIÓN', { exact: true }).first()).toBeVisible();
      await openOnlySample(page);
      await expect(page.locator('#sampleDetail').getByText('MUESTRA', { exact: true }).first()).toBeVisible();
      await openOnlyAccession(page);
      await expect(page.locator('#accessionDetail').getByText('ACCESIÓN', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Editar accesión' }).click();
      await expect(page.locator('#accessionEditStatusValue')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.locator('#cancelAccessionEditBtn').click();
      await page.screenshot({ path: 'evidence/mvp4-material-flow-mobile.png', fullPage: true });
    });
  });
});
