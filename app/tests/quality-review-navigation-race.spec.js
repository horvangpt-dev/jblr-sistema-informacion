const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openQualityWithAssessment(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: 'ESTADO REGIONAL' }).click();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#regionalAssertionList .regional-assertion-card').count() === 0) {
    await page.getByRole('button', { name: 'Crear / reutilizar estado regional demo' }).click();
    await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
  }
  await page.locator('#regionalAssertionList .regional-assertion-card').click();
  await expect(page.getByRole('button', { name: 'CALIDAD' })).toBeVisible();
  await page.getByRole('button', { name: 'CALIDAD' }).click();
  await expect(page.locator('#qualityMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#qualityAssessmentList .quality-assessment-card').count() === 0) {
    await page.getByRole('button', { name: 'Crear / reutilizar revisión demo' }).click();
    await expect(page.locator('#qualityAssessmentList .quality-assessment-card')).toHaveCount(1);
  }
}

test('MVP12 stale QualityAssessment response cannot replace newer quality navigation', async ({ page }) => {
  await openQualityWithAssessment(page);

  let releaseAssessment;
  const gate = new Promise((resolve) => { releaseAssessment = resolve; });
  let intercepted = false;

  await page.route('**/mvp12-api/quality-assessments/**', async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    await gate;
    await route.continue();
  });

  await page.locator('#qualityAssessmentList .quality-assessment-card').first().click();
  await expect(page.locator('#qualityAssessmentDetailView')).toBeVisible();
  await expect(page.locator('#qualityAssessmentDetail')).toContainText('Cargando QualityAssessment…');

  await page.locator('#backQualityDetailBtn').click();
  await expect(page.locator('#qualityOverviewView')).toBeVisible();
  await expect(page.locator('#qualityMessage')).not.toHaveText('Cargando…');

  releaseAssessment();
  await expect(page.locator('#qualityOverviewView')).toBeVisible();
  await expect(page.locator('#qualityAssessmentDetailView')).toBeHidden();
  await expect(page.locator('#qualityAssessmentList .quality-assessment-card')).toHaveCount(1);
});
