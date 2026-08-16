const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openAnalysesWithRun(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: 'ANÁLISIS' }).click();
  await expect(page.locator('#taxonAnalysisView')).toBeVisible();
  await expect(page.locator('#analysisStatus')).not.toHaveText('Cargando…');
  if (await page.locator('#analysisRunList .analysis-run-card').count() === 0) {
    await page.getByRole('button', { name: 'Crear / reutilizar análisis sintético' }).click();
    await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
  }
}

test('MVP10 stale AnalysisRun response cannot replace a newer Analyses navigation', async ({ page }) => {
  await openAnalysesWithRun(page);

  let releaseRun;
  const gate = new Promise((resolve) => { releaseRun = resolve; });
  let intercepted = false;

  await page.route('**/mvp10-api/analysis-runs/**', async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    await gate;
    await route.continue();
  });

  await page.locator('#analysisRunList .analysis-run-card').first().click();
  await expect(page.locator('#analysisRunDetailView')).toBeVisible();
  await expect(page.locator('#analysisRunDetail')).toContainText('Cargando AnalysisRun…');

  await page.locator('#backRunToAnalysesBtn').click();
  await expect(page.locator('#taxonAnalysisView')).toBeVisible();
  await expect(page.locator('#analysisStatus')).not.toHaveText('Cargando…');

  releaseRun();
  await expect(page.locator('#taxonAnalysisView')).toBeVisible();
  await expect(page.locator('#analysisRunDetailView')).toBeHidden();
  await expect(page.locator('#analysisRunList .analysis-run-card')).toHaveCount(1);
});
