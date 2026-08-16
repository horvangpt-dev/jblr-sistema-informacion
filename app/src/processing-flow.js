const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const MVP5_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_5 · NO VALIDADO · ';

function cleanText(value, max = 1000) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`Text exceeds ${max} characters`);
  return text;
}

function requiredText(value, field, max = 300) {
  const text = cleanText(value, max);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function optionalTimestamp(value, field) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return date.toISOString();
}

function stagingNote(input, fallback) {
  const note = cleanText(input, 1000);
  return `${MVP5_PREFIX}${note || fallback}`;
}

function assertChronology(startedAt, endedAt) {
  if (startedAt && endedAt && new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
    throw new Error('endedAt must not be earlier than startedAt');
  }
}

async function addRevision(client, targetId, changes, reason) {
  if (!changes.length) return;
  await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE', [targetId]);
  const rev = await client.query(`
    INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
    VALUES (uuidv7(), 'REV', 'unreviewed')
    RETURNING resource_id
  `);
  const next = await client.query(`
    SELECT COALESCE(MAX(revision_no),0)+1 AS next_no
    FROM governance.record_revision
    WHERE target_resource_id=$1
  `, [targetId]);
  await client.query(`
    INSERT INTO governance.record_revision(resource_id, target_resource_id, revision_no, operation, reason)
    VALUES ($1,$2,$3,'update',$4)
  `, [rev.rows[0].resource_id, targetId, next.rows[0].next_no, reason]);
  for (const change of changes) {
    await client.query(`
      INSERT INTO governance.revision_change(
        revision_change_id, record_revision_id, field_path, old_value, new_value, change_kind, sensitive_value
      ) VALUES (uuidv7(),$1,$2,$3::jsonb,$4::jsonb,'replace',false)
    `, [rev.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

async function getSampleProcessing(sampleId) {
  const sample = await pool.query(`
    SELECT s.resource_id AS sample_id, r.jblr_code AS sample_code, r.validation_status,
           s.sample_kind, s.quantity_value, s.quantity_unit, s.material_state, s.notes
    FROM material.sample s
    JOIN core.resource r ON r.resource_id=s.resource_id AND r.currency_status='current'
    WHERE s.resource_id=$1
  `, [sampleId]);
  if (!sample.rows[0]) return null;

  const processes = await pool.query(`
    SELECT pe.resource_id AS processing_event_id, r.jblr_code AS processing_event_code,
           r.validation_status, pe.process_type, pe.started_at, pe.ended_at, pe.notes,
           CASE
             WHEN EXISTS (SELECT 1 FROM material.process_input pi WHERE pi.processing_event_id=pe.resource_id AND pi.sample_id=$1) THEN 'input'
             ELSE 'output'
           END AS sample_role,
           (SELECT count(*)::int FROM material.process_input pi WHERE pi.processing_event_id=pe.resource_id) AS input_count,
           (SELECT count(*)::int FROM material.process_output po WHERE po.processing_event_id=pe.resource_id) AS output_count
    FROM material.processing_event pe
    JOIN core.resource r ON r.resource_id=pe.resource_id AND r.currency_status='current'
    WHERE EXISTS (SELECT 1 FROM material.process_input pi WHERE pi.processing_event_id=pe.resource_id AND pi.sample_id=$1)
       OR EXISTS (SELECT 1 FROM material.process_output po WHERE po.processing_event_id=pe.resource_id AND po.sample_id=$1)
    ORDER BY pe.started_at NULLS LAST, r.created_at, pe.resource_id
  `, [sampleId]);

  return { sample: sample.rows[0], processes: processes.rows };
}

async function getProcessingEventDetail(processingEventId) {
  const event = await pool.query(`
    SELECT pe.resource_id AS processing_event_id, r.jblr_code AS processing_event_code,
           r.validation_status, r.row_version, pe.process_type, pe.started_at, pe.ended_at,
           pe.operator_agent_id, pe.protocol_resource_id, pe.notes
    FROM material.processing_event pe
    JOIN core.resource r ON r.resource_id=pe.resource_id
    WHERE pe.resource_id=$1
  `, [processingEventId]);
  if (!event.rows[0]) return null;

  const inputs = await pool.query(`
    SELECT pi.process_input_id, pi.quantity_value AS linked_quantity_value,
           pi.quantity_unit AS linked_quantity_unit, pi.ordinal,
           s.resource_id AS sample_id, sr.jblr_code AS sample_code, sr.validation_status,
           s.sample_kind, s.quantity_value, s.quantity_unit, s.material_state, s.notes
    FROM material.process_input pi
    JOIN material.sample s ON s.resource_id=pi.sample_id
    JOIN core.resource sr ON sr.resource_id=s.resource_id AND sr.currency_status='current'
    WHERE pi.processing_event_id=$1
    ORDER BY pi.ordinal NULLS LAST, pi.process_input_id
  `, [processingEventId]);

  const outputs = await pool.query(`
    SELECT po.process_output_id, po.quantity_value AS linked_quantity_value,
           po.quantity_unit AS linked_quantity_unit, po.ordinal,
           s.resource_id AS sample_id, sr.jblr_code AS sample_code, sr.validation_status,
           s.sample_kind, s.quantity_value, s.quantity_unit, s.material_state, s.notes
    FROM material.process_output po
    JOIN material.sample s ON s.resource_id=po.sample_id
    JOIN core.resource sr ON sr.resource_id=s.resource_id AND sr.currency_status='current'
    WHERE po.processing_event_id=$1
    ORDER BY po.ordinal NULLS LAST, po.process_output_id
  `, [processingEventId]);

  return { ...event.rows[0], inputs: inputs.rows, outputs: outputs.rows };
}

async function createOrReuseProcessing(inputSampleId, input) {
  const processType = requiredText(input.processType, 'processType', 200);
  const startedAt = optionalTimestamp(input.startedAt, 'startedAt');
  const endedAt = optionalTimestamp(input.endedAt, 'endedAt');
  assertChronology(startedAt, endedAt);
  const notes = stagingNote(input.notes, 'procesado sintético sin datos sensibles');

  const client = await pool.connect();
  let processingEventId;
  let created = false;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);

    const inputSample = await client.query(`
      SELECT s.resource_id, s.sample_kind, r.jblr_code
      FROM material.sample s
      JOIN core.resource r ON r.resource_id=s.resource_id AND r.currency_status='current'
      WHERE s.resource_id=$1
      FOR UPDATE OF s, r
    `, [inputSampleId]);
    if (!inputSample.rows[0]) throw new Error('Sample not found');

    const existing = await client.query(`
      SELECT pe.resource_id
      FROM material.process_input pi
      JOIN material.processing_event pe ON pe.resource_id=pi.processing_event_id
      JOIN core.resource r ON r.resource_id=pe.resource_id AND r.currency_status='current'
      WHERE pi.sample_id=$1 AND pe.notes LIKE $2
      ORDER BY r.created_at, pe.resource_id
      LIMIT 1
    `, [inputSampleId, `${MVP5_PREFIX}%`]);

    if (existing.rows[0]) {
      processingEventId = existing.rows[0].resource_id;
      await client.query('COMMIT');
      return { ...(await getProcessingEventDetail(processingEventId)), created: false };
    }

    const processingResource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'PRC','unreviewed')
      RETURNING resource_id
    `);
    processingEventId = processingResource.rows[0].resource_id;
    await client.query(`
      INSERT INTO material.processing_event(
        resource_id, process_type, started_at, ended_at, operator_agent_id, protocol_resource_id, notes
      ) VALUES($1,$2,$3,$4,NULL,NULL,$5)
    `, [processingEventId, processType, startedAt, endedAt, notes]);

    await client.query(`
      INSERT INTO material.process_input(
        process_input_id, processing_event_id, sample_id, quantity_value, quantity_unit, ordinal
      ) VALUES(uuidv7(),$1,$2,NULL,NULL,1)
    `, [processingEventId, inputSampleId]);

    const outputResource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'SMP','unreviewed')
      RETURNING resource_id
    `);
    const outputSampleId = outputResource.rows[0].resource_id;
    if (outputSampleId === inputSampleId) throw new Error('Process input and output samples must not be identical');

    await client.query(`
      INSERT INTO material.sample(resource_id,sample_kind,quantity_value,quantity_unit,material_state,notes)
      VALUES($1,$2,NULL,NULL,'processed_demo_unvalidated',$3)
    `, [outputSampleId, `${inputSample.rows[0].sample_kind}_processed_demo`, stagingNote(null, 'muestra de salida sintética MVP5')]);

    await client.query(`
      INSERT INTO material.process_output(
        process_output_id, processing_event_id, sample_id, quantity_value, quantity_unit, ordinal
      ) VALUES(uuidv7(),$1,$2,NULL,NULL,1)
    `, [processingEventId, outputSampleId]);

    created = true;
    await client.query('COMMIT');
    return { ...(await getProcessingEventDetail(processingEventId)), created };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editProcessingEvent(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`
      SELECT * FROM material.processing_event WHERE resource_id=$1 FOR UPDATE
    `, [id]);
    if (!current.rows[0]) throw new Error('ProcessingEvent not found');
    const old = current.rows[0];

    const next = {
      process_type: input.processType === undefined ? old.process_type : requiredText(input.processType, 'processType', 200),
      started_at: input.startedAt === undefined ? old.started_at : optionalTimestamp(input.startedAt, 'startedAt'),
      ended_at: input.endedAt === undefined ? old.ended_at : optionalTimestamp(input.endedAt, 'endedAt'),
      notes: input.notes === undefined ? old.notes : stagingNote(input.notes, 'procesado sintético sin datos sensibles'),
    };
    const startedComparable = next.started_at instanceof Date ? next.started_at.toISOString() : next.started_at;
    const endedComparable = next.ended_at instanceof Date ? next.ended_at.toISOString() : next.ended_at;
    assertChronology(startedComparable, endedComparable);

    const changes = [];
    for (const [field, value] of Object.entries(next)) {
      const before = old[field] instanceof Date ? old[field].toISOString() : old[field];
      const after = value instanceof Date ? value.toISOString() : value;
      if (String(before ?? '') !== String(after ?? '')) changes.push({ field, oldValue: before, newValue: after });
    }

    if (changes.length) {
      await client.query(`
        UPDATE material.processing_event
        SET process_type=$2, started_at=$3, ended_at=$4, notes=$5
        WHERE resource_id=$1
      `, [id, next.process_type, next.started_at, next.ended_at, next.notes]);
      await client.query(`
        UPDATE core.resource
        SET updated_at=clock_timestamp(), row_version=row_version+1
        WHERE resource_id=$1
      `, [id]);
      await addRevision(client, id, changes, 'MVP5 safe ProcessingEvent edit');
    }

    await client.query('COMMIT');
    return getProcessingEventDetail(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getSampleProcessing,
  getProcessingEventDetail,
  createOrReuseProcessing,
  editProcessingEvent,
};
