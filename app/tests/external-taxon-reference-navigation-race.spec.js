const { test, expect } = require('@playwright/test');

const BASE=process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';

async function openReferences(page){
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button',{name:'Buscar'}).click();
  await page.getByText('Plantago major L.',{exact:true}).click();
  await page.getByRole('button',{name:'REFERENCIAS EXTERNAS'}).click();
  await expect(page.locator('#externalTaxonReferencesStatus')).not.toHaveText('Cargando…');
  if(await page.locator('#externalTaxonReferencesList .etr-card').count()===0){
    await page.getByRole('button',{name:'Crear / reutilizar referencia'}).click();
    await expect(page.locator('#externalTaxonReferenceDetailView')).toBeVisible();
    await page.locator('#backExternalTaxonReferenceListBtn').click();
  }
  await expect(page.locator('#externalTaxonReferencesList .etr-card')).toHaveCount(1);
}

test('MVP15 stale ExternalTaxonReference response cannot replace newer TaxonConcept navigation',async({page})=>{
  await openReferences(page);
  let release;
  const gate=new Promise((resolve)=>{release=resolve;});
  let intercepted=false;
  await page.route('**/mvp15-api/external-taxonomy-references/**',async(route)=>{
    if(intercepted) return route.continue();
    intercepted=true;
    await gate;
    await route.continue();
  });

  await page.locator('#externalTaxonReferencesList .etr-card').click();
  await page.locator('#backExternalTaxonRefsToTaxonBtn').click();
  await expect(page.locator('#detailView')).toBeVisible();
  release();
  await page.waitForTimeout(250);
  await expect(page.locator('#detailView')).toBeVisible();
  await expect(page.locator('#externalTaxonReferenceDetailView')).toBeHidden();
  await expect(page.getByRole('heading',{name:'Taxonomía'})).toBeVisible();
});
