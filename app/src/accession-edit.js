const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const materialFlow = require('./material-flow');

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

function optionalDate(value, field) {
  const text = cleanText(value, 20);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} is invalid`);
  return text;
}

function stagingNote(input) {
  const note = cleanText(input, 1000);
  return note
    ? `STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO · ${note}`
    : 'STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO · accesión sintética sin datos sensibles';
}

function dateOnly(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

async function addRevision(client, targetId, changes) {
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
    VALUES ($1,$2,$3,'update','MVP4 safe Accession edit')
  `, [rev.rows[0].resource_id, targetId, next.rows[0].next_no]);
  for (const change of changes) {
    await client.query(`
      INSERT INTO governance.revision_change(
        revision_change_id, record_revision_id, field_path, old_value, new_value, change_kind, sensitive_value
      ) VALUES (uuidv7(),$1,$2,$3::jsonb,$4::jsonb,'replace',false)
    `, [rev.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

async function editAccession(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query('SELECT * FROM material.accession WHERE resource_id=$1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new Error('Accession not found');
    const old = current.rows[0];
    const next = {
      accession_date: input.accessionDate === undefined ? dateOnly(old.accession_date) : optionalDate(input.accessionDate, 'accessionDate'),
      accession_status: input.accessionStatus === undefined ? old.accession_status : requiredText(input.accessionStatus, 'accessionStatus', 120),
      notes: input.notes === undefined ? old.notes : stagingNote(input.notes),
    };
    const before = {
      accession_date: dateOnly(old.accession_date),
      accession_status: old.accession_status,
      notes: old.notes,
    };
    const changes = [];
    for (const field of Object.keys(next)) {
      if (String(before[field] ?? '') !== String(next[field] ?? '')) {
        changes.push({ field, oldValue: before[field], newValue: next[field] });
      }
    }
    if (changes.length) {
      await client.query(
        'UPDATE material.accession SET accession_date=$2,accession_status=$3,notes=$4 WHERE resource_id=$1',
        [id, next.accession_date, next.accession_status, next.notes]
      );
      await client.query(
        'UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1',
        [id]
      );
      await addRevision(client, id, changes);
    }
    await client.query('COMMIT');
    return materialFlow.getAccessionDetail(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { editAccession };
