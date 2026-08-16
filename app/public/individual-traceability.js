(() => {
  state.currentIndividual = null;
  state.individualReturn = 'population';

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="populationIndividualsView" class="panel hidden">
      <button class="link-button" id="backIndividualsToPopulationBtn">← Volver a población</button>
      <div class="identity compact"><div><p class="eyebrow">INDIVIDUOS</p><h1 id="individualsPopulationTitle">Individuos</h1><p class="muted">Individual ≠ Population. El taxón se deriva de la Identification existente de la Population.</p></div><button class="primary" id="newIndividualBtn">Crear / reutilizar Individual</button></div>
      <div id="individualsStatus" class="status"></div>
      <div id="individualList" class="results"></div>
    </section>
    <section id="individualDetailView" class="panel hidden"><button class="link-button" id="backFromIndividualBtn">← Volver</button><div id="individualDetail"></div></section>
    <section id="collectionIndividualsView" class="panel hidden">
      <button class="link-button" id="backCollectionIndividualsBtn">← Volver a recolección</button>
      <div class="identity compact"><div><p class="eyebrow">INDIVIDUOS / MADRES</p><h1 id="collectionIndividualsTitle">Individuos de recolección</h1><p class="muted">CollectionIndividual vincula el evento con un Individual; no convierte al Individual en Sample.</p></div></div>
      <div class="section entity-block"><h2>VINCULAR INDIVIDUO EXISTENTE</h2><div class="grid-2"><label>Individual<select id="collectionIndividualSelect"></select></label><label>Rol<input id="collectionIndividualRole" value="mother_plant" readonly></label></div><button class="primary" id="linkCollectionIndividualBtn">Añadir / reutilizar vínculo</button><div id="collectionIndividualsStatus" class="status"></div></div>
      <section class="section entity-block"><h2>INDIVIDUOS VINCULADOS</h2><div id="collectionIndividualList" class="results"></div></section>
    </section>
  `);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="individualCreateDialog"><form id="individualCreateForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Crear / reutilizar Individual</h2><button type="button" class="icon-button" id="closeIndividualCreateBtn">×</button></div><label>Etiqueta<input id="individualLabel" required maxlength="300" value="JBLR STAGING · Madre demo MVP8"></label><label>Notas<textarea id="individualNotes" rows="3" maxlength="1000">madre demo MVP8; no representa una planta real</textarea></label><p class="hint">STAGING / DEMO / NO VALIDADO. No introducir códigos, plantas ni personas reales.</p><div id="individualCreateStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelIndividualCreateBtn">Cancelar</button><button type="submit" class="primary">Crear / reutilizar</button></div></form></dialog>
    <dialog id="individualEditDialog"><form id="individualEditForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Editar Individual</h2><button type="button" class="icon-button" id="closeIndividualEditBtn">×</button></div><label>Etiqueta<input id="individualEditLabel" required maxlength="300"></label><label>Notas<textarea id="individualEditNotes" rows="3" maxlength="1000"></textarea></label><div id="individualEditStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelIndividualEditBtn">Cancelar</button><button type="submit" class="primary">Guardar cambios</button></div></form></dialog>
  `);

  const oldHide = hideViews;
  hideViews = () => { oldHide(); ['populationIndividualsView','individualDetailView','collectionIndividualsView'].forEach(id => $(`#${id}`).classList.add('hidden')); };
  const txt=(tag,value,cls='')=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value??'—';return e;};
  const card=(title,meta,detail,onClick,cls='')=>{const c=document.createElement('article');c.className=`result-card ${cls}`;c.tabIndex=0;c.append(txt('h3',title),metaLine(meta));if(detail)c.append(txt('p',detail,'muted'));c.onclick=onClick;c.onkeydown=e=>{if(e.key==='Enter')onClick()};return c;};
  const strip=v=>String(v||'').replace(/^STAGING DEMO · MVP_PRODUCTIVO_8 · NO VALIDADO · /,'');
  async function mapi(path,options={}){const r=await fetch(`/mvp8-api${path}`,{headers:{'Content-Type':'application/json'},...options});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
  function showExisting(id){hideViews();$(`#${id}`).classList.remove('hidden');}

  const previousRenderPopulation = renderPopulationDetail;
  renderPopulationDetail = d => {
    previousRenderPopulation(d);
    const identity=$('#populationDetail .identity');if(!identity||$('#openIndividualsBtn'))return;
    let actions=identity.querySelector('.entity-actions');
    if(!actions){actions=document.createElement('div');actions.className='entity-actions';[...identity.querySelectorAll(':scope > button')].forEach(b=>{b.remove();actions.append(b)});identity.append(actions);}
    const b=document.createElement('button');b.type='button';b.id='openIndividualsBtn';b.className='secondary';b.textContent='INDIVIDUOS';b.onclick=openPopulationIndividuals;actions.prepend(b);
  };

  async function openPopulationIndividuals(){
    if(!state.currentPopulation)return;
    hideViews();$('#populationIndividualsView').classList.remove('hidden');status($('#individualsStatus'),'Cargando…');
    try{
      const d=await mapi(`/populations/${state.currentPopulation.population_id}/individuals`);
      $('#individualsPopulationTitle').textContent=`Individuos · ${d.population.population_label||d.population.population_code}`;
      const list=$('#individualList');list.innerHTML='';d.individuals.forEach(x=>list.append(card(x.individual_label,[x.individual_code,x.validation_status,`${x.revision_count} revisión${x.revision_count===1?'':'es'}`],`Taxón: ${d.population.scientific_name}`,()=>openIndividual(x.individual_id,'population'),'individual-card')));
      if(!d.individuals.length)list.append(txt('p','No hay Individuals registrados todavía.','muted'));
      status($('#individualsStatus'),`${d.individuals.length} Individual · Population ${d.population.population_code} · ${d.population.scientific_name}.`);
    }catch(e){status($('#individualsStatus'),e.message,true)}
  }
  async function createIndividual(e){e.preventDefault();status($('#individualCreateStatus'),'Guardando…');try{await mapi(`/populations/${state.currentPopulation.population_id}/individuals`,{method:'POST',body:JSON.stringify({individualLabel:$('#individualLabel').value,notes:$('#individualNotes').value})});$('#individualCreateDialog').close();await openPopulationIndividuals();}catch(x){status($('#individualCreateStatus'),x.message,true)}}
  async function openIndividual(id,source='population'){
    try{
      const d=await mapi(`/individuals/${id}`);state.currentIndividual=d;state.individualReturn=source;hideViews();$('#individualDetailView').classList.remove('hidden');
      const r=$('#individualDetail');r.innerHTML='';const identity=document.createElement('div');identity.className='identity';const left=document.createElement('div');left.append(txt('p','INDIVIDUAL','eyebrow'),txt('h1',d.individual_label),txt('p',`ID: ${d.individual_id}`,'resource-id'));const edit=txt('button','Editar Individual','primary');edit.type='button';edit.onclick=openIndividualEdit;identity.append(left,edit);r.append(identity);
      const ind=document.createElement('section');ind.className='section entity-block';ind.append(sectionTitle('INDIVIDUAL'),metaLine([d.individual_code,d.validation_status,d.first_seen_at?new Date(d.first_seen_at).toLocaleString('es-ES'):'first_seen no registrado']),txt('p',strip(d.notes)||'Sin notas','muted'));r.append(ind);
      const pop=document.createElement('section');pop.className='section entity-block';pop.append(sectionTitle('POBLACIÓN / TAXÓN'),txt('strong',d.population_label||d.population_code),metaLine([d.population_code]),txt('p',d.scientific_name),txt('p','Taxón derivado de la Identification de Population; no es una validación independiente del Individual.','muted'));r.append(pop);
      const tr=document.createElement('section');tr.className='section entity-block';tr.append(sectionTitle('TRAZABILIDAD'),txt('p',`${d.collection_link_count} CollectionIndividual · ${d.sample_origin_count} SampleOrigin`));r.append(tr);
    }catch(e){alert(e.message)}
  }
  function openIndividualEdit(){const d=state.currentIndividual;if(!d)return;$('#individualEditLabel').value=d.individual_label||'';$('#individualEditNotes').value=strip(d.notes);status($('#individualEditStatus'),'');$('#individualEditDialog').showModal();}
  async function saveIndividualEdit(e){e.preventDefault();try{const d=await mapi(`/individuals/${state.currentIndividual.individual_id}`,{method:'PATCH',body:JSON.stringify({individualLabel:$('#individualEditLabel').value,notes:$('#individualEditNotes').value})});$('#individualEditDialog').close();state.currentIndividual=d;await openIndividual(d.individual_id,state.individualReturn);}catch(x){status($('#individualEditStatus'),x.message,true)}}
  function backFromIndividual(){if(state.individualReturn==='collection')showExisting('collectionIndividualsView');else if(state.individualReturn==='sample')showExisting('sampleDetailView');else openPopulationDetail(state.currentPopulation.population_id);}

  async function openCollectionIndividuals(){
    if(!state.currentCollectionEvent)return;
    hideViews();$('#collectionIndividualsView').classList.remove('hidden');status($('#collectionIndividualsStatus'),'Cargando…');
    try{
      const d=await mapi(`/collection-events/${state.currentCollectionEvent.collection_event_id}/individuals`);$('#collectionIndividualsTitle').textContent=`Individuos / Madres · ${d.event.collection_event_code}`;
      const sel=$('#collectionIndividualSelect');sel.innerHTML='';d.availableIndividuals.forEach(x=>{const o=document.createElement('option');o.value=x.individual_id;o.textContent=`${x.individual_label} · ${x.individual_code}`;sel.append(o)});$('#linkCollectionIndividualBtn').disabled=!d.availableIndividuals.length;
      const list=$('#collectionIndividualList');list.innerHTML='';d.individuals.forEach(x=>list.append(card(x.individual_label,[x.individual_code,x.role_code,`secuencia ${x.sequence_no}`],d.event.scientific_name,()=>openIndividual(x.individual_id,'collection'),'collection-individual-card')));if(!d.individuals.length)list.append(txt('p','Sin Individuals vinculados al CollectionEvent.','muted'));
      status($('#collectionIndividualsStatus'),`${d.individuals.length} vínculo · Population ${d.event.population_code} · ${d.event.scientific_name}.`);
    }catch(e){status($('#collectionIndividualsStatus'),e.message,true)}
  }
  async function linkCollectionIndividual(){try{await mapi(`/collection-events/${state.currentCollectionEvent.collection_event_id}/individuals`,{method:'POST',body:JSON.stringify({individualId:$('#collectionIndividualSelect').value,roleCode:'mother_plant'})});await openCollectionIndividuals();}catch(e){status($('#collectionIndividualsStatus'),e.message,true)}}

  function ensureCollectionSection(){
    const root=$('#collectionEventDetail');if(!root||!state.currentCollectionEvent||root.children.length===0||$('#mvp8CollectionIndividualsSection'))return;
    const s=document.createElement('section');s.id='mvp8CollectionIndividualsSection';s.className='section entity-block';s.append(sectionTitle('INDIVIDUOS / MADRES'),txt('p','Vínculos explícitos mediante CollectionIndividual. mother_plant es un rol sintético STAGING, no una afirmación sobre una planta real.','muted'));const b=txt('button','Gestionar individuos / madres','secondary');b.type='button';b.onclick=openCollectionIndividuals;s.append(b);root.append(s);
  }
  new MutationObserver(ensureCollectionSection).observe($('#collectionEventDetail'),{childList:true,subtree:true});

  async function renderSampleTraceSection(section){
    const d=await mapi(`/samples/${state.currentSample.sample_id}/origin-trace`);section.innerHTML='';section.append(sectionTitle('PROCEDENCIA / INDIVIDUO'));
    if(d.origins.length!==1){section.append(txt('p',`SampleOrigin: ${d.origins.length}; MVP8 requiere una procedencia única para esta muestra.`,'muted'));return;}
    const o=d.origins[0];section.append(metaLine([o.collection_event_code,o.origin_role,o.individual_code||'Individual no asociado']),txt('p',`CollectionEvent: ${o.collection_event_code||'—'}`),txt('p',`Population: ${o.population_label||o.population_code||'—'}`),txt('p',`Taxón: ${o.scientific_name||'Taxón no determinado'}`));
    if(o.individual_id){const open=txt('button',`Abrir Individual · ${o.individual_label}`,'secondary');open.type='button';open.onclick=()=>openIndividual(o.individual_id,'sample');section.append(open,txt('p','SampleOrigin conserva simultáneamente CollectionEvent + Individual.','muted'));}
    else {const row=document.createElement('div');row.className='mvp8-origin-link';const sel=document.createElement('select');sel.id='sampleOriginIndividualSelect';d.availableIndividuals.forEach(x=>{const op=document.createElement('option');op.value=x.individual_id;op.textContent=`${x.individual_label} · ${x.individual_code}`;sel.append(op)});const b=txt('button','Asociar / reutilizar Individual','primary');b.type='button';b.disabled=!d.availableIndividuals.length;b.onclick=async()=>{try{await mapi(`/samples/${state.currentSample.sample_id}/origin-individual`,{method:'POST',body:JSON.stringify({individualId:sel.value})});await renderSampleTraceSection(section);}catch(e){alert(e.message)}};row.append(sel,b);section.append(row,txt('p','El vínculo Individual complementará, no sustituirá, el CollectionEvent de SampleOrigin.','muted'));}
  }
  function ensureSampleSection(){
    const root=$('#sampleDetail');if(!root||!state.currentSample||root.children.length===0||$('#mvp8SampleOriginSection'))return;
    const s=document.createElement('section');s.id='mvp8SampleOriginSection';s.className='section entity-block';s.append(sectionTitle('PROCEDENCIA / INDIVIDUO'),txt('p','Cargando trazabilidad…','muted'));root.append(s);renderSampleTraceSection(s).catch(e=>{s.append(txt('p',e.message,'status error'))});
  }
  new MutationObserver(ensureSampleSection).observe($('#sampleDetail'),{childList:true,subtree:true});

  $('#backIndividualsToPopulationBtn').onclick=()=>openPopulationDetail(state.currentPopulation.population_id);
  $('#newIndividualBtn').onclick=()=>{$('#individualCreateForm').reset();$('#individualLabel').value='JBLR STAGING · Madre demo MVP8';$('#individualNotes').value='madre demo MVP8; no representa una planta real';status($('#individualCreateStatus'),'');$('#individualCreateDialog').showModal();};
  $('#individualCreateForm').onsubmit=createIndividual;$('#closeIndividualCreateBtn').onclick=$('#cancelIndividualCreateBtn').onclick=()=>$('#individualCreateDialog').close();
  $('#individualEditForm').onsubmit=saveIndividualEdit;$('#closeIndividualEditBtn').onclick=$('#cancelIndividualEditBtn').onclick=()=>$('#individualEditDialog').close();
  $('#backFromIndividualBtn').onclick=backFromIndividual;$('#backCollectionIndividualsBtn').onclick=()=>showExisting('collectionEventDetailView');$('#linkCollectionIndividualBtn').onclick=linkCollectionIndividual;
})();
