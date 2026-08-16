const crypto = require('crypto');
const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const SOURCE_CODE = 'STAGING_MVP9';
const SOURCE_NAME = 'JBLR STAGING · Fuente externa sintética MVP9';
const EXTERNAL_ID = 'MVP9-DEMO-0001';
const RECORD_TYPE = 'synthetic_taxon_record';
const NOTE_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_9 · NO VALIDADO · ';
const RAW_PAYLOAD = Object.freeze({
  external_id: EXTERNAL_ID,
  scientific_name: 'Plantago major L.',
  status: 'synthetic_demo',
  warning: 'STAGING / DEMO / NO VALIDADO',
});
const NORMALIZED_PAYLOAD = Object.freeze({
  scientificName: 'Plantago major L.',
  importStatus: 'unvalidated',
});

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function payloadHash(payload = RAW_PAYLOAD) {
  return crypto.createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
}

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

function stagingNote(value, fallback) {
  const note = cleanText(value, 1000);
  if (note && note.startsWith(NOTE_PREFIX)) return note;
  return `${NOTE_PREFIX}${note || fallback}`;
}

const scientificNameSql = `COALESCE((
  SELECT COALESCE(tn.scientific_name, tc.concept_label)
  FROM taxonomy.taxon_concept tc
  LEFT JOIN LATERAL (
    SELECT tn2.scientific_name
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxonomic_name tn2 ON tn2.resource_id=nu.taxonomic_name_id
    WHERE nu.taxon_concept_id=tc.resource_id
    ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END, tn2.scientific_name
    LIMIT 1
  ) tn ON true
  WHERE tc.resource_id=$1
), 'Taxón no determinado')`;

async function getTaxon(taxonId, client = pool) {
  const result = await client.query(`
    SELECT tc.resource_id AS taxon_concept_id,r.jblr_code AS taxon_concept_code,
           r.validation_status,r.row_version,${scientificNameSql} AS scientific_name,tc.concept_label
    FROM taxonomy.taxon_concept tc
    JOIN core.resource r ON r.resource_id=tc.resource_id AND r.currency_status='current'
    WHERE tc.resource_id=$1
  `, [taxonId]);
  return result.rows[0] || null;
}

async function getSource(client = pool) {
  const result = await client.query(`
    SELECT external_source_id,source_code,source_name,source_type,base_url,default_license,is_active,notes
    FROM evidence.external_source WHERE source_code=$1
  `, [SOURCE_CODE]);
  return result.rows[0] || null;
}

async function getRecordDetail(recordId) {
  const result = await pool.query(`
    SELECT er.resource_id AS external_record_id,r.jblr_code AS external_record_code,r.validation_status,r.row_version,
           er.external_source_id,es.source_code,es.source_name,es.source_type,
           er.external_id,er.record_type,er.canonical_url,er.license_text,er.first_seen_at,er.last_seen_at,er.notes
    FROM evidence.external_record er
    JOIN core.resource r ON r.resource_id=er.resource_id
    JOIN evidence.external_source es ON es.external_source_id=er.external_source_id
    WHERE er.resource_id=$1
  `, [recordId]);
  if (!result.rows[0]) return null;
  const snapshots = await pool.query(`
    SELECT ers.resource_id AS snapshot_id,r.resource_type_code,r.jblr_code,ers.retrieved_at,ers.payload_hash,
           ers.capture_status,ers.schema_version,ers.raw_asset_id,ers.notes
    FROM evidence.external_record_snapshot ers
    JOIN core.resource r ON r.resource_id=ers.resource_id
    WHERE ers.external_record_id=$1
    ORDER BY ers.retrieved_at,ers.resource_id
  `, [recordId]);
  return { ...result.rows[0], snapshots: snapshots.rows };
}

async function getSnapshotDetail(snapshotId) {
  const result = await pool.query(`
    SELECT ers.resource_id AS snapshot_id,sr.resource_type_code,sr.jblr_code AS snapshot_code,sr.validation_status AS snapshot_validation_status,
           ers.external_record_id,ers.retrieved_at,ers.payload_hash,ers.raw_payload,ers.raw_asset_id,ers.normalized_payload,
           ers.schema_version,ers.license_text AS snapshot_license_text,ers.capture_status,ers.notes AS snapshot_notes,
           er.external_id,er.record_type,er.resource_id AS external_record_resource_id,rr.jblr_code AS external_record_code,
           er.external_source_id,es.source_code,es.source_name,es.source_type
    FROM evidence.external_record_snapshot ers
    JOIN core.resource sr ON sr.resource_id=ers.resource_id
    JOIN evidence.external_record er ON er.resource_id=ers.external_record_id
    JOIN core.resource rr ON rr.resource_id=er.resource_id
    JOIN evidence.external_source es ON es.external_source_id=er.external_source_id
    WHERE ers.resource_id=$1
  `, [snapshotId]);
  if (!result.rows[0]) return null;
  const provenance = await pool.query(`
    SELECT pl.provenance_link_id,pl.subject_resource_id,pl.source_resource_id,pl.external_source_id,
           pl.data_activity_id,pl.generation_mode,pl.relation_role,pl.notes,
           tr.jblr_code AS subject_code
    FROM evidence.provenance_link pl
    JOIN core.resource tr ON tr.resource_id=pl.subject_resource_id
    WHERE pl.source_resource_id=$1
    ORDER BY pl.provenance_link_id
  `, [snapshotId]);
  return { ...result.rows[0], provenance: provenance.rows };
}

