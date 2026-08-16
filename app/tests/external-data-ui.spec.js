const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openPlantago(page) {
  await page.goto(baseURL);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'FUENTES EXTERNAS' })).toBeVisible();
}

async function waitExternalReady(page) {
  await expect(page.locator('#externalDataView')).toBeVisible();
  await expect(page.locator('#externalDataStatus')).not.toHaveText('Cargando…');
  await expect(page.locator('#externalDataView')).toContainText('Importación ≠ validación');
}

async function openExternal(page) {
  await page.getByRole('button', { name: 'FUENTES EXTERNAS' }).click();
  await waitExternalReady(page);
}

async function ensureFullChain(page) {
  await page.getByRole('button', { name: 'Crear / reutilizar fuente' }).click();
  await expect(page.locator('#externalSourceBlock')).toContainText('STAGING_MVP9');
  await expect(page.locator('#externalSourceBlock')).toContainText('JBLR STAGING · Fuente externa sintética MVP9');

  await page.getByRole('button', { name: 'Crear / reutilizar registro' }).click();
  await expect(page.locator('#externalRecordDetailView')).toBeVisible();
  await expect(page.locator('#externalRecordDetail')).toContainText('MVP9-DEMO-0001');
  await expect(page.locator('#externalRecordDetail')).toContainText('synthetic_taxon_record');
  await expect(page.locator('#externalRecordDetail')).toContainText('ExternalRecord identifica persistentemente');

  await page.getByRole('button', { name: 'Crear / reutilizar Snapshot' }).click();
  await expect(page.locator('#externalSnapshotDetailView')).toBeVisible();
  await expect(page.locator('#externalSnapshotDetail')).toContainText('captured');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('raw_asset_id: NULL');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('RAW PAYLOAD');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('NORMALIZED PAYLOAD');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('Plantago major L.');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('STAGING / DEMO / NO VALIDADO');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('unvalidated');
  await expect(page.locator('#externalSnapshotDetail .hash-value')).toHaveText(/payload_hash SHA-256: [0-9a-f]{64}/);

  await page.getByRole('button', { name: 'Vincular / reutilizar procedencia' }).click();
  await expect(page.locator('#externalSnapshotDetail')).toContainText('manual_import_demo');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('source_record_snapshot');
  await expect(page.locator('#externalSnapshotDetail')).toContainText('JBLR-TXC-00000002');
}

test.describe.serial('MVP_PRODUCTIVO_9 external scientific records', () => {
  test('creates/reuses source, record, immutable snapshot and manual provenance without validation', async ({ page }) => {
    await openPlantago(page);
    await openExternal(page);
    await ensureFullChain(page);

    await page.locator('#backSnapshotBtn').click();
    await expect(page.locator('#externalRecordDetailView')).toBeVisible();
    await expect(page.locator('#externalRecordDetail .external-snapshot-card')).toHaveCount(1);
    await page.locator('#backRecordToExternalBtn').click();
    await waitExternalReady(page);
    await expect(page.locator('#externalRecordList .external-record-card')).toHaveCount(1);
    await expect(page.locator('#externalLinkedList .external-linked-card')).toHaveCount(1);

    await page.locator('#backExternalToTaxonBtn').click();
    await expect(page.locator('#detailView')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
    await openExternal(page);
    const linked = page.locator('#externalLinkedList .external-linked-card');
    await expect(linked).toHaveCount(1);
    await expect(linked).toBeVisible();
    await linked.click();
    await expect(page.locator('#externalSnapshotDetail')).toContainText('source_record_snapshot');

    await page.reload();
    await openPlantago(page);
    await openExternal(page);
    await expect(page.locator('#externalRecordList .external-record-card')).toHaveCount(1);
    await expect(page.locator('#externalLinkedList .external-linked-card')).toHaveCount(1);
    await expect(page.locator('#externalLinkedList .external-linked-card')).toBeVisible();
    await page.locator('#externalLinkedList .external-linked-card').click();
    await expect(page.locator('#externalSnapshotDetail')).toContainText('MVP9-DEMO-0001');
    await expect(page.locator('#externalSnapshotDetail')).toContainText('raw_asset_id: NULL');
    await expect(page.locator('#externalSnapshotDetail .hash-value')).toHaveText(/payload_hash SHA-256: [0-9a-f]{64}/);
    await page.screenshot({ path: 'evidence/mvp9-external-data-desktop.png', fullPage: true });
  });

  test.describe('mobile external data UI', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('TaxonConcept to source, record, snapshot and provenance remains usable without horizontal overflow', async ({ page }) => {
      await openPlantago(page);
      await openExternal(page);
      await expect(page.locator('#externalSourceBlock')).toContainText('STAGING_MVP9');
      await expect(page.locator('#externalRecordList .external-record-card')).toHaveCount(1);
      await expect(page.locator('#externalRecordList .external-record-card')).toBeVisible();
      await page.locator('#externalRecordList .external-record-card').click();
      await expect(page.locator('#externalRecordDetail .external-snapshot-card')).toHaveCount(1);
      await expect(page.locator('#externalRecordDetail .external-snapshot-card')).toBeVisible();
      await page.locator('#externalRecordDetail .external-snapshot-card').click();
      await expect(page.locator('#externalSnapshotDetail')).toContainText('RAW PAYLOAD');
      await expect(page.locator('#externalSnapshotDetail')).toContainText('NORMALIZED PAYLOAD');
      await expect(page.locator('#externalSnapshotDetail')).toContainText('source_record_snapshot');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: 'evidence/mvp9-external-data-mobile.png', fullPage: true });
    });
  });
});
