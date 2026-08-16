const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const SNAPSHOT_ID = '01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH = 'f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const METRIC_CODE = 'staging_demo_score';
const METRIC_LABEL = 'JBLR STAGING · Puntuación sintética MVP10';
const METRIC_DESCRIPTION = 'STAGING / DEMO / SIN VALOR CIENTÍFICO · métrica sintética MVP10.';
const ACTIVITY_TYPE = 'staging_demo_analysis';
const MODULE_CODE = 'staging_demo_analysis';
const METHOD_VERSION = 'mvp10.v1';
const NOTE_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_10 · NO VALIDADO · ';
const ANALYSIS_PARAMETERS = Object.freeze({
  mode: 'synthetic_demo',
  scientificMeaning: false,
  warning: 'STAGING / DEMO / NO VALIDADO'
});

function exactOne(rows, label) {
  if (rows.length > 1) throw new Error(`${label} conflicts with duplicate MVP10 rows`);
  return rows[0] || null;
}

async function getTaxon(taxonId, client = pool) {
  const result = await client.query(`
    SELECT tc.resource_id AS taxon_concept_id,r.jblr_code AS taxon_concept_code,
           r.validation_status,r.row_version,tc.concept_label,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=tc.resource_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name
    FROM taxonomy.taxon_concept tc
    JOIN core.resource r ON r.resource_id=tc.resource_id AND r.currency_status='current'
    WHERE tc.resource_id=$1
  `,[taxonId]);
  return result.rows[0] || null;
}

async function getSnapshot(client = pool) {
  const result = await client.query(`
    SELECT ers.resource_id AS snapshot_id,ers.external_record_id,ers.retrieved_at,ers.payload_hash,
           ers.raw_payload,ers.raw_asset_id,ers.normalized_payload,ers.schema_version,
           ers.capture_status,ers.notes,sr.validation_status AS snapshot_validation_status,
           er.external_id,rr.jblr_code AS external_record_code
    FROM evidence.external_record_snapshot ers
    JOIN core.resource sr ON sr.resource_id=ers.resource_id
    JOIN evidence.external_record er ON er.resource_id=ers.external_record_id
    JOIN core.resource rr ON rr.resource_id=er.resource_id
    WHERE ers.resource_id=$1
  `,[SNAPSHOT_ID]);
  return result.rows[0] || null;
}

async function getMetric(client = pool) {
  const result = await client.query(`
    SELECT md.*,
           COALESCE(array_agg(mtrt.resource_type_code ORDER BY mtrt.resource_type_code)
                    FILTER (WHERE mtrt.resource_type_code IS NOT NULL),'{}') AS target_resource_types
    FROM analytics.metric_definition md
    LEFT JOIN analytics.metric_target_resource_type mtrt
      ON mtrt.metric_definition_id=md.metric_definition_id
    WHERE md.metric_code=$1
    GROUP BY md.metric_definition_id
  `,[METRIC_CODE]);
  return result.rows[0] || null;
}

async function getAnalysisRunDetail(runId, client = pool) {
  const runResult = await client.query(`
    SELECT ar.resource_id AS analysis_run_id,rr.jblr_code AS analysis_run_code,
           rr.validation_status AS analysis_run_validation_status,
           ar.data_activity_id,ar.module_code,ar.method_version,ar.parameters,
           ar.input_manifest_hash,ar.run_status,ar.closed_at,ar.release_label,ar.released_at,ar.notes,
           da.activity_type,da.started_at,da.ended_at,da.performed_by_agent_id,
           da.software_name,da.software_version,da.code_commit,
           da.parameters AS activity_parameters,da.process_outcome,da.notes AS activity_notes,
           dar.jblr_code AS data_activity_code,dar.validation_status AS data_activity_validation_status
    FROM analytics.analysis_run ar
    JOIN core.resource rr ON rr.resource_id=ar.resource_id
    JOIN governance.data_activity da ON da.resource_id=ar.data_activity_id
    JOIN core.resource dar ON dar.resource_id=da.resource_id
    WHERE ar.resource_id=$1
  `,[runId]);
  const run = runResult.rows[0];
  if (!run) return null;

  const inputs = await client.query(`
    SELECT ai.analysis_input_id,ai.analysis_run_id,ai.input_resource_id,ai.input_role,ai.input_hash,ai.ordinal,
           sr.resource_type_code AS input_resource_type,sr.validation_status AS input_validation_status,
           ers.external_record_id,ers.retrieved_at,ers.payload_hash,ers.raw_payload,ers.raw_asset_id,
           ers.normalized_payload,ers.schema_version,ers.capture_status,
           er.external_id,err.jblr_code AS external_record_code
    FROM analytics.analysis_input ai
    JOIN core.resource sr ON sr.resource_id=ai.input_resource_id
    LEFT JOIN evidence.external_record_snapshot ers ON ers.resource_id=ai.input_resource_id
    LEFT JOIN evidence.external_record er ON er.resource_id=ers.external_record_id
    LEFT JOIN core.resource err ON err.resource_id=er.resource_id
    WHERE ai.analysis_run_id=$1
    ORDER BY ai.ordinal NULLS LAST,ai.analysis_input_id
  `,[runId]);

  const results = await client.query(`
    SELECT ar.resource_id AS analysis_result_id,rr.jblr_code AS analysis_result_code,
           rr.validation_status AS result_validation_status,
           ar.analysis_run_id,ar.metric_definition_id,md.metric_code,md.label AS metric_label,
           md.value_type,md.default_unit_code,md.description AS metric_description,
           ar.subject_resource_id,ar.value_status,ar.numeric_value,ar.text_value,
           ar.boolean_value,ar.json_value,ar.unit_code,ar.computed_at,ar.notes,
           tc.concept_label,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=ar.subject_resource_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name
    FROM analytics.analysis_result ar
    JOIN core.resource rr ON rr.resource_id=ar.resource_id
    JOIN analytics.metric_definition md ON md.metric_definition_id=ar.metric_definition_id
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=ar.subject_resource_id
    WHERE ar.analysis_run_id=$1
    ORDER BY ar.computed_at,ar.resource_id
  `,[runId]);

  return { ...run, inputs: inputs.rows, results: results.rows };
}

