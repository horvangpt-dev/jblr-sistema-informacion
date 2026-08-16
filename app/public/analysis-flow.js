(() => {
  state.currentAnalysisRun = null;
  state.currentAnalysisInput = null;
  state.currentAnalysisResult = null;
  state.analysisRunId = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="taxonAnalysisView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backAnalysisToTaxonBtn">← Volver al taxón</button>
      <div class="identity compact analysis-identity">
        <div>
          <p class="eyebrow">ANÁLISIS</p>
          <h1 id="analysisTaxonTitle">Análisis trazables</h1>
          <p class="muted">FUENTE ≠ EJECUCIÓN ≠ RESULTADO · resultado calculado ≠ validación científica.</p>
        </div>
        <button class="primary" id="createAnalysisBtn">Crear / reutilizar análisis sintético</button>
      </div>
      <div id="analysisStatus" class="status"></div>
      <section class="section entity-block">
        <h2>MÉTRICA</h2>
        <div id="analysisMetricBlock"></div>
      </section>
      <section class="section entity-block">
        <h2>INPUT DISPONIBLE</h2>
        <div id="analysisSnapshotBlock"></div>
      </section>
      <section class="section entity-block">
        <h2>EJECUCIONES</h2>
        <div id="analysisRunList" class="results"></div>
      </section>
    </section>

    <section id="analysisRunDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backRunToAnalysesBtn">← Volver a análisis</button>
      <div id="analysisRunDetail"></div>
    </section>

    <section id="analysisInputDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backInputToRunBtn">← Volver a ejecución</button>
      <div id="analysisInputDetail"></div>
    </section>

    <section id="analysisResultDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backResultToRunBtn">← Volver a ejecución</button>
      <div id="analysisResultDetail"></div>
    </section>
  `);

  const t = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };
  const card = (title, meta, detail, handler, cls = '') => {
    const el = document.createElement('article');
    el.className = `result-card ${cls}`.trim();
    el.tabIndex = 0;
    el.append(t('h3', title), metaLine(meta), t('p', detail, 'muted'));
    if (handler) {
      el.onclick = handler;
      el.onkeydown = (event) => { if (event.key === 'Enter') handler(); };
    }
    return el;
  };
  const json = (value) => {
    const pre = document.createElement('pre');
    pre.className = 'analysis-json';
    pre.textContent = JSON.stringify(value, null, 2);
    return pre;
  };
  const navToken = (token) => token === undefined ? beginNavigation() : token;

  async function aapi(path, options = {}) {
    const response = await fetch(`/mvp10-api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function ensureAnalysisButton() {
    const identity = $('#detail .identity');
    if (!identity || $('#openTaxonAnalysisBtn')) return;
    const button = t('button', 'ANÁLISIS', 'secondary analysis-entry-button');
    button.id = 'openTaxonAnalysisBtn';
    button.type = 'button';
    button.onclick = () => openTaxonAnalyses();
    identity.append(button);
  }
  new MutationObserver(ensureAnalysisButton).observe($('#detail'), { childList: true, subtree: true });

  function renderMetric(metric) {
    const root = $('#analysisMetricBlock');
    root.innerHTML = '';
    if (!metric) {
      root.append(t('p', 'No existe todavía la MetricDefinition sintética MVP10.', 'muted'));
      return;
    }
    root.append(
      t('strong', metric.label),
      metaLine([metric.metric_code, metric.value_type, metric.is_active ? 'activa' : 'inactiva']),
      t('p', `Target: ${(metric.target_resource_types || []).join(', ') || 'sin target'} · unidad por defecto: ${metric.default_unit_code || 'NULL'}`),
      t('p', metric.description, 'analysis-warning')
    );
  }

  function renderSnapshot(snapshot) {
    const root = $('#analysisSnapshotBlock');
    root.innerHTML = '';
    if (!snapshot) {
      root.append(t('p', 'No se encontró el Snapshot MVP9 aceptado.', 'muted'));
      return;
    }
    root.append(
      t('strong', `ExternalRecordSnapshot · ${snapshot.snapshot_id}`),
      metaLine([snapshot.external_record_code, snapshot.external_id, snapshot.capture_status]),
      t('p', `payload_hash: ${snapshot.payload_hash}`, 'resource-id'),
      t('p', 'El análisis consume este Snapshot. No modifica raw_payload, normalized_payload ni payload_hash.', 'analysis-warning')
    );
  }

  async function openTaxonAnalyses(token) {
    if (!state.current?.concept_id) return;
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    const conceptId = state.current.concept_id;
    showView('taxonAnalysisView', nav);
    status($('#analysisStatus'), 'Cargando…');
    try {
      const detail = await aapi(`/taxa/${conceptId}/analyses`);
      if (!isNavigationCurrent(nav)) return;
      $('#analysisTaxonTitle').textContent = `Análisis · ${detail.taxon.scientific_name}`;
      renderMetric(detail.metric);
      renderSnapshot(detail.snapshot);
      const list = $('#analysisRunList');
      list.innerHTML = '';
      detail.runs.forEach((run) => list.append(card(
        run.analysis_run_code || 'AnalysisRun',
        [run.module_code, run.method_version, run.run_status],
        `${run.metric_label} · ${run.value_status} · valor ${run.numeric_value ?? 'NULL'} · sin release científica`,
        () => openAnalysisRun(run.analysis_run_id),
        'analysis-run-card'
      )));
      if (!detail.runs.length) list.append(t('p', 'Todavía no existe AnalysisRun MVP10.', 'muted'));
      status($('#analysisStatus'), `${detail.runs.length} AnalysisRun · resultado calculado ≠ validación científica.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#analysisStatus'), err.message, true);
    }
  }

  async function createAnalysis() {
    if (!state.current?.concept_id) return;
    const nav = beginNavigation();
    showView('taxonAnalysisView', nav);
    status($('#analysisStatus'), 'Creando / reutilizando cadena analítica sintética…');
    try {
      const detail = await aapi(`/taxa/${state.current.concept_id}/analysis-demo`, {
        method: 'POST',
        body: '{}'
      });
      if (!isNavigationCurrent(nav)) return;
      state.analysisRunId = detail.run.analysis_run_id;
      await openTaxonAnalyses(nav);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#analysisStatus'), err.message, true);
    }
  }

  function renderAnalysisRun(detail) {
    state.currentAnalysisRun = detail;
    state.analysisRunId = detail.analysis_run_id;
    const root = $('#analysisRunDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity analysis-identity';
    const left = document.createElement('div');
    left.append(
      t('p', 'ANALYSIS RUN', 'eyebrow'),
      t('h1', detail.analysis_run_code || detail.module_code),
      t('p', `ID: ${detail.analysis_run_id}`, 'resource-id'),
      t('p', 'FUENTE ≠ EJECUCIÓN ≠ RESULTADO', 'analysis-warning')
    );
    identity.append(left);
    root.append(identity);

    const activity = document.createElement('section');
    activity.className = 'section entity-block analysis-section';
    activity.append(
      t('h2', 'ACTIVIDAD'),
      metaLine([detail.activity_type, detail.software_name, detail.software_version, detail.process_outcome]),
      t('p', `DataActivity ID: ${detail.data_activity_id}`, 'resource-id'),
      t('p', `performed_by_agent_id: ${detail.performed_by_agent_id || 'NULL'} · code_commit: ${detail.code_commit || 'NULL'}`),
      t('p', 'DataActivity describe la actividad de procesamiento; no es el AnalysisRun.', 'muted')
    );
    root.append(activity);

    const run = document.createElement('section');
    run.className = 'section entity-block analysis-section';
    run.append(
      t('h2', 'EJECUCIÓN'),
      metaLine([detail.module_code, detail.method_version, detail.run_status]),
      t('p', `closed_at: ${detail.closed_at ? new Date(detail.closed_at).toLocaleString('es-ES') : 'NULL'}`),
      t('p', `release_label: ${detail.release_label || 'NULL'} · released_at: ${detail.released_at || 'NULL'}`),
      t('p', 'AnalysisRun cerrado = ejecución histórica. No se edita para simular una ejecución nueva.', 'analysis-warning')
    );
    root.append(run);

    const inputs = document.createElement('section');
    inputs.className = 'section entity-block analysis-section';
    inputs.append(t('h2', 'INPUT'));
    detail.inputs.forEach((input) => inputs.append(card(
      `ExternalRecordSnapshot · ${input.input_resource_id}`,
      [input.input_role, `ordinal ${input.ordinal}`, input.capture_status],
      `input_hash: ${input.input_hash}`,
      () => openAnalysisInput(input),
      'analysis-input-card'
    )));
    if (!detail.inputs.length) inputs.append(t('p', 'Sin AnalysisInput.', 'muted'));
    root.append(inputs);

    const results = document.createElement('section');
    results.className = 'section entity-block analysis-section';
    results.append(t('h2', 'RESULTADO'));
    detail.results.forEach((result) => results.append(card(
      `${result.metric_label} · ${result.numeric_value ?? 'NULL'}`,
      [result.analysis_result_code, result.value_status, result.value_type],
      `${result.scientific_name} · RESULTADO CALCULADO ≠ VALIDACIÓN CIENTÍFICA`,
      () => openAnalysisResult(result.analysis_result_id),
      'analysis-result-card'
    )));
    if (!detail.results.length) results.append(t('p', 'Sin AnalysisResult.', 'muted'));
    root.append(results);
  }

  async function openAnalysisRun(id, token) {
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    state.analysisRunId = id;
    showView('analysisRunDetailView', nav);
    const root = $('#analysisRunDetail');
    root.innerHTML = '';
    root.append(t('p', 'Cargando AnalysisRun…', 'status'));
    try {
      const detail = await aapi(`/analysis-runs/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderAnalysisRun(detail);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(t('p', err.message, 'status error'));
      }
    }
  }

  function openAnalysisInput(input) {
    const nav = beginNavigation();
    if (!isNavigationCurrent(nav)) return;
    state.currentAnalysisInput = input;
    showView('analysisInputDetailView', nav);
    const root = $('#analysisInputDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity analysis-identity';
    const left = document.createElement('div');
    left.append(
      t('p', 'ANALYSIS INPUT', 'eyebrow'),
      t('h1', 'ExternalRecordSnapshot input'),
      t('p', `AnalysisInput ID: ${input.analysis_input_id}`, 'resource-id')
    );
    identity.append(left);
    root.append(identity);

    const inputSection = document.createElement('section');
    inputSection.className = 'section entity-block analysis-section';
    inputSection.append(
      t('h2', 'INPUT'),
      metaLine([input.input_role, `ordinal ${input.ordinal}`, input.input_resource_type]),
      t('p', `input_resource_id: ${input.input_resource_id}`, 'resource-id'),
      t('p', `input_hash: ${input.input_hash}`, 'resource-id')
    );
    root.append(inputSection);

    const snapshot = document.createElement('section');
    snapshot.className = 'section entity-block analysis-section';
    snapshot.append(
      t('h2', 'EXTERNAL RECORD SNAPSHOT'),
      metaLine([input.external_record_code, input.external_id, input.capture_status, input.schema_version]),
      t('p', `Snapshot ID: ${input.input_resource_id}`, 'resource-id'),
      t('p', `payload_hash: ${input.payload_hash}`, 'resource-id'),
      t('p', `raw_asset_id: ${input.raw_asset_id || 'NULL'}`),
      t('p', 'RAW PAYLOAD · preservado; el análisis lo consume sin sobrescribirlo.', 'analysis-warning'),
      json(input.raw_payload),
      t('p', 'NORMALIZED PAYLOAD · sigue separado del resultado analítico.', 'analysis-warning'),
      json(input.normalized_payload)
    );
    root.append(snapshot);
  }

  async function openAnalysisResult(id, token) {
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    showView('analysisResultDetailView', nav);
    const root = $('#analysisResultDetail');
    root.innerHTML = '';
    root.append(t('p', 'Cargando AnalysisResult…', 'status'));
    try {
      const detail = await aapi(`/analysis-results/${id}`);
      if (!isNavigationCurrent(nav)) return;
      state.currentAnalysisResult = detail;
      root.innerHTML = '';

      const identity = document.createElement('div');
      identity.className = 'identity analysis-identity';
      const left = document.createElement('div');
      left.append(
        t('p', 'ANALYSIS RESULT', 'eyebrow'),
        t('h1', `${detail.metric_label} · ${detail.numeric_value ?? 'NULL'}`),
        t('p', `ID: ${detail.analysis_result_id}`, 'resource-id')
      );
      const taxonButton = t('button', 'Volver al TaxonConcept', 'secondary');
      taxonButton.type = 'button';
      taxonButton.onclick = returnToTaxon;
      identity.append(left, taxonButton);
      root.append(identity);

      const result = document.createElement('section');
      result.className = 'section entity-block analysis-section';
      result.append(
        t('h2', 'RESULTADO'),
        metaLine([detail.analysis_result_code, detail.value_status, detail.value_type]),
        t('p', `value_status: ${detail.value_status}`),
        t('p', `numeric_value: ${detail.numeric_value ?? 'NULL'}`, 'analysis-value'),
        t('p', `text_value: ${detail.text_value ?? 'NULL'}`),
        t('p', `boolean_value: ${detail.boolean_value ?? 'NULL'}`),
        t('p', `json_value: ${detail.json_value == null ? 'NULL' : JSON.stringify(detail.json_value)}`),
        t('p', `unit_code: ${detail.unit_code || 'NULL'}`),
        t('p', '7.5 = STAGING / DEMO / SIN SIGNIFICADO CIENTÍFICO.', 'analysis-warning'),
        t('p', 'RESULTADO CALCULADO ≠ VALIDACIÓN CIENTÍFICA · AnalysisResult ≠ Assertion.', 'analysis-warning')
      );
      root.append(result);

      const metric = document.createElement('section');
      metric.className = 'section entity-block analysis-section';
      metric.append(
        t('h2', 'MÉTRICA'),
        t('strong', detail.metric_label),
        metaLine([detail.metric_code, detail.value_type, detail.metric_is_active ? 'activa' : 'inactiva']),
        t('p', detail.metric_description, 'analysis-warning')
      );
      root.append(metric);

      const subject = document.createElement('section');
      subject.className = 'section entity-block analysis-section';
      subject.append(
        t('h2', 'SUJETO'),
        t('strong', detail.scientific_name),
        metaLine([detail.subject_code, detail.subject_validation_status]),
        t('p', `TaxonConcept ID: ${detail.subject_resource_id}`, 'resource-id'),
        t('p', 'El resultado apunta al TaxonConcept; no modifica ni valida su identidad.', 'muted')
      );
      root.append(subject);

      const execution = document.createElement('section');
      execution.className = 'section entity-block analysis-section';
      execution.append(
        t('h2', 'EJECUCIÓN DE ORIGEN'),
        metaLine([detail.analysis_run_code, detail.module_code, detail.method_version, detail.run_status]),
        t('p', `AnalysisRun ID: ${detail.analysis_run_id}`, 'resource-id')
      );
      root.append(execution);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(t('p', err.message, 'status error'));
      }
    }
  }

  function returnToTaxon() {
    const nav = beginNavigation();
    showView('detailView', nav);
    ensureAnalysisButton();
  }

  $('#createAnalysisBtn').onclick = createAnalysis;
  $('#backAnalysisToTaxonBtn').onclick = returnToTaxon;
  $('#backRunToAnalysesBtn').onclick = () => openTaxonAnalyses();
  $('#backInputToRunBtn').onclick = () => state.analysisRunId && openAnalysisRun(state.analysisRunId);
  $('#backResultToRunBtn').onclick = () => state.analysisRunId && openAnalysisRun(state.analysisRunId);

  ensureAnalysisButton();
})();