async function getTaxonExternalData(taxonId) {
  const taxon = await getTaxon(taxonId);
  if (!taxon) return null;
  const source = await getSource();
  let record = null;
  let snapshots = [];
  if (source) {
    const rec = await pool.query(`
      SELECT resource_id FROM evidence.external_record
      WHERE external_source_id=$1 AND external_id=$2
    `, [source.external_source_id, EXTERNAL_ID]);
    if (rec.rows[0]) {
      record = await getRecordDetail(rec.rows[0].resource_id);
      snapshots = record.snapshots;
    }
  }
  const linked = await pool.query(`
    SELECT pl.provenance_link_id,pl.generation_mode,pl.relation_role,pl.source_resource_id AS snapshot_id,
           ers.external_record_id,ers.capture_status,ers.retrieved_at,ers.payload_hash,
           er.external_id,er.record_type,rr.jblr_code AS external_record_code,
           es.external_source_id,es.source_code,es.source_name
    FROM evidence.provenance_link pl
    JOIN evidence.external_record_snapshot ers ON ers.resource_id=pl.source_resource_id
    JOIN evidence.external_record er ON er.resource_id=ers.external_record_id
    JOIN core.resource rr ON rr.resource_id=er.resource_id
    JOIN evidence.external_source es ON es.external_source_id=er.external_source_id
    WHERE pl.subject_resource_id=$1
    ORDER BY ers.retrieved_at,pl.provenance_link_id
  `, [taxonId]);
  return { taxon, source, record, snapshots, linked: linked.rows };
}

