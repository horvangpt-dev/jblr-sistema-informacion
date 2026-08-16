(() => {
  state.currentQualityTarget = null;
  state.currentQualityAssessment = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="qualityOverviewView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backQualityToAssertionBtn">← Volver al estado regional</button>
      <div class="identity compact quality-identity">
        <div>
          <p class="eyebrow">CALIDAD</p>
          <h1 id="qualityTitle">Revisión de calidad trazable</h1>
          <p class="muted">QualityAssessment ≠ ValidationEvent · QualityAssessment ≠ validación científica.</p>
        </div>
        <button class="primary" id="createQualityAssessmentBtn">Crear / reutilizar revisión demo</button>
      </div>
      <div id="qualityMessage" class="status"></div>
      <section class="section entity-block quality-section">
        <h2>OBJETO EVALUADO</h2>
        <div id="qualityTargetBlock"></div>
      </section>
      <section class="section entity-block quality-section">
        <h2>EVALUACIONES</h2>
        <div id="qualityAssessmentList" class="results"></div>
      </section>
      <section class="section entity-block quality-section quality-semantics">
        <h2>LÍMITES</h2>
        <p>La revisión técnica no valida científicamente el registro y no modifica su estado regional.</p>
        <p><strong>score = NULL</strong> significa puntuación no registrada; NULL ≠ 0.</p>
        <p>No se crean QualityFlag ni ValidationEvent en MVP12.</p>
      </section>
    </section>

    <section id="qualityAssessmentDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backQualityDetailBtn">← Volver a calidad</button>
      <div id="qualityAssessmentDetail"></div>
    </section>
  `);

  const qt = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };

  const qnav = (token) => token === undefined ? beginNavigation() : token;
  const qnull = (value) => value === null || value === undefined ? 'NULL' : String(value);

  async function qapi(path, options = {}) {
    const response = await fetch(`/mvp12-api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function ensureQualityButton() {
    const identity = $('#regionalAssertionDetail .identity');
    if (!identity || $('#openQualityBtn')) return;
    const button = qt('button', 'CALIDAD', 'secondary quality-entry-button');
    button.id = 'openQualityBtn';
    button.type = 'button';
    button.onclick = () => openRegionalQuality();
    identity.append(button);
  }
  new MutationObserver(ensureQualityButton).observe($('#regionalAssertionDetail'), { childList: true, subtree: true });

  function qualityCard(item) {
    const el = document.createElement('article');
    el.className = 'result-card quality-assessment-card';
    el.tabIndex = 0;
    const assessedAt = item.assessed_at ? new Date(item.assessed_at).toLocaleString('es-ES') : 'NULL';
    el.append(
      qt('h3', 'QualityAssessment'),
      metaLine([item.quality_assessment_id, assessedAt]),
      qt('p', `${item.method_text || 'NULL'} · score: ${qnull(item.score)}`, 'muted')
    );
    const open = () => openQualityAssessment(item.quality_assessment_id);
    el.onclick = open;
    el.onkeydown = (event) => { if (event.key === 'Enter') open(); };
    return el;
  }

  function renderQualityOverview(detail) {
    state.currentQualityTarget = detail.target;
    const targetRoot = $('#qualityTargetBlock');
    targetRoot.innerHTML = '';
    targetRoot.append(
      qt('p', `RegionalTaxonAssertion: ${detail.target.regional_assertion_id}`, 'resource-id'),
      qt('strong', `${detail.target.scientific_name} · ${detail.target.geographic_area_name}`),
      qt('p', `presence_value_status: ${detail.target.presence_value_status} · presence_term_key: ${qnull(detail.target.presence_term_key)}`),
      qt('p', `validation_status: ${detail.target.regional_assertion_validation_status} · row_version: ${detail.target.regional_assertion_row_version}`, 'muted'),
      qt('p', 'DESCONOCIDO ≠ AUSENCIA · la revisión de calidad no altera este estado.', 'quality-warning')
    );

    const list = $('#qualityAssessmentList');
    list.innerHTML = '';
    for (const item of detail.assessments) list.append(qualityCard(item));
    if (!detail.assessments.length) list.append(qt('p', 'No existe todavía QualityAssessment MVP12.', 'muted'));
    $('#qualityTitle').textContent = `Calidad · ${detail.target.scientific_name} · ${detail.target.geographic_area_name}`;
  }

  async function openRegionalQuality(token) {
    const targetId = state.currentRegionalAssertion?.regional_assertion_id || state.currentQualityTarget?.regional_assertion_id;
    if (!targetId) return;
    const nav = qnav(token);
    if (!isNavigationCurrent(nav)) return;
    showView('qualityOverviewView', nav);
    status($('#qualityMessage'), 'Cargando…');
    try {
      const detail = await qapi(`/regional-assertions/${targetId}/quality`);
      if (!isNavigationCurrent(nav)) return;
      renderQualityOverview(detail);
      status($('#qualityMessage'), `${detail.assessments.length} evaluación registrada · revisión técnica ≠ validación científica.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#qualityMessage'), err.message, true);
    }
  }

  async function createQualityAssessment() {
    const targetId = state.currentQualityTarget?.regional_assertion_id || state.currentRegionalAssertion?.regional_assertion_id;
    if (!targetId) return;
    const nav = beginNavigation();
    showView('qualityOverviewView', nav);
    status($('#qualityMessage'), 'Creando / reutilizando revisión técnica segura…');
    try {
      await qapi(`/regional-assertions/${targetId}/quality-demo`, { method: 'POST', body: '{}' });
      if (!isNavigationCurrent(nav)) return;
      await openRegionalQuality(nav);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#qualityMessage'), err.message, true);
    }
  }

  function renderQualityAssessment(detail) {
    state.currentQualityAssessment = detail;
    const root = $('#qualityAssessmentDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity quality-identity';
    const left = document.createElement('div');
    left.append(
      qt('p', 'QUALITY ASSESSMENT', 'eyebrow'),
      qt('h1', 'Revisión de calidad trazable'),
      qt('p', `ID: ${detail.quality_assessment_id}`, 'resource-id'),
      qt('p', 'QualityAssessment ≠ ValidationEvent · QualityAssessment ≠ Assertion · QualityAssessment ≠ AnalysisResult', 'quality-warning')
    );
    identity.append(left);
    root.append(identity);

    const fields = document.createElement('section');
    fields.className = 'section entity-block quality-section';
    fields.append(
      qt('h2', 'EVALUACIÓN'),
      qt('h3', 'OBJETO EVALUADO'),
      qt('p', `RegionalTaxonAssertion: ${detail.target_resource_id}`, 'resource-id'),
      qt('h3', 'FECHA DE EVALUACIÓN'),
      qt('p', detail.assessed_at ? new Date(detail.assessed_at).toLocaleString('es-ES') : 'NULL'),
      qt('h3', 'MÉTODO'),
      qt('p', qnull(detail.method_text)),
      qt('h3', 'REVISOR'),
      qt('p', qnull(detail.assessed_by_agent_id), 'quality-null'),
      qt('h3', 'PUNTUACIÓN'),
      qt('p', qnull(detail.score), 'quality-score'),
      qt('p', 'NULL ≠ 0', 'quality-warning'),
      qt('h3', 'RESUMEN'),
      qt('p', qnull(detail.summary)),
      qt('p', `data_activity_id: ${qnull(detail.data_activity_id)}`, 'resource-id')
    );
    root.append(fields);

    const trace = document.createElement('section');
    trace.className = 'section entity-block quality-section';
    trace.append(
      qt('h2', 'TRAZABILIDAD'),
      qt('p', `QualityAssessment → RegionalTaxonAssertion ${detail.target_resource_id}`, 'resource-id'),
      qt('p', `RegionalTaxonAssertion → TaxonConcept ${detail.taxon_concept_id}`, 'resource-id'),
      qt('strong', detail.scientific_name),
      qt('p', `RegionalTaxonAssertion → GeographicArea ${detail.geographic_area_id}`, 'resource-id'),
      qt('strong', `${detail.geographic_area_name} · ${detail.geographic_area_kind}`),
      qt('p', `RTA validation_status: ${detail.regional_assertion_validation_status} · row_version: ${detail.regional_assertion_row_version}`, 'muted'),
      qt('p', `RTA presence: ${detail.presence_value_status} · term: ${qnull(detail.presence_term_key)}`, 'quality-warning')
    );
    root.append(trace);

    const limits = document.createElement('section');
    limits.className = 'section entity-block quality-section';
    limits.append(
      qt('h2', 'LÍMITES DE LA DEMO'),
      qt('p', 'NO constituye validación científica.'),
      qt('p', 'NO constituye una puntuación de calidad.'),
      qt('p', 'NO modifica la RegionalTaxonAssertion.'),
      qt('p', 'NO crea QualityFlag.'),
      qt('p', 'NO crea ValidationEvent.')
    );
    root.append(limits);
  }

  async function openQualityAssessment(id, token) {
    const nav = qnav(token);
    if (!isNavigationCurrent(nav)) return;
    showView('qualityAssessmentDetailView', nav);
    const root = $('#qualityAssessmentDetail');
    root.innerHTML = '';
    root.append(qt('p', 'Cargando QualityAssessment…', 'status'));
    try {
      const detail = await qapi(`/quality-assessments/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderQualityAssessment(detail);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(qt('p', err.message, 'status error'));
      }
    }
  }

  $('#createQualityAssessmentBtn').onclick = createQualityAssessment;
  $('#backQualityToAssertionBtn').onclick = () => {
    const nav = beginNavigation();
    showView('regionalAssertionDetailView', nav);
  };
  $('#backQualityDetailBtn').onclick = () => openRegionalQuality();
})();
