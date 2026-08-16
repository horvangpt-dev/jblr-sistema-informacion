const { test, expect } = require('@playwright/test');

const baseURL = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

test('desktop search and detail are usable', async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: 'Buscar taxón' })).toBeVisible();
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByText('Plantago major L.', { exact: true })).toBeVisible();
  await page.getByText('Plantago major L.', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Taxonomía' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Información relacionada' })).toBeVisible();
  await page.screenshot({ path: 'evidence/mvp1-desktop.png', fullPage: true });
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('fits mobile viewport and keeps core controls usable', async ({ page }) => {
    await page.goto(baseURL);
    await expect(page.getByRole('button', { name: 'Nuevo taxón' })).toBeVisible();
    await expect(page.getByLabel('Buscar por nombre científico')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.getByLabel('Buscar por nombre científico').fill('Papaver');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Papaver rhoeas L.', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'evidence/mvp1-mobile.png', fullPage: true });
  });
});
