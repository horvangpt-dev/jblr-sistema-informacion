const $ = (s) => document.querySelector(s);
const state = { current: null, ranks: [] };

async function api(path, options={}) {
  const res = await fetch(path, { headers:{'Content-Type':'application/json'}, ...options });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
function escText(el, text){ el.textContent = text ?? '—'; return el; }
function status(el,msg,error=false){ el.textContent=msg||''; el.classList.toggle('error',error); }

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

function sectionTitle(text){ const h=document.createElement('h2'); h.textContent=text; return h; }
function countCard(value,label){ const d=document.createElement('div');d.className='count-card';const s=document.createElement('strong');s.textContent=value??0;const l=document.createElement('span');l.textContent=label;d.append(s,l);return d; }

async function openDetail(id){
  try{
    const d=await api(`/api/taxa/${id}`); state.current=d;
    $('#searchView').classList.add('hidden'); $('#detailView').classList.remove('hidden');
    const root=$('#detail');root.innerHTML='';
    const identity=document.createElement('div');identity.className='identity';
    const left=document.createElement('div');const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=d.concept_code||'TaxonConcept';
    const h=document.createElement('h1');h.textContent=d.names[0]?.scientific_name||d.concept_label||'Taxón'; const p=document.createElement('p');p.className='muted';p.textContent=d.names[0]?.authorship?`Autoría: ${d.names[0].authorship}`:'Autoría no registrada'; const idp=document.createElement('p');idp.className='resource-id';idp.textContent=`ID: ${d.concept_id}`;left.append(eyebrow,h,p,idp);
    const edit=document.createElement('button');edit.className='primary';edit.textContent='Editar';edit.addEventListener('click',()=>openEdit());identity.append(left,edit);root.append(identity);
    const chips=document.createElement('div');chips.className='chips'; for(const text of [d.rank_label,d.resolution_status,d.concept_validation_status]){if(text){const c=document.createElement('span');c.className='chip';c.textContent=text;chips.append(c)}} root.append(chips);

    const tax=document.createElement('section');tax.className='section';tax.append(sectionTitle('Taxonomía'));const names=document.createElement('div');names.className='names';
    for(const n of d.names){const card=document.createElement('div');card.className='name-card';const strong=document.createElement('strong');strong.textContent=n.scientific_name;const m=document.createElement('div');m.className='meta';m.textContent=[n.name_code,n.rank_label,n.usage_role,n.name_validation_status].filter(Boolean).join(' · ');const note=document.createElement('p');note.className='muted';note.textContent=n.name_notes||'Sin notas del nombre';card.append(strong,m,note);names.append(card)} tax.append(names);const conceptMeta=document.createElement('p');conceptMeta.className='muted';conceptMeta.textContent=`Etiqueta del concepto: ${d.concept_label||'—'} · Notas: ${d.concept_notes||'Sin notas'}`;tax.append(conceptMeta);root.append(tax);

    const info=document.createElement('section');info.className='section';info.append(sectionTitle('Información relacionada'));const counts=document.createElement('div');counts.className='counts';
    counts.append(countCard(d.counts.populations,'Poblaciones'),countCard(d.counts.prospections_visits,'Prospecciones / visitas'),countCard(d.counts.samples,'Muestras'),countCard(d.counts.accessions,'Accesiones'),countCard(d.counts.bibliography,'Bibliografía'),countCard(d.counts.assets_documents,'Activos / documentos')); info.append(counts);root.append(info);
  }catch(e){alert(e.message)}
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

$('#searchForm').addEventListener('submit',e=>{e.preventDefault();search()});$('#newTaxonBtn').addEventListener('click',openCreate);$('#backBtn').addEventListener('click',()=>{$('#detailView').classList.add('hidden');$('#searchView').classList.remove('hidden')});$('#taxonForm').addEventListener('submit',saveForm);$('#closeDialogBtn').addEventListener('click',()=>$('#taxonDialog').close());$('#cancelDialogBtn').addEventListener('click',()=>$('#taxonDialog').close());
loadRanks().catch(e=>status($('#searchStatus'),e.message,true));