async function getAnalysisResultDetail(resultId, client = pool) {
  const result = await client.query(`
    SELECT ar.resource_id AS analysis_result_id,rr.jblr_code AS analysis_result_code,
           rr.validation_status AS result_validation_status,
           ar.analysis_run_id,runr.jblr_code AS analysis_run_code,
           run.module_code,run.method_version,run.run_status,
           ar.metric_definition_id,md.metric_code,md.label AS metric_label,md.value_type,
           md.default_unit_code,md.description AS metric_description,md.is_active AS metric_is_active,
           ar.subject_resource_id,tr.jblr_code AS subject_code,tr.validation_status AS subject_validation_status,
           ar.value_status,ar.numeric_value,ar.text_value,ar.boolean_value,ar.json_value,
           ar.unit_code,ar.computed_at,ar.notes,
           tc.concept_label,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=ar.subject_resource_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name
    FROM analytics.analysis_result ar
    JOIN core.resource rr ON rr.resource_id=ar.resource_id
    JOIN analytics.analysis_run run ON run.resource_id=ar.analysis_run_id
    JOIN core.resource runr ON runr.resource_id=run.resource_id
    JOIN analytics.metric_definition md ON md.metric_definition_id=ar.metric_definition_id
    JOIN core.resource tr ON tr.resource_id=ar.subject_resource_id
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=ar.subject_resource_id
    WHERE ar.resource_id=$1
  `,[resultId]);
  return result.rows[0] || null;
}

async function getTaxonAnalyses(taxonId) {
  const taxon = await getTaxon(taxonId);
  if (!taxon) return null;
  const metric = await getMetric();
  const snapshot = await getSnapshot();
  const runs = await pool.query(`
    SELECT run.resource_id AS analysis_run_id,rr.jblr_code AS analysis_run_code,
           run.module_code,run.method_version,run.run_status,run.closed_at,
           run.data_activity_id,
           result.resource_id AS analysis_result_id,resr.jblr_code AS analysis_result_code,
           result.value_status,result.numeric_value,result.unit_code,
           md.metric_code,md.label AS metric_label
    FROM analytics.analysis_result result
    JOIN analytics.analysis_run run ON run.resource_id=result.analysis_run_id
    JOIN core.resource rr ON rr.resource_id=run.resource_id
    JOIN core.resource resr ON resr.resource_id=result.resource_id
    JOIN analytics.metric_definition md ON md.metric_definition_id=result.metric_definition_id
    WHERE result.subject_resource_id=$1
      AND run.module_code=$2
      AND run.method_version=$3
      AND md.metric_code=$4
    ORDER BY run.closed_at,run.resource_id
  `,[taxonId,MODULE_CODE,METHOD_VERSION,METRIC_CODE]);
  return { taxon, metric, snapshot, runs: runs.rows };
}

