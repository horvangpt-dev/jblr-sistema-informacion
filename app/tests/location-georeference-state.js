const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');
const geo = require('../src/location-georeference');

const VALIDATION_EVENT_ID = '01a00d10-7d9b-7e10-859e-36f0e6b580c7';
const RTA_ID = '01a00cd2-04ef-706a-9e14-2d47c9de0a18';
const QUALITY_ID = '01a00ce6-7146-7388-99cf-55299f3ab39c';
const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const ANALYSIS_RUN_ID = '01a00ca7-8cc3-746f-8db2-6c5a07b5517d';
const ANALYSIS_RESULT_ID = '01a00ca7-8ee3-796b-aa85-f23b9632f57c';

function assert(condition, message) { if (!condition) throw new Error(message); }
async function scalar(sql, params = []) { const { rows } = await pool.query(sql, params); return rows[0]; }

(async () => {
  try {
    await assertAuthorizedStaging();

    const first = await geo.createOrReuseDemoGeometry(geo.DEMO_LOCATION_ID);
    const second = await geo.createOrReuseDemoGeometry(geo.DEMO_LOCATION_ID);
    assert(first.geometry.geometry_version_id === second.geometry.geometry_version_id, 'Repeated create/reuse changed LocationGeometryVersion identity');
    assert(String(first.geometry.geometry_created_at) === String(second.geometry.geometry_created_at), 'Repeated create/reuse changed geometry created_at');
    assert(second.created === false, 'Second create/reuse must reuse existing geometry');

    const rows = (await pool.query(`
      SELECT lgv.*,r.resource_type_code,r.validation_status,r.created_at,
             GeometryType(lgv.geom) AS geometry_type,ST_GeometryType(lgv.geom) AS st_geometry_type,
             ST_SRID(lgv.geom) AS actual_srid,ST_AsText(lgv.geom) AS wkt,
             ST_X(lgv.geom) AS longitude,ST_Y(lgv.geom) AS latitude
      FROM field.location_geometry_version lgv
      JOIN core.resource r ON r.resource_id=lgv.resource_id
      WHERE lgv.location_id=$1
      ORDER BY lgv.version_no
    `, [geo.DEMO_LOCATION_ID])).rows;
    assert(rows.length === 1, `Expected one LocationGeometryVersion, received ${rows.length}`);
    const g = rows[0];
    assert(g.resource_type_code === 'LGE', 'Geometry resource must be LGE');
    assert(Number(g.version_no) === 1, 'version_no must remain 1');
    assert(g.geometry_type === 'POINT' && g.st_geometry_type === 'ST_Point', 'Geometry must be Point');
    assert(Number(g.actual_srid) === 4326 && Number(g.source_srid) === 4326, 'SRID must be 4326');
    assert(g.wkt === 'POINT(0 0)', `Unexpected synthetic WKT ${g.wkt}`);
    assert(Number(g.longitude) === 0 && Number(g.latitude) === 0, 'EPSG:4326 X/Y longitude/latitude order mismatch');
    assert(g.geometry_role === 'interpreted', 'geometry_role must be interpreted');
    assert(g.uncertainty_m === null, 'uncertainty_m must remain NULL, not zero');
    assert(g.verbatim_coordinates === null, 'Synthetic geometry must not become verbatim_coordinates');
    assert(g.source_geometry_text === null, 'Synthetic geometry must not become source_geometry_text');
    assert(g.source_resource_id === null, 'Synthetic geometry must not invent a scientific source');
    assert(g.valid_from === null && g.valid_to === null, 'Synthetic geometry must not invent validity dates');
    assert(g.is_preferred === true, 'Demo geometry must be preferred');
    assert(g.georeference_method === geo.DEMO_METHOD, 'Demo georeference method changed');
    assert(g.notes === geo.DEMO_NOTES, 'Demo geometry notes changed');
    assert(!/gps/i.test(g.georeference_method) && !/gps/i.test(g.notes), 'MVP14 must not invent GPS provenance');

    const preferred = await scalar(`SELECT count(*)::int AS n FROM field.location_geometry_version WHERE location_id=$1 AND is_preferred=true`, [geo.DEMO_LOCATION_ID]);
    assert(preferred.n === 1, `Expected exactly one preferred geometry, received ${preferred.n}`);

    const location = await scalar(`SELECT resource_id,location_name,verbatim_locality,notes FROM field.location WHERE resource_id=$1`, [geo.DEMO_LOCATION_ID]);
    assert(location && location.verbatim_locality === geo.DEMO_VERBATIM_LOCALITY, 'Location verbatim_locality was modified');

    const populationLink = await scalar(`SELECT count(*)::int AS n FROM field.population_location WHERE population_id=$1 AND location_id=$2`, [geo.DEMO_POPULATION_ID, geo.DEMO_LOCATION_ID]);
    assert(populationLink.n === 1, 'PopulationLocation link changed');
    const projection = await scalar(`SELECT population_resource_id,location_id,geometry_version_resource_id,geometry_role,uncertainty_m,source_srid,version_no,is_preferred FROM security.v_population_geometry_projection WHERE population_resource_id=$1 AND location_id=$2`, [geo.DEMO_POPULATION_ID, geo.DEMO_LOCATION_ID]);
    assert(projection && projection.geometry_version_resource_id === g.resource_id, 'Preferred geometry projection does not trace to Population');
    assert(projection.is_preferred === true && Number(projection.version_no) === 1, 'Preferred geometry projection mismatch');

    const validationEvent = await scalar(`SELECT target_resource_id,from_validation_status,to_validation_status,reviewed_by_agent_id,occurred_at,data_activity_id,reason FROM governance.validation_event WHERE resource_id=$1`, [VALIDATION_EVENT_ID]);
    assert(validationEvent && validationEvent.target_resource_id === RTA_ID, 'MVP13 ValidationEvent target changed');
    assert(validationEvent.from_validation_status === 'unreviewed' && validationEvent.to_validation_status === 'pending_review', 'MVP13 ValidationEvent transition changed');
    assert(validationEvent.reviewed_by_agent_id === null && validationEvent.data_activity_id === null, 'MVP13 reviewer/activity semantics changed');
    assert(validationEvent.reason === 'STAGING / DEMO / MVP13 REVIEW REQUEST · NO SCIENTIFIC VALIDATION', 'MVP13 ValidationEvent reason changed');

    const rta = await scalar(`SELECT r.validation_status,r.row_version,rta.presence_value_status,rta.presence_term_key,rta.source_resource_id FROM taxonomy.regional_taxon_assertion rta JOIN core.resource r ON r.resource_id=rta.resource_id WHERE rta.resource_id=$1`, [RTA_ID]);
    assert(rta && rta.validation_status === 'pending_review' && Number(rta.row_version) === 2, 'MVP13 review state changed');
    assert(rta.presence_value_status === 'unknown' && rta.presence_term_key === null && rta.source_resource_id === null, 'MVP11 regional presence changed');

    const quality = await scalar(`SELECT score,assessed_by_agent_id,data_activity_id FROM governance.quality_assessment WHERE resource_id=$1`, [QUALITY_ID]);
    assert(quality && quality.score === null && quality.assessed_by_agent_id === null && quality.data_activity_id === null, 'MVP12 QualityAssessment changed');

    const snapshot = await scalar(`SELECT payload_hash FROM evidence.external_record_snapshot WHERE resource_id=$1`, [SNAPSHOT_ID]);
    assert(snapshot && snapshot.payload_hash === SNAPSHOT_HASH, 'MVP9 Snapshot changed');
    const run = await scalar(`SELECT run_status,closed_at FROM analytics.analysis_run WHERE resource_id=$1`, [ANALYSIS_RUN_ID]);
    assert(run && run.run_status === 'closed' && run.closed_at !== null, 'MVP10 AnalysisRun changed');
    const analysis = await scalar(`SELECT value_status,numeric_value FROM analytics.analysis_result WHERE resource_id=$1`, [ANALYSIS_RESULT_ID]);
    assert(analysis && analysis.value_status === 'present' && Number(analysis.numeric_value) === 7.5, 'MVP10 AnalysisResult changed');

    const cardinalities = (await pool.query(`
      SELECT
        (SELECT count(*)::int FROM field.location_geometry_version) AS location_geometry_version,
        (SELECT count(*)::int FROM field.location) AS location,
        (SELECT count(*)::int FROM field.population) AS population,
        (SELECT count(*)::int FROM field.population_location) AS population_location,
        (SELECT count(*)::int FROM governance.quality_assessment) AS quality_assessment,
        (SELECT count(*)::int FROM governance.quality_flag) AS quality_flag,
        (SELECT count(*)::int FROM governance.validation_event) AS validation_event,
        (SELECT count(*)::int FROM core.geographic_area) AS geographic_area,
        (SELECT count(*)::int FROM taxonomy.regional_taxon_assertion) AS regional_taxon_assertion,
        (SELECT count(*)::int FROM taxonomy.term) AS taxonomy_term,
        (SELECT count(*)::int FROM taxonomy.identification) AS identification,
        (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
        (SELECT count(*)::int FROM evidence.external_record_snapshot) AS external_record_snapshot,
        (SELECT count(*)::int FROM analytics.analysis_run) AS analysis_run,
        (SELECT count(*)::int FROM analytics.analysis_result) AS analysis_result,
        (SELECT count(*)::int FROM evidence.assertion) AS assertion,
        (SELECT count(*)::int FROM evidence.assertion WHERE resolution_status='unresolved') AS unresolved_assertion,
        (SELECT count(*)::int FROM evidence.digital_asset) AS digital_asset,
        (SELECT count(*)::int FROM security.sensitivity_assignment) AS sensitivity_assignment,
        (SELECT count(*)::int FROM security.spatial_disclosure_policy) AS spatial_disclosure_policy
    `)).rows[0];

    const expected = {
      location_geometry_version:1, location:1, population:1, population_location:1,
      quality_assessment:1, quality_flag:0, validation_event:1, geographic_area:1,
      regional_taxon_assertion:1, taxonomy_term:2, identification:1, taxon_concept:4,
      external_record_snapshot:1, analysis_run:1, analysis_result:1, assertion:1,
      unresolved_assertion:1, digital_asset:0, sensitivity_assignment:0, spatial_disclosure_policy:0
    };
    for (const [key,value] of Object.entries(expected)) assert(cardinalities[key] === value, `${key} cardinality changed: ${cardinalities[key]} != ${value}`);

    console.log(JSON.stringify({
      OPEN_LOCATION_GEOREFERENCE:'PASS',
      CREATE_LOCATION_GEOMETRY_VERSION:'PASS',
      OPEN_LOCATION_GEOMETRY_VERSION:'PASS',
      LINK_GEOMETRY_TO_LOCATION:'PASS',
      TRACE_GEOMETRY_TO_POPULATION:'PASS',
      LOCATION_NOT_GEOMETRY_VERSION:'PASS',
      POPULATION_NOT_LOCATION:'PASS',
      GEOMETRY_NOT_TAXON_PRESENCE:'PASS',
      GEOREFERENCE_NOT_SCIENTIFIC_VALIDATION:'PASS',
      GEOMETRY_ROLE_INTERPRETED:'PASS',
      SRID_4326:'PASS',
      LONGITUDE_LATITUDE_ORDER_CORRECT:'PASS',
      UNCERTAINTY_NULL_NOT_ZERO:'PASS',
      NO_FAKE_GPS_SOURCE:'PASS',
      NO_FAKE_SCIENTIFIC_SOURCE:'PASS',
      SYNTHETIC_GEOMETRY_NOT_VERBATIM_SOURCE:'PASS',
      ONE_PREFERRED_GEOMETRY_PER_LOCATION:'PASS',
      VERSION_NO_1:'PASS',
      NO_OVERWRITE_GEOMETRY_HISTORY:'PASS',
      NO_DUPLICATE_LOCATION_GEOMETRY_VERSION:'PASS',
      PRESERVE_LOCATION_VERBATIM_LOCALITY:'PASS',
      PRESERVE_MVP13_REVIEW_STATE:'PASS',
      PRESERVE_MVP12_QUALITY_ASSESSMENT:'PASS',
      PRESERVE_MVP11_REGIONAL_STATUS:'PASS',
      PRESERVE_MVP10_ANALYSIS:'PASS',
      PRESERVE_MVP9_SNAPSHOT:'PASS',
      NO_NEW_LOCATION:'PASS',
      NO_NEW_POPULATION:'PASS',
      NO_NEW_IDENTIFICATION:'PASS',
      NO_NEW_TAXON_CONCEPT:'PASS',
      PERSIST_LOCATION_GEOMETRY_TO_NEON:'PASS',
      SENSITIVITY_ASSIGNMENT_MVP14:'OUT_OF_SCOPE',
      SPATIAL_DISCLOSURE_POLICY_MVP14:'OUT_OF_SCOPE',
      geometryVersionId:g.resource_id,
      locationId:geo.DEMO_LOCATION_ID,
      populationId:geo.DEMO_POPULATION_ID,
      geometryCreatedAt:g.created_at,
      versionNo:g.version_no,
      geometryType:g.geometry_type,
      wkt:g.wkt,
      longitude:g.longitude,
      latitude:g.latitude,
      actualSrid:g.actual_srid,
      sourceSrid:g.source_srid,
      uncertaintyM:g.uncertainty_m,
      isPreferred:g.is_preferred,
      cardinalities
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
