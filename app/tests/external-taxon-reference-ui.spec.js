const { test, expect } = require('@playwright/test');

const BASE=process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const EXTERNAL_ID='STAGING-DEMO-TAXON-REF-001';

async function openPlantago(page){
  await page.goto(BASE);
  await page.getByLabel('Buscar por nombre científico').fill('Plantago');
  await page.getByRole('button',{name:'Buscar'}).click();
  await expect(page.getByText('Plantago major L.',{exact:true})).toBeVisible();
  await page.getByText('Plantago major L.',{exact:true}).click();
  await expect(page.getByRole('heading',{name:'Taxonomía'})).toBeVisible();
  await expect(page.getByRole('button',{name:'REFERENCIAS EXTERNAS'})).toBeVisible();
}

async function openReferences(page){
  await page.getByRole('button',{name:'REFERENCIAS EXTERNAS'}).click();
  await expect(page.locator('#externalTaxonReferencesView')).toBeVisible();
  await expect(page.locator('#externalTaxonReferencesStatus')).not.toHaveText('Cargando…');
}

async function ensureReference(page){
  if(await page.locator('#externalTaxonReferencesList .etr-card').count()===0){
    await page.getByRole('button',{name:'Crear / reutilizar referencia'}).click();
    await expect(page.locator('#externalTaxonReferenceDetailView')).toBeVisible();
    await page.locator('#backExternalTaxonReferenceListBtn').click();
    await expect(page.locator('#externalTaxonReferencesView')).toBeVisible();
  }
  await expect(page.locator('#externalTaxonReferencesList .etr-card')).toHaveCount(1);
}

test.describe.serial('MVP_PRODUCTIVO_15 traceable external taxon references',()=>{
  test('creates/reuses one synthetic ExternalTaxonReference without taxonomic validation',async({page})=>{
    await openPlantago(page);
    await openReferences(page);
    await expect(page.locator('#externalTaxonReferencesView')).toContainText('REFERENCIA EXTERNA ≠ IDENTIDAD TAXONÓMICA VALIDADA');
    await expect(page.locator('#externalTaxonReferencesView')).toContainText('ESTE REGISTRO STAGING NO CONSTITUYE VALIDACIÓN CIENTÍFICA');
    await ensureReference(page);

    const card=page.locator('#externalTaxonReferencesList .etr-card');
    await expect(card).toContainText(EXTERNAL_ID);
    await expect(card).toContainText('JBLR STAGING · Fuente externa sintética MVP9');
    await card.click();
    await expect(page.locator('#externalTaxonReferenceDetailView')).toBeVisible();
    const detail=page.locator('#externalTaxonReferenceDetail');
    await expect(detail).toContainText(EXTERNAL_ID);
    await expect(detail).toContainText('Plantago major L. · JBLR-TXC-00000002');
    await expect(detail).toContainText('JBLR STAGING · Fuente externa sintética MVP9 · STAGING_MVP9');
    await expect(detail).toContainText('URL');
    await expect(detail.getByText('NO REGISTRADO',{exact:true})).toHaveCount(5);
    await expect(detail).toContainText('ESTADO DE REVISIÓN');
    await expect(detail).toContainText('unreviewed');
    await expect(detail).toContainText('External identifier ≠ Identification');
    await expect(detail).toContainText('reference ≠ Assertion');
    await expect(detail).toContainText('import ≠ validation');
    await expect(detail).not.toContainText('0 %');
    await expect(detail).not.toContainText('NO MATCH');

    await page.locator('#backExternalTaxonReferenceListBtn').click();
    await page.getByRole('button',{name:'Crear / reutilizar referencia'}).click();
    await expect(page.locator('#externalTaxonReferenceDetailView')).toBeVisible();
    await page.locator('#backExternalTaxonReferenceListBtn').click();
    await expect(page.locator('#externalTaxonReferencesList .etr-card')).toHaveCount(1);
    await page.screenshot({path:'evidence/mvp15-external-taxon-reference-desktop.png',fullPage:true});
  });

  test.describe('mobile external taxon reference UI',()=>{
    test.use({viewport:{width:390,height:844}});
    test('TaxonConcept to ExternalTaxonReference remains usable without horizontal overflow',async({page})=>{
      await openPlantago(page);
      await openReferences(page);
      await ensureReference(page);
      await page.locator('#externalTaxonReferencesList .etr-card').click();
      await expect(page.locator('#externalTaxonReferenceDetailView')).toBeVisible();
      await expect(page.locator('#externalTaxonReferenceDetail')).toContainText(EXTERNAL_ID);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({path:'evidence/mvp15-external-taxon-reference-mobile.png',fullPage:true});
    });
  });
});
