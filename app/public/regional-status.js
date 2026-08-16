(() => {
  state.currentRegionalAssertion = null;
  state.currentGeographicArea = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="regionalStatusView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backRegionalToTaxonBtn">← Volver al taxón</button>
      <div class="identity compact regional-identity">
        <div>
          <p class="eyebrow">ESTADO REGIONAL</p>
          <h1 id="regionalTaxonTitle">Estado regional del taxón</h1>
          <p class="muted">unknown ≠ absence · not_recorded ≠ absent · not_queried ≠ absent · failed ≠ absent.</p>
        </div>
        <button class="primary" id="createRegionalStatusBtn">Crear / reutilizar estado regional demo</button>
      </div>
      <div id="regionalStatusMessage" class="status"></div>
      <section class="section entity-block regional-section">
        <h2>ÁREA</h2>
        <div id="regionalAreaBlock"></div>
      </section>
      <section class="section entity-block regional-section">
        <h2>ESTADO REGIONAL</h2>
        <div id="regionalAssertionList" class="results"></div>
      </section>
      <section class="section entity-block regional-section regional-semantics">
        <h2>SEMÁNTICA</h2>
        <p><strong>unknown</strong> = desconocido; no significa ausencia.</p>
        <p><strong>not_recorded</strong> = no registrado; no significa ausencia.</p>
        <p><strong>not_queried</strong> = no consultado; no significa ausencia.</p>
        <p><strong>failed</strong> = consulta fallida; no significa ausencia.</p>
      </section>
    </section>

    <section id="geographicAreaDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backAreaToRegionalBtn">← Volver a estado regional</button>
      <div id="geographicAreaDetail"></div>
    </section>

    <section id="regionalAssertionDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backAssertionToRegionalBtn">← Volver a estado regional</button>
      <div id="regionalAssertionDetail"></div>
    </section>
  `);

  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="regionalAssertionEditDialog">
      <form id="regionalAssertionEditForm" method="dialog" class="form-stack">
        <div class="dialog-head">
          <h2>Editar nota regional</h2>
          <button type="button" class="icon-button" id="closeRegionalAssertionEditBtn" aria-label="Cerrar">×</button>
        </div>
        <p class="hint">MVP11 permite editar solo la nota editorial. Estados, términos, taxón, área y fuente permanecen inalterados.</p>
        <label>Nota editorial<textarea id="regionalAssertionNote" rows="4" maxlength="1000"></textarea></label>
        <div id="regionalAssertionEditStatus" class="status" aria-live="polite"></div>
        <div class="dialog-actions">
          <button type="button" class="secondary" id="cancelRegionalAssertionEditBtn">Cancelar</button>
          <button type="submit" class="primary">Guardar nota</button>
        </div>
      </form>
    </dialog>
  `);

  const rt = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };

  const rcard = (title, meta, detail, handler, cls = '') => {
    const el = document.createElement('article');
    el.className = `result-card ${cls}`.trim();
    el.tabIndex = 0;
    el.append(rt('h3', title), metaLine(meta), rt('p', detail, 'muted'));
    if (handler) {
      el.onclick = handler;
      el.onkeydown = (event) => { if (event.key === 'Enter') handler(); };
    }
    return el;
  };

  const navToken = (token) => token === undefined ? beginNavigation() : token;

  async function rapi(path, options = {}) {
    const response = await fetch(`/mvp11-api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function ensureRegionalButton() {
    const identity = $('#detail .identity');
    if (!identity || $('#openRegionalStatusBtn')) return;
    const button = rt('button', 'ESTADO REGIONAL', 'secondary regional-entry-button');
    button.id = 'openRegionalStatusBtn';
    button.type = 'button';
    button.onclick = () => openTaxonRegionalStatus();
    identity.append(button);
  }
  new MutationObserver(ensureRegionalButton).observe($('#detail'), { childList: true, subtree: true });

  function renderArea(area) {
    const root = $('#regionalAreaBlock');
    root.innerHTML = '';
    if (!area) {
      root.append(rt('p', 'La GeographicArea «La Rioja» todavía no existe en STAGING.', 'muted'));
      return;
    }
    root.append(rcard(
      area.name,
      [area.geographic_area_code, area.area_kind, area.validation_status],
      'GeographicArea ≠ Location · el área no afirma presencia de ningún taxón.',
      () => openGeographicArea(area.geographic_area_id),
      'regional-area-card'
    ));
  }

  function renderAssertions(assertions) {
    const root = $('#regionalAssertionList');
    root.innerHTML = '';
    for (const item of assertions) {
      root.append(rcard(
        item.geographic_area_name || 'RegionalTaxonAssertion',
        [item.regional_assertion_code, `presencia: ${item.presence_value_status}`],
        `presence_term_key: ${item.presence_term_key || 'NULL'} · UNKNOWN ≠ AUSENCIA`,
        () => openRegionalAssertion(item.regional_assertion_id),
        'regional-assertion-card'
      ));
    }
    if (!assertions.length) {
      root.append(rt('p', 'No existe todavía RegionalTaxonAssertion MVP11 para este taxón.', 'muted'));
    }
  }

  async function openTaxonRegionalStatus(token) {
    if (!state.current?.concept_id) return;
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    const conceptId = state.current.concept_id;
    showView('regionalStatusView', nav);
    status($('#regionalStatusMessage'), 'Cargando…');
    try {
      const detail = await rapi(`/taxa/${conceptId}/regional-status`);
      if (!isNavigationCurrent(nav)) return;
      $('#regionalTaxonTitle').textContent = `Estado regional · ${detail.taxon.scientific_name}`;
      renderArea(detail.area);
      renderAssertions(detail.assertions);
      status($('#regionalStatusMessage'), `${detail.assertions.length} estado regional · desconocido no equivale a ausencia.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#regionalStatusMessage'), err.message, true);
    }
  }

  async function createRegionalStatus() {
    if (!state.current?.concept_id) return;
    const nav = beginNavigation();
    showView('regionalStatusView', nav);
    status($('#regionalStatusMessage'), 'Creando / reutilizando estado regional seguro…');
    try {
      await rapi(`/taxa/${state.current.concept_id}/regional-status-demo`, {
        method: 'POST',
        body: '{}'
      });
      if (!isNavigationCurrent(nav)) return;
      await openTaxonRegionalStatus(nav);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#regionalStatusMessage'), err.message, true);
    }
  }

  async function openGeographicArea(id, token) {
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    showView('geographicAreaDetailView', nav);
    const root = $('#geographicAreaDetail');
    root.innerHTML = '';
    root.append(rt('p', 'Cargando GeographicArea…', 'status'));
    try {
      const area = await rapi(`/geographic-areas/${id}`);
      if (!isNavigationCurrent(nav)) return;
      state.currentGeographicArea = area;
      root.innerHTML = '';
      const identity = document.createElement('div');
      identity.className = 'identity regional-identity';
      const left = document.createElement('div');
      left.append(
        rt('p', 'GEOGRAPHIC AREA', 'eyebrow'),
        rt('h1', area.name),
        rt('p', `ID: ${area.geographic_area_id}`, 'resource-id'),
        rt('p', 'GeographicArea ≠ Location', 'regional-warning')
      );
      identity.append(left);
      root.append(identity);

      const section = document.createElement('section');
      section.className = 'section entity-block regional-section';
      section.append(
        rt('h2', 'ÁREA'),
        metaLine([area.geographic_area_code, area.area_kind, area.resource_type_code, area.validation_status]),
        rt('p', `parent_area_id: ${area.parent_area_id || 'NULL'}`, 'resource-id'),
        rt('p', `external_code: ${area.external_code || 'NULL'} · external_code_system: ${area.external_code_system || 'NULL'}`),
        rt('p', `localizaciones de campo vinculadas: ${area.linked_location_count}`),
        rt('p', 'La existencia de esta región administrativa no constituye una observación ni una afirmación de presencia.', 'regional-warning')
      );
      root.append(section);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(rt('p', err.message, 'status error'));
      }
    }
  }

  function statusSection(label, valueStatus, termKey, extraClass = '') {
    const block = document.createElement('div');
    block.className = `regional-value-card ${extraClass}`.trim();
    block.append(
      rt('h3', label),
      rt('p', `value_status: ${valueStatus}`, 'regional-value-status'),
      rt('p', `term_key: ${termKey || 'NULL'}`, 'resource-id')
    );
    if (valueStatus === 'unknown') {
      block.append(rt('p', 'DESCONOCIDO ≠ AUSENCIA', 'regional-warning'));
    } else if (valueStatus === 'not_recorded') {
      block.append(rt('p', 'NO REGISTRADO ≠ AUSENCIA', 'regional-warning'));
    } else if (valueStatus === 'not_queried') {
      block.append(rt('p', 'NO CONSULTADO ≠ AUSENCIA', 'regional-warning'));
    } else if (valueStatus === 'failed') {
      block.append(rt('p', 'CONSULTA FALLIDA ≠ AUSENCIA', 'regional-warning'));
    }
    return block;
  }

  function renderRegionalAssertion(detail) {
    state.currentRegionalAssertion = detail;
    const root = $('#regionalAssertionDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity regional-identity';
    const left = document.createElement('div');
    left.append(
      rt('p', 'REGIONAL TAXON ASSERTION', 'eyebrow'),
      rt('h1', `${detail.scientific_name} · ${detail.geographic_area_name}`),
      rt('p', `ID: ${detail.regional_assertion_id}`, 'resource-id'),
      rt('p', 'RegionalTaxonAssertion ≠ Observation · regional status ≠ field observation', 'regional-warning')
    );
    const edit = rt('button', 'Editar nota', 'secondary');
    edit.type = 'button';
    edit.id = 'editRegionalAssertionBtn';
    edit.onclick = openRegionalAssertionEdit;
    identity.append(left, edit);
    root.append(identity);

    const area = document.createElement('section');
    area.className = 'section entity-block regional-section';
    area.append(
      rt('h2', 'ÁREA'),
      rt('strong', detail.geographic_area_name),
      metaLine([detail.geographic_area_code, detail.geographic_area_kind]),
      rt('p', `GeographicArea ID: ${detail.geographic_area_id}`, 'resource-id'),
      rt('p', 'GeographicArea ≠ Location.', 'muted')
    );
    root.append(area);

    const values = document.createElement('section');
    values.className = 'section entity-block regional-section';
    values.append(rt('h2', 'ESTADO'));
    const grid = document.createElement('div');
    grid.className = 'regional-value-grid';
    grid.append(
      statusSection('PRESENCIA', detail.presence_value_status, detail.presence_term_key, 'presence-status'),
      statusSection('ORIGEN', detail.origin_value_status, detail.origin_term_key),
      statusSection('ESTABLECIMIENTO', detail.establishment_value_status, detail.establishment_term_key),
      statusSection('CONTEXTO', detail.context_value_status, detail.context_term_key),
      statusSection('TEMPORALIDAD', detail.temporality_value_status, detail.temporality_term_key),
      statusSection('CATÁLOGO', detail.catalog_inclusion_value_status, detail.catalog_inclusion_term_key)
    );
    values.append(grid);
    root.append(values);

    const source = document.createElement('section');
    source.className = 'section entity-block regional-section';
    source.append(
      rt('h2', 'FUENTE'),
      rt('p', `source_resource_id: ${detail.source_resource_id || 'NULL'}`, 'resource-id'),
      rt('p', detail.source_resource_id ? 'Fuente vinculada.' : 'Sin fuente: no se inventa Reference, Snapshot ni Asset.', 'regional-warning')
    );
    root.append(source);

    const editorial = document.createElement('section');
    editorial.className = 'section entity-block regional-section';
    editorial.append(
      rt('h2', 'NOTA EDITORIAL'),
      rt('p', detail.editable_note || 'Sin nota editorial', 'regional-note'),
      rt('p', `valid_from: ${detail.valid_from || 'NULL'} · valid_to: ${detail.valid_to || 'NULL'}`, 'muted'),
      rt('p', `TaxonConcept validation_status: ${detail.taxon_validation_status} · row_version: ${detail.taxon_row_version}`, 'muted')
    );
    root.append(editorial);
  }

  async function openRegionalAssertion(id, token) {
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    showView('regionalAssertionDetailView', nav);
    const root = $('#regionalAssertionDetail');
    root.innerHTML = '';
    root.append(rt('p', 'Cargando RegionalTaxonAssertion…', 'status'));
    try {
      const detail = await rapi(`/regional-assertions/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderRegionalAssertion(detail);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(rt('p', err.message, 'status error'));
      }
    }
  }

  function openRegionalAssertionEdit() {
    const detail = state.currentRegionalAssertion;
    if (!detail) return;
    $('#regionalAssertionNote').value = detail.editable_note || '';
    status($('#regionalAssertionEditStatus'), '');
    $('#regionalAssertionEditDialog').showModal();
  }

  async function saveRegionalAssertionEdit(event) {
    event.preventDefault();
    const detail = state.currentRegionalAssertion;
    if (!detail) return;
    status($('#regionalAssertionEditStatus'), 'Guardando…');
    try {
      const updated = await rapi(`/regional-assertions/${detail.regional_assertion_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userNote: $('#regionalAssertionNote').value })
      });
      $('#regionalAssertionEditDialog').close();
      renderRegionalAssertion(updated);
    } catch (err) {
      status($('#regionalAssertionEditStatus'), err.message, true);
    }
  }

  function returnToTaxon() {
    const nav = beginNavigation();
    showView('detailView', nav);
    ensureRegionalButton();
  }

  $('#createRegionalStatusBtn').onclick = createRegionalStatus;
  $('#backRegionalToTaxonBtn').onclick = returnToTaxon;
  $('#backAreaToRegionalBtn').onclick = () => openTaxonRegionalStatus();
  $('#backAssertionToRegionalBtn').onclick = () => openTaxonRegionalStatus();
  $('#regionalAssertionEditForm').addEventListener('submit', saveRegionalAssertionEdit);
  $('#closeRegionalAssertionEditBtn').onclick = () => $('#regionalAssertionEditDialog').close();
  $('#cancelRegionalAssertionEditBtn').onclick = () => $('#regionalAssertionEditDialog').close();

  ensureRegionalButton();
})();
