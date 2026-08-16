const $ = (s) => document.querySelector(s);
const state = {
  current: null,
  currentPopulation: null,
  ranks: [],
  locations: [],
  returnToPopulationDialog: false,
};

async function api(path, options={}) {
  const res = await fetch(path, { headers:{'Content-Type':'application/json'}, ...options });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
function escText(el, text){ el.textContent = text ?? '—'; return el; }
function status(el,msg,error=false){ el.textContent=msg||''; el.classList.toggle('error',error); }
function hideViews(){ for(const id of ['searchView','detailView','populationsView','populationDetailView']) $(`#${id}`).classList.add('hidden'); }
function sectionTitle(text){ const h=document.createElement('h2'); h.textContent=text; return h; }
function metaLine(items){ const m=document.createElement('div');m.className='meta';m.textContent=items.filter(Boolean).join(' · ');return m; }

async function loadRanks(){
  state.ranks = await api('/api/ranks');
  const select = $('#rankTermKey');
  select.innerHTML='<option value="">Sin especificar</option>';
  for(const r of state.ranks){ const o=document.createElement('option'); o.value=r.term_key; o.textContent=r.label; select.append(o); }
}

function renderResults(rows){
  const box=$('#results'); box.innerHTML='';
  if(!rows.length){ status($('#searchStatus'),'Sin resultados.'); return; }
  status($('#searchStatus'),`${rows.length} resultado${rows.length===1?'':'s'}.`);
  for(const row of rows){
    const card=document.createElement('article'); card.className='result-card'; card.tabIndex=0;
    const h=document.createElement('h3'); escText(h,row.scientific_name); card.append(h);
    const meta=document.createElement('div'); meta.className='meta';
    for(const text of [row.concept_code,row.rank_label,row.usage_role]){ if(text){ const s=document.createElement('span'); escText(s,text); meta.append(s); } }
    card.append(meta);
    card.addEventListener('click',()=>openDetail(row.concept_id));
    card.addEventListener('keydown',e=>{if(e.key==='Enter')openDetail(row.concept_id)});
    box.append(card);
  }
}

async function search(){
  const q=$('#searchInput').value.trim(); if(q.length<2){status($('#searchStatus'),'Escribe al menos 2 caracteres.',true);return;}
  status($('#searchStatus'),'Buscando…');
  try{ renderResults(await api(`/api/taxa?q=${encodeURIComponent(q)}`)); }catch(e){status($('#searchStatus'),e.message,true)}
}

function countCard(value,label,onClick){
  const d=document.createElement(onClick?'button':'div');
  d.className=`count-card${onClick?' count-button':''}`;
  if(onClick){ d.type='button'; d.addEventListener('click',onClick); d.setAttribute('aria-label',`${label}: ${value??0}`); }
  const s=document.createElement('strong');s.textContent=value??0;
  const l=document.createElement('span');l.textContent=label;
  d.append(s,l);return d;
}

async function openDetail(id){
  try{
    const d=await api(`/api/taxa/${id}`); state.current=d;
    hideViews(); $('#detailView').classList.remove('hidden');
    const root=$('#detail');root.innerHTML='';
    const identity=document.createElement('div');identity.className='identity';
    const left=document.createElement('div');const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=d.concept_code||'TaxonConcept';
    const h=document.createElement('h1');h.textContent=d.names[0]?.scientific_name||d.concept_label||'Taxón';
    const p=document.createElement('p');p.className='muted';p.textContent=d.names[0]?.authorship?`Autoría: ${d.names[0].authorship}`:'Autoría no registrada';
    const idp=document.createElement('p');idp.className='resource-id';idp.textContent=`ID: ${d.concept_id}`;
    left.append(eyebrow,h,p,idp);
    const edit=document.createElement('button');edit.className='primary';edit.textContent='Editar';edit.addEventListener('click',()=>openEdit());identity.append(left,edit);root.append(identity);
    const chips=document.createElement('div');chips.className='chips'; for(const text of [d.rank_label,d.resolution_status,d.concept_validation_status]){if(text){const c=document.createElement('span');c.className='chip';c.textContent=text;chips.append(c)}} root.append(chips);

    const tax=document.createElement('section');tax.className='section';tax.append(sectionTitle('Taxonomía'));const names=document.createElement('div');names.className='names';
    for(const n of d.names){const card=document.createElement('div');card.className='name-card';const strong=document.createElement('strong');strong.textContent=n.scientific_name;const m=metaLine([n.name_code,n.rank_label,n.usage_role,n.name_validation_status]);const note=document.createElement('p');note.className='muted';note.textContent=n.name_notes||'Sin notas del nombre';card.append(strong,m,note);names.append(card)}
    tax.append(names);const conceptMeta=document.createElement('p');conceptMeta.className='muted';conceptMeta.textContent=`Etiqueta del concepto: ${d.concept_label||'—'} · Notas: ${d.concept_notes||'Sin notas'}`;tax.append(conceptMeta);root.append(tax);

    const info=document.createElement('section');info.className='section';info.append(sectionTitle('Información relacionada'));const counts=document.createElement('div');counts.className='counts';
    counts.append(
      countCard(d.counts.populations,'Poblaciones',()=>openPopulations()),
      countCard(d.counts.prospections_visits,'Prospecciones / visitas'),
      countCard(d.counts.samples,'Muestras'),
      countCard(d.counts.accessions,'Accesiones'),
      countCard(d.counts.bibliography,'Bibliografía'),
      countCard(d.counts.assets_documents,'Activos / documentos')
    );
    info.append(counts);root.append(info);
  }catch(e){alert(e.message)}
}

async function openPopulations(){
  if(!state.current) return;
  hideViews(); $('#populationsView').classList.remove('hidden');
  status($('#populationsStatus'),'Cargando…');
  try{
    const data=await api(`/api/taxa/${state.current.concept_id}/populations`);
    $('#populationTaxonTitle').textContent=data.taxon.scientific_name||data.taxon.concept_label||'Poblaciones';
    const box=$('#populationList');box.innerHTML='';
    if(!data.populations.length){
      status($('#populationsStatus'),'No hay poblaciones asociadas todavía.');
      return;
    }
    status($('#populationsStatus'),`${data.populations.length} población${data.populations.length===1?'':'es'} asociada${data.populations.length===1?'':'s'}.`);
    for(const row of data.populations){
      const card=document.createElement('article');card.className='result-card';card.tabIndex=0;
      const h=document.createElement('h3');h.textContent=row.population_label||row.population_code||'Población';
      card.append(h,metaLine([row.population_code,row.resolution_status,row.identification_resolution_status]));
      const loc=document.createElement('p');loc.className='muted';loc.textContent=row.location_labels||'Sin localización asociada';card.append(loc);
      card.addEventListener('click',()=>openPopulationDetail(row.population_id));
      card.addEventListener('keydown',e=>{if(e.key==='Enter')openPopulationDetail(row.population_id)});
      box.append(card);
    }
  }catch(e){status($('#populationsStatus'),e.message,true)}
}

async function loadLocations(selectedId=''){
  state.locations=await api('/api/locations');
  const select=$('#populationLocationId');
  select.innerHTML='<option value="">Selecciona una localización</option>';
  for(const l of state.locations){
    const option=document.createElement('option');option.value=l.location_id;option.textContent=l.location_name||l.location_code||l.location_id;select.append(option);
  }
  if(selectedId) select.value=selectedId;
}

async function openNewPopulation(){
  if(!state.current) return;
  $('#populationForm').reset();status($('#populationFormStatus'),'');
  try{ await loadLocations(); $('#populationDialog').showModal(); }catch(e){status($('#populationsStatus'),e.message,true)}
}

function renderPopulationDetail(d){
  state.currentPopulation=d;
  hideViews();$('#populationDetailView').classList.remove('hidden');
  const root=$('#populationDetail');root.innerHTML='';

  const identity=document.createElement('div');identity.className='identity';
  const left=document.createElement('div');const eye=document.createElement('p');eye.className='eyebrow';eye.textContent='POBLACIÓN';
  const h=document.createElement('h1');h.textContent=d.population_label||d.population_code||'Población';
  const idp=document.createElement('p');idp.className='resource-id';idp.textContent=`ID: ${d.population_id}`;
  left.append(eye,h,idp);
  const edit=document.createElement('button');edit.className='primary';edit.textContent='Editar población';edit.addEventListener('click',openPopulationEdit);
  identity.append(left,edit);root.append(identity);

  const pop=document.createElement('section');pop.className='section entity-block';pop.append(sectionTitle('POBLACIÓN'));
  pop.append(metaLine([d.population_code,d.resolution_status,d.validation_status]));
  const pn=document.createElement('p');pn.className='muted';pn.textContent=d.notes||'Sin notas';pop.append(pn);root.append(pop);

  const det=document.createElement('section');det.className='section entity-block';det.append(sectionTitle('DETERMINACIÓN TAXONÓMICA'));
  if(!d.identifications.length){
    const p=document.createElement('p');p.className='muted';p.textContent='Sin identificación taxonómica asociada';det.append(p);
  } else {
    for(const i of d.identifications){
      const card=document.createElement('div');card.className='name-card';
      const strong=document.createElement('strong');strong.textContent=i.scientific_name||i.concept_label||'TaxonConcept';
      const m=metaLine([i.identification_code,i.identification_resolution_status,i.is_preferred?'preferida':null]);
      const p=document.createElement('p');p.className='muted';p.textContent='Identification ≠ validación taxonómica';card.append(strong,m,p);det.append(card);
    }
  }
  root.append(det);

  const locations=document.createElement('section');locations.className='section entity-block';locations.append(sectionTitle('LOCALIZACIÓN'));
  if(!d.locations.length){
    const p=document.createElement('p');p.className='muted';p.textContent='Sin localización asociada';locations.append(p);
  } else {
    for(const l of d.locations){
      const card=document.createElement('div');card.className='location-card';
      const head=document.createElement('div');head.className='card-head';
      const title=document.createElement('strong');title.textContent=l.location_name||l.location_code||'Localización';
      const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='Editar localización';btn.addEventListener('click',()=>openLocationEdit(l));
      head.append(title,btn);
      const m=metaLine([l.location_code,l.location_kind,l.location_resolution_status,l.location_validation_status]);
      const literal=document.createElement('p');literal.textContent=l.verbatim_locality||'Localidad literal no registrada';
      const note=document.createElement('p');note.className='muted';note.textContent=l.location_notes||'Sin notas';
      card.append(head,m,literal,note);locations.append(card);
    }
  }
  root.append(locations);
}

async function openPopulationDetail(id){
  try{ renderPopulationDetail(await api(`/api/populations/${id}`)); }catch(e){alert(e.message)}
}

function openPopulationEdit(){
  const d=state.currentPopulation;if(!d)return;
  $('#populationEditLabel').value=d.population_label||'';
  $('#populationEditNotes').value=d.notes||'';
  status($('#populationEditStatus'),'');
  $('#populationEditDialog').showModal();
}

async function savePopulationEdit(e){
  e.preventDefault();if(!state.currentPopulation)return;
  status($('#populationEditStatus'),'Guardando…');
  try{
    const updated=await api(`/api/populations/${state.currentPopulation.population_id}`,{
      method:'PATCH',
      body:JSON.stringify({populationLabel:$('#populationEditLabel').value,notes:$('#populationEditNotes').value}),
    });
    $('#populationEditDialog').close();renderPopulationDetail(updated);
  }catch(err){status($('#populationEditStatus'),err.message,true)}
}

async function savePopulation(e){
  e.preventDefault();if(!state.current)return;
  status($('#populationFormStatus'),'Guardando…');
  try{
    await api(`/api/taxa/${state.current.concept_id}/populations`,{
      method:'POST',
      body:JSON.stringify({
        populationLabel:$('#populationLabel').value,
        locationId:$('#populationLocationId').value,
        notes:$('#populationNotes').value,
      }),
    });
    $('#populationDialog').close();await openPopulations();
  }catch(err){status($('#populationFormStatus'),err.message,true)}
}

function resetLocationDialog(){
  $('#locationForm').reset();$('#editLocationId').value='';status($('#locationFormStatus'),'');
}

function openLocationCreate(){
  resetLocationDialog();state.returnToPopulationDialog=true;
  $('#locationDialogTitle').textContent='Nueva localización';
  $('#populationDialog').close();
  $('#locationDialog').showModal();
}

function openLocationEdit(location){
  resetLocationDialog();state.returnToPopulationDialog=false;
  $('#locationDialogTitle').textContent='Editar localización';
  $('#editLocationId').value=location.location_id;
  $('#locationName').value=location.location_name||'';
  $('#verbatimLocality').value=location.verbatim_locality||'';
  $('#locationKind').value=location.location_kind||'';
  $('#locationNotes').value=location.location_notes||'';
  $('#locationDialog').showModal();
}

async function saveLocation(e){
  e.preventDefault();
  const id=$('#editLocationId').value;status($('#locationFormStatus'),'Guardando…');
  const payload={
    locationName:$('#locationName').value,
    verbatimLocality:$('#verbatimLocality').value,
    locationKind:$('#locationKind').value,
    notes:$('#locationNotes').value,
  };
  try{
    if(id){
      await api(`/api/locations/${id}`,{method:'PATCH',body:JSON.stringify(payload)});
      $('#locationDialog').close();
      if(state.currentPopulation) await openPopulationDetail(state.currentPopulation.population_id);
      return;
    }
    const created=await api('/api/locations',{method:'POST',body:JSON.stringify(payload)});
    $('#locationDialog').close();
    if(state.returnToPopulationDialog){
      state.returnToPopulationDialog=false;
      await loadLocations(created.location_id);
      $('#populationDialog').showModal();
    }
  }catch(err){status($('#locationFormStatus'),err.message,true)}
}

function resetDialog(){ $('#taxonForm').reset(); $('#editConceptId').value='';status($('#formStatus'),''); }
function setMode(editing){
  document.querySelectorAll('.create-only').forEach(el=>el.classList.toggle('hidden',editing));
  document.querySelectorAll('.edit-only').forEach(el=>el.classList.toggle('hidden',!editing));
  $('#scientificName').disabled=editing;$('#canonicalName').disabled=editing;$('#authorship').disabled=editing;$('#rankTermKey').disabled=editing;
  $('#dialogTitle').textContent=editing?'Editar taxón':'Nuevo taxón';
}
function openCreate(){resetDialog();setMode(false);$('#taxonDialog').showModal();}
function openEdit(){
  if(!state.current)return;resetDialog();setMode(true);const n=state.current.names[0]||{};$('#editConceptId').value=state.current.concept_id;$('#scientificName').value=n.scientific_name||'';$('#canonicalName').value=n.canonical_name||'';$('#authorship').value=n.authorship||'';$('#rankTermKey').value=n.rank_term_key||'';$('#conceptLabel').value=state.current.concept_label||'';$('#nameNotes').value=n.name_notes||'';$('#conceptNotes').value=state.current.concept_notes||'';$('#taxonDialog').showModal();
}
async function saveForm(e){
  e.preventDefault(); status($('#formStatus'),'Guardando…'); const id=$('#editConceptId').value;
  try{
    if(id){
      await api(`/api/taxa/${id}`,{method:'PATCH',body:JSON.stringify({conceptLabel:$('#conceptLabel').value,nameNotes:$('#nameNotes').value,conceptNotes:$('#conceptNotes').value})});
      $('#taxonDialog').close();await openDetail(id);
    }else{
      const created=await api('/api/taxa',{method:'POST',body:JSON.stringify({scientificName:$('#scientificName').value,canonicalName:$('#canonicalName').value,authorship:$('#authorship').value,rankTermKey:$('#rankTermKey').value,genus:$('#genus').value,specificEpithet:$('#specificEpithet').value})});
      $('#taxonDialog').close();$('#searchInput').value=created.names[0]?.canonical_name||created.concept_label;await search();
    }
  }catch(err){status($('#formStatus'),err.message,true)}
}

$('#searchForm').addEventListener('submit',e=>{e.preventDefault();search()});
$('#newTaxonBtn').addEventListener('click',openCreate);
$('#backBtn').addEventListener('click',()=>{hideViews();$('#searchView').classList.remove('hidden')});
$('#taxonForm').addEventListener('submit',saveForm);
$('#closeDialogBtn').addEventListener('click',()=>$('#taxonDialog').close());
$('#cancelDialogBtn').addEventListener('click',()=>$('#taxonDialog').close());

$('#backToTaxonBtn').addEventListener('click',()=>state.current&&openDetail(state.current.concept_id));
$('#newPopulationBtn').addEventListener('click',openNewPopulation);
$('#populationForm').addEventListener('submit',savePopulation);
$('#closePopulationDialogBtn').addEventListener('click',()=>$('#populationDialog').close());
$('#cancelPopulationDialogBtn').addEventListener('click',()=>$('#populationDialog').close());
$('#createLocationForPopulationBtn').addEventListener('click',openLocationCreate);

$('#backToPopulationsBtn').addEventListener('click',openPopulations);
$('#populationEditForm').addEventListener('submit',savePopulationEdit);
$('#closePopulationEditDialogBtn').addEventListener('click',()=>$('#populationEditDialog').close());
$('#cancelPopulationEditBtn').addEventListener('click',()=>$('#populationEditDialog').close());

$('#locationForm').addEventListener('submit',saveLocation);
$('#closeLocationDialogBtn').addEventListener('click',()=>$('#locationDialog').close());
$('#cancelLocationDialogBtn').addEventListener('click',()=>$('#locationDialog').close());

loadRanks().catch(e=>status($('#searchStatus'),e.message,true));
