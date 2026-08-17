const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');
const quality = require('../src/quality-review');

const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const ANALYSIS_RUN_ID = '01a00ca7-8cc3-746f-8db2-6c5a07b5517d';
const ANALYSIS_RESULT_ID = '01a00ca7-8ee3-796b-aa85-f23b9632f57c';
const VALIDATION_EVENT_ID = '01a00d10-7d9b-7e10-859e-36f0e6b580c7';

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

    const target = await quality.getTargetRegionalAssertion(quality.TARGET_RTA_ID);
    quality.assertSafeTarget(target);

    const qaRows = (await pool.query(`
      SELECT qa.*,r.resource_type_code,r.validation_status,r.row_version
      FROM governance.quality_assessment qa
      JOIN core.resource r ON r.resource_id=qa.resource_id
      WHERE qa.target_resource_id=$1 AND qa.method_text=$2
      ORDER BY qa.resource_id
    `,[quality.TARGET_RTA_ID,quality.METHOD_TEXT])).rows;
    assert(qaRows.length === 1, `Expected one MVP12 QualityAssessment, received ${qaRows.length}`);
    const qa = qaRows[0];
    assert(qa.resource_type_code === 'QAS', 'QualityAssessment must use QAS resource type');
    assert(qa.validation_status === 'unreviewed', 'QualityAssessment resource must remain unreviewed');
    assert(qa.target_resource_id === quality.TARGET_RTA_ID, 'QualityAssessment target mismatch');
    assert(qa.assessed_at !== null, 'QualityAssessment assessed_at must be recorded');
    assert(qa.assessed_by_agent_id === null, 'MVP12 must not invent a reviewer');
    assert(qa.score === null, 'MVP12 score must remain NULL, not zero');
    assert(qa.data_activity_id === null, 'MVP12 must not invent DataActivity');
    assert(qa.method_text === quality.METHOD_TEXT, 'MVP12 method identity mismatch');
    assert(qa.summary === quality.SUMMARY_TEXT, 'MVP12 summary semantics mismatch');

    const qaCollisionAssertion = await scalar('SELECT count(*)::int AS n FROM evidence.assertion WHERE resource_id=$1',[qa.resource_id]);
    const qaCollisionAnalysis = await scalar('SELECT count(*)::int AS n FROM analytics.analysis_result WHERE resource_id=$1',[qa.resource_id]);
    const qaCollisionValidation = await scalar('SELECT count(*)::int AS n FROM governance.validation_event WHERE resource_id=$1',[qa.resource_id]);
    assert(qaCollisionAssertion.n === 0, 'QualityAssessment must not be a generic Assertion');
    assert(qaCollisionAnalysis.n === 0, 'QualityAssessment must not be an AnalysisResult');
    assert(qaCollisionValidation.n === 0, 'QualityAssessment must not be a ValidationEvent');

    const qualityFlag = await scalar('SELECT count(*)::int AS n FROM governance.quality_flag');
    const validationEvent = await scalar('SELECT count(*)::int AS n FROM governance.validation_event');
    assert(qualityFlag.n === 0, `QualityFlag is out of scope; count=${qualityFlag.n}`);
    assert(validationEvent.n === 1, `Accepted MVP13 ValidationEvent cardinality changed; count=${validationEvent.n}`);
    const acceptedValidationEvent = await scalar(`
      SELECT resource_id,target_resource_id,from_validation_status,to_validation_status,reviewed_by_agent_id,data_activity_id,reason
      FROM governance.validation_event
      WHERE resource_id=$1
    `,[VALIDATION_EVENT_ID]);
    assert(acceptedValidationEvent, 'Accepted MVP13 ValidationEvent missing');
    assert(acceptedValidationEvent.target_resource_id === quality.TARGET_RTA_ID, 'Accepted MVP13 ValidationEvent target changed');
    assert(acceptedValidationEvent.from_validation_status === 'unreviewed' && acceptedValidationEvent.to_validation_status === 'pending_review',
      'Accepted MVP13 ValidationEvent transition changed');
    assert(acceptedValidationEvent.reviewed_by_agent_id === null && acceptedValidationEvent.data_activity_id === null,
      'Accepted MVP13 ValidationEvent reviewer/activity changed');
    assert(acceptedValidationEvent.reason === 'STAGING / DEMO / MVP13 REVIEW REQUEST · NO SCIENTIFIC VALIDATION',
      'Accepted MVP13 ValidationEvent reason changed');

    assert(target.regional_assertion_validation_status === 'pending_review', 'Accepted MVP13 RTA validation_status changed');
    assert(target.regional_assertion_row_version === 2, 'Accepted MVP13 RTA row_version changed');
    assert(target.presence_value_status === 'unknown' && target.presence_term_key === null,
      'Quality preservation must keep unknown+NULL presence');
    const secondary = [
      [target.origin_value_status,target.origin_term_key],
      [target.establishment_value_status,target.establishment_term_key],
      [target.context_value_status,target.context_term_key],
      [target.temporality_value_status,target.temporality_term_key],
      [target.catalog_inclusion_value_status,target.catalog_inclusion_term_key]
    ];
    assert(secondary.every(([status,term]) => status === 'not_recorded' && term === null),
      'Quality preservation must keep not_recorded+NULL regional fields');
    assert(target.source_resource_id === null, 'Quality preservation must keep NULL regional source');

    const area = await scalar('SELECT name,area_kind FROM core.geographic_area WHERE resource_id=$1',[quality.TARGET_AREA_ID]);
    assert(area && area.name === 'La Rioja' && area.area_kind === 'autonomous_community', 'MVP11 GeographicArea was not preserved');

    const terms = (await pool.query('SELECT term_key FROM taxonomy.term ORDER BY term_key')).rows.map((row) => row.term_key);
    assert(terms.length === 2 && terms[0] === 'rank:genus' && terms[1] === 'rank:species',
      `Quality preservation must not create taxonomy terms: ${terms.join(',')}`);

    const identificationCount = await scalar('SELECT count(*)::int AS n FROM taxonomy.identification');
    const taxonCount = await scalar('SELECT count(*)::int AS n FROM taxonomy.taxon_concept');
    assert(identificationCount.n === 1, `Identification cardinality changed: ${identificationCount.n}`);
    assert(taxonCount.n === 4, `TaxonConcept cardinality changed: ${taxonCount.n}`);

    const snapshot = await scalar('SELECT payload_hash FROM evidence.external_record_snapshot WHERE resource_id=$1',[SNAPSHOT_ID]);
    assert(snapshot && snapshot.payload_hash === SNAPSHOT_HASH, 'MVP9 Snapshot hash changed');

    const run = await scalar('SELECT run_status,closed_at,release_label,released_at FROM analytics.analysis_run WHERE resource_id=$1',[ANALYSIS_RUN_ID]);
    assert(run && run.run_status === 'closed' && run.closed_at !== null, 'MVP10 AnalysisRun was not preserved');
    assert(run.release_label === null && run.released_at === null, 'MVP10 AnalysisRun release semantics changed');
    const analysisResult = await scalar('SELECT value_status,numeric_value FROM analytics.analysis_result WHERE resource_id=$1',[ANALYSIS_RESULT_ID]);
    assert(analysisResult && analysisResult.value_status === 'present' && Number(analysisResult.numeric_value) === 7.5,
      'MVP10 AnalysisResult was not preserved');

    const genericAssertion = await scalar(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE resolution_status='unresolved')::int AS unresolved
      FROM evidence.assertion
    `);
    assert(genericAssertion.total === 1 && genericAssertion.unresolved === 1,
      'Quality preservation must not resolve or replace the generic Assertion');

    const cardinalities = (await pool.query(`
      SELECT
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
        (SELECT count(*)::int FROM evidence.digital_asset) AS digital_asset
    `)).rows[0];

    assert(cardinalities.quality_assessment === 1, `QualityAssessment cardinality=${cardinalities.quality_assessment}`);
    assert(cardinalities.quality_flag === 0, `QualityFlag cardinality=${cardinalities.quality_flag}`);
    assert(cardinalities.validation_event === 1, `ValidationEvent cardinality=${cardinalities.validation_event}`);
    assert(cardinalities.geographic_area === 1, `GeographicArea cardinality=${cardinalities.geographic_area}`);
    assert(cardinalities.regional_taxon_assertion === 1, `RegionalTaxonAssertion cardinality=${cardinalities.regional_taxon_assertion}`);
    assert(cardinalities.taxonomy_term === 2, `taxonomy.term cardinality=${cardinalities.taxonomy_term}`);
    assert(cardinalities.identification === 1, `Identification cardinality=${cardinalities.identification}`);
    assert(cardinalities.taxon_concept === 4, `TaxonConcept cardinality=${cardinalities.taxon_concept}`);
    assert(cardinalities.external_record_snapshot === 1, `ExternalRecordSnapshot cardinality=${cardinalities.external_record_snapshot}`);
    assert(cardinalities.analysis_run === 1, `AnalysisRun cardinality=${cardinalities.analysis_run}`);
    assert(cardinalities.analysis_result === 1, `AnalysisResult cardinality=${cardinalities.analysis_result}`);
    assert(cardinalities.assertion === 1 && cardinalities.unresolved_assertion === 1, 'Assertion cardinality/resolution changed');
    assert(cardinalities.digital_asset === 0, `DigitalAsset cardinality=${cardinalities.digital_asset}`);

    console.log(JSON.stringify({
      OPEN_REGIONAL_QUALITY:'PASS',
      OPEN_QUALITY_ASSESSMENT:'PASS',
      LINK_QUALITY_ASSESSMENT_TO_REGIONAL_ASSERTION:'PASS',
      TRACE_QUALITY_TO_TAXON:'PASS',
      TRACE_QUALITY_TO_GEOGRAPHIC_AREA:'PASS',
      QUALITY_ASSESSMENT_NOT_VALIDATION_EVENT:'PASS',
      QUALITY_ASSESSMENT_NOT_ASSERTION:'PASS',
      QUALITY_ASSESSMENT_NOT_ANALYSIS_RESULT:'PASS',
      QUALITY_ASSESSMENT_NOT_SCIENTIFIC_VALIDATION:'PASS',
      SCORE_NULL_NOT_ZERO:'PASS',
      NO_FAKE_REVIEWER:'PASS',
      NO_FAKE_DATA_ACTIVITY:'PASS',
      NO_QUALITY_FLAG:'PASS',
      PRESERVE_MVP13_VALIDATION_EVENT:'PASS',
      PRESERVE_MVP13_REVIEW_STATE:'PASS',
      REGIONAL_ASSERTION_PRESENCE_UNCHANGED:'PASS',
      UNKNOWN_NOT_ABSENCE:'PASS',
      PRESERVE_MVP11_REGIONAL_STATUS:'PASS',
      PRESERVE_MVP10_ANALYSIS:'PASS',
      PRESERVE_MVP9_SNAPSHOT:'PASS',
      NO_NEW_IDENTIFICATION:'PASS',
      NO_NEW_TAXON_CONCEPT:'PASS',
      PRESERVE_MVP12_QUALITY_ASSESSMENT:'PASS',
      qualityAssessmentId:qa.resource_id,
      targetRegionalAssertionId:qa.target_resource_id,
      assessedAt:qa.assessed_at,
      assessedByAgentId:qa.assessed_by_agent_id,
      score:qa.score,
      dataActivityId:qa.data_activity_id,
      methodText:qa.method_text,
      cardinalities
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
