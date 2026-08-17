(() => {
  const $ = (selector) => document.querySelector(selector);
  const text = (tag,value,cls='') => { const el=document.createElement(tag); if(cls) el.className=cls; el.textContent=value; return el; };
  const display = (value) => value === null || value === undefined || value === '' ? 'NO REGISTRADO' : String(value);
  const navToken = (token) => token === undefined ? beginNavigation() : token;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="externalTaxonReferencesView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backExternalTaxonRefsToTaxonBtn">← Volver al TaxonConcept</button>
      <div class="identity compact etr-identity">
        <div>
          <p class="eyebrow">REFERENCIAS TAXONÓMICAS EXTERNAS</p>
          <h1 id="externalTaxonReferencesTitle">Referencias externas</h1>
          <p class="muted etr-warning">REFERENCIA EXTERNA ≠ IDENTIDAD TAXONÓMICA VALIDADA</p>
          <p class="muted etr-warning">ESTE REGISTRO STAGING NO CONSTITUYE VALIDACIÓN CIENTÍFICA</p>
        </div>
        <button class="primary" id="createExternalTaxonReferenceBtn" type="button">Crear / reutilizar referencia</button>
      </div>
      <div id="externalTaxonReferencesStatus" class="status"></div>
      <div id="externalTaxonReferencesList" class="results"></div>
    </section>

    <section id="externalTaxonReferenceDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backExternalTaxonReferenceListBtn">← Volver a referencias externas</button>
      <div id="externalTaxonReferenceDetail"></div>
    </section>
  `);

  async function api(path,options={}) {
    const response = await fetch(`/mvp15-api${path}`, { headers:{'Content-Type':'application/json'}, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function ensureEntryButton() {
    const identity = $('#detail .identity');
    if (!identity || $('#openExternalTaxonReferencesBtn')) return;
    const button = text('button','REFERENCIAS EXTERNAS','secondary etr-entry-button');
    button.id='openExternalTaxonReferencesBtn';
    button.type='button';
    button.onclick=() => openReferenceList();
    identity.append(button);
  }
  new MutationObserver(ensureEntryButton).observe($('#detail'), { childList:true, subtree:true });

  function referenceCard(item) {
    const card=document.createElement('article');
    card.className='result-card etr-card';
    card.tabIndex=0;
    card.append(
      text('h3',item.external_id),
      text('p',`${item.source_name} · ${item.validation_status}`,'muted'),
      text('p','ExternalTaxonReference · referencia trazable, no identidad ni validación científica.','muted')
    );
    const open=() => openReferenceDetail(item.external_taxon_reference_id);
    card.onclick=open;
    card.onkeydown=(event) => { if(event.key==='Enter') open(); };
    return card;
  }

  async function openReferenceList(token) {
    if (!state.current?.concept_id) return;
    const nav=navToken(token);
    const conceptId=state.current.concept_id;
    if (!isNavigationCurrent(nav)) return;
    showView('externalTaxonReferencesView',nav);
    $('#externalTaxonReferencesStatus').textContent='Cargando…';
    try {
      const detail=await api(`/taxa/${conceptId}/external-taxonomy-references`);
      if(!isNavigationCurrent(nav)) return;
      $('#externalTaxonReferencesTitle').textContent=`Referencias externas · ${detail.taxon.concept_label}`;
      const list=$('#externalTaxonReferencesList');
      list.innerHTML='';
      detail.references.forEach((item)=>list.append(referenceCard(item)));
      if(!detail.references.length) list.append(text('p','No existe todavía ExternalTaxonReference para este TaxonConcept.','muted'));
      $('#externalTaxonReferencesStatus').textContent=`${detail.references.length} ExternalTaxonReference`;
    } catch(err) {
      if(isNavigationCurrent(nav)) $('#externalTaxonReferencesStatus').textContent=err.message;
    }
  }

  async function createReference() {
    if (!state.current?.concept_id) return;
    const nav=beginNavigation();
    const conceptId=state.current.concept_id;
    $('#externalTaxonReferencesStatus').textContent='Creando / reutilizando referencia sintética…';
    try {
      const result=await api(`/taxa/${conceptId}/external-taxonomy-references-demo`,{method:'POST',body:'{}'});
      if(!isNavigationCurrent(nav)) return;
      await openReferenceDetail(result.reference.external_taxon_reference_id,nav);
    } catch(err) {
      if(isNavigationCurrent(nav)) $('#externalTaxonReferencesStatus').textContent=err.message;
    }
  }

  function row(label,value) {
    const wrap=document.createElement('div');
    wrap.className='etr-row';
    wrap.append(text('strong',label),text('span',display(value)));
    return wrap;
  }

  function renderReferenceDetail(item,nav) {
    if(!isNavigationCurrent(nav)) return;
    showView('externalTaxonReferenceDetailView',nav);
    const root=$('#externalTaxonReferenceDetail');
    root.innerHTML='';
    const identity=document.createElement('div');
    identity.className='identity etr-identity';
    const head=document.createElement('div');
    head.append(text('p','EXTERNAL TAXON REFERENCE','eyebrow'),text('h1',item.external_id),text('p',`ID: ${item.external_taxon_reference_id}`,'resource-id'));
    identity.append(head);
    root.append(identity);

    const warning=document.createElement('section');
    warning.className='section entity-block etr-warning-block';
    warning.append(text('strong','REFERENCIA EXTERNA ≠ IDENTIDAD TAXONÓMICA VALIDADA'),text('p','ESTE REGISTRO STAGING NO CONSTITUYE VALIDACIÓN CIENTÍFICA','muted'));
    root.append(warning);

    const fields=document.createElement('section');
    fields.className='section entity-block etr-grid';
    fields.append(
      text('h2','DETALLE'),
      row('TAXÓN',`${item.concept_label} · ${item.taxon_code}`),
      row('FUENTE',`${item.source_name} · ${item.source_code}`),
      row('IDENTIFICADOR EXTERNO',item.external_id),
      row('URL',item.external_url),
      row('TIPO DE COINCIDENCIA',item.match_type),
      row('CONFIANZA',item.confidence),
      row('BACKBONE SNAPSHOT',item.backbone_snapshot_id),
      row('NOMBRE TAXONÓMICO',item.taxonomic_name_id),
      row('ESTADO DE REVISIÓN',item.validation_status),
      row('NOTAS',item.notes)
    );
    root.append(fields);

    const trace=document.createElement('section');
    trace.className='section entity-block';
    trace.append(text('h2','TRAZA'),text('p',`${item.concept_label} → ${item.external_id} → ${item.source_name}`),text('p','External identifier ≠ Identification · reference ≠ Assertion · import ≠ validation.','muted'));
    const taxonBtn=text('button','Volver al TaxonConcept','secondary');
    taxonBtn.type='button';
    taxonBtn.onclick=() => { const t=beginNavigation(); showView('detailView',t); };
    trace.append(taxonBtn);
    root.append(trace);
  }

  async function openReferenceDetail(id,token) {
    const nav=navToken(token);
    try {
      const item=await api(`/external-taxonomy-references/${id}`);
      if(!isNavigationCurrent(nav)) return;
      renderReferenceDetail(item,nav);
    } catch(err) {
      if(isNavigationCurrent(nav)) alert(err.message);
    }
  }

  $('#createExternalTaxonReferenceBtn').onclick=createReference;
  $('#backExternalTaxonRefsToTaxonBtn').onclick=() => { const nav=beginNavigation(); showView('detailView',nav); };
  $('#backExternalTaxonReferenceListBtn').onclick=() => openReferenceList();

  window.mvp15OpenExternalTaxonReferences=openReferenceList;
  window.mvp15OpenExternalTaxonReferenceDetail=openReferenceDetail;
})();
