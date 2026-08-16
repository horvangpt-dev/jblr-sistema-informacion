const { test, expect } = require('@playwright/test');

const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const TARGET = '01a00cd2-04ef-706a-9e14-2d47c9de0a18';

async function openReview(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: 'ESTADO REGIONAL' }).click();
  await expect(page.locator('#regionalStatusMessage')).not.toHaveText('Cargando…');
  await page.locator('#regionalAssertionList .regional-assertion-card').click();
  await expect(page.getByRole('button', { name: 'REVISIÓN' })).toBeVisible();
  await page.getByRole('button', { name: 'REVISIÓN' }).click();
  await expect(page.locator('#reviewMessage')).not.toHaveText('Cargando…');
  if (await page.locator('#requestReviewBtn').isEnabled()) {
    await page.locator('#requestReviewBtn').click();
    await expect(page.locator('#reviewMessage')).not.toContainText('Registrando solicitud');
  }
  await expect(page.locator('#validationEventList .validation-event-card')).toHaveCount(1);
}

test('MVP13 stale ValidationEvent response cannot replace newer review navigation', async ({ page }) => {
  await openReview(page);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/mvp13-api/validation-events/*', async (route) => {
    await gate;
    await route.continue();
  });

  await page.locator('#validationEventList .validation-event-card').click();
  await expect(page.locator('#validationEventDetailView')).toBeVisible();
  await expect(page.locator('#validationEventDetail')).toContainText('Cargando ValidationEvent');

  await page.locator('#backValidationEventBtn').click();
  await expect(page.locator('#reviewOverviewView')).toBeVisible();
  await expect(page.locator('#reviewMessage')).not.toHaveText('Cargando…');

  release();
  await page.waitForTimeout(500);

  await expect(page.locator('#reviewOverviewView')).toBeVisible();
  await expect(page.locator('#validationEventDetailView')).toBeHidden();
  await expect(page.locator('#reviewTargetBlock')).toContainText('PENDIENTE DE REVISIÓN');

  const response = await page.request.get(`${BASE}/mvp13-api/regional-assertions/${TARGET}/review`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.events).toHaveLength(1);
  expect(body.target.regional_assertion_row_version).toBe(2);
});
