const { test, expect } = require('@playwright/test');
const BASE = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openMonitoring(page){
  await page.goto(BASE);
  await page.locator('#searchInput').fill('Plantago major L.');
  await page.locator('#searchForm').getByRole('button',{name:'Buscar'}).click();
  await page.locator('#results .result-card').filter({hasText:'Plantago major L.'}).first().click();
  await page.getByRole('button',{name:/^Poblaciones:/}).click();
  await page.locator('#populationList .result-card').filter({hasText:'JBLR STAGING · Población demo MVP2 · editada'}).first().click();
  await page.getByRole('button',{name:'Prospecciones / visitas'}).click();
  await page.locator('#fieldVisitList .visit-card').first().click();
  await page.getByRole('button',{name:'OBSERVACIONES / CENSOS'}).click();
  await expect(page.locator('#fieldMonitoringView')).toBeVisible();
  await expect(page.locator('#monitoringContext')).toContainText('Plantago major L.');
}

async function waitForMonitoringReady(page){
  await expect(page.locator('#fieldMonitoringView')).toBeVisible();
  await expect(page.locator('#monitoringStatus')).not.toHaveText('Cargando…');
}

test.describe.serial('MVP_PRODUCTIVO_7 observations and censuses',()=>{
  test('creates/reuses Observation, Census and measurements, edits safely and persists',async({page})=>{
    await openMonitoring(page);

    await page.getByRole('button',{name:'Crear / reutilizar Observation'}).click();
    await expect(page.locator('#observationCreateDialog')).toBeVisible();
    await page.locator('#observationCreateForm').getByRole('button',{name:'Crear / reutilizar'}).click();
    await expect(page.locator('#observationList .observation-card')).toHaveCount(1);
    await page.locator('#observationList .observation-card').first().click();
    await expect(page.locator('#observationDetail')).toContainText('FieldVisit:');
    await expect(page.locator('#observationDetail')).toContainText('Population:');
    await expect(page.locator('#observationDetail')).toContainText('Location:');
    await expect(page.locator('#observationDetail')).toContainText('Plantago major L.');
    await expect(page.locator('#observationDetail')).toContainText('Individual: NULL');
    await page.getByRole('button',{name:'Editar Observation'}).click();
    await page.locator('#observationEditVerbatim').fill('JBLR STAGING · observación demo MVP7 · editada');
    await page.locator('#observationEditNotes').fill('observación cualitativa sintética MVP7 · editada');
    await page.locator('#observationEditForm').getByRole('button',{name:'Guardar cambios'}).click();
    await expect(page.locator('#observationDetail h1')).toHaveText('JBLR STAGING · observación demo MVP7 · editada');
    await page.locator('#backObservationToMonitoringBtn').click();
    await waitForMonitoringReady(page);

    await page.getByRole('button',{name:'Crear / reutilizar Census'}).click();
    await expect(page.locator('#censusCreateDialog')).toBeVisible();
    await page.locator('#censusCreateForm').getByRole('button',{name:'Crear / reutilizar'}).click();
    await expect(page.locator('#censusList .census-card')).toHaveCount(1);
    await page.locator('#censusList .census-card').first().click();
    await expect(page.locator('#censusDetail')).toContainText('FieldVisit:');
    await expect(page.locator('#censusDetail')).toContainText('Population:');
    await page.getByRole('button',{name:'Crear / reutilizar mediciones'}).click();
    await expect(page.locator('.measurement-card').filter({hasText:'individual_count'})).toContainText('present');
    await expect(page.locator('.measurement-card').filter({hasText:'individual_count'})).toContainText('12');
    await expect(page.locator('.measurement-card').filter({hasText:'seedling_count'})).toContainText('unknown');
    await expect(page.locator('.measurement-card').filter({hasText:'seedling_count'})).toContainText('NULL');
    await page.getByRole('button',{name:'Editar Census'}).click();
    await page.locator('#censusEditMethod').fill('JBLR STAGING · censo demo MVP7 · editado');
    await page.locator('#censusEditNotes').fill('censo sintético MVP7 · editado; no es un protocolo científico real');
    await page.locator('#censusEditForm').getByRole('button',{name:'Guardar cambios'}).click();
    await expect(page.locator('#censusDetail h1')).toHaveText('JBLR STAGING · censo demo MVP7 · editado');

    await page.reload();
    await openMonitoring(page);
    await expect(page.locator('#observationList .observation-card')).toHaveCount(1);
    await expect(page.locator('#censusList .census-card')).toHaveCount(1);
    await expect(page.locator('#observationList')).toContainText('JBLR STAGING · observación demo MVP7 · editada');
    await expect(page.locator('#censusList')).toContainText('JBLR STAGING · censo demo MVP7 · editado');
    await page.locator('#censusList .census-card').first().click();
    await expect(page.locator('.measurement-card')).toHaveCount(2);
    await expect(page.locator('.measurement-card').filter({hasText:'seedling_count'})).toContainText('unknown');
    await expect(page.locator('.measurement-card').filter({hasText:'seedling_count'})).toContainText('NULL');
  });

  test('mobile FieldVisit monitoring remains usable without horizontal overflow',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await openMonitoring(page);
    let overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(overflow).toBeFalsy();
    await page.locator('#observationList .observation-card').first().click();
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(overflow).toBeFalsy();
    await page.locator('#backObservationToMonitoringBtn').click();
    await waitForMonitoringReady(page);
    await page.locator('#censusList .census-card').first().click();
    await expect(page.locator('.measurement-card')).toHaveCount(2);
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(overflow).toBeFalsy();
  });
});
