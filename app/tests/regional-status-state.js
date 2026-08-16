const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');
const regional = require('../src/regional-status');

const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const ANALYSIS_RUN_ID = '01a00ca7-8cc3-746f-8db2-6c5a07b5517d';
const ANALYSIS_RESULT_ID = '01a00ca7-8ee3-796b-aa85-f23b9632f57c';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function scalar(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

(async () => {
  try {
    await assertAuthorizedStaging();

    const areaRows = (await pool.query(`
      SELECT ga.*,r.resource_type_code,r.jblr_code,r.validation_status,r.row_version
      FROM core.geographic_area ga
      JOIN core.resource r ON r.resource_id=ga.resource_id
      WHERE lower(ga.name)=lower('La Rioja')
      ORDER BY ga.resource_id
    `)).rows;
    assert(areaRows.length === 1, `Expected one La Rioja GeographicArea, received ${areaRows.length}`);
    const area = areaRows[0];
    assert(area.resource_type_code === 'GAR', 'La Rioja must be a GAR resource');
    assert(area.area_kind === 'autonomous_community', 'La Rioja area_kind mismatch');
    assert(area.validation_status === 'unreviewed', 'GeographicArea must remain unreviewed');

    const assertionRows = (await pool.query(`
      SELECT rta.*,r.resource_type_code,r.jblr_code,r.validation_status,r.row_version
      FROM taxonomy.regional_taxon_assertion rta
      JOIN core.resource r ON r.resource_id=rta.resource_id
      WHERE rta.taxon_concept_id=$1
        AND rta.geographic_area_id=$2
        AND rta.notes LIKE $3
      ORDER BY rta.resource_id
    `,[regional.TAXON_ID,area.resource_id,`${regional.NOTE_PREFIX}%`])).rows;
    assert(assertionRows.length === 1, `Expected one MVP11 RegionalTaxonAssertion, received ${assertionRows.length}`);
    const rta = assertionRows[0];
    assert(rta.resource_type_code === 'RTA', 'RegionalTaxonAssertion must be an RTA resource');
    assert(rta.validation_status === 'unreviewed', 'RegionalTaxonAssertion must remain unreviewed');
    assert(rta.presence_value_status === 'unknown', 'presence_value_status must be unknown');
    assert(rta.presence_term_key === null, 'presence_term_key must be NULL when presence is unknown');

    const secondaryStatuses = [
      ['origin',rta.origin_term_key,rta.origin_value_status],
      ['establishment',rta.establishment_term_key,rta.establishment_value_status],
      ['context',rta.context_term_key,rta.context_value_status],
      ['temporality',rta.temporality_term_key,rta.temporality_value_status],
      ['catalog_inclusion',rta.catalog_inclusion_term_key,rta.catalog_inclusion_value_status]
    ];
    for (const [label,termKey,valueStatus] of secondaryStatuses) {
      assert(termKey === null, `${label}_term_key must remain NULL`);
      assert(valueStatus === 'not_recorded', `${label}_value_status must be not_recorded`);
    }
    assert(rta.source_resource_id === null, 'source_resource_id must be NULL for unknown MVP11 status');
    assert(rta.valid_from === null && rta.valid_to === null, 'MVP11 must not invent validity dates');

    const terms = (await pool.query(`SELECT term_key FROM taxonomy.term ORDER BY term_key`)).rows.map((row) => row.term_key);
    assert(terms.length === 2, `MVP11 must not create regional terms; taxonomy.term count=${terms.length}`);
    assert(terms[0] === 'rank:genus' && terms[1] === 'rank:species', `Unexpected taxonomy terms: ${terms.join(',')}`);

    const locationCollision = await scalar(`SELECT count(*)::int AS n FROM field.location WHERE resource_id=$1`,[area.resource_id]);
    assert(locationCollision.n === 0, 'GeographicArea must not be a field.Location');
    const observationCollision = await scalar(`SELECT count(*)::int AS n FROM field.observation WHERE resource_id=$1`,[rta.resource_id]);
    assert(observationCollision.n === 0, 'RegionalTaxonAssertion must not be an Observation');

    const taxon = await scalar(`
      SELECT r.validation_status,r.row_version
      FROM taxonomy.taxon_concept tc
      JOIN core.resource r ON r.resource_id=tc.resource_id
      WHERE tc.resource_id=$1
    `,[regional.TAXON_ID]);
    assert(taxon.validation_status === 'unreviewed', 'Regional status must not validate TaxonConcept');
    assert(taxon.row_version === 1, 'Regional status must not edit TaxonConcept');

    const identificationCount = await scalar(`SELECT count(*)::int AS n FROM taxonomy.identification`);
    const taxonCount = await scalar(`SELECT count(*)::int AS n FROM taxonomy.taxon_concept`);
    assert(identificationCount.n === 1, `Identification cardinality changed: ${identificationCount.n}`);
    assert(taxonCount.n === 4, `TaxonConcept cardinality changed: ${taxonCount.n}`);

    const snapshot = await scalar(`SELECT payload_hash FROM evidence.external_record_snapshot WHERE resource_id=$1`,[SNAPSHOT_ID]);
    assert(snapshot && snapshot.payload_hash === SNAPSHOT_HASH, 'MVP9 Snapshot hash changed');

    const run = await scalar(`
      SELECT ar.run_status,ar.closed_at,ar.release_label,ar.released_at
      FROM analytics.analysis_run ar
      WHERE ar.resource_id=$1
    `,[ANALYSIS_RUN_ID]);
    assert(run && run.run_status === 'closed' && run.closed_at !== null, 'MVP10 AnalysisRun was not preserved');
    assert(run.release_label === null && run.released_at === null, 'MVP10 AnalysisRun release semantics changed');
    const analysisResult = await scalar(`
      SELECT value_status,numeric_value FROM analytics.analysis_result WHERE resource_id=$1
    `,[ANALYSIS_RESULT_ID]);
    assert(analysisResult && analysisResult.value_status === 'present' && Number(analysisResult.numeric_value) === 7.5,
      'MVP10 AnalysisResult was not preserved');

    const genericAssertion = await scalar(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE resolution_status='unresolved')::int AS unresolved
      FROM evidence.assertion
    `);
    assert(genericAssertion.total === 1 && genericAssertion.unresolved === 1,
      'MVP11 must not resolve or replace the generic Assertion');

    const cardinalities = (await pool.query(`
      SELECT
        (SELECT count(*)::int FROM core.geographic_area) AS geographic_area,
        (SELECT count(*)::int FROM taxonomy.regional_taxon_assertion) AS regional_taxon_assertion,
        (SELECT count(*)::int FROM taxonomy.term) AS taxonomy_term,
        (SELECT count(*)::int FROM taxonomy.identification) AS identification,
        (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
        (SELECT count(*)::int FROM evidence.external_record_snapshot) AS external_record_snapshot,
        (SELECT count(*)::int FROM analytics.analysis_run) AS analysis_run,
        (SELECT count(*)::int FROM analytics.analysis_result) AS analysis_result
    `)).rows[0];

    console.log(JSON.stringify({
      OPEN_TAXON_REGIONAL_STATUS:'PASS',
      CREATE_GEOGRAPHIC_AREA:'PASS',
      OPEN_GEOGRAPHIC_AREA:'PASS',
      CREATE_REGIONAL_TAXON_ASSERTION:'PASS',
      OPEN_REGIONAL_TAXON_ASSERTION:'PASS',
      LINK_REGIONAL_ASSERTION_TAXON:'PASS',
      LINK_REGIONAL_ASSERTION_AREA:'PASS',
      GEOGRAPHIC_AREA_NOT_LOCATION:'PASS',
      REGIONAL_ASSERTION_NOT_OBSERVATION:'PASS',
      UNKNOWN_WITH_NULL_TERM:'PASS',
      UNKNOWN_NOT_ABSENCE:'PASS',
      NOT_RECORDED_NOT_ABSENCE:'PASS',
      NO_FAKE_REGIONAL_TERMS:'PASS',
      NO_TAXONOMIC_VALIDATION_FROM_REGIONAL_STATUS:'PASS',
      NO_NEW_IDENTIFICATION:'PASS',
      NO_NEW_TAXON_CONCEPT:'PASS',
      PRESERVE_MVP9_SNAPSHOT:'PASS',
      PRESERVE_MVP10_ANALYSIS:'PASS',
      PERSIST_REGIONAL_STATUS_TO_NEON:'PASS',
      geographicAreaId:area.resource_id,
      geographicAreaCode:area.jblr_code,
      regionalAssertionId:rta.resource_id,
      regionalAssertionCode:rta.jblr_code,
      taxonConceptId:regional.TAXON_ID,
      presenceValueStatus:rta.presence_value_status,
      presenceTermKey:rta.presence_term_key,
      sourceResourceId:rta.source_resource_id,
      cardinalities
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
