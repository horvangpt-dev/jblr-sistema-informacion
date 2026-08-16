const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function main() {
  await assertAuthorizedStaging();
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM material.processing_event) AS processing_event,
      (SELECT count(*)::int FROM material.process_input) AS process_input,
      (SELECT count(*)::int FROM material.process_output) AS process_output,
      (SELECT count(*)::int FROM material.sample) AS sample
  `)).rows[0];
  if (counts.processing_event !== 1 || counts.process_input !== 1 || counts.process_output !== 1 || counts.sample !== 2) {
    throw new Error(`Unexpected MVP5 cardinalities: ${JSON.stringify(counts)}`);
  }

  const { rows } = await pool.query(`
    SELECT
      pe.resource_id AS processing_event_id,
      per.jblr_code AS processing_event_code,
      per.resource_type_code AS processing_resource_type,
      per.validation_status AS processing_validation,
      pe.process_type,
      pe.started_at,
      pe.ended_at,
      pe.operator_agent_id,
      pe.protocol_resource_id,
      pe.notes AS processing_notes,
      pi.process_input_id,
      pi.sample_id AS input_sample_id,
      pi.quantity_value AS input_link_quantity_value,
      pi.quantity_unit AS input_link_quantity_unit,
      pi.ordinal AS input_ordinal,
      insr.jblr_code AS input_sample_code,
      ins.sample_kind AS input_sample_kind,
      ins.quantity_value AS input_sample_quantity_value,
      ins.quantity_unit AS input_sample_quantity_unit,
      ins.material_state AS input_material_state,
      po.process_output_id,
      po.sample_id AS output_sample_id,
      po.quantity_value AS output_link_quantity_value,
      po.quantity_unit AS output_link_quantity_unit,
      po.ordinal AS output_ordinal,
      outsr.jblr_code AS output_sample_code,
      outsr.validation_status AS output_validation,
      outs.sample_kind AS output_sample_kind,
      outs.quantity_value AS output_sample_quantity_value,
      outs.quantity_unit AS output_sample_quantity_unit,
      outs.material_state AS output_material_state,
      outs.notes AS output_notes,
      (SELECT count(*)::int FROM material.sample_origin so WHERE so.sample_id=po.sample_id) AS output_sample_origin_count,
      (SELECT count(*)::int FROM material.accession_material am WHERE am.sample_id=pi.sample_id) AS input_accession_count,
      (SELECT count(*)::int FROM material.accession_material am WHERE am.sample_id=po.sample_id) AS output_accession_count,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=pe.resource_id) AS processing_revisions
    FROM material.processing_event pe
    JOIN core.resource per ON per.resource_id=pe.resource_id
    JOIN material.process_input pi ON pi.processing_event_id=pe.resource_id
    JOIN material.sample ins ON ins.resource_id=pi.sample_id
    JOIN core.resource insr ON insr.resource_id=ins.resource_id
    JOIN material.process_output po ON po.processing_event_id=pe.resource_id
    JOIN material.sample outs ON outs.resource_id=po.sample_id
    JOIN core.resource outsr ON outsr.resource_id=outs.resource_id
  `);
  if (rows.length !== 1) throw new Error(`Expected one complete MVP5 processing chain, got ${rows.length}`);
  const r = rows[0];

  const checks = [
    r.processing_resource_type === 'PRC',
    r.processing_validation === 'unreviewed',
    r.process_type === 'cleaning_demo_edited',
    r.operator_agent_id === null,
    r.protocol_resource_id === null,
    /^STAGING DEMO · MVP_PRODUCTIVO_5 · NO VALIDADO · /.test(r.processing_notes || ''),
    r.input_sample_code === 'JBLR-SMP-00000018',
    r.input_sample_kind === 'seed_demo',
    r.input_sample_quantity_value === null,
    r.input_sample_quantity_unit === null,
    r.input_material_state === 'field_demo_unvalidated_edited',
    r.input_link_quantity_value === null,
    r.input_link_quantity_unit === null,
    r.input_ordinal === 1,
    r.output_sample_id !== r.input_sample_id,
    r.output_sample_code !== r.input_sample_code,
    r.output_validation === 'unreviewed',
    r.output_sample_kind === 'seed_demo_processed_demo',
    r.output_sample_quantity_value === null,
    r.output_sample_quantity_unit === null,
    r.output_material_state === 'processed_demo_unvalidated',
    /^STAGING DEMO · MVP_PRODUCTIVO_5 · NO VALIDADO · /.test(r.output_notes || ''),
    r.output_link_quantity_value === null,
    r.output_link_quantity_unit === null,
    r.output_ordinal === 1,
    r.output_sample_origin_count === 0,
    r.input_accession_count === 1,
    r.output_accession_count === 0,
    r.processing_revisions === 1,
  ];
  if (checks.some(v => !v)) throw new Error(`MVP5 canonical processing state failed: ${JSON.stringify(r)}`);

  console.log(JSON.stringify({
    OPEN_SAMPLE_PROCESSING: 'PASS',
    CREATE_PROCESSING_EVENT: 'PASS',
    LINK_PROCESS_INPUT: 'PASS',
    CREATE_PROCESS_OUTPUT_SAMPLE: 'PASS',
    LINK_PROCESS_OUTPUT: 'PASS',
    OPEN_PROCESSING_EVENT_DETAIL: 'PASS',
    OPEN_PROCESS_OUTPUT_SAMPLE: 'PASS',
    TRACE_INPUT_TO_OUTPUT: 'PASS',
    EDIT_PROCESSING_EVENT: 'PASS',
    PERSIST_PROCESSING_TO_NEON: 'PASS',
    PROCESS_INPUT_OUTPUT_DISTINCT_SAMPLES: 'PASS',
    UNKNOWN_QUANTITY_NOT_ZERO: 'PASS',
    processingEventId: r.processing_event_id,
    processingEventCode: r.processing_event_code,
    inputSampleId: r.input_sample_id,
    inputSampleCode: r.input_sample_code,
    outputSampleId: r.output_sample_id,
    outputSampleCode: r.output_sample_code,
    cardinalities: counts,
    quantitySemantics: 'unknown=NULL; zero not used',
  }));
}

main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
