(() => {
  let navigationEpoch = 0;
  window.beginNavigation = () => ++navigationEpoch;
  window.isNavigationCurrent = (token) => token === navigationEpoch;
  window.showView = (viewId, token) => {
    if (token !== undefined && token !== null && !window.isNavigationCurrent(token)) return false;
    document.querySelectorAll('main > .panel').forEach((panel) => panel.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (!target) return false;
    target.classList.remove('hidden');
    return true;
  };
  window.hideViews = () => document.querySelectorAll('main > .panel').forEach((panel) => panel.classList.add('hidden'));
  window.currentNavigationEpoch = () => navigationEpoch;
})();

(() => {
  state.currentExternalRecord = null;
  state.currentExternalSnapshot = null;
  state.externalSourceId = null;
  state.externalRecordId = null;
  state.externalSnapshotId = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="externalDataView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backExternalToTaxonBtn">← Volver al taxón</button>
      <div class="identity compact external-identity">
        <div>
          <p class="eyebrow">FUENTES EXTERNAS</p>
          <h1 id="externalTaxonTitle">Fuentes externas</h1>
          <p class="muted">Importación ≠ validación · nombre científico ≠ identidad · raw/original ≠ normalized/interpreted.</p>
        </div>
        <div class="external-actions">
          <button class="secondary" id="createExternalSourceBtn">Crear / reutilizar fuente</button>
          <button class="primary" id="createExternalRecordBtn">Crear / reutilizar registro</button>
        </div>
      </div>
      <div id="externalDataStatus" class="status"></div>
      <section class="section entity-block"><h2>FUENTE EXTERNA</h2><div id="externalSourceBlock"></div></section>
      <section class="section entity-block"><h2>REGISTRO EXTERNO</h2><div id="externalRecordList" class="results"></div></section>
      <section class="section entity-block"><h2>PROCEDENCIA</h2><p class="muted">Solo aparecen aquí capturas vinculadas explícitamente al TaxonConcept mediante ProvenanceLink.</p><div id="externalLinkedList" class="results"></div></section>
    </section>

    <section id="externalRecordDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backRecordToExternalBtn">← Volver a fuentes externas</button>
      <div id="externalRecordDetail"></div>
    </section>

    <section id="externalSnapshotDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backSnapshotBtn">← Volver</button>
      <div id="externalSnapshotDetail"></div>
    </section>
  `);

  const text = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };
  const card = (title, meta, detail, handler, cls = '') => {
    const el = document.createElement('article');
    el.className = `result-card ${cls}`.trim();
    el.tabIndex = 0;
    el.append(text('h3', title), metaLine(meta), text('p', detail, 'muted'));
    if (handler) {
      el.onclick = handler;
      el.onkeydown = (event) => { if (event.key === 'Enter') handler(); };
    }
    return el;
  };
  const jsonBlock = (value) => {
    const pre = document.createElement('pre');
    pre.className = 'external-json';
    pre.textContent = JSON.stringify(value, null, 2);
    return pre;
  };
  const navToken = (token) => token === undefined ? beginNavigation() : token;

  async function xapi(path, options = {}) {
    const response = await fetch(`/mvp9-api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function ensureExternalButton() {
    const identity = $('#detail .identity');
    if (!identity || $('#openExternalDataBtn')) return;
    const button = text('button', 'FUENTES EXTERNAS', 'secondary external-entry-button');
    button.id = 'openExternalDataBtn';
    button.type = 'button';
    button.onclick = () => openExternalData();
    identity.append(button);
  }
  new MutationObserver(ensureExternalButton).observe($('#detail'), { childList: true, subtree: true });

  function renderSource(source) {
    const root = $('#externalSourceBlock');
    root.innerHTML = '';
    if (!source) {
      root.append(text('p', 'No existe todavía la fuente sintética MVP9.', 'muted'));
      return;
    }
    root.append(
      text('strong', source.source_name),
      metaLine([source.source_code, source.source_type, source.is_active ? 'activa' : 'inactiva']),
      text('p', `base_url: ${source.base_url || 'NULL'} · default_license: ${source.default_license || 'NULL'}`, 'muted'),
      text('p', 'Fuente sintética de arquitectura; no representa GBIF, iNaturalist, Anthos, POWO ni otro proveedor real.', 'muted')
    );
  }

  async function openExternalData(token) {
    if (!state.current?.concept_id) return;
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    const conceptId = state.current.concept_id;
    showView('externalDataView', nav);
    status($('#externalDataStatus'), 'Cargando…');
    try {
      const detail = await xapi(`/taxa/${conceptId}/external-data`);
      if (!isNavigationCurrent(nav)) return;
      $('#externalTaxonTitle').textContent = `Fuentes externas · ${detail.taxon.scientific_name}`;
      state.externalSourceId = detail.source?.external_source_id || null;
      state.externalRecordId = detail.record?.external_record_id || null;
      state.externalSnapshotId = detail.snapshots?.[0]?.snapshot_id || null;
      renderSource(detail.source);

      const records = $('#externalRecordList');
      records.innerHTML = '';
      if (detail.record) {
        records.append(card(
          `${detail.record.external_id} · ${detail.record.external_record_code}`,
          [detail.record.record_type, detail.record.validation_status],
          `${detail.record.snapshots.length} captura${detail.record.snapshots.length === 1 ? '' : 's'} · identidad persistente del registro externo`,
          () => openExternalRecord(detail.record.external_record_id),
          'external-record-card'
        ));
      } else records.append(text('p', 'No existe todavía ExternalRecord MVP9.', 'muted'));

      const linked = $('#externalLinkedList');
      linked.innerHTML = '';
      detail.linked.forEach((item) => linked.append(card(
        `${item.external_id} · Snapshot`,
        [item.external_record_code, item.capture_status, item.relation_role],
        `${item.generation_mode} · fuente concreta: ExternalRecordSnapshot`,
        () => openExternalSnapshot(item.snapshot_id, 'taxon'),
        'external-linked-card'
      )));
      if (!detail.linked.length) linked.append(text('p', 'Todavía no hay Snapshot vinculado mediante ProvenanceLink.', 'muted'));

      $('#createExternalRecordBtn').disabled = !state.externalSourceId;
      status($('#externalDataStatus'), `${detail.source ? 1 : 0} ExternalSource · ${detail.record ? 1 : 0} ExternalRecord · ${detail.snapshots.length} Snapshot · ${detail.linked.length} ProvenanceLink.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#externalDataStatus'), err.message, true);
    }
  }

  async function createExternalSource() {
    const nav = beginNavigation();
    status($('#externalDataStatus'), 'Creando / reutilizando fuente…');
    try {
      const source = await xapi('/external-sources', { method: 'POST', body: JSON.stringify({ sourceName: 'JBLR STAGING · Fuente externa sintética MVP9', notes: 'fuente demo MVP9' }) });
      if (!isNavigationCurrent(nav)) return;
      state.externalSourceId = source.external_source_id;
      await openExternalData(nav);
    } catch (err) { if (isNavigationCurrent(nav)) status($('#externalDataStatus'), err.message, true); }
  }

  async function createExternalRecord() {
    if (!state.externalSourceId) return;
    const nav = beginNavigation();
    status($('#externalDataStatus'), 'Creando / reutilizando registro…');
    try {
      const record = await xapi('/external-records', { method: 'POST', body: JSON.stringify({ externalSourceId: state.externalSourceId, notes: 'registro sintético MVP9' }) });
      if (!isNavigationCurrent(nav)) return;
      state.externalRecordId = record.external_record_id;
      await openExternalRecord(record.external_record_id, nav);
    } catch (err) { if (isNavigationCurrent(nav)) status($('#externalDataStatus'), err.message, true); }
  }

  function renderRecord(detail, nav) {
    if (!isNavigationCurrent(nav)) return;
    state.currentExternalRecord = detail;
    state.externalRecordId = detail.external_record_id;
    showView('externalRecordDetailView', nav);
    const root = $('#externalRecordDetail');
    root.innerHTML = '';
    const identity = document.createElement('div');
    identity.className = 'identity external-identity';
    const left = document.createElement('div');
    left.append(text('p', 'REGISTRO EXTERNO', 'eyebrow'), text('h1', detail.external_id), text('p', `ID: ${detail.external_record_id}`, 'resource-id'));
    const create = text('button', 'Crear / reutilizar Snapshot', 'primary');
    create.type = 'button';
    create.onclick = createSnapshot;
    identity.append(left, create);
    root.append(identity);

    const source = document.createElement('section');
    source.className = 'section entity-block';
    source.append(text('h2', 'FUENTE EXTERNA'), text('strong', detail.source_name), metaLine([detail.source_code, detail.source_type]));
    root.append(source);

    const record = document.createElement('section');
    record.className = 'section entity-block';
    record.append(
      text('h2', 'REGISTRO EXTERNO'),
      metaLine([detail.external_record_code, detail.record_type, detail.validation_status]),
      text('p', `external_id: ${detail.external_id}`),
      text('p', `canonical_url: ${detail.canonical_url || 'NULL'} · license_text: ${detail.license_text || 'NULL'}`, 'muted'),
      text('p', 'ExternalRecord identifica persistentemente un registro de una fuente; no es una captura histórica.', 'muted')
    );
    root.append(record);

    const snapshots = document.createElement('section');
    snapshots.className = 'section entity-block';
    snapshots.append(text('h2', 'CAPTURAS / SNAPSHOTS'));
    detail.snapshots.forEach((item) => snapshots.append(card(
      `Snapshot · ${item.capture_status}`,
      [item.resource_type_code, item.schema_version, item.payload_hash?.slice(0, 12)],
      `retrieved_at: ${new Date(item.retrieved_at).toLocaleString('es-ES')} · raw_asset_id: ${item.raw_asset_id || 'NULL'}`,
      () => openExternalSnapshot(item.snapshot_id, 'record'),
      'external-snapshot-card'
    )));
    if (!detail.snapshots.length) snapshots.append(text('p', 'No hay capturas todavía. Un cambio externo futuro crearía un nuevo Snapshot, no sobrescribiría el anterior.', 'muted'));
    root.append(snapshots);
  }

  async function openExternalRecord(id, token) {
    const nav = navToken(token);
    try {
      const detail = await xapi(`/external-records/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderRecord(detail, nav);
    } catch (err) { if (isNavigationCurrent(nav)) alert(err.message); }
  }

  async function createSnapshot() {
    if (!state.externalRecordId) return;
    const nav = beginNavigation();
    const recordId = state.externalRecordId;
    try {
      const snapshot = await xapi(`/external-records/${recordId}/snapshots`, { method: 'POST', body: '{}' });
      if (!isNavigationCurrent(nav)) return;
      state.externalSnapshotId = snapshot.snapshot_id;
      await openExternalSnapshot(snapshot.snapshot_id, 'record', nav);
    } catch (err) { if (isNavigationCurrent(nav)) alert(err.message); }
  }

  function renderSnapshot(detail, from, nav) {
    if (!isNavigationCurrent(nav)) return;
    state.currentExternalSnapshot = detail;
    state.externalSnapshotId = detail.snapshot_id;
    showView('externalSnapshotDetailView', nav);
    const back = $('#backSnapshotBtn');
    back.dataset.from = from;
    back.textContent = from === 'taxon' ? '← Volver a fuentes externas' : '← Volver al registro externo';
    const root = $('#externalSnapshotDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity external-identity';
    const left = document.createElement('div');
    left.append(text('p', 'CAPTURA / SNAPSHOT', 'eyebrow'), text('h1', `Snapshot · ${detail.capture_status}`), text('p', `ID: ${detail.snapshot_id}`, 'resource-id'));
    const link = text('button', 'Vincular / reutilizar procedencia', 'primary');
    link.type = 'button';
    link.id = 'linkSnapshotProvenanceBtn';
    link.onclick = linkProvenance;
    identity.append(left, link);
    root.append(identity);

    const source = document.createElement('section');
    source.className = 'section entity-block';
    source.append(text('h2', 'FUENTE EXTERNA'), text('strong', detail.source_name), metaLine([detail.source_code, detail.source_type]));
    root.append(source);

    const record = document.createElement('section');
    record.className = 'section entity-block';
    record.append(
      text('h2', 'REGISTRO EXTERNO'),
      metaLine([detail.external_record_code, detail.external_id, detail.record_type]),
      text('p', `ExternalRecord ID: ${detail.external_record_id}`, 'resource-id'),
      text('p', 'ExternalRecord ≠ ExternalRecordSnapshot.', 'muted')
    );
    root.append(record);

    const snapshot = document.createElement('section');
    snapshot.className = 'section entity-block external-snapshot-block';
    snapshot.append(
      text('h2', 'SNAPSHOT'),
      metaLine([detail.capture_status, detail.schema_version, detail.snapshot_validation_status]),
      text('p', `retrieved_at: ${new Date(detail.retrieved_at).toLocaleString('es-ES')}`),
      text('p', `payload_hash SHA-256: ${detail.payload_hash || 'NULL'}`, 'hash-value'),
      text('p', `raw_asset_id: ${detail.raw_asset_id || 'NULL'} · license_text: ${detail.snapshot_license_text || 'NULL'}`, 'muted'),
      text('p', 'RAW PAYLOAD · captura histórica preservada; no editable ordinariamente.', 'external-json-label'),
      jsonBlock(detail.raw_payload),
      text('p', 'NORMALIZED PAYLOAD · derivado mínimo; normalized ≠ validated.', 'external-json-label'),
      jsonBlock(detail.normalized_payload)
    );
    root.append(snapshot);

    const provenance = document.createElement('section');
    provenance.className = 'section entity-block';
    provenance.append(text('h2', 'PROCEDENCIA'));
    detail.provenance.forEach((item) => provenance.append(
      metaLine([item.subject_code, item.generation_mode, item.relation_role]),
      text('p', `subject_resource_id: ${item.subject_resource_id}`, 'resource-id'),
      text('p', 'El enlace es manual y contextual; el nombre científico contenido en raw_payload no resuelve identidad taxonómica JBLR.', 'muted')
    ));
    if (!detail.provenance.length) provenance.append(text('p', 'Snapshot aún no vinculado al TaxonConcept.', 'muted'));
    root.append(provenance);
  }

  async function openExternalSnapshot(id, from = 'record', token) {
    const nav = navToken(token);
    try {
      const detail = await xapi(`/external-record-snapshots/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderSnapshot(detail, from, nav);
    } catch (err) { if (isNavigationCurrent(nav)) alert(err.message); }
  }

  async function linkProvenance() {
    if (!state.current?.concept_id || !state.externalSnapshotId) return;
    const nav = beginNavigation();
    const conceptId = state.current.concept_id;
    const snapshotId = state.externalSnapshotId;
    const from = $('#backSnapshotBtn').dataset.from || 'record';
    try {
      await xapi(`/taxa/${conceptId}/provenance-links`, { method: 'POST', body: JSON.stringify({ snapshotId }) });
      if (!isNavigationCurrent(nav)) return;
      await openExternalSnapshot(snapshotId, from, nav);
    } catch (err) { if (isNavigationCurrent(nav)) alert(err.message); }
  }

  $('#createExternalSourceBtn').onclick = createExternalSource;
  $('#createExternalRecordBtn').onclick = createExternalRecord;
  $('#backExternalToTaxonBtn').onclick = () => { const nav = beginNavigation(); showView('detailView', nav); ensureExternalButton(); };
  $('#backRecordToExternalBtn').onclick = () => openExternalData();
  $('#backSnapshotBtn').onclick = () => {
    if ($('#backSnapshotBtn').dataset.from === 'taxon') openExternalData();
    else if (state.externalRecordId) openExternalRecord(state.externalRecordId);
    else openExternalData();
  };
})();
