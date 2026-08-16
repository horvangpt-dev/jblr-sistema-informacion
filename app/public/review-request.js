(() => {
  state.currentValidationEvent = null;
  state.currentReviewTarget = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="reviewOverviewView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backReviewToAssertionBtn">← Volver al estado regional</button>
      <div class="identity compact review-identity">
        <div>
          <p class="eyebrow">REVISIÓN</p>
          <h1 id="reviewTitle">Solicitud de revisión trazable</h1>
          <p class="muted">pending_review ≠ validated · solicitar revisión ≠ validación científica.</p>
        </div>
        <button class="primary" id="requestReviewBtn">SOLICITAR REVISIÓN</button>
      </div>
      <div id="reviewMessage" class="status"></div>
      <section class="section entity-block review-section">
        <h2>ESTADO DE REVISIÓN</h2>
        <div id="reviewTargetBlock"></div>
      </section>
      <section class="section entity-block review-section">
        <h2>VALIDATION EVENT</h2>
        <div id="validationEventList" class="results"></div>
      </section>
      <section class="section entity-block review-section review-limits">
        <h2>LÍMITES</h2>
        <p><strong>PENDIENTE DE REVISIÓN ≠ VALIDADO.</strong></p>
        <p>ValidationEvent ≠ QualityAssessment · ValidationEvent ≠ Assertion · ValidationEvent ≠ AnalysisResult.</p>
        <p>La solicitud no cambia presencia, términos regionales ni conclusiones científicas.</p>
        <p>MVP13 no ofrece acciones para validar, rechazar o disputar.</p>
      </section>
    </section>

    <section id="validationEventDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backValidationEventBtn">← Volver a revisión</button>
      <div id="validationEventDetail"></div>
    </section>
  `);

  const vt = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };

  const vnav = (token) => token === undefined ? beginNavigation() : token;
  const vnull = (value) => value === null || value === undefined ? 'NO REGISTRADO' : String(value);

  function reviewLabel(statusValue) {
    if (statusValue === 'unreviewed') return 'SIN REVISAR';
    if (statusValue === 'pending_review') return 'PENDIENTE DE REVISIÓN';
    return String(statusValue || 'NO REGISTRADO');
  }

  async function vapi(path, options = {}) {
    const response = await fetch(`/mvp13-api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function renderInlineReviewState() {
    const root = $('#regionalAssertionDetail');
    const identity = root?.querySelector('.identity');
    if (!root || !identity) return;

    if (!$('#openReviewBtn')) {
      const button = vt('button', 'REVISIÓN', 'secondary review-entry-button');
      button.id = 'openReviewBtn';
      button.type = 'button';
      button.onclick = () => openRegionalReview();
      identity.append(button);
    }

    let section = $('#reviewStateInline');
    if (!section) {
      section = document.createElement('section');
      section.id = 'reviewStateInline';
      section.className = 'section entity-block review-section review-inline-state';
      identity.insertAdjacentElement('afterend', section);
    }
    const detail = state.currentRegionalAssertion;
    const raw = detail?.regional_assertion_validation_status;
    const version = detail?.regional_assertion_row_version;
    section.innerHTML = '';
    section.append(
      vt('h2', 'ESTADO DE REVISIÓN'),
      vt('strong', reviewLabel(raw), 'review-state-label'),
      vt('p', `validation_status: ${raw || 'NO REGISTRADO'} · row_version: ${version ?? 'NO REGISTRADO'}`, 'muted'),
      vt('p', raw === 'pending_review' ? 'PENDIENTE DE REVISIÓN ≠ VALIDADO' : 'La solicitud de revisión todavía no se ha registrado.', 'review-warning')
    );
  }

  new MutationObserver(renderInlineReviewState).observe($('#regionalAssertionDetail'), { childList: true, subtree: true });

  function validationEventCard(item) {
    const el = document.createElement('article');
    el.className = 'result-card validation-event-card';
    el.tabIndex = 0;
    const occurredAt = item.occurred_at ? new Date(item.occurred_at).toLocaleString('es-ES') : 'NO REGISTRADO';
    el.append(
      vt('h3', 'ValidationEvent'),
      metaLine([item.validation_event_id, occurredAt]),
      vt('p', `${item.from_validation_status} → ${item.to_validation_status}`, 'review-transition'),
      vt('p', 'Solicitud de revisión · NO es validación científica', 'muted')
    );
    const open = () => openValidationEvent(item.validation_event_id);
    el.onclick = open;
    el.onkeydown = (event) => { if (event.key === 'Enter') open(); };
    return el;
  }

  function renderReviewOverview(detail) {
    state.currentReviewTarget = detail.target;
    if (state.currentRegionalAssertion && state.currentRegionalAssertion.regional_assertion_id === detail.target.regional_assertion_id) {
      state.currentRegionalAssertion.regional_assertion_validation_status = detail.target.regional_assertion_validation_status;
      state.currentRegionalAssertion.regional_assertion_row_version = detail.target.regional_assertion_row_version;
    }
    renderInlineReviewState();

    const target = $('#reviewTargetBlock');
    target.innerHTML = '';
    target.append(
      vt('strong', reviewLabel(detail.target.regional_assertion_validation_status), 'review-state-label review-state-large'),
      vt('p', `RegionalTaxonAssertion: ${detail.target.regional_assertion_id}`, 'resource-id'),
      vt('p', `${detail.target.scientific_name} · ${detail.target.geographic_area_name}`),
      vt('p', `validation_status: ${detail.target.regional_assertion_validation_status} · row_version: ${detail.target.regional_assertion_row_version}`),
      vt('p', `presence_value_status: ${detail.target.presence_value_status} · presence_term_key: ${detail.target.presence_term_key ?? 'NULL'}`, 'review-warning'),
      vt('p', 'DESCONOCIDO ≠ AUSENCIA', 'review-warning')
    );

    const list = $('#validationEventList');
    list.innerHTML = '';
    for (const event of detail.events) list.append(validationEventCard(event));
    if (!detail.events.length) list.append(vt('p', 'No existe todavía una solicitud de revisión MVP13.', 'muted'));

    const request = $('#requestReviewBtn');
    const pending = detail.target.regional_assertion_validation_status === 'pending_review';
    request.disabled = pending;
    request.textContent = pending ? 'REVISIÓN YA SOLICITADA' : 'SOLICITAR REVISIÓN';
    $('#reviewTitle').textContent = `Revisión · ${detail.target.scientific_name} · ${detail.target.geographic_area_name}`;
  }

  async function openRegionalReview(token) {
    const targetId = state.currentRegionalAssertion?.regional_assertion_id || state.currentReviewTarget?.regional_assertion_id;
    if (!targetId) return;
    const nav = vnav(token);
    if (!isNavigationCurrent(nav)) return;
    showView('reviewOverviewView', nav);
    status($('#reviewMessage'), 'Cargando…');
    try {
      const detail = await vapi(`/regional-assertions/${targetId}/review`);
      if (!isNavigationCurrent(nav)) return;
      renderReviewOverview(detail);
      status($('#reviewMessage'), `${detail.events.length} solicitud registrada · pending_review ≠ validated.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#reviewMessage'), err.message, true);
    }
  }

  async function requestReview() {
    const targetId = state.currentReviewTarget?.regional_assertion_id || state.currentRegionalAssertion?.regional_assertion_id;
    if (!targetId) return;
    const nav = beginNavigation();
    showView('reviewOverviewView', nav);
    status($('#reviewMessage'), 'Registrando solicitud de revisión trazable…');
    try {
      await vapi(`/regional-assertions/${targetId}/request-review`, { method: 'POST', body: '{}' });
      if (!isNavigationCurrent(nav)) return;
      await openRegionalReview(nav);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#reviewMessage'), err.message, true);
    }
  }

  function renderValidationEvent(detail) {
    state.currentValidationEvent = detail;
    const root = $('#validationEventDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity review-identity';
    const left = document.createElement('div');
    left.append(
      vt('p', 'VALIDATION EVENT', 'eyebrow'),
      vt('h1', 'Solicitud de revisión trazable'),
      vt('p', `ID: ${detail.validation_event_id}`, 'resource-id'),
      vt('p', 'ValidationEvent ≠ QualityAssessment · ValidationEvent ≠ validación científica', 'review-warning')
    );
    identity.append(left);
    root.append(identity);

    const fields = document.createElement('section');
    fields.className = 'section entity-block review-section';
    fields.append(
      vt('h2', 'EVENTO'),
      vt('h3', 'OBJETO'),
      vt('p', `RegionalTaxonAssertion: ${detail.target_resource_id}`, 'resource-id'),
      vt('h3', 'ESTADO ANTERIOR'),
      vt('p', detail.from_validation_status, 'review-transition'),
      vt('h3', 'ESTADO NUEVO'),
      vt('p', detail.to_validation_status, 'review-transition'),
      vt('p', 'PENDIENTE DE REVISIÓN ≠ VALIDADO', 'review-warning'),
      vt('h3', 'FECHA'),
      vt('p', detail.occurred_at ? new Date(detail.occurred_at).toLocaleString('es-ES') : 'NO REGISTRADO'),
      vt('h3', 'REVISOR'),
      vt('p', vnull(detail.reviewed_by_agent_id), 'review-null'),
      vt('h3', 'ACTIVIDAD'),
      vt('p', vnull(detail.data_activity_id), 'review-null'),
      vt('h3', 'RAZÓN'),
      vt('p', vnull(detail.reason))
    );
    root.append(fields);

    const trace = document.createElement('section');
    trace.className = 'section entity-block review-section';
    trace.append(
      vt('h2', 'TRAZABILIDAD'),
      vt('p', `ValidationEvent → RegionalTaxonAssertion ${detail.target_resource_id}`, 'resource-id'),
      vt('p', `RegionalTaxonAssertion → TaxonConcept ${detail.taxon_concept_id}`, 'resource-id'),
      vt('strong', detail.scientific_name),
      vt('p', `RegionalTaxonAssertion → GeographicArea ${detail.geographic_area_id}`, 'resource-id'),
      vt('strong', `${detail.geographic_area_name} · ${detail.geographic_area_kind}`),
      vt('p', `RTA validation_status: ${detail.regional_assertion_validation_status} · row_version: ${detail.regional_assertion_row_version}`),
      vt('p', `RTA presence: ${detail.presence_value_status} · term: ${detail.presence_term_key ?? 'NULL'}`, 'review-warning')
    );
    root.append(trace);

    const limits = document.createElement('section');
    limits.className = 'section entity-block review-section review-limits';
    limits.append(
      vt('h2', 'LÍMITES DE MVP13'),
      vt('p', 'NO constituye validación científica.'),
      vt('p', 'NO valida, rechaza ni disputa el estado regional.'),
      vt('p', 'NO modifica presencia ni términos regionales.'),
      vt('p', 'NO crea QualityFlag ni puntuaciones de calidad.')
    );
    root.append(limits);
  }

  async function openValidationEvent(id, token) {
    const nav = vnav(token);
    if (!isNavigationCurrent(nav)) return;
    showView('validationEventDetailView', nav);
    const root = $('#validationEventDetail');
    root.innerHTML = '';
    root.append(vt('p', 'Cargando ValidationEvent…', 'status'));
    try {
      const detail = await vapi(`/validation-events/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderValidationEvent(detail);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(vt('p', err.message, 'status error'));
      }
    }
  }

  $('#requestReviewBtn').onclick = requestReview;
  $('#backReviewToAssertionBtn').onclick = () => {
    const nav = beginNavigation();
    showView('regionalAssertionDetailView', nav);
    renderInlineReviewState();
  };
  $('#backValidationEventBtn').onclick = () => openRegionalReview();
})();
