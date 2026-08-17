(() => {
  const style=document.createElement('style');
  style.textContent='#realMaterialFlowView .flow-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}#realMaterialFlowView fieldset{border:1px solid #d7dce2;border-radius:.65rem;padding:1rem;margin:0 0 1rem}#realMaterialFlowView legend{font-weight:700}#realMaterialFlowView label{display:flex;flex-direction:column;gap:.35rem;margin:.45rem 0}#realMaterialFlowView .inline-check{flex-direction:row;align-items:center}#realMaterialFlowView .flow-actions{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0}#realMaterialFlowView pre{white-space:pre-wrap;overflow:auto;background:#f6f7f9;border:1px solid #d7dce2;border-radius:.5rem;padding:1rem}#realMaterialFlowView .model-gap{border-left:4px solid currentColor;padding:.75rem 1rem;background:#f6f7f9}';
  document.head.appendChild(style);

  const topbar=document.querySelector('.topbar');
  const main=document.querySelector('main');
  if(!topbar||!main) return;
  const button=document.createElement('button');
  button.id='realMaterialFlowBtn'; button.className='secondary'; button.textContent='Campo → Jardín → Banco';
  topbar.appendChild(button);

  const view=document.createElement('section');
  view.id='realMaterialFlowView'; view.className='panel hidden';
  view.innerHTML=`
    <button class="link-button" id="realFlowBackBtn">← Volver</button>
    <p class="eyebrow">04.1 · FLUJO BOTÁNICO REAL</p><h1>Entrada y circuito de material</h1>
    <p class="muted">Entrada nueva o retrospectiva. Solo se crean etapas respaldadas por evidencia. UNKNOWN ≠ 0 · Sample ≠ Accession.</p>
    <form id="realFlowForm">
      <fieldset><legend>Fuente y modalidad</legend><div class="flow-grid">
        <label>Modalidad<select id="rfMode"><option value="retrospective">Retrospectiva</option><option value="new_collection">Nueva recolección</option></select></label>
        <label>Código/clave existente<input id="rfSourceKey" required></label>
        <label>ID documento fuente<input id="rfSourceDocumentId" required></label>
        <label>Documento fuente<input id="rfSourceDocumentTitle" required></label>
      </div></fieldset>
      <fieldset><legend>Identidad documental</legend><div class="flow-grid">
        <label>Taxón verbal<input id="rfTaxon"></label>
        <label class="inline-check"><input id="rfTaxonProvisional" type="checkbox"> Identificación provisional</label>
        <label>Localidad<input id="rfLocation"></label>
        <label>Población operativa<input id="rfPopulation"></label>
        <label>Recolector/a<input id="rfCollector"></label>
      </div></fieldset>
      <fieldset><legend>Recolección y muestra</legend><div class="flow-grid">
        <label class="inline-check"><input id="rfCollectionOccurred" type="checkbox"> CollectionEvent documentada</label>
        <label>Fecha/hora<input id="rfCollectionAt" type="datetime-local"></label>
        <label>Método<input id="rfCollectionMethod"></label>
        <label>Material recogido literal<input id="rfRawMaterial"></label>
        <label>Plantas observadas<input id="rfPlantsObserved" type="number" min="0"></label>
        <label>Plantas muestreadas<input id="rfPlantsSampled" type="number" min="0"></label>
        <label class="inline-check"><input id="rfSampleOccurred" type="checkbox"> Sample física documentada</label>
        <label>Tipo de muestra<input id="rfSampleKind" placeholder="infructescences, seeds…"></label>
        <label>Cantidad<input id="rfQuantity" type="number" step="any"></label>
        <label>Unidad<input id="rfQuantityUnit"></label>
      </div></fieldset>
      <fieldset><legend>Jardín y banco</legend><div class="flow-grid">
        <label class="inline-check"><input id="rfReceptionOccurred" type="checkbox"> Recepción física documentada</label>
        <label>Fecha/hora de recepción<input id="rfReceptionAt" type="datetime-local"></label>
        <label>Procesos documentados<textarea id="rfProcessing" placeholder='JSON opcional: [{"occurred":true,"processType":"cleaning","producesDistinctMaterial":true,"outputSampleKind":"seeds"}]'></textarea></label>
        <label class="inline-check"><input id="rfAccessionOccurred" type="checkbox"> Accession formal documentada</label>
        <label>Fecha de accesión<input id="rfAccessionDate" type="date"></label>
        <label>Estado de accesión<input id="rfAccessionStatus"></label>
      </div>
      <p class="model-gap"><strong>Ubicación física estructurada:</strong> bloqueada por el modelo actual. No se codifica como ResourceSet ni texto libre hasta resolver el gap de modelo.</p>
      </fieldset>
      <div class="flow-actions"><button class="secondary" type="button" id="rfLoadLavatera">Cargar caso Lavatera</button><button class="secondary" type="button" id="rfPreview">Previsualizar</button><button class="primary" type="submit">Crear flujo real en STAGING</button></div>
      <div id="rfStatus" class="status" aria-live="polite"></div><pre id="rfOutput"></pre>
    </form>`;
  main.appendChild(view);

  const knownViews=[...main.querySelectorAll(':scope > section')];
  function showReal(){ knownViews.forEach(v=>v.classList.add('hidden')); view.classList.remove('hidden'); }
  function showSearch(){ knownViews.forEach(v=>v.classList.add('hidden')); const s=document.getElementById('searchView'); if(s)s.classList.remove('hidden'); }
  button.addEventListener('click',showReal); document.getElementById('realFlowBackBtn').addEventListener('click',showSearch);

  const $=id=>document.getElementById(id);
  function localIso(value){ return value ? new Date(value).toISOString() : null; }
  function payload(){
    let processing=[]; const raw=$('rfProcessing').value.trim(); if(raw) processing=JSON.parse(raw);
    return {
      mode:$('rfMode').value, sourceKey:$('rfSourceKey').value, sourceDocumentId:$('rfSourceDocumentId').value, sourceDocumentTitle:$('rfSourceDocumentTitle').value,
      taxonVerbatim:$('rfTaxon').value||null, taxonProvisional:$('rfTaxonProvisional').checked, identificationStatus:$('rfTaxonProvisional').checked?'provisional':null,
      locationName:$('rfLocation').value||null, populationLabel:$('rfPopulation').value||null, collectorName:$('rfCollector').value||null,
      collectionOccurred:$('rfCollectionOccurred').checked, collectionAt:localIso($('rfCollectionAt').value), collectionMethod:$('rfCollectionMethod').value||null,
      rawMaterialVerbatim:$('rfRawMaterial').value||null, plantsObserved:$('rfPlantsObserved').value||null, plantsSampled:$('rfPlantsSampled').value||null,
      sampleOccurred:$('rfSampleOccurred').checked, sampleKind:$('rfSampleKind').value||null, quantityValue:$('rfQuantity').value||null, quantityUnit:$('rfQuantityUnit').value||null,
      reception:{occurred:$('rfReceptionOccurred').checked,at:localIso($('rfReceptionAt').value)}, processing,
      accession:{occurred:$('rfAccessionOccurred').checked,date:$('rfAccessionDate').value||null,status:$('rfAccessionStatus').value||null}
    };
  }
  async function call(url,body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await r.json(); if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`); return data; }
  function show(data){ $('rfOutput').textContent=JSON.stringify(data,null,2); $('rfStatus').textContent=''; }
  function fail(err){ $('rfStatus').textContent=err.message; }
  $('rfPreview').addEventListener('click',async()=>{try{show(await call('/real-flow-api/preview',payload()));}catch(e){fail(e);}});
  $('realFlowForm').addEventListener('submit',async e=>{e.preventDefault();try{show(await call('/real-flow-api/flows',payload()));}catch(err){fail(err);}});
  $('rfLoadLavatera').addEventListener('click',()=>{
    $('rfMode').value='retrospective'; $('rfSourceKey').value='ES-0-JBLR-01/26'; $('rfSourceDocumentId').value='1Cj8K6IYle933fP0xnkudgtK1u6hM5VLx'; $('rfSourceDocumentTitle').value='ES-0-JBLR-01-26_01_Recoleccion_Campo_REVISADA.xlsx';
    $('rfTaxon').value='Lavatera arborea L.'; $('rfTaxonProvisional').checked=true; $('rfLocation').value='Cárdenas de Rioja · núcleo urbano junto a la carretera principal'; $('rfPopulation').value='Lavatera arborea L. [provisional] · Cárdenas de Rioja · P01'; $('rfCollector').value='Joaquín Hornos';
    $('rfCollectionOccurred').checked=true; $('rfCollectionAt').value='2026-07-04T19:42'; $('rfCollectionMethod').value='A — Toda la población'; $('rfRawMaterial').value='C — Infrutescencias'; $('rfPlantsObserved').value='8'; $('rfPlantsSampled').value='3';
    $('rfSampleOccurred').checked=true; $('rfSampleKind').value='infructescences'; $('rfQuantity').value=''; $('rfQuantityUnit').value=''; $('rfReceptionOccurred').checked=false; $('rfProcessing').value=''; $('rfAccessionOccurred').checked=false;
  });
})();
