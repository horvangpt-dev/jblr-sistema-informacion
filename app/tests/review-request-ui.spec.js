const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const TARGET = '01a00cd2-04ef-706a-9e14-2d47c9de0a18';

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
  await expect(page.locator('#reviewStateInline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'REVISIÓN' })).toBeVisible();
}

async function openReview(page) {
  await page.getByRole('button', { name: 'REVISIÓN' }).click();
  await expect(page.locator('#reviewOverviewView')).toBeVisible();
  await expect(page.locator('#reviewMessage')).not.toHaveText('Cargando…');
}

async function ensureRequested(page) {
  const button = page.locator('#requestReviewBtn');
  if (await button.isEnabled()) {
    await expect(page.locator('#reviewTargetBlock')).toContainText('SIN REVISAR');
    await button.click();
    await expect(page.locator('#reviewMessage')).not.toContainText('Registrando solicitud');
  }
  await expect(page.locator('#reviewTargetBlock')).toContainText('PENDIENTE DE REVISIÓN');
  await expect(page.locator('#reviewTargetBlock')).toContainText('row_version: 2');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('REVISIÓN YA SOLICITADA');
  await expect(page.locator('#validationEventList .validation-event-card')).toHaveCount(1);
}

test.describe.serial('MVP_PRODUCTIVO_13 traceable regional review request', () => {
  test('requests review once and exposes the ValidationEvent without scientific validation', async ({ page }) => {
    await openRegionalAssertion(page);
    const inline = page.locator('#reviewStateInline');
    await expect(inline).toContainText(/SIN REVISAR|PENDIENTE DE REVISIÓN/);

    await openReview(page);
    await expect(page.getByRole('button', { name: 'VALIDAR', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'RECHAZAR', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'DISPUTAR', exact: true })).toHaveCount(0);
    await ensureRequested(page);

    await expect(page.locator('#reviewTargetBlock')).toContainText('presence_value_status: unknown');
    await expect(page.locator('#reviewTargetBlock')).toContainText('presence_term_key: NULL');
    await expect(page.locator('#reviewTargetBlock')).toContainText('DESCONOCIDO ≠ AUSENCIA');

    const eventCard = page.locator('#validationEventList .validation-event-card');
    await expect(eventCard).toContainText('unreviewed → pending_review');
    await eventCard.click();

    await expect(page.locator('#validationEventDetailView')).toBeVisible();
    const detail = page.locator('#validationEventDetail');
    await expect(detail).toContainText('OBJETO');
    await expect(detail).toContainText('ESTADO ANTERIOR');
    await expect(detail).toContainText('unreviewed');
    await expect(detail).toContainText('ESTADO NUEVO');
    await expect(detail).toContainText('pending_review');
    await expect(detail).toContainText('PENDIENTE DE REVISIÓN ≠ VALIDADO');
    await expect(detail).toContainText('REVISOR');
    await expect(detail).toContainText('ACTIVIDAD');
    await expect(detail.locator('.review-null')).toHaveCount(2);
    await expect(detail.locator('.review-null').nth(0)).toHaveText('NO REGISTRADO');
    await expect(detail.locator('.review-null').nth(1)).toHaveText('NO REGISTRADO');
    await expect(detail).toContainText('STAGING / DEMO / MVP13 REVIEW REQUEST · NO SCIENTIFIC VALIDATION');
    await expect(detail).toContainText('ValidationEvent → RegionalTaxonAssertion');
    await expect(detail).toContainText('RegionalTaxonAssertion → TaxonConcept');
    await expect(detail).toContainText('RegionalTaxonAssertion → GeographicArea');
    await expect(detail).toContainText('RTA validation_status: pending_review · row_version: 2');
    await expect(detail).toContainText('RTA presence: unknown · term: NULL');

    await page.locator('#backValidationEventBtn').click();
    await expect(page.locator('#reviewOverviewView')).toBeVisible();

    const response = await page.request.post(`${BASE}/mvp13-api/regional-assertions/${TARGET}/request-review`, { data: {} });
    expect(response.ok()).toBe(true);
    const reused = await response.json();
    expect(reused.created).toBe(false);
    expect(reused.target.regional_assertion_validation_status).toBe('pending_review');
    expect(reused.target.regional_assertion_row_version).toBe(2);

    await page.reload();
    await openRegionalAssertion(page);
    await expect(page.locator('#reviewStateInline')).toContainText('PENDIENTE DE REVISIÓN');
    await page.screenshot({ path: 'evidence/mvp13-review-request-desktop.png', fullPage: true });
  });

  test.describe('mobile review UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('RegionalTaxonAssertion to ValidationEvent remains usable without horizontal overflow', async ({ page }) => {
      await openRegionalAssertion(page);
      await openReview(page);
      await ensureRequested(page);
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      await page.locator('#validationEventList .validation-event-card').click();
      await expect(page.locator('#validationEventDetailView')).toBeVisible();
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp13-review-request-mobile.png', fullPage: true });
    });
  });
});