async function createOrReuseExternalSource(input = {}) {
  const sourceName = requiredText(input.sourceName || SOURCE_NAME, 'sourceName', 400);
  if (!sourceName.startsWith('JBLR STAGING ·')) throw new Error('sourceName must remain synthetic STAGING');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, ['MVP9:external-source']);
    const existing = await client.query(`SELECT * FROM evidence.external_source WHERE source_code=$1`, [SOURCE_CODE]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.source_type !== 'synthetic_demo' || row.base_url !== null || row.default_license !== null || row.is_active !== true) {
        throw new Error('Existing ExternalSource conflicts with MVP9 synthetic semantics');
      }
      await client.query('COMMIT');
      return { ...row, created: false };
    }
    const inserted = await client.query(`
      INSERT INTO evidence.external_source(
        external_source_id,source_code,source_name,source_type,base_url,default_license,is_active,notes
      ) VALUES(uuidv7(),$1,$2,'synthetic_demo',NULL,NULL,true,$3)
      RETURNING *
    `, [SOURCE_CODE, sourceName, stagingNote(input.notes, 'fuente externa sintética; no representa un proveedor real')]);
    await client.query('COMMIT');
    return { ...inserted.rows[0], created: true };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function createOrReuseExternalRecord(input = {}) {
  const sourceId = requiredText(input.externalSourceId, 'externalSourceId', 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP9:external-record:${sourceId}:${EXTERNAL_ID}`]);
    const source = await client.query(`SELECT * FROM evidence.external_source WHERE external_source_id=$1 AND source_code=$2`, [sourceId,SOURCE_CODE]);
    if (!source.rows[0]) throw new Error('Synthetic MVP9 ExternalSource not found');
    const existing = await client.query(`
      SELECT er.*,r.jblr_code,r.validation_status,r.resource_type_code
      FROM evidence.external_record er JOIN core.resource r ON r.resource_id=er.resource_id
      WHERE er.external_source_id=$1 AND er.external_id=$2
    `, [sourceId,EXTERNAL_ID]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.record_type !== RECORD_TYPE || row.canonical_url !== null || row.license_text !== null || row.resource_type_code !== 'EXT') {
        throw new Error('Existing ExternalRecord conflicts with MVP9 synthetic semantics');
      }
      await client.query('COMMIT');
      return { ...row, external_record_id: row.resource_id, created: false };
    }
    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'EXT','unreviewed') RETURNING resource_id
    `);
    const id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO evidence.external_record(
        resource_id,external_source_id,external_id,record_type,canonical_url,license_text,notes
      ) VALUES($1,$2,$3,$4,NULL,NULL,$5)
    `, [id,sourceId,EXTERNAL_ID,RECORD_TYPE,stagingNote(input.notes, 'registro externo sintético; importación no equivale a validación')]);
    await client.query('COMMIT');
    return { ...(await getRecordDetail(id)), created: true };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function createOrReuseSnapshot(recordId) {
  const hash = payloadHash(RAW_PAYLOAD);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP9:snapshot:${recordId}:${hash}`]);
    const record = await client.query(`
      SELECT er.resource_id,er.external_source_id,er.external_id,er.record_type,es.source_code
      FROM evidence.external_record er JOIN evidence.external_source es ON es.external_source_id=er.external_source_id
      WHERE er.resource_id=$1
    `, [recordId]);
    if (!record.rows[0] || record.rows[0].source_code !== SOURCE_CODE || record.rows[0].external_id !== EXTERNAL_ID || record.rows[0].record_type !== RECORD_TYPE) {
      throw new Error('Synthetic MVP9 ExternalRecord not found');
    }
    const existing = await client.query(`
      SELECT * FROM evidence.external_record_snapshot WHERE external_record_id=$1 AND payload_hash=$2
    `, [recordId,hash]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (canonicalize(row.raw_payload) !== canonicalize(RAW_PAYLOAD) || canonicalize(row.normalized_payload) !== canonicalize(NORMALIZED_PAYLOAD) || row.raw_asset_id !== null || row.capture_status !== 'captured') {
        throw new Error('Existing ExternalRecordSnapshot conflicts with preserved MVP9 payload');
      }
      await client.query('COMMIT');
      return { ...(await getSnapshotDetail(row.resource_id)), created: false };
    }
    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'EXS','unreviewed') RETURNING resource_id
    `);
    const id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO evidence.external_record_snapshot(
        resource_id,external_record_id,retrieved_at,payload_hash,raw_payload,raw_asset_id,normalized_payload,
        schema_version,license_text,capture_status,notes
      ) VALUES($1,$2,clock_timestamp(),$3,$4::jsonb,NULL,$5::jsonb,'mvp9.synthetic.v1',NULL,'captured',$6)
    `, [id,recordId,hash,JSON.stringify(RAW_PAYLOAD),JSON.stringify(NORMALIZED_PAYLOAD),stagingNote(null, 'captura histórica sintética; raw preservado e inmutable en el flujo ordinario')]);
    await client.query('COMMIT');
    return { ...(await getSnapshotDetail(id)), created: true };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function linkTaxonProvenance(taxonId, input = {}) {
  const snapshotId = requiredText(input.snapshotId, 'snapshotId', 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP9:provenance:${taxonId}:${snapshotId}`]);
    const taxon = await getTaxon(taxonId, client);
    if (!taxon) throw new Error('TaxonConcept not found');
    const snapshot = await client.query(`
      SELECT ers.resource_id,ers.capture_status,er.external_id,er.record_type,es.source_code
      FROM evidence.external_record_snapshot ers
      JOIN evidence.external_record er ON er.resource_id=ers.external_record_id
      JOIN evidence.external_source es ON es.external_source_id=er.external_source_id
      WHERE ers.resource_id=$1
    `,[snapshotId]);
    const s = snapshot.rows[0];
    if (!s || s.source_code !== SOURCE_CODE || s.external_id !== EXTERNAL_ID || s.record_type !== RECORD_TYPE || s.capture_status !== 'captured') {
      throw new Error('Synthetic MVP9 Snapshot not found');
    }
    const existing = await client.query(`
      SELECT * FROM evidence.provenance_link
      WHERE subject_resource_id=$1 AND source_resource_id=$2
        AND generation_mode='manual_import_demo' AND relation_role='source_record_snapshot'
      ORDER BY provenance_link_id LIMIT 2
    `,[taxonId,snapshotId]);
    if (existing.rows.length > 1) throw new Error('ProvenanceLink conflicts with duplicate MVP9 links');
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.external_source_id !== null || row.data_activity_id !== null) throw new Error('Existing ProvenanceLink conflicts with MVP9 semantics');
      await client.query('COMMIT');
      return { ...row, created: false };
    }
    const inserted = await client.query(`
      INSERT INTO evidence.provenance_link(
        provenance_link_id,subject_resource_id,source_resource_id,external_source_id,data_activity_id,
        generation_mode,relation_role,notes
      ) VALUES(uuidv7(),$1,$2,NULL,NULL,'manual_import_demo','source_record_snapshot',$3)
      RETURNING *
    `,[taxonId,snapshotId,stagingNote(null, 'enlace manual de procedencia; scientific name externo no resuelve identidad JBLR')]);
    await client.query('COMMIT');
    return { ...inserted.rows[0], created: true };
  } catch(err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

module.exports = {
  SOURCE_CODE,SOURCE_NAME,EXTERNAL_ID,RECORD_TYPE,NOTE_PREFIX,RAW_PAYLOAD,NORMALIZED_PAYLOAD,
  canonicalize,payloadHash,getTaxonExternalData,createOrReuseExternalSource,createOrReuseExternalRecord,
  getRecordDetail,createOrReuseSnapshot,getSnapshotDetail,linkTaxonProvenance,
};
