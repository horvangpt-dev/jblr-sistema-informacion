const { test, expect } = require('@playwright/test');
const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openPlantagoExternal(page) {
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'FUENTES EXTERNAS' })).toBeVisible();
  await page.getByRole('button', { name: 'FUENTES EXTERNAS' }).click();
  await expect(page.locator('#externalDataView')).toBeVisible();
  await expect(page.locator('#externalDataStatus')).not.toHaveText('Cargando…');
  await expect(page.locator('#externalRecordList .external-record-card')).toHaveCount(1);
}

test('STALE_NAVIGATION_IGNORED: delayed ExternalRecord response cannot replace newer TaxonConcept view', async ({ page }) => {
  await openPlantagoExternal(page);

  let releaseRequest;
  const gate = new Promise((resolve) => { releaseRequest = resolve; });
  let markIntercepted;
  const intercepted = new Promise((resolve) => { markIntercepted = resolve; });

  await page.route('**/mvp9-api/external-records/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    markIntercepted();
    await gate;
    await route.continue();
  });

  await page.locator('#externalRecordList .external-record-card').click();
  await intercepted;

  await page.locator('#backExternalToTaxonBtn').click();
  await expect(page.locator('#detailView')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();

  const completed = page.waitForResponse((response) =>
    response.request().method() === 'GET' &&
    /\/mvp9-api\/external-records\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  releaseRequest();
  await completed;

  await expect(page.locator('#detailView')).toBeVisible();
  await expect(page.locator('#externalRecordDetailView')).toBeHidden();
  await expect(page.locator('#externalDataView')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
});
