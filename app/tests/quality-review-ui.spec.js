const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openRegionalAssertion(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: 'ESTADO REGIONAL' }).click();
  await expect(page.locator('#regionalStatusView')).toBeVisible();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#regionalAssertionList .regional-assertion-card').count() === 0) {
    await page.getByRole('button', { name: 'Crear / reutilizar estado regional demo' }).click();
    await expect(page.locator('#regionalAssertionList .regional-assertion-card')).toHaveCount(1);
  }
  await page.locator('#regionalAssertionList .regional-assertion-card').click();
  await expect(page.locator('#regionalAssertionDetailView')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CALIDAD' })).toBeVisible();
}

async function openQuality(page) {
  await page.getByRole('button', { name: 'CALIDAD' }).click();
  await expect(page.locator('#qualityOverviewView')).toBeVisible();
  await expect(page.locator('#qualityMessage')).not.toHaveText('Cargando…');
}

async function createOrReuseQuality(page) {
  await page.getByRole('button', { name: 'Crear / reutilizar revisión demo' }).click();
  await expect(page.locator('#qualityMessage')).not.toContainText('Creando / reutilizando');
  await expect(page.locator('#qualityAssessmentList .quality-assessment-card')).toHaveCount(1);
}

test.describe.serial('MVP_PRODUCTIVO_12 traceable regional quality review', () => {
  test('creates or reuses one safe QualityAssessment without validation semantics', async ({ page }) => {
    await openRegionalAssertion(page);
    await openQuality(page);
    await createOrReuseQuality(page);

    await expect(page.locator('#qualityTargetBlock')).toContainText('RegionalTaxonAssertion');
    await expect(page.locator('#qualityTargetBlock')).toContainText('Plantago major L.');
    await expect(page.locator('#qualityTargetBlock')).toContainText('La Rioja');
    await expect(page.locator('#qualityTargetBlock')).toContainText('presence_value_status: unknown');
    await expect(page.locator('#qualityTargetBlock')).toContainText('DESCONOCIDO ≠ AUSENCIA');
    await expect(page.locator('#qualityTargetBlock')).toContainText(/validation_status: (unreviewed|pending_review)/);

    const card = page.locator('#qualityAssessmentList .quality-assessment-card');
    await expect(card).toContainText('STAGING / DEMO / MVP12 QUALITY REVIEW');
    await expect(card).toContainText('score: NULL');
    await card.click();

    await expect(page.locator('#qualityAssessmentDetailView')).toBeVisible();
    const detail = page.locator('#qualityAssessmentDetail');
    await expect(detail).toContainText('OBJETO EVALUADO');
    await expect(detail).toContainText('FECHA DE EVALUACIÓN');
    await expect(detail).toContainText('MÉTODO');
    await expect(detail).toContainText('REVISOR');
    await expect(detail).toContainText('PUNTUACIÓN');
    await expect(detail).toContainText('RESUMEN');
    await expect(detail.locator('.quality-score')).toHaveText('NULL');
    await expect(detail).toContainText('NULL ≠ 0');
    await expect(detail).toContainText('data_activity_id: NULL');
    await expect(detail).toContainText('NO constituye validación científica');
    await expect(detail).toContainText('NO constituye una puntuación de calidad');
    await expect(detail).toContainText('NO modifica la RegionalTaxonAssertion');
    await expect(detail).toContainText('NO crea QualityFlag');
    await expect(detail).toContainText('NO crea ValidationEvent');
    await expect(detail).toContainText('RegionalTaxonAssertion → TaxonConcept');
    await expect(detail).toContainText('RegionalTaxonAssertion → GeographicArea');
    await expect(detail).toContainText(/RTA validation_status: (unreviewed|pending_review)/);
    await expect(detail).toContainText('RTA presence: unknown · term: NULL');

    await page.locator('#backQualityDetailBtn').click();
    await expect(page.locator('#qualityOverviewView')).toBeVisible();
    await createOrReuseQuality(page);
    await expect(page.locator('#qualityAssessmentList .quality-assessment-card')).toHaveCount(1);
    await page.screenshot({ path: 'evidence/mvp12-quality-review-desktop.png', fullPage: true });
  });

  test.describe('mobile quality UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('RegionalTaxonAssertion to QualityAssessment remains usable without horizontal overflow', async ({ page }) => {
      await openRegionalAssertion(page);
      await openQuality(page);
      await expect(page.locator('#qualityAssessmentList .quality-assessment-card')).toHaveCount(1);
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      await page.locator('#qualityAssessmentList .quality-assessment-card').click();
      await expect(page.locator('#qualityAssessmentDetailView')).toBeVisible();
      await expect(page.locator('#qualityAssessmentDetail .quality-score')).toHaveText('NULL');
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp12-quality-review-mobile.png', fullPage: true });
    });
  });
});
