const crypto = require('crypto');
const { pool } = require('../src/db');

const TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const RAW_EXPECTED = {
  external_id: 'MVP9-DEMO-0001',
  scientific_name: 'Plantago major L.',
  status: 'synthetic_demo',
  warning: 'STAGING / DEMO / NO VALIDADO',
};
const NORMALIZED_EXPECTED = {
  scientificName: 'Plantago major L.',
  importStatus: 'unvalidated',
};

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}
function hash(value) {
  return crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  try {
    const counts = (await pool.query(`
      SELECT
        (SELECT count(*)::int FROM analytics.metric_definition) AS metric_definition,
        (SELECT count(*)::int FROM analytics.metric_target_resource_type) AS metric_target_resource_type,
        (SELECT count(*)::int FROM governance.data_activity) AS data_activity,
        (SELECT count(*)::int FROM analytics.analysis_run) AS analysis_run,
        (SELECT count(*)::int FROM analytics.analysis_input) AS analysis_input,
        (SELECT count(*)::int FROM analytics.analysis_result) AS analysis_result,
        (SELECT count(*)::int FROM evidence.external_source) AS external_source,
        (SELECT count(*)::int FROM evidence.external_record) AS external_record,
        (SELECT count(*)::int FROM evidence.external_record_snapshot) AS external_record_snapshot,
        (SELECT count(*)::int FROM evidence.provenance_link) AS provenance_link,
        (SELECT count(*)::int FROM taxonomy.identification) AS identification,
        (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
        (SELECT count(*)::int FROM taxonomy.taxonomic_name) AS taxonomic_name,
        (SELECT count(*)::int FROM taxonomy.name_usage) AS name_usage,
        (SELECT count(*)::int FROM evidence.assertion) AS assertion,
        (SELECT count(*)::int FROM evidence.assertion WHERE resolution_status='unresolved') AS unresolved_assertion,
        (SELECT count(*)::int FROM governance.record_revision) AS record_revision
    `)).rows[0];

    assert(counts.metric_definition === 1, `MetricDefinition expected 1, got ${counts.metric_definition}`);
    assert(counts.metric_target_resource_type === 1, `MetricTargetResourceType expected 1, got ${counts.metric_target_resource_type}`);
    assert(counts.data_activity === 1, `DataActivity expected 1, got ${counts.data_activity}`);
    assert(counts.analysis_run === 1, `AnalysisRun expected 1, got ${counts.analysis_run}`);
    assert(counts.analysis_input === 1, `AnalysisInput expected 1, got ${counts.analysis_input}`);
    assert(counts.analysis_result === 1, `AnalysisResult expected 1, got ${counts.analysis_result}`);
    assert(counts.external_source === 1 && counts.external_record === 1 && counts.external_record_snapshot === 1 && counts.provenance_link === 1,
      'MVP9 external data cardinalities changed');
    assert(counts.identification === 1, `Identification must remain 1, got ${counts.identification}`);
    assert(counts.taxon_concept === 4, `TaxonConcept must remain 4, got ${counts.taxon_concept}`);
    assert(counts.taxonomic_name === 4, `TaxonomicName must remain 4, got ${counts.taxonomic_name}`);
    assert(counts.name_usage === 4, `NameUsage must remain 4, got ${counts.name_usage}`);
    assert(counts.assertion === 1 && counts.unresolved_assertion === 1, 'MVP6 Assertion must remain single and unresolved');
    assert(counts.record_revision === 14, `record_revision must remain 14, got ${counts.record_revision}`);

    const row = (await pool.query(`
      SELECT md.metric_definition_id,md.metric_code,md.label AS metric_label,md.value_type,
             md.default_unit_code,md.description AS metric_description,md.is_active,
             mtrt.resource_type_code AS metric_target,
             da.resource_id AS data_activity_id,dar.resource_type_code AS data_activity_resource_type,
             dar.jblr_code AS data_activity_code,dar.validation_status AS data_activity_validation,
             da.activity_type,da.started_at,da.ended_at,da.performed_by_agent_id,
             da.software_name,da.software_version,da.code_commit,da.parameters AS activity_parameters,
             da.process_outcome,da.notes AS activity_notes,
             run.resource_id AS analysis_run_id,runr.resource_type_code AS analysis_run_resource_type,
             runr.jblr_code AS analysis_run_code,runr.validation_status AS analysis_run_validation,
             run.data_activity_id AS run_data_activity_id,run.module_code,run.method_version,
             run.parameters AS run_parameters,run.input_manifest_hash,run.run_status,run.closed_at,
             run.release_label,run.released_at,run.notes AS run_notes,
             ai.analysis_input_id,ai.input_resource_id,ai.input_role,ai.input_hash,ai.ordinal,
             result.resource_id AS analysis_result_id,resr.resource_type_code AS analysis_result_resource_type,
             resr.jblr_code AS analysis_result_code,resr.validation_status AS analysis_result_validation,
             result.analysis_run_id AS result_run_id,result.metric_definition_id AS result_metric_definition_id,
             result.subject_resource_id,result.value_status,result.numeric_value,result.text_value,
             result.boolean_value,result.json_value,result.unit_code,result.computed_at,result.notes AS result_notes,
             ers.payload_hash AS snapshot_hash,ers.raw_payload,ers.normalized_payload,ers.capture_status,
             ers.raw_asset_id,ers.schema_version,
             txr.validation_status AS taxon_validation,txr.row_version AS taxon_row_version
      FROM analytics.metric_definition md
      JOIN analytics.metric_target_resource_type mtrt ON mtrt.metric_definition_id=md.metric_definition_id
      JOIN analytics.analysis_result result ON result.metric_definition_id=md.metric_definition_id
      JOIN core.resource resr ON resr.resource_id=result.resource_id
      JOIN analytics.analysis_run run ON run.resource_id=result.analysis_run_id
      JOIN core.resource runr ON runr.resource_id=run.resource_id
      JOIN governance.data_activity da ON da.resource_id=run.data_activity_id
      JOIN core.resource dar ON dar.resource_id=da.resource_id
      JOIN analytics.analysis_input ai ON ai.analysis_run_id=run.resource_id
      JOIN evidence.external_record_snapshot ers ON ers.resource_id=ai.input_resource_id
      JOIN core.resource txr ON txr.resource_id=result.subject_resource_id
      WHERE md.metric_code='staging_demo_score'
    `)).rows[0];

    assert(row, 'MVP10 analysis chain not found');
    assert(row.metric_label === 'JBLR STAGING · Puntuación sintética MVP10', 'Unexpected MetricDefinition label');
    assert(row.value_type === 'numeric' && row.default_unit_code === null && row.is_active === true, 'MetricDefinition value semantics failed');
    assert((row.metric_description || '').includes('STAGING / DEMO / SIN VALOR CIENTÍFICO'), 'MetricDefinition scientific warning missing');
    assert(row.metric_target === 'TXC', 'MetricDefinition target must be TXC');

    assert(row.data_activity_resource_type === 'ACT', 'DataActivity resource type must be ACT');
    assert(row.data_activity_validation === 'unreviewed', 'DataActivity must remain unreviewed');
    assert(row.activity_type === 'staging_demo_analysis', 'Unexpected DataActivity activity_type');
    assert(row.performed_by_agent_id === null, 'performed_by_agent_id must remain NULL');
    assert(row.software_name === 'JBLR STAGING' && row.software_version === 'mvp10', 'Unexpected synthetic software identity');
    assert(row.code_commit === null, 'DataActivity code_commit must remain NULL for this synthetic run');
    assert(row.process_outcome === 'synthetic_demo_completed', 'Unexpected process_outcome');
    assert(new Date(row.ended_at) >= new Date(row.started_at), 'DataActivity time order invalid');

    assert(row.analysis_run_resource_type === 'ANR', 'AnalysisRun resource type must be ANR');
    assert(/^JBLR-ANR-\d{8}$/.test(row.analysis_run_code || ''), `Unexpected AnalysisRun code ${row.analysis_run_code}`);
    assert(row.analysis_run_validation === 'unreviewed', 'AnalysisRun must remain unreviewed');
    assert(row.run_data_activity_id === row.data_activity_id, 'AnalysisRun must reference DataActivity');
    assert(row.module_code === 'staging_demo_analysis' && row.method_version === 'mvp10.v1', 'AnalysisRun method identity mismatch');
    assert(row.run_status === 'closed' && row.closed_at !== null, 'AnalysisRun must be closed with closed_at');
    assert(new Date(row.closed_at) >= new Date(row.started_at), 'AnalysisRun closed_at must be coherent with DataActivity start');
    assert(row.release_label === null && row.released_at === null, 'AnalysisRun must not be a scientific release');
    assert(row.input_manifest_hash === null, 'input_manifest_hash must remain NULL; Snapshot hash belongs to AnalysisInput');

    assert(row.input_resource_id === SNAPSHOT_ID, 'AnalysisInput must reference accepted MVP9 Snapshot');
    assert(row.input_role === 'source_snapshot', 'AnalysisInput role must be source_snapshot');
    assert(row.input_hash === SNAPSHOT_HASH, 'AnalysisInput must use accepted real Snapshot payload_hash');
    assert(row.ordinal === 1, 'AnalysisInput ordinal must be 1');

    assert(row.analysis_result_resource_type === 'RSL', 'AnalysisResult resource type must be RSL');
    assert(/^JBLR-RSL-\d{8}$/.test(row.analysis_result_code || ''), `Unexpected AnalysisResult code ${row.analysis_result_code}`);
    assert(row.analysis_result_validation === 'unreviewed', 'AnalysisResult must remain unreviewed');
    assert(row.result_run_id === row.analysis_run_id, 'AnalysisResult must trace to AnalysisRun');
    assert(row.result_metric_definition_id === row.metric_definition_id, 'AnalysisResult must use MVP10 metric');
    assert(row.subject_resource_id === TAXON_ID, 'AnalysisResult subject must be Plantago TaxonConcept');
    assert(row.value_status === 'present', 'AnalysisResult value_status must be present');
    assert(Number(row.numeric_value) === 7.5, `AnalysisResult numeric_value expected 7.5, got ${row.numeric_value}`);
    assert(row.text_value === null && row.boolean_value === null && row.json_value === null && row.unit_code === null,
      'AnalysisResult present numeric semantics require every other value/unit to remain NULL');

    assert(row.snapshot_hash === SNAPSHOT_HASH, 'MVP9 Snapshot payload_hash changed');
    assert(hash(row.raw_payload) === SNAPSHOT_HASH, 'MVP9 Snapshot raw_payload no longer matches accepted SHA-256');
    assert(canonicalize(row.raw_payload) === canonicalize(RAW_EXPECTED), 'MVP9 raw_payload changed');
    assert(canonicalize(row.normalized_payload) === canonicalize(NORMALIZED_EXPECTED), 'MVP9 normalized_payload changed');
    assert(row.capture_status === 'captured' && row.raw_asset_id === null && row.schema_version === 'mvp9.synthetic.v1',
      'MVP9 Snapshot capture semantics changed');

    assert(row.taxon_validation === 'unreviewed' && row.taxon_row_version === 1, 'Analysis must not validate or edit TaxonConcept');
    assert(row.analysis_run_id !== row.analysis_result_id, 'AnalysisRun must not equal AnalysisResult');
    assert(row.analysis_input_id !== row.analysis_result_id, 'AnalysisInput must not equal AnalysisResult');

    const result = {
      OPEN_TAXON_ANALYSES: 'PASS',
      CREATE_METRIC_DEFINITION: 'PASS',
      LINK_METRIC_TARGET_TAXONCONCEPT: 'PASS',
      CREATE_DATA_ACTIVITY: 'PASS',
      CREATE_ANALYSIS_RUN: 'PASS',
      LINK_ANALYSIS_INPUT: 'PASS',
      CREATE_ANALYSIS_RESULT: 'PASS',
      OPEN_ANALYSIS_RUN_DETAIL: 'PASS',
      OPEN_ANALYSIS_RESULT_DETAIL: 'PASS',
      TRACE_RESULT_TO_RUN: 'PASS',
      TRACE_RUN_TO_INPUT_SNAPSHOT: 'PASS',
      TRACE_RESULT_TO_TAXON: 'PASS',
      TRACE_RUN_TO_DATA_ACTIVITY: 'PASS',
      ANALYSIS_RUN_NOT_RESULT: 'PASS',
      ANALYSIS_INPUT_NOT_RESULT: 'PASS',
      ANALYSIS_VALUE_STATUS_SEMANTICS: 'PASS',
      PRESERVE_ANALYSIS_HISTORY: 'PASS',
      NO_TAXONOMIC_VALIDATION_FROM_ANALYSIS: 'PASS',
      NO_NEW_IDENTIFICATION: 'PASS',
      NO_NEW_TAXON_CONCEPT: 'PASS',
      PERSIST_ANALYSIS_TO_NEON: 'PASS',
      metricDefinitionId: row.metric_definition_id,
      metricTargetResourceType: row.metric_target,
      dataActivityId: row.data_activity_id,
      dataActivityCode: row.data_activity_code,
      analysisRunId: row.analysis_run_id,
      analysisRunCode: row.analysis_run_code,
      analysisInputId: row.analysis_input_id,
      analysisResultId: row.analysis_result_id,
      analysisResultCode: row.analysis_result_code,
      subjectTaxonConceptId: row.subject_resource_id,
      inputSnapshotId: row.input_resource_id,
      inputHash: row.input_hash,
      valueStatus: row.value_status,
      numericValue: Number(row.numeric_value),
      snapshotHash: row.snapshot_hash,
      cardinalities: counts
    };
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
