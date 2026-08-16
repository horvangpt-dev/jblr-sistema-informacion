(() => {
  const PREFIX='STAGING DEMO · MVP_PRODUCTIVO_7 · NO VALIDADO · ';
  state.currentObservation=null;state.currentCensus=null;
  document.querySelector('main').insertAdjacentHTML('beforeend',`
    <section id="fieldMonitoringView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backMonitoringToVisitBtn">← Volver a visita de campo</button>
      <div class="identity compact monitoring-identity"><div><p class="eyebrow">OBSERVACIONES / CENSOS</p><h1 id="monitoringTitle">Seguimiento de población</h1><p class="muted">Observation ≠ Census ≠ CensusMeasurement · unknown ≠ zero.</p></div><div class="monitoring-actions"><button class="secondary" id="newObservationBtn">Crear / reutilizar Observation</button><button class="primary" id="newCensusBtn">Crear / reutilizar Census</button></div></div>
      <div id="monitoringContext" class="section entity-block"></div><div id="monitoringStatus" class="status"></div>
      <section class="section entity-block"><h2>OBSERVACIONES</h2><div id="observationList" class="results"></div></section>
      <section class="section entity-block"><h2>CENSOS</h2><div id="censusList" class="results"></div></section>
    </section>
    <section id="observationDetailView" class="panel hidden"><button class="link-button" id="backObservationToMonitoringBtn">← Volver a observaciones / censos</button><div id="observationDetail"></div></section>
    <section id="censusDetailView" class="panel hidden"><button class="link-button" id="backCensusToMonitoringBtn">← Volver a observaciones / censos</button><div id="censusDetail"></div></section>
  `);
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="observationCreateDialog"><form id="observationCreateForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Crear / reutilizar Observation sintética</h2><button type="button" class="icon-button" id="closeObservationCreateBtn">×</button></div><label>Observación<textarea id="observationVerbatim" required rows="4" maxlength="1200"></textarea></label><label>Notas<textarea id="observationNotes" rows="3" maxlength="1200"></textarea></label><p class="hint">Se vincula a la FieldVisit, Population y Location existentes. individual_id permanece NULL y resolution_status permanece unresolved.</p><div id="observationCreateStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelObservationCreateBtn">Cancelar</button><button type="submit" class="primary">Crear / reutilizar</button></div></form></dialog>
    <dialog id="observationEditDialog"><form id="observationEditForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Editar Observation</h2><button type="button" class="icon-button" id="closeObservationEditBtn">×</button></div><label>Observación<textarea id="observationEditVerbatim" required rows="4" maxlength="1200"></textarea></label><label>Notas<textarea id="observationEditNotes" rows="3" maxlength="1200"></textarea></label><div id="observationEditStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelObservationEditBtn">Cancelar</button><button type="submit" class="primary">Guardar cambios</button></div></form></dialog>
    <dialog id="censusCreateDialog"><form id="censusCreateForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Crear / reutilizar Census sintético</h2><button type="button" class="icon-button" id="closeCensusCreateBtn">×</button></div><label>Método<input id="censusMethod" required maxlength="1200"></label><label>Notas<textarea id="censusNotes" rows="3" maxlength="1200"></textarea></label><p class="hint">El método es exclusivamente sintético STAGING y no representa un protocolo científico real.</p><div id="censusCreateStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelCensusCreateBtn">Cancelar</button><button type="submit" class="primary">Crear / reutilizar</button></div></form></dialog>
    <dialog id="censusEditDialog"><form id="censusEditForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Editar Census</h2><button type="button" class="icon-button" id="closeCensusEditBtn">×</button></div><label>Método<input id="censusEditMethod" required maxlength="1200"></label><label>Notas<textarea id="censusEditNotes" rows="3" maxlength="1200"></textarea></label><div id="censusEditStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelCensusEditBtn">Cancelar</button><button type="submit" class="primary">Guardar cambios</button></div></form></dialog>
  `);

  const txt=(tag,value,cls='')=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value??'—';return e;};
  const strip=v=>String(v||'').startsWith(PREFIX)?String(v).slice(PREFIX.length):String(v||'');
  const fmt=v=>v?new Date(v).toLocaleString('es-ES'):'—';
  const card=(title,meta,detail,handler,cls='')=>{const e=document.createElement('article');e.className=`result-card ${cls}`.trim();e.tabIndex=0;e.append(txt('h3',title),metaLine(meta));if(detail)e.append(txt('p',detail,'muted'));e.onclick=handler;e.onkeydown=x=>{if(x.key==='Enter')handler();};return e;};
  async function mapi(path,options={}){const r=await fetch(`/mvp7-api${path}`,{headers:{'Content-Type':'application/json'},...options});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
  const navToken=t=>t===undefined?beginNavigation():t;

  function ensureMonitoringButton(){const identity=$('#fieldVisitDetail .identity');if(!identity||$('#openFieldMonitoringBtn'))return;const b=txt('button','OBSERVACIONES / CENSOS','secondary monitoring-entry-button');b.id='openFieldMonitoringBtn';b.type='button';b.onclick=()=>openMonitoring();identity.append(b);}
  new MutationObserver(ensureMonitoringButton).observe($('#fieldVisitDetail'),{childList:true,subtree:true});

  function setObservationDefaults(){$('#observationCreateForm').reset();$('#observationVerbatim').value='JBLR STAGING · observación demo MVP7';$('#observationNotes').value='observación cualitativa sintética MVP7';status($('#observationCreateStatus'),'');}
  function setCensusDefaults(){$('#censusCreateForm').reset();$('#censusMethod').value='JBLR STAGING · censo demo MVP7';$('#censusNotes').value='censo sintético MVP7; no es un protocolo científico real';status($('#censusCreateStatus'),'');}

  async function openMonitoring(token){
    if(!state.currentVisit?.field_visit_id)return;
    const nav=navToken(token); if(!isNavigationCurrent(nav))return;
    const visitId=state.currentVisit.field_visit_id;
    showView('fieldMonitoringView',nav);status($('#monitoringStatus'),'Cargando…');
    try{
      const d=await mapi(`/field-visits/${visitId}/monitoring`);if(!isNavigationCurrent(nav))return;
      const c=d.context;$('#monitoringTitle').textContent=`Observaciones / Censos · ${c.scientific_name||c.population_label||c.population_code}`;
      const ctx=$('#monitoringContext');ctx.innerHTML='';ctx.append(txt('h2','CONTEXTO DERIVADO'),metaLine([c.field_visit_code,c.population_code,c.location_code,c.identification_resolution_status]),txt('p',`Population: ${c.population_label||c.population_code}`),txt('p',`Location: ${c.location_name||c.location_code}`),txt('p',`Taxón derivado por Identification: ${c.scientific_name||'no determinado'}`),txt('p','Identification ≠ validación taxonómica.','muted'));
      const o=$('#observationList');o.innerHTML='';d.observations.forEach(x=>o.append(card(x.verbatim_observation,[x.observation_code,x.resolution_status,x.validation_status],`Population ${c.population_code} · Location ${c.location_code}`,()=>openObservation(x.observation_id),'observation-card')));if(!d.observations.length)o.append(txt('p','No hay Observations todavía.','muted'));
      const cs=$('#censusList');cs.innerHTML='';d.censuses.forEach(x=>cs.append(card(x.method_text,[x.census_code,x.validation_status,`${x.measurement_count} mediciones`],`Population ${c.population_code} · ${fmt(x.census_at)}`,()=>openCensus(x.census_id),'census-card')));if(!d.censuses.length)cs.append(txt('p','No hay Censuses todavía.','muted'));
      status($('#monitoringStatus'),`${d.observations.length} Observation · ${d.censuses.length} Census.`);
    }catch(e){if(isNavigationCurrent(nav))status($('#monitoringStatus'),e.message,true);}
  }

  async function createObservation(e){
    e.preventDefault();const nav=beginNavigation();const visitId=state.currentVisit?.field_visit_id;if(!visitId)return;
    status($('#observationCreateStatus'),'Guardando…');
    try{const d=await mapi(`/field-visits/${visitId}/observations`,{method:'POST',body:JSON.stringify({verbatimObservation:$('#observationVerbatim').value,notes:$('#observationNotes').value})});if(!isNavigationCurrent(nav))return;state.currentObservation=d;$('#observationCreateDialog').close();await openMonitoring(nav);}catch(x){if(isNavigationCurrent(nav))status($('#observationCreateStatus'),x.message,true);}
  }
  async function openObservation(id,token){
    const nav=navToken(token);
    try{const d=await mapi(`/observations/${id}`);if(!isNavigationCurrent(nav))return;state.currentObservation=d;showView('observationDetailView',nav);const r=$('#observationDetail');r.innerHTML='';const i=document.createElement('div');i.className='identity monitoring-identity';const l=document.createElement('div');l.append(txt('p','OBSERVATION','eyebrow'),txt('h1',d.verbatim_observation),txt('p',`ID: ${d.observation_id}`,'resource-id'));const e=txt('button','Editar Observation','primary');e.type='button';e.onclick=openObservationEdit;i.append(l,e);r.append(i);const s=document.createElement('section');s.className='section entity-block';s.append(txt('h2','OBSERVACIÓN CUALITATIVA'),metaLine([d.observation_code,d.resolution_status,d.validation_status,fmt(d.observed_at)]),txt('p',`FieldVisit: ${d.context.field_visit_code}`),txt('p',`Population: ${d.context.population_label||d.context.population_code}`),txt('p',`Location: ${d.context.location_name||d.context.location_code}`),txt('p',`Taxón derivado: ${d.context.scientific_name||'no determinado'}`),txt('p',`Individual: ${d.individual_id||'NULL'}`,'muted'),txt('p',strip(d.notes)||'Sin notas','muted'));r.append(s);}catch(e){if(isNavigationCurrent(nav))alert(e.message);}
  }
  function openObservationEdit(){const d=state.currentObservation;if(!d)return;$('#observationEditVerbatim').value=d.verbatim_observation||'';$('#observationEditNotes').value=strip(d.notes);status($('#observationEditStatus'),'');$('#observationEditDialog').showModal();}
  async function saveObservationEdit(e){
    e.preventDefault();const d=state.currentObservation;if(!d)return;const nav=beginNavigation();
    try{const u=await mapi(`/observations/${d.observation_id}`,{method:'PATCH',body:JSON.stringify({verbatimObservation:$('#observationEditVerbatim').value,notes:$('#observationEditNotes').value})});if(!isNavigationCurrent(nav))return;$('#observationEditDialog').close();state.currentObservation=u;await openObservation(u.observation_id,nav);}catch(x){if(isNavigationCurrent(nav))status($('#observationEditStatus'),x.message,true);}
  }

  async function createCensus(e){
    e.preventDefault();const nav=beginNavigation();const visitId=state.currentVisit?.field_visit_id;if(!visitId)return;status($('#censusCreateStatus'),'Guardando…');
    try{const d=await mapi(`/field-visits/${visitId}/censuses`,{method:'POST',body:JSON.stringify({methodText:$('#censusMethod').value,notes:$('#censusNotes').value})});if(!isNavigationCurrent(nav))return;state.currentCensus=d;$('#censusCreateDialog').close();await openMonitoring(nav);}catch(x){if(isNavigationCurrent(nav))status($('#censusCreateStatus'),x.message,true);}
  }
  async function openCensus(id,token){
    const nav=navToken(token);
    try{const d=await mapi(`/censuses/${id}`);if(!isNavigationCurrent(nav))return;state.currentCensus=d;showView('censusDetailView',nav);const r=$('#censusDetail');r.innerHTML='';const i=document.createElement('div');i.className='identity monitoring-identity';const l=document.createElement('div');l.append(txt('p','CENSUS','eyebrow'),txt('h1',d.method_text),txt('p',`ID: ${d.census_id}`,'resource-id'));const actions=document.createElement('div');actions.className='monitoring-actions';const measure=txt('button','Crear / reutilizar mediciones','secondary');measure.type='button';measure.id='ensureMeasurementsBtn';measure.onclick=ensureMeasurements;const edit=txt('button','Editar Census','primary');edit.type='button';edit.onclick=openCensusEdit;actions.append(measure,edit);i.append(l,actions);r.append(i);const s=document.createElement('section');s.className='section entity-block';s.append(txt('h2','CENSO'),metaLine([d.census_code,d.validation_status,fmt(d.census_at)]),txt('p',`FieldVisit: ${d.context.field_visit_code}`),txt('p',`Population: ${d.context.population_label||d.context.population_code}`),txt('p',`Taxón derivado: ${d.context.scientific_name||'no determinado'}`),txt('p',strip(d.notes)||'Sin notas','muted'));r.append(s);const m=document.createElement('section');m.className='section entity-block';m.append(txt('h2','CENSUS MEASUREMENTS'));d.measurements.forEach(x=>{const value=x.numeric_value==null?'NULL':String(x.numeric_value);m.append(card(x.metric_code,[x.value_status,value,x.unit_code||'sin unidad'],x.value_status==='unknown'?'unknown + NULL; nunca se transforma en 0.':'present + numeric_value conocido.',()=>{},'measurement-card'));});if(!d.measurements.length)m.append(txt('p','No hay mediciones todavía.','muted'));r.append(m);}catch(e){if(isNavigationCurrent(nav))alert(e.message);}
  }
  async function ensureMeasurements(){
    const d=state.currentCensus;if(!d)return;const nav=beginNavigation();
    try{const u=await mapi(`/censuses/${d.census_id}/measurements`,{method:'POST',body:'{}'});if(!isNavigationCurrent(nav))return;state.currentCensus=u;await openCensus(u.census_id,nav);}catch(e){if(isNavigationCurrent(nav))alert(e.message);}
  }
  function openCensusEdit(){const d=state.currentCensus;if(!d)return;$('#censusEditMethod').value=d.method_text||'';$('#censusEditNotes').value=strip(d.notes);status($('#censusEditStatus'),'');$('#censusEditDialog').showModal();}
  async function saveCensusEdit(e){
    e.preventDefault();const d=state.currentCensus;if(!d)return;const nav=beginNavigation();
    try{const u=await mapi(`/censuses/${d.census_id}`,{method:'PATCH',body:JSON.stringify({methodText:$('#censusEditMethod').value,notes:$('#censusEditNotes').value})});if(!isNavigationCurrent(nav))return;$('#censusEditDialog').close();state.currentCensus=u;await openCensus(u.census_id,nav);}catch(x){if(isNavigationCurrent(nav))status($('#censusEditStatus'),x.message,true);}
  }

  $('#newObservationBtn').onclick=()=>{setObservationDefaults();$('#observationCreateDialog').showModal();};$('#newCensusBtn').onclick=()=>{setCensusDefaults();$('#censusCreateDialog').showModal();};
  $('#observationCreateForm').onsubmit=createObservation;$('#observationEditForm').onsubmit=saveObservationEdit;$('#censusCreateForm').onsubmit=createCensus;$('#censusEditForm').onsubmit=saveCensusEdit;
  $('#backMonitoringToVisitBtn').onclick=()=>{const nav=beginNavigation();showView('fieldVisitDetailView',nav);ensureMonitoringButton();};
  $('#backObservationToMonitoringBtn').onclick=()=>openMonitoring();$('#backCensusToMonitoringBtn').onclick=()=>openMonitoring();
  [['closeObservationCreateBtn','observationCreateDialog'],['cancelObservationCreateBtn','observationCreateDialog'],['closeObservationEditBtn','observationEditDialog'],['cancelObservationEditBtn','observationEditDialog'],['closeCensusCreateBtn','censusCreateDialog'],['cancelCensusCreateBtn','censusCreateDialog'],['closeCensusEditBtn','censusEditDialog'],['cancelCensusEditBtn','censusEditDialog']].forEach(([b,d])=>{$(`#${b}`).onclick=()=>{$(`#${d}`).close();};});
  setObservationDefaults();setCensusDefaults();ensureMonitoringButton();
})();
