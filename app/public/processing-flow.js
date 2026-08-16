(() => {
  state.currentProcessingEvent = null;
  state.processingSourceSampleId = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="sampleProcessingView" class="panel hidden">
      <button class="link-button" id="backToProcessingSampleBtn">← Volver a muestra</button>
      <div class="identity compact"><div><p class="eyebrow">PROCESADO</p><h1 id="sampleProcessingTitle">Procesado</h1><p class="muted">Sample de entrada → ProcessingEvent → Sample de salida. La entrada nunca se sobrescribe.</p></div><button class="primary" id="createProcessingBtn">Crear / reutilizar proceso</button></div>
      <div id="sampleProcessingStatus" class="status"></div><section class="section entity-block"><h2>PROCESOS</h2><div id="processingList" class="results"></div></section>
    </section>
    <section id="processingEventDetailView" class="panel hidden"><button class="link-button" id="backToProcessingListBtn">← Volver a procesado</button><div id="processingEventDetail"></div></section>
    <section id="processedSampleDetailView" class="panel hidden"><button class="link-button" id="backToProcessingEventBtn">← Volver al ProcessingEvent</button><div id="processedSampleDetail"></div></section>
  `);
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="processingDialog"><form id="processingForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Crear / reutilizar proceso</h2><button type="button" class="icon-button" id="closeProcessingDialogBtn">×</button></div><label>Tipo de proceso<input id="processingType" required maxlength="200"></label><div class="grid-2"><label>Inicio<input id="processingStartedAt" type="datetime-local"></label><label>Fin<input id="processingEndedAt" type="datetime-local"></label></div><label>Notas<textarea id="processingNotes" rows="3" maxlength="1000"></textarea></label><p class="hint">Cantidad desconocida = NULL. Nunca se sustituye por cero.</p><div id="processingFormStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelProcessingBtn">Cancelar</button><button type="submit" class="primary">Crear / reutilizar</button></div></form></dialog>
    <dialog id="processingEditDialog"><form id="processingEditForm" method="dialog" class="form-stack"><div class="dialog-head"><h2>Editar proceso</h2><button type="button" class="icon-button" id="closeProcessingEditBtn">×</button></div><label>Tipo de proceso<input id="processingEditType" required maxlength="200"></label><div class="grid-2"><label>Inicio<input id="processingEditStartedAt" type="datetime-local"></label><label>Fin<input id="processingEditEndedAt" type="datetime-local"></label></div><label>Notas<textarea id="processingEditNotes" rows="3" maxlength="1000"></textarea></label><div id="processingEditStatus" class="status"></div><div class="dialog-actions"><button type="button" class="secondary" id="cancelProcessingEditBtn">Cancelar</button><button type="submit" class="primary">Guardar cambios</button></div></form></dialog>
  `);

  const oldHide = hideViews;
  hideViews = () => { oldHide(); ['sampleProcessingView','processingEventDetailView','processedSampleDetailView'].forEach(id => $(`#${id}`).classList.add('hidden')); };
  const t = (tag,value,cls='') => { const e=document.createElement(tag); if(cls)e.className=cls; e.textContent=value??'—'; return e; };
  const fmt = v => v ? new Date(v).toLocaleString('es-ES') : '—';
  const strip = v => String(v||'').replace(/^STAGING DEMO · MVP_PRODUCTIVO_[45] · NO VALIDADO · /,'');
  const qty = (v,u) => v===null || v===undefined ? 'Cantidad: desconocida / no registrada' : `Cantidad: ${v} ${u||''}`.trim();
  const meta = values => t('p',values.filter(Boolean).join(' · '),'meta');
  const card = (title,values,detail,handler,cls='') => { const c=document.createElement('article'); c.className=`result-card ${cls}`; c.tabIndex=0; c.append(t('h3',title),meta(values),t('p',detail,'muted')); if(handler){c.onclick=handler;c.onkeydown=e=>{if(e.key==='Enter')handler();};} return c; };
  const local = v => v ? new Date(v).toISOString().slice(0,16) : '';

  function ensureButton(){
    const identity=$('#sampleDetail .identity'); if(!identity || $('#openSampleProcessingBtn'))return;
    const actions=identity.querySelector('.entity-actions'); if(!actions)return;
    const b=document.createElement('button'); b.id='openSampleProcessingBtn'; b.className='secondary'; b.textContent='PROCESADO'; b.onclick=openList; actions.prepend(b);
  }
  new MutationObserver(ensureButton).observe($('#sampleDetail'),{childList:true,subtree:true});

  async function openList(){
    if(!state.currentSample?.sample_id)return;
    state.processingSourceSampleId=state.currentSample.sample_id; hideViews(); $('#sampleProcessingView').classList.remove('hidden'); status($('#sampleProcessingStatus'),'Cargando…');
    try{
      const d=await api(`/api/samples/${state.processingSourceSampleId}/processing`); $('#sampleProcessingTitle').textContent=`Procesado · ${d.sample.sample_code}`; const list=$('#processingList'); list.innerHTML='';
      d.processes.forEach(p=>list.append(card(`${p.process_type} · ${p.processing_event_code}`,[p.validation_status,p.sample_role==='input'?'muestra de entrada':'muestra de salida',fmt(p.started_at)],`${p.input_count} INPUT · ${p.output_count} OUTPUT`,()=>openEvent(p.processing_event_id),'processing-card')));
      status($('#sampleProcessingStatus'),d.processes.length?`${d.processes.length} proceso${d.processes.length===1?'':'s'} vinculado${d.processes.length===1?'':'s'}.`:'No hay procesos vinculados todavía.');
    }catch(e){status($('#sampleProcessingStatus'),e.message,true);}
  }

  function openCreate(){ $('#processingForm').reset(); $('#processingType').value='cleaning_demo'; status($('#processingFormStatus'),''); $('#processingDialog').showModal(); }
  async function saveCreate(e){ e.preventDefault(); status($('#processingFormStatus'),'Guardando…'); try{const d=await api(`/api/samples/${state.processingSourceSampleId}/processing`,{method:'POST',body:JSON.stringify({processType:$('#processingType').value,startedAt:$('#processingStartedAt').value,endedAt:$('#processingEndedAt').value,notes:$('#processingNotes').value})}); $('#processingDialog').close(); renderEvent(d);}catch(err){status($('#processingFormStatus'),err.message,true);} }
  async function openEvent(id){ try{renderEvent(await api(`/api/processing-events/${id}`));}catch(e){alert(e.message);} }

  function renderEvent(d){
    state.currentProcessingEvent=d; hideViews(); $('#processingEventDetailView').classList.remove('hidden'); const r=$('#processingEventDetail'); r.innerHTML='';
    const id=document.createElement('div'); id.className='identity'; const left=document.createElement('div'); left.append(t('p','PROCESO','eyebrow'),t('h1',d.process_type),t('p',`ID: ${d.processing_event_id}`,'resource-id')); const actions=document.createElement('div'); actions.className='entity-actions'; const edit=document.createElement('button'); edit.className='primary'; edit.textContent='Editar proceso'; edit.onclick=openEdit; actions.append(edit); id.append(left,actions); r.append(id);
    const p=document.createElement('section'); p.className='section entity-block'; p.append(t('h2','PROCESO'),meta([d.processing_event_code,d.validation_status,fmt(d.started_at),d.ended_at?`fin ${fmt(d.ended_at)}`:'fin no registrado']),t('p',strip(d.notes)||'Sin notas','muted'),t('p','Sin agentes ni protocolos ficticios: operator_agent_id y protocol_resource_id permanecen NULL.','muted')); r.append(p);
    const tr=document.createElement('section'); tr.className='section entity-block'; tr.append(t('h2','TRAZABILIDAD INPUT → PROCESO → OUTPUT')); const chain=document.createElement('div'); chain.className='processing-trace'; const inp=document.createElement('div'); inp.className='trace-column'; inp.append(t('p','INPUT','eyebrow')); d.inputs.forEach(x=>inp.append(card(`${x.sample_kind} · ${x.sample_code}`,[x.validation_status,x.material_state||'estado no registrado'],`${qty(x.linked_quantity_value,x.linked_quantity_unit)} · Sample original preservada`,null,'process-input-card'))); const mid=document.createElement('div'); mid.className='trace-process'; mid.append(t('span','→','trace-arrow'),t('strong',d.processing_event_code),t('span','→','trace-arrow')); const out=document.createElement('div'); out.className='trace-column'; out.append(t('p','OUTPUT','eyebrow')); d.outputs.forEach(x=>out.append(card(`${x.sample_kind} · ${x.sample_code}`,[x.validation_status,x.material_state||'estado no registrado'],`${qty(x.linked_quantity_value,x.linked_quantity_unit)} · Abrir Sample resultante`,()=>openOutput(x.sample_id),'process-output-card'))); chain.append(inp,mid,out); tr.append(chain); r.append(tr);
  }

  function openEdit(){ const d=state.currentProcessingEvent; $('#processingEditType').value=d.process_type||''; $('#processingEditStartedAt').value=local(d.started_at); $('#processingEditEndedAt').value=local(d.ended_at); $('#processingEditNotes').value=strip(d.notes); status($('#processingEditStatus'),''); $('#processingEditDialog').showModal(); }
  async function saveEdit(e){ e.preventDefault(); status($('#processingEditStatus'),'Guardando…'); try{const d=await api(`/api/processing-events/${state.currentProcessingEvent.processing_event_id}`,{method:'PATCH',body:JSON.stringify({processType:$('#processingEditType').value,startedAt:$('#processingEditStartedAt').value,endedAt:$('#processingEditEndedAt').value,notes:$('#processingEditNotes').value})}); $('#processingEditDialog').close(); renderEvent(d);}catch(err){status($('#processingEditStatus'),err.message,true);} }

  async function openOutput(id){
    try{const d=await api(`/api/samples/${id}`); hideViews(); $('#processedSampleDetailView').classList.remove('hidden'); const r=$('#processedSampleDetail'); r.innerHTML=''; const identity=document.createElement('div'); identity.className='identity'; const left=document.createElement('div'); left.append(t('p','MUESTRA RESULTANTE','eyebrow'),t('h1',`${d.sample_kind} · ${d.sample_code}`),t('p',`ID: ${d.sample_id}`,'resource-id')); identity.append(left); r.append(identity); const s=document.createElement('section'); s.className='section entity-block'; s.append(t('h2','SAMPLE'),meta([d.sample_code,d.validation_status,d.material_state||'estado no registrado']),t('p',qty(d.quantity_value,d.quantity_unit)),t('p',strip(d.notes)||'Sin notas','muted'),t('p','Sample nueva de OUTPUT; la Sample de entrada permanece inalterada.','muted')); r.append(s);}catch(e){alert(e.message);}
  }

  $('#createProcessingBtn').onclick=openCreate; $('#processingForm').onsubmit=saveCreate; $('#processingEditForm').onsubmit=saveEdit;
  $('#backToProcessingSampleBtn').onclick=()=>{hideViews();$('#sampleDetailView').classList.remove('hidden');ensureButton();}; $('#backToProcessingListBtn').onclick=openList; $('#backToProcessingEventBtn').onclick=()=>openEvent(state.currentProcessingEvent.processing_event_id);
  $('#cancelProcessingBtn').onclick=$('#closeProcessingDialogBtn').onclick=()=>$('#processingDialog').close(); $('#cancelProcessingEditBtn').onclick=$('#closeProcessingEditBtn').onclick=()=>$('#processingEditDialog').close();
})();
