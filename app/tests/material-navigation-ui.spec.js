const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

test('material flow returns safely to the current FieldVisit', async ({ page }) => {
  await page.goto(baseURL);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await page.getByRole('button', { name: /^Poblaciones:/ }).click();
  await expect(page.locator('#populationsStatus')).not.toHaveText('Cargando…');
  await page.locator('#populationList .result-card').first().click();
  await page.getByRole('button', { name: 'Prospecciones / visitas' }).click();
  await expect(page.locator('#fieldActivityStatus')).not.toHaveText('Cargando…');
  await page.locator('#fieldVisitList .visit-card').first().click();
  await expect(page.locator('#fieldVisitDetail').getByRole('heading', { name: 'VISITA DE CAMPO' })).toBeVisible();
  await page.getByRole('button', { name: 'Recolección / material' }).click();
  await expect(page.locator('#materialFlowView')).toBeVisible();
  await page.locator('#backToFieldVisitBtn').click();
  await expect(page.locator('#fieldVisitDetailView')).toBeVisible();
  await expect(page.locator('#fieldVisitDetail').getByRole('heading', { name: 'VISITA DE CAMPO' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recolección / material' })).toBeVisible();
});
