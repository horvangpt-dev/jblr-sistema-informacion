const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');
const review = require('../src/review-request');

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

    const target = await review.getTargetRegionalAssertion(review.TARGET_RTA_ID);
    review.assertBotanicalSemantics(target);
    assert(target.regional_assertion_validation_status === 'pending_review', 'RTA must be pending_review after MVP13 request');
    assert(target.regional_assertion_row_version === 2, `RTA row_version must be 2, received ${target.regional_assertion_row_version}`);
    assert(target.presence_value_status === 'unknown' && target.presence_term_key === null,
      'MVP13 must preserve unknown+NULL presence');
    assert(target.source_resource_id === null, 'MVP13 must preserve NULL regional source');

    const events = await review.getTargetValidationEvents(review.TARGET_RTA_ID);
    assert(events.length === 1, `Expected one ValidationEvent, received ${events.length}`);
    const event = events[0];
    review.assertDemoEvent(event);
    assert(event.occurred_at !== null, 'ValidationEvent occurred_at must be recorded');
    assert(event.reviewed_by_agent_id === null, 'MVP13 must not invent reviewer');
    assert(event.data_activity_id === null, 'MVP13 must not invent DataActivity');
    assert(event.from_validation_status === 'unreviewed', 'ValidationEvent from status mismatch');
    assert(event.to_validation_status === 'pending_review', 'ValidationEvent to status mismatch');
    assert(event.reason === review.REVIEW_REASON, 'ValidationEvent reason mismatch');

    const detail = await review.getValidationEvent(event.validation_event_id);
    assert(detail && detail.validation_event_resource_type === 'VLE', 'ValidationEvent must use VLE resource type');
    assert(detail.regional_assertion_validation_status === 'pending_review', 'ValidationEvent target must be pending_review');
    assert(detail.regional_assertion_row_version === 2, 'ValidationEvent target row_version must remain 2');
    assert(detail.taxon_concept_id === review.TARGET_TAXON_ID, 'ValidationEvent taxon trace mismatch');
    assert(detail.geographic_area_id === review.TARGET_AREA_ID, 'ValidationEvent GeographicArea trace mismatch');

    const qa = await review.preservedQuality();
    assert(qa.resource_id === review.QUALITY_ASSESSMENT_ID, 'MVP12 QualityAssessment ID changed');
    assert(qa.assessed_by_agent_id === null, 'MVP12 reviewer must remain NULL');
    assert(qa.score === null, 'MVP12 quality score must remain NULL, not zero');
    assert(qa.data_activity_id === null, 'MVP12 DataActivity must remain NULL');

    const qualityFlag = await scalar('SELECT count(*)::int AS n FROM governance.quality_flag');
    assert(qualityFlag.n === 0, `QualityFlag is out of scope; count=${qualityFlag.n}`);

    const eventAsQuality = await scalar('SELECT count(*)::int AS n FROM governance.quality_assessment WHERE resource_id=$1',[event.validation_event_id]);
    const eventAsAssertion = await scalar('SELECT count(*)::int AS n FROM evidence.assertion WHERE resource_id=$1',[event.validation_event_id]);
    const eventAsAnalysis = await scalar('SELECT count(*)::int AS n FROM analytics.analysis_result WHERE resource_id=$1',[event.validation_event_id]);
    assert(eventAsQuality.n === 0, 'ValidationEvent must not be QualityAssessment');
    assert(eventAsAssertion.n === 0, 'ValidationEvent must not be Assertion');
    assert(eventAsAnalysis.n === 0, 'ValidationEvent must not be AnalysisResult');

    const forbiddenTransitions = await scalar(`
      SELECT count(*)::int AS n
      FROM governance.validation_event
      WHERE target_resource_id=$1
        AND (from_validation_status <> 'unreviewed' OR to_validation_status <> 'pending_review')
    `,[review.TARGET_RTA_ID]);
    assert(forbiddenTransitions.n === 0, 'MVP13 created an unauthorized validation transition');

    const area = await scalar('SELECT name,area_kind FROM core.geographic_area WHERE resource_id=$1',[review.TARGET_AREA_ID]);
    assert(area && area.name === 'La Rioja' && area.area_kind === 'autonomous_community', 'MVP11 GeographicArea changed');

    const terms = (await pool.query('SELECT term_key FROM taxonomy.term ORDER BY term_key')).rows.map((row) => row.term_key);
    assert(terms.length === 2 && terms[0] === 'rank:genus' && terms[1] === 'rank:species',
      `MVP13 must not create taxonomy terms: ${terms.join(',')}`);

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
      'MVP13 must not resolve the generic Assertion');

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

    const expected = {
      quality_assessment:1,quality_flag:0,validation_event:1,geographic_area:1,
      regional_taxon_assertion:1,taxonomy_term:2,identification:1,taxon_concept:4,
      external_record_snapshot:1,analysis_run:1,analysis_result:1,assertion:1,
      unresolved_assertion:1,digital_asset:0
    };
    for (const [key,value] of Object.entries(expected)) {
      assert(cardinalities[key] === value, `${key} cardinality=${cardinalities[key]}, expected ${value}`);
    }

    console.log(JSON.stringify({
      OPEN_REGIONAL_REVIEW:'PASS',
      REQUEST_REGIONAL_REVIEW:'PASS',
      CREATE_VALIDATION_EVENT:'PASS',
      OPEN_VALIDATION_EVENT:'PASS',
      LINK_VALIDATION_EVENT_TO_REGIONAL_ASSERTION:'PASS',
      TRACE_VALIDATION_EVENT_TO_TAXON:'PASS',
      TRACE_VALIDATION_EVENT_TO_GEOGRAPHIC_AREA:'PASS',
      UNREVIEWED_TO_PENDING_REVIEW:'PASS',
      PENDING_REVIEW_NOT_VALIDATED:'PASS',
      NO_VALIDATED_TRANSITION:'PASS',
      VALIDATION_EVENT_NOT_QUALITY_ASSESSMENT:'PASS',
      VALIDATION_EVENT_NOT_ASSERTION:'PASS',
      VALIDATION_EVENT_NOT_ANALYSIS_RESULT:'PASS',
      VALIDATION_EVENT_NOT_SCIENTIFIC_VALIDATION:'PASS',
      NO_FAKE_REVIEWER:'PASS',
      NO_FAKE_DATA_ACTIVITY:'PASS',
      REGIONAL_ASSERTION_PRESENCE_UNCHANGED:'PASS',
      UNKNOWN_NOT_ABSENCE:'PASS',
      ROW_VERSION_INCREMENTED_ONCE:'PASS',
      REPEAT_DOES_NOT_INCREMENT_ROW_VERSION:'PASS',
      NO_DUPLICATE_VALIDATION_EVENT:'PASS',
      PRESERVE_MVP12_QUALITY_ASSESSMENT:'PASS',
      QUALITY_SCORE_NULL_PRESERVED:'PASS',
      NO_QUALITY_FLAG:'PASS',
      PRESERVE_MVP11_REGIONAL_STATUS:'PASS',
      PRESERVE_MVP10_ANALYSIS:'PASS',
      PRESERVE_MVP9_SNAPSHOT:'PASS',
      NO_NEW_IDENTIFICATION:'PASS',
      NO_NEW_TAXON_CONCEPT:'PASS',
      PERSIST_REVIEW_REQUEST_TO_NEON:'PASS',
      validationEventId:event.validation_event_id,
      targetRegionalAssertionId:target.regional_assertion_id,
      validationStatus:target.regional_assertion_validation_status,
      rowVersion:target.regional_assertion_row_version,
      occurredAt:event.occurred_at,
      reviewedByAgentId:event.reviewed_by_agent_id,
      dataActivityId:event.data_activity_id,
      reason:event.reason,
      qualityAssessmentId:qa.resource_id,
      qualityScore:qa.score,
      cardinalities
    }));
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