async function createOrReuseAnalysis(taxonId) {
  if (taxonId !== TAXON_ID) throw new Error('MVP10 synthetic analysis is restricted to the Plantago STAGING TaxonConcept');
  const client = await pool.connect();
  let runId;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`MVP10:analysis:${taxonId}`]);

    const taxon = await getTaxon(taxonId, client);
    if (!taxon) throw new Error('TaxonConcept not found');

    const snapshot = await getSnapshot(client);
    if (!snapshot) throw new Error('MVP9 ExternalRecordSnapshot not found');
    if (snapshot.payload_hash !== SNAPSHOT_HASH || snapshot.capture_status !== 'captured') {
      throw new Error('MVP9 ExternalRecordSnapshot hash/status conflicts with accepted baseline');
    }

    let metric = exactOne((await client.query(
      `SELECT * FROM analytics.metric_definition WHERE metric_code=$1`,
      [METRIC_CODE]
    )).rows,'MetricDefinition');
    let metricCreated = false;
    if (!metric) {
      metric = (await client.query(`
        INSERT INTO analytics.metric_definition(
          metric_definition_id,metric_code,label,value_type,default_unit_code,description,is_active
        ) VALUES(uuidv7(),$1,$2,'numeric',NULL,$3,true)
        RETURNING *
      `,[METRIC_CODE,METRIC_LABEL,METRIC_DESCRIPTION])).rows[0];
      metricCreated = true;
    } else if (
      metric.label !== METRIC_LABEL ||
      metric.value_type !== 'numeric' ||
      metric.default_unit_code !== null ||
      metric.description !== METRIC_DESCRIPTION ||
      metric.is_active !== true
    ) {
      throw new Error('Existing MetricDefinition conflicts with MVP10 synthetic semantics');
    }

    const targets = (await client.query(`
      SELECT resource_type_code
      FROM analytics.metric_target_resource_type
      WHERE metric_definition_id=$1
      ORDER BY resource_type_code
    `,[metric.metric_definition_id])).rows;
    if (targets.length > 1 || (targets[0] && targets[0].resource_type_code !== 'TXC')) {
      throw new Error('Existing MetricTargetResourceType conflicts with MVP10 TXC target');
    }
    let targetCreated = false;
    if (!targets.length) {
      await client.query(`
        INSERT INTO analytics.metric_target_resource_type(metric_definition_id,resource_type_code)
        VALUES($1,'TXC')
      `,[metric.metric_definition_id]);
      targetCreated = true;
    }

    let activity = exactOne((await client.query(`
      SELECT da.*,r.resource_type_code,r.jblr_code,r.validation_status
      FROM governance.data_activity da
      JOIN core.resource r ON r.resource_id=da.resource_id
      WHERE da.activity_type=$1
      ORDER BY da.resource_id
    `,[ACTIVITY_TYPE])).rows,'DataActivity');
    let activityCreated = false;
    if (!activity) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'ACT','unreviewed') RETURNING resource_id
      `)).rows[0];
      activity = (await client.query(`
        INSERT INTO governance.data_activity(
          resource_id,activity_type,started_at,ended_at,performed_by_agent_id,
          software_name,software_version,code_commit,parameters,process_outcome,notes
        ) VALUES(
          $1,$2,current_timestamp,current_timestamp,NULL,
          'JBLR STAGING','mvp10',NULL,$3::jsonb,'synthetic_demo_completed',$4
        ) RETURNING *
      `,[resource.resource_id,ACTIVITY_TYPE,JSON.stringify(ANALYSIS_PARAMETERS),
         `${NOTE_PREFIX}actividad sintética de procesamiento; no constituye validación científica`])).rows[0];
      activityCreated = true;
    } else if (
      activity.resource_type_code !== 'ACT' ||
      activity.performed_by_agent_id !== null ||
      activity.software_name !== 'JBLR STAGING' ||
      activity.software_version !== 'mvp10' ||
      activity.process_outcome !== 'synthetic_demo_completed'
    ) {
      throw new Error('Existing DataActivity conflicts with MVP10 synthetic semantics');
    }

    let run = exactOne((await client.query(`
      SELECT ar.*,r.resource_type_code,r.jblr_code,r.validation_status
      FROM analytics.analysis_run ar
      JOIN core.resource r ON r.resource_id=ar.resource_id
      WHERE ar.module_code=$1 AND ar.method_version=$2
      ORDER BY ar.resource_id
    `,[MODULE_CODE,METHOD_VERSION])).rows,'AnalysisRun');
    let runCreated = false;
    if (!run) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'ANR','unreviewed') RETURNING resource_id
      `)).rows[0];
      run = (await client.query(`
        INSERT INTO analytics.analysis_run(
          resource_id,data_activity_id,module_code,method_version,parameters,input_manifest_hash,
          run_status,closed_at,release_label,released_at,notes
        ) VALUES(
          $1,$2,$3,$4,$5::jsonb,NULL,
          'closed',current_timestamp,NULL,NULL,$6
        ) RETURNING *
      `,[resource.resource_id,activity.resource_id,MODULE_CODE,METHOD_VERSION,
         JSON.stringify(ANALYSIS_PARAMETERS),
         `${NOTE_PREFIX}ejecución analítica sintética cerrada; no es una release científica`])).rows[0];
      runCreated = true;
    } else if (
      run.resource_type_code !== 'ANR' ||
      run.data_activity_id !== activity.resource_id ||
      run.run_status !== 'closed' ||
      run.closed_at === null ||
      run.release_label !== null ||
      run.released_at !== null
    ) {
      throw new Error('Existing AnalysisRun conflicts with MVP10 synthetic semantics');
    }
    runId = run.resource_id;

    const existingInputs = (await client.query(`
      SELECT * FROM analytics.analysis_input
      WHERE analysis_run_id=$1
      ORDER BY ordinal NULLS LAST,analysis_input_id
    `,[runId])).rows;
    let inputCreated = false;
    let analysisInput = null;
    if (!existingInputs.length) {
      analysisInput = (await client.query(`
        INSERT INTO analytics.analysis_input(
          analysis_input_id,analysis_run_id,input_resource_id,input_role,input_hash,ordinal
        ) VALUES(uuidv7(),$1,$2,'source_snapshot',$3,1)
        RETURNING *
      `,[runId,SNAPSHOT_ID,SNAPSHOT_HASH])).rows[0];
      inputCreated = true;
    } else {
      if (existingInputs.length !== 1) throw new Error('AnalysisInput conflicts with duplicate MVP10 inputs');
      analysisInput = existingInputs[0];
      if (
        analysisInput.input_resource_id !== SNAPSHOT_ID ||
        analysisInput.input_role !== 'source_snapshot' ||
        analysisInput.input_hash !== SNAPSHOT_HASH ||
        analysisInput.ordinal !== 1
      ) {
        throw new Error('Existing AnalysisInput conflicts with accepted MVP9 Snapshot');
      }
    }

    const existingResults = (await client.query(`
      SELECT ar.*,r.resource_type_code,r.jblr_code,r.validation_status
      FROM analytics.analysis_result ar
      JOIN core.resource r ON r.resource_id=ar.resource_id
      WHERE ar.analysis_run_id=$1
      ORDER BY ar.resource_id
    `,[runId])).rows;
    let resultCreated = false;
    let analysisResult = null;
    if (!existingResults.length) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'RSL','unreviewed') RETURNING resource_id
      `)).rows[0];
      analysisResult = (await client.query(`
        INSERT INTO analytics.analysis_result(
          resource_id,analysis_run_id,metric_definition_id,subject_resource_id,
          value_status,numeric_value,text_value,boolean_value,json_value,unit_code,computed_at,notes
        ) VALUES(
          $1,$2,$3,$4,'present',7.5,NULL,NULL,NULL,NULL,current_timestamp,$5
        ) RETURNING *
      `,[resource.resource_id,runId,metric.metric_definition_id,taxonId,
         `${NOTE_PREFIX}7.5 es un valor sintético sin significado científico`])).rows[0];
      resultCreated = true;
    } else {
      if (existingResults.length !== 1) throw new Error('AnalysisResult conflicts with duplicate MVP10 results');
      analysisResult = existingResults[0];
      if (
        analysisResult.resource_type_code !== 'RSL' ||
        analysisResult.metric_definition_id !== metric.metric_definition_id ||
        analysisResult.subject_resource_id !== taxonId ||
        analysisResult.value_status !== 'present' ||
        Number(analysisResult.numeric_value) !== 7.5 ||
        analysisResult.text_value !== null ||
        analysisResult.boolean_value !== null ||
        analysisResult.json_value !== null ||
        analysisResult.unit_code !== null
      ) {
        throw new Error('Existing AnalysisResult conflicts with MVP10 synthetic result semantics');
      }
    }

    await client.query('COMMIT');
    const detail = await getAnalysisRunDetail(runId);
    return {
      created: {
        metricDefinition: metricCreated,
        metricTargetResourceType: targetCreated,
        dataActivity: activityCreated,
        analysisRun: runCreated,
        analysisInput: inputCreated,
        analysisResult: resultCreated
      },
      metricDefinitionId: metric.metric_definition_id,
      analysisInputId: analysisInput.analysis_input_id,
      analysisResultId: analysisResult.resource_id,
      run: detail
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  TAXON_ID,
  SNAPSHOT_ID,
  SNAPSHOT_HASH,
  METRIC_CODE,
  getTaxonAnalyses,
  createOrReuseAnalysis,
  getAnalysisRunDetail,
  getAnalysisResultDetail
};
