(() => {
  state.currentLocationGeoreference = null;
  state.currentLocationGeometryVersion = null;

  document.querySelector('main').insertAdjacentHTML('beforeend', `
    <section id="locationGeoreferenceView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backGeoreferenceToPopulationBtn">← Volver a la población</button>
      <div class="identity compact georeference-identity">
        <div>
          <p class="eyebrow">GEORREFERENCIACIÓN</p>
          <h1 id="georeferenceTitle">Georreferenciación de la localización</h1>
          <p class="muted">Location ≠ LocationGeometryVersion · georreferenciación ≠ validación científica.</p>
        </div>
        <button class="primary" id="createGeometryVersionBtn">Crear / reutilizar geometría demo</button>
      </div>
      <div id="georeferenceMessage" class="status"></div>
      <section class="section entity-block georeference-section">
        <h2>LOCALIZACIÓN</h2>
        <div id="georeferenceLocationBlock"></div>
      </section>
      <section class="section entity-block georeference-section">
        <h2>HISTORIAL DE GEOMETRÍA</h2>
        <div id="locationGeometryVersionList" class="results"></div>
      </section>
      <section class="section entity-block georeference-section georeference-limits">
        <h2>LÍMITES MVP14</h2>
        <p><strong>STAGING / DEMO / NO REAL LOCATION.</strong></p>
        <p>La geometría sintética no es una fuente verbatim, no representa GPS y no afirma presencia de ningún taxón.</p>
        <p>preferred geometry ≠ scientifically validated geometry.</p>
      </section>
    </section>

    <section id="locationGeometryVersionDetailView" class="panel hidden" aria-live="polite">
      <button class="link-button" id="backGeometryToGeoreferenceBtn">← Volver a georreferenciación</button>
      <div id="locationGeometryVersionDetail"></div>
    </section>
  `);

  const gt = (tag, value, cls = '') => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value ?? '—';
    return el;
  };
  const gnull = (value) => value === null || value === undefined ? 'NO REGISTRADO' : String(value);
  const navToken = (token) => token === undefined ? beginNavigation() : token;

  async function gapi(path, options = {}) {
    const response = await fetch(`/mvp14-api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  let georeferenceButtonScheduled = false;
  function ensureGeoreferenceButtons() {
    if (georeferenceButtonScheduled) return;
    georeferenceButtonScheduled = true;
    queueMicrotask(() => {
      georeferenceButtonScheduled = false;
      const cards = [...document.querySelectorAll('#populationDetail .location-card')];
      const locations = state.currentPopulation?.locations || [];
      cards.forEach((card, index) => {
        const location = locations[index];
        if (!location || card.querySelector('.georeference-entry-button')) return;
        const head = card.querySelector('.card-head') || card;
        const button = gt('button', 'GEORREFERENCIACIÓN', 'secondary georeference-entry-button');
        button.type = 'button';
        button.dataset.locationId = location.location_id;
        button.onclick = () => openLocationGeoreference(location.location_id);
        head.append(button);
      });
    });
  }
  new MutationObserver(ensureGeoreferenceButtons).observe($('#populationDetail'), { childList: true, subtree: true });

  function geometryCard(item) {
    const card = document.createElement('article');
    card.className = 'result-card location-geometry-version-card';
    card.tabIndex = 0;
    card.append(
      gt('h3', `Versión ${item.version_no}`),
      metaLine([
        item.geometry_type,
        `SRID ${item.actual_srid}`,
        item.geometry_role,
        item.is_preferred ? 'PREFERIDA' : null
      ]),
      gt('p', item.geometry_type === 'POINT'
        ? `Longitud (X): ${item.longitude} · Latitud (Y): ${item.latitude}`
        : item.geometry_wkt, 'geometry-coordinates'),
      gt('p', `Incertidumbre: ${item.uncertainty_m === null ? 'NO REGISTRADO' : `${item.uncertainty_m} m`}`, 'muted')
    );
    const open = () => openLocationGeometryVersion(item.geometry_version_id);
    card.onclick = open;
    card.onkeydown = (event) => { if (event.key === 'Enter') open(); };
    return card;
  }

  function renderLocationGeoreference(detail) {
    state.currentLocationGeoreference = detail;
    $('#georeferenceTitle').textContent = `Georreferenciación · ${detail.location.location_name}`;

    const location = $('#georeferenceLocationBlock');
    location.innerHTML = '';
    location.append(
      gt('strong', detail.location.location_name),
      metaLine([detail.location.location_code, detail.location.location_kind, detail.location.resolution_status]),
      gt('p', `ID: ${detail.location.location_id}`, 'resource-id'),
      gt('p', `Localidad literal: ${gnull(detail.location.verbatim_locality)}`),
      gt('p', `Poblaciones vinculadas: ${detail.location.population_count}`),
      gt('p', 'La localidad literal original se conserva separada de cualquier geometría interpretada.', 'georeference-warning')
    );

    const list = $('#locationGeometryVersionList');
    list.innerHTML = '';
    detail.versions.forEach((item) => list.append(geometryCard(item)));
    if (!detail.versions.length) list.append(gt('p', 'No existe todavía una versión de geometría para esta Location.', 'muted'));

    const create = $('#createGeometryVersionBtn');
    const exists = detail.versions.length > 0;
    create.disabled = exists;
    create.textContent = exists ? 'VERSIÓN DEMO YA CREADA' : 'CREAR GEOMETRÍA DEMO';
  }

  async function openLocationGeoreference(locationId, token) {
    if (!locationId) return;
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    showView('locationGeoreferenceView', nav);
    status($('#georeferenceMessage'), 'Cargando…');
    try {
      const detail = await gapi(`/locations/${locationId}/georeference`);
      if (!isNavigationCurrent(nav)) return;
      renderLocationGeoreference(detail);
      status($('#georeferenceMessage'), `${detail.versions.length} versión${detail.versions.length === 1 ? '' : 'es'} · geometría sintética STAGING.`);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#georeferenceMessage'), err.message, true);
    }
  }
  window.openLocationGeoreference = openLocationGeoreference;

  async function createDemoGeometry() {
    const locationId = state.currentLocationGeoreference?.location?.location_id;
    if (!locationId) return;
    const nav = beginNavigation();
    showView('locationGeoreferenceView', nav);
    status($('#georeferenceMessage'), 'Creando / reutilizando versión geométrica sintética…');
    try {
      await gapi(`/locations/${locationId}/georeference-demo`, { method: 'POST', body: '{}' });
      if (!isNavigationCurrent(nav)) return;
      await openLocationGeoreference(locationId, nav);
    } catch (err) {
      if (isNavigationCurrent(nav)) status($('#georeferenceMessage'), err.message, true);
    }
  }

  function renderGeometryDetail(detail) {
    state.currentLocationGeometryVersion = detail;
    const root = $('#locationGeometryVersionDetail');
    root.innerHTML = '';

    const identity = document.createElement('div');
    identity.className = 'identity georeference-identity';
    const left = document.createElement('div');
    left.append(
      gt('p', 'LOCATION GEOMETRY VERSION', 'eyebrow'),
      gt('h1', `Versión ${detail.version_no} · ${detail.location_name}`),
      gt('p', `ID: ${detail.geometry_version_id}`, 'resource-id'),
      gt('p', 'STAGING / DEMO / NO REAL LOCATION', 'georeference-warning')
    );
    identity.append(left);
    root.append(identity);

    const fields = document.createElement('section');
    fields.className = 'section entity-block georeference-section geometry-fields';
    fields.append(
      gt('h2', 'GEORREFERENCIACIÓN'),
      gt('h3', 'LOCALIZACIÓN'), gt('p', `${detail.location_name} · ${detail.location_id}`, 'resource-id'),
      gt('h3', 'VERSIÓN'), gt('p', String(detail.version_no)),
      gt('h3', 'TIPO DE GEOMETRÍA'), gt('p', detail.geometry_type),
      gt('h3', 'COORDENADAS'),
      gt('p', detail.geometry_type === 'POINT' ? `Longitud (X, EPSG:4326): ${detail.longitude}` : detail.geometry_wkt, 'geometry-coordinates'),
      gt('p', detail.geometry_type === 'POINT' ? `Latitud (Y, EPSG:4326): ${detail.latitude}` : 'NO REGISTRADO', 'geometry-coordinates'),
      gt('h3', 'SRID'), gt('p', `${detail.actual_srid} · source_srid: ${gnull(detail.source_srid)}`),
      gt('h3', 'ROL'), gt('p', detail.geometry_role),
      gt('h3', 'INCERTIDUMBRE'), gt('p', detail.uncertainty_m === null ? 'NO REGISTRADO' : `${detail.uncertainty_m} m`, 'geometry-null'),
      gt('h3', 'MÉTODO'), gt('p', gnull(detail.georeference_method)),
      gt('h3', 'PREFERIDA'), gt('p', detail.is_preferred ? 'SÍ' : 'NO'),
      gt('h3', 'FUENTE'), gt('p', gnull(detail.source_resource_id), 'geometry-null'),
      gt('h3', 'VERBATIM COORDINATES'), gt('p', gnull(detail.verbatim_coordinates), 'geometry-null'),
      gt('h3', 'SOURCE GEOMETRY TEXT'), gt('p', gnull(detail.source_geometry_text), 'geometry-null'),
      gt('h3', 'NOTAS'), gt('p', gnull(detail.notes))
    );
    root.append(fields);

    const trace = document.createElement('section');
    trace.className = 'section entity-block georeference-section';
    trace.append(
      gt('h2', 'TRAZABILIDAD'),
      gt('p', `LocationGeometryVersion → Location ${detail.location_id}`, 'resource-id'),
      gt('p', 'Location ≠ LocationGeometryVersion', 'georeference-warning')
    );
    for (const pop of detail.populations || []) {
      trace.append(gt('p', `Location → PopulationLocation → Population ${pop.population_id}`, 'resource-id'));
      trace.append(gt('strong', pop.population_label || pop.population_id));
    }
    trace.append(
      gt('p', 'Geometría ≠ presencia del taxón · coordenada ≠ identificación taxonómica.', 'georeference-warning'),
      gt('p', 'Preferred geometry ≠ scientifically validated geometry.', 'georeference-warning')
    );
    root.append(trace);
  }

  async function openLocationGeometryVersion(id, token) {
    const nav = navToken(token);
    if (!isNavigationCurrent(nav)) return;
    showView('locationGeometryVersionDetailView', nav);
    const root = $('#locationGeometryVersionDetail');
    root.innerHTML = '';
    root.append(gt('p', 'Cargando LocationGeometryVersion…', 'status'));
    try {
      const detail = await gapi(`/location-geometry-versions/${id}`);
      if (!isNavigationCurrent(nav)) return;
      renderGeometryDetail(detail);
    } catch (err) {
      if (isNavigationCurrent(nav)) {
        root.innerHTML = '';
        root.append(gt('p', err.message, 'status error'));
      }
    }
  }

  $('#createGeometryVersionBtn').onclick = createDemoGeometry;
  $('#backGeoreferenceToPopulationBtn').onclick = () => {
    const nav = beginNavigation();
    showView('populationDetailView', nav);
    ensureGeoreferenceButtons();
  };
  $('#backGeometryToGeoreferenceBtn').onclick = () => {
    const locationId = state.currentLocationGeometryVersion?.location_id || state.currentLocationGeoreference?.location?.location_id;
    openLocationGeoreference(locationId);
  };
})();
