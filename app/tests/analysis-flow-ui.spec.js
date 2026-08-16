const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';

async function openPlantago(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ANÁLISIS' })).toBeVisible();
}

async function openAnalyses(page) {
  await page.getByRole('button', { name: 'ANÁLISIS' }).click();
  await expect(page.locator('#taxonAnalysisView')).toBeVisible();
  await expect(page.locator('#analysisStatus')).not.toHaveText('Cargando…');
  await expect(page.locator('#taxonAnalysisView')).toContainText('resultado calculado ≠ validación científica');
}

async function createOrReuseAnalysis(page) {
  await page.getByRole('button', { name: 'Crear / reutilizar análisis sintético' }).click();
  await expect(page.locator('#analysisStatus')).not.toContainText('Creando / reutilizando');
  await expect(page.locator('#analysisMetricBlock')).toContainText('staging_demo_score');
  await expect(page.locator('#analysisMetricBlock')).toContainText('Target: TXC');
  await expect(page.locator('#analysisMetricBlock')).toContainText('SIN VALOR CIENTÍFICO');
  await expect(page.locator('#analysisSnapshotBlock')).toContainText(SNAPSHOT_ID);
  await expect(page.locator('#analysisSnapshotBlock')).toContainText(SNAPSHOT_HASH);
  await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
}

test.describe.serial('MVP_PRODUCTIVO_10 traceable analyses', () => {
  test('creates/reuses metric, activity, run, input and result while preserving scientific separation', async ({ page }) => {
    await openPlantago(page);
    await openAnalyses(page);
    await createOrReuseAnalysis(page);

    const runCard = page.locator('#analysisRunList .analysis-run-card').first();
    await expect(runCard).toContainText('staging_demo_analysis');
    await expect(runCard).toContainText('mvp10.v1');
    await expect(runCard).toContainText('7.5');
    await runCard.click();

    await expect(page.locator('#analysisRunDetailView')).toBeVisible();
    await expect(page.locator('#analysisRunDetail')).toContainText('ACTIVIDAD');
    await expect(page.locator('#analysisRunDetail')).toContainText('JBLR STAGING');
    await expect(page.locator('#analysisRunDetail')).toContainText('synthetic_demo_completed');
    await expect(page.locator('#analysisRunDetail')).toContainText('EJECUCIÓN');
    await expect(page.locator('#analysisRunDetail')).toContainText('closed');
    await expect(page.locator('#analysisRunDetail')).toContainText('release_label: NULL');
    await expect(page.locator('#analysisRunDetail .analysis-input-card')).toHaveCount(1);
    await expect(page.locator('#analysisRunDetail .analysis-result-card')).toHaveCount(1);

    await page.locator('#analysisRunDetail .analysis-input-card').click();
    await expect(page.locator('#analysisInputDetailView')).toBeVisible();
    await expect(page.locator('#analysisInputDetail')).toContainText('source_snapshot');
    await expect(page.locator('#analysisInputDetail')).toContainText('ordinal 1');
    await expect(page.locator('#analysisInputDetail')).toContainText(SNAPSHOT_ID);
    await expect(page.locator('#analysisInputDetail')).toContainText(SNAPSHOT_HASH);
    await expect(page.locator('#analysisInputDetail')).toContainText('RAW PAYLOAD');
    await expect(page.locator('#analysisInputDetail')).toContainText('NORMALIZED PAYLOAD');
    await expect(page.locator('#analysisInputDetail')).toContainText('STAGING / DEMO / NO VALIDADO');

    await page.locator('#backInputToRunBtn').click();
    await expect(page.locator('#analysisRunDetailView')).toBeVisible();
    await expect(page.locator('#analysisRunDetail .analysis-result-card')).toHaveCount(1);
    await page.locator('#analysisRunDetail .analysis-result-card').click();

    await expect(page.locator('#analysisResultDetailView')).toBeVisible();
    await expect(page.locator('#analysisResultDetail')).toContainText('value_status');
    await expect(page.locator('#analysisResultDetail')).toContainText('present');
    await expect(page.locator('#analysisResultDetail .analysis-value')).toHaveText('numeric_value: 7.5');
    await expect(page.locator('#analysisResultDetail')).toContainText('text_value: NULL');
    await expect(page.locator('#analysisResultDetail')).toContainText('boolean_value: NULL');
    await expect(page.locator('#analysisResultDetail')).toContainText('json_value: NULL');
    await expect(page.locator('#analysisResultDetail')).toContainText('unit_code: NULL');
    await expect(page.locator('#analysisResultDetail')).toContainText('staging_demo_score');
    await expect(page.locator('#analysisResultDetail')).toContainText('Plantago major L.');
    await expect(page.locator('#analysisResultDetail')).toContainText('RESULTADO CALCULADO ≠ VALIDACIÓN CIENTÍFICA');
    await expect(page.locator('#analysisResultDetail')).toContainText('AnalysisResult ≠ Assertion');

    await page.getByRole('button', { name: 'Volver al TaxonConcept' }).click();
    await expect(page.locator('#detailView')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();

    await page.reload();
    await openPlantago(page);
    await openAnalyses(page);
    await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
    await createOrReuseAnalysis(page);
    await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
    await page.screenshot({ path: 'evidence/mvp10-analysis-desktop.png', fullPage: true });
  });

  test.describe('mobile analysis UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('TaxonConcept to AnalysisRun to Input and Result remains usable without horizontal overflow', async ({ page }) => {
      await openPlantago(page);
      await openAnalyses(page);
      await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
      await page.locator('#analysisRunList .analysis-run-card').click();
      await expect(page.locator('#analysisRunDetailView')).toBeVisible();
      await expect(page.locator('#analysisRunDetail')).toContainText('ACTIVIDAD');
      await expect(page.locator('#analysisRunDetail')).toContainText('EJECUCIÓN');

      await page.locator('#analysisRunDetail .analysis-input-card').click();
      await expect(page.locator('#analysisInputDetail')).toContainText('ExternalRecordSnapshot');
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      await page.locator('#backInputToRunBtn').click();
      await expect(page.locator('#analysisRunDetailView')).toBeVisible();
      await page.locator('#analysisRunDetail .analysis-result-card').click();
      await expect(page.locator('#analysisResultDetail')).toContainText('numeric_value: 7.5');
      await expect(page.locator('#analysisResultDetail')).toContainText('SIN SIGNIFICADO CIENTÍFICO');
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp10-analysis-mobile.png', fullPage: true });
    });
  });
});
