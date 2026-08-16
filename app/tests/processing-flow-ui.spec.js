const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const POPULATION_BASE = 'JBLR STAGING · Población demo MVP2';
const POPULATION_EDITED = 'JBLR STAGING · Población demo MVP2 · editada';
const VISIT_BASE = 'JBLR STAGING · Visita demo MVP3';
const VISIT_EDITED = 'JBLR STAGING · Visita demo MVP3 · editada';

async function openInputSample(page) {
  await page.goto(baseURL);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: /^Poblaciones:/ }).click();
  await expect(page.locator('#populationsStatus')).not.toHaveText('Cargando…');
  const populations = page.locator('#populationList');
  let population = populations.getByText(POPULATION_EDITED, { exact: true });
  if (!(await population.count())) population = populations.getByText(POPULATION_BASE, { exact: true });
  await population.click();
  await page.getByRole('button', { name: 'Prospecciones / visitas' }).click();
  await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
  const visits = page.locator('#fieldVisitList');
  let visit = visits.getByText(VISIT_EDITED, { exact: true });
  if (!(await visit.count())) visit = visits.getByText(VISIT_BASE, { exact: true });
  await visit.click();
  await page.getByRole('button', { name: 'Recolección / material' }).click();
  await expect(page.locator('#materialFlowStatus')).not.toHaveText('Cargando…');
  await page.locator('#collectionEventList .collection-card').first().click();
  await page.locator('#collectionEventDetail .sample-card').first().click();
  await expect(page.locator('#sampleDetail').getByText('MUESTRA', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'PROCESADO' })).toBeVisible();
}

async function openProcessingList(page) {
  await page.getByRole('button', { name: 'PROCESADO' }).click();
  await expect(page.locator('#sampleProcessingStatus')).not.toHaveText('Cargando…');
}

async function openOnlyProcess(page) {
  const process = page.locator('#processingList .processing-card').first();
  await expect(process).toBeVisible();
  await process.click();
  await expect(page.locator('#processingEventDetail').getByText('PROCESO', { exact: true }).first()).toBeVisible();
}

test.describe.serial('MVP_PRODUCTIVO_5 processing traceability', () => {
  test('creates or reuses processing, preserves input, opens output, edits and persists', async ({ page }) => {
    await openInputSample(page);
    await openProcessingList(page);

    if (!(await page.locator('#processingList .processing-card').count())) {
      await page.getByRole('button', { name: 'Crear / reutilizar proceso' }).click();
      await page.locator('#processingType').fill('cleaning_demo');
      await page.locator('#processingStartedAt').fill('2026-08-16T13:00');
      await page.locator('#processingEndedAt').fill('2026-08-16T13:30');
      await page.locator('#processingNotes').fill('JBLR STAGING · Proceso demo MVP5');
      await page.locator('#processingDialog').getByRole('button', { name: 'Crear / reutilizar' }).click();
      await expect(page.locator('#processingDialog')).not.toBeVisible();
    } else {
      await openOnlyProcess(page);
    }

    await expect(page.locator('#processingEventDetail .process-input-card')).toHaveCount(1);
    await expect(page.locator('#processingEventDetail .process-output-card')).toHaveCount(1);
    await expect(page.locator('#processingEventDetail')).toContainText('TRAZABILIDAD INPUT → PROCESO → OUTPUT');
    await expect(page.locator('#processingEventDetail .process-input-card')).toContainText('JBLR-SMP-00000018');
    await expect(page.locator('#processingEventDetail')).toContainText('Cantidad: desconocida / no registrada');

    const inputText = await page.locator('.process-input-card h3').innerText();
    const outputText = await page.locator('.process-output-card h3').innerText();
    expect(outputText).not.toBe(inputText);

    if ((await page.locator('#processingEventDetail h1').innerText()) !== 'cleaning_demo_edited') {
      await page.getByRole('button', { name: 'Editar proceso' }).click();
      await page.locator('#processingEditType').fill('cleaning_demo_edited');
      await page.locator('#processingEditNotes').fill('JBLR STAGING · Proceso demo MVP5 · editado');
      await page.locator('#processingEditDialog').getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.locator('#processingEditDialog')).not.toBeVisible();
    }
    await expect(page.locator('#processingEventDetail h1')).toHaveText('cleaning_demo_edited');

    await page.locator('#processingEventDetail .process-output-card').click();
    await expect(page.locator('#processedSampleDetail')).toContainText('MUESTRA RESULTANTE');
    await expect(page.locator('#processedSampleDetail')).toContainText('Cantidad: desconocida / no registrada');
    await expect(page.locator('#processedSampleDetail')).toContainText('Sample nueva de OUTPUT; la Sample de entrada permanece inalterada.');
    await page.getByRole('button', { name: 'Volver al ProcessingEvent' }).click();
    await expect(page.locator('#processingEventDetail h1')).toHaveText('cleaning_demo_edited');

    await page.reload();
    await openInputSample(page);
    await openProcessingList(page);
    await expect(page.locator('#processingList .processing-card')).toHaveCount(1);
    await openOnlyProcess(page);
    await expect(page.locator('#processingEventDetail .process-input-card')).toHaveCount(1);
    await expect(page.locator('#processingEventDetail .process-output-card')).toHaveCount(1);
    await page.screenshot({ path: 'evidence/mvp5-processing-desktop.png', fullPage: true });
  });

  test.describe('mobile processing UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('input-process-output trace is usable without horizontal overflow', async ({ page }) => {
      await openInputSample(page);
      await openProcessingList(page);
      await openOnlyProcess(page);
      await page.locator('#processingEventDetail .process-output-card').click();
      await expect(page.locator('#processedSampleDetail')).toContainText('MUESTRA RESULTANTE');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.getByRole('button', { name: 'Volver al ProcessingEvent' }).click();
      await page.getByRole('button', { name: 'Editar proceso' }).click();
      await expect(page.locator('#processingEditType')).toBeVisible();
      await page.locator('#cancelProcessingEditBtn').click();
      await page.screenshot({ path: 'evidence/mvp5-processing-mobile.png', fullPage: true });
    });
  });
});
