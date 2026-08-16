const crypto = require('crypto');
const { pool } = require('../src/db');

const TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
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
        (SELECT count(*)::int FROM evidence.external_source) AS external_source,
        (SELECT count(*)::int FROM evidence.external_record) AS external_record,
        (SELECT count(*)::int FROM evidence.external_record_snapshot) AS external_record_snapshot,
        (SELECT count(*)::int FROM evidence.provenance_link) AS provenance_link,
        (SELECT count(*)::int FROM evidence.digital_asset) AS digital_asset,
        (SELECT count(*)::int FROM taxonomy.identification) AS identification,
        (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
        (SELECT count(*)::int FROM taxonomy.taxonomic_name) AS taxonomic_name,
        (SELECT count(*)::int FROM taxonomy.name_usage) AS name_usage,
        (SELECT count(*)::int FROM governance.record_revision) AS record_revision
    `)).rows[0];
    assert(counts.external_source === 1, `ExternalSource expected 1, got ${counts.external_source}`);
    assert(counts.external_record === 1, `ExternalRecord expected 1, got ${counts.external_record}`);
    assert(counts.external_record_snapshot === 1, `Snapshot expected 1, got ${counts.external_record_snapshot}`);
    assert(counts.provenance_link === 1, `ProvenanceLink expected 1, got ${counts.provenance_link}`);
    assert(counts.digital_asset === 0, `DigitalAsset expected 0, got ${counts.digital_asset}`);
    assert(counts.identification === 1, `Identification must remain 1, got ${counts.identification}`);
    assert(counts.taxon_concept === 4, `TaxonConcept must remain 4, got ${counts.taxon_concept}`);
    assert(counts.taxonomic_name === 4, `TaxonomicName must remain 4, got ${counts.taxonomic_name}`);
    assert(counts.name_usage === 4, `NameUsage must remain 4, got ${counts.name_usage}`);
    assert(counts.record_revision === 14, `record_revision must remain 14, got ${counts.record_revision}`);

    const row = (await pool.query(`
      SELECT es.external_source_id,es.source_code,es.source_name,es.source_type,es.base_url,es.default_license,es.is_active,
             er.resource_id AS external_record_id,err.jblr_code AS external_record_code,err.resource_type_code AS external_record_type,
             err.validation_status AS external_record_validation,er.external_id,er.record_type,er.canonical_url,er.license_text,
             ers.resource_id AS snapshot_id,sr.jblr_code AS snapshot_code,sr.resource_type_code AS snapshot_type,
             sr.validation_status AS snapshot_validation,ers.external_record_id AS snapshot_external_record_id,
             ers.payload_hash,ers.raw_payload,ers.raw_asset_id,ers.normalized_payload,ers.schema_version,ers.capture_status,
             pl.provenance_link_id,pl.subject_resource_id,pl.source_resource_id,pl.external_source_id AS provenance_external_source_id,
             pl.data_activity_id,pl.generation_mode,pl.relation_role,
             tr.jblr_code AS taxon_code,tr.validation_status AS taxon_validation,tr.row_version AS taxon_row_version
      FROM evidence.external_source es
      JOIN evidence.external_record er ON er.external_source_id=es.external_source_id
      JOIN core.resource err ON err.resource_id=er.resource_id
      JOIN evidence.external_record_snapshot ers ON ers.external_record_id=er.resource_id
      JOIN core.resource sr ON sr.resource_id=ers.resource_id
      JOIN evidence.provenance_link pl ON pl.source_resource_id=ers.resource_id
      JOIN core.resource tr ON tr.resource_id=pl.subject_resource_id
      WHERE es.source_code='STAGING_MVP9' AND er.external_id='MVP9-DEMO-0001'
    `)).rows[0];
    assert(row, 'MVP9 external data row not found');
    assert(row.source_name === 'JBLR STAGING · Fuente externa sintética MVP9', 'Unexpected ExternalSource name');
    assert(row.source_type === 'synthetic_demo', 'Unexpected source_type');
    assert(row.base_url === null && row.default_license === null && row.is_active === true, 'ExternalSource nullable/active semantics failed');
    assert(row.external_record_type === 'EXT' && /^JBLR-EXT-\d{8}$/.test(row.external_record_code || ''), 'ExternalRecord resource/code semantics failed');
    assert(row.external_record_validation === 'unreviewed', 'ExternalRecord must remain unreviewed');
    assert(row.record_type === 'synthetic_taxon_record' && row.canonical_url === null && row.license_text === null, 'ExternalRecord synthetic semantics failed');
    assert(row.snapshot_type === 'EXS' && row.snapshot_code === null, 'Snapshot resource/code semantics failed');
    assert(row.snapshot_validation === 'unreviewed', 'Snapshot must remain unreviewed');
    assert(row.external_record_id !== row.snapshot_id, 'ExternalRecord must not equal Snapshot');
    assert(row.snapshot_external_record_id === row.external_record_id, 'Snapshot must reference ExternalRecord');
    assert(row.raw_asset_id === null, 'raw_asset_id must remain NULL');
    assert(row.capture_status === 'captured', 'capture_status must be captured');
    assert(row.schema_version === 'mvp9.synthetic.v1', 'Unexpected snapshot schema_version');
    assert(canonicalize(row.raw_payload) === canonicalize(RAW_EXPECTED), 'raw_payload was not preserved exactly');
    assert(canonicalize(row.normalized_payload) === canonicalize(NORMALIZED_EXPECTED), 'normalized_payload mismatch');
    assert(row.payload_hash && /^[0-9a-f]{64}$/.test(row.payload_hash), 'payload_hash must be 64 lowercase hex characters');
    assert(row.payload_hash === hash(row.raw_payload), 'payload_hash does not match recalculated SHA-256');
    assert(row.subject_resource_id === TAXON_ID, 'Provenance subject must be Plantago TaxonConcept');
    assert(row.source_resource_id === row.snapshot_id, 'Provenance source must be Snapshot');
    assert(row.provenance_external_source_id === null && row.data_activity_id === null, 'Provenance optional IDs must remain NULL');
    assert(row.generation_mode === 'manual_import_demo' && row.relation_role === 'source_record_snapshot', 'Provenance semantics failed');
    assert(row.taxon_code === 'JBLR-TXC-00000002' && row.taxon_validation === 'unreviewed' && row.taxon_row_version === 1, 'TaxonConcept must remain unchanged/unvalidated');

    const result = {
      OPEN_TAXON_EXTERNAL_SOURCES: 'PASS',
      CREATE_EXTERNAL_SOURCE: 'PASS',
      CREATE_EXTERNAL_RECORD: 'PASS',
      OPEN_EXTERNAL_RECORD_DETAIL: 'PASS',
      CREATE_EXTERNAL_RECORD_SNAPSHOT: 'PASS',
      OPEN_EXTERNAL_RECORD_SNAPSHOT: 'PASS',
      PRESERVE_RAW_PAYLOAD: 'PASS',
      SHOW_NORMALIZED_PAYLOAD: 'PASS',
      CAPTURE_STATUS: 'PASS',
      LINK_TAXON_PROVENANCE: 'PASS',
      TRACE_TAXON_TO_EXTERNAL_SNAPSHOT: 'PASS',
      EXTERNAL_RECORD_NOT_SNAPSHOT: 'PASS',
      IMPORT_RECORD_WITHOUT_VALIDATION: 'PASS',
      NO_NEW_IDENTIFICATION: 'PASS',
      NO_NEW_TAXON_CONCEPT: 'PASS',
      PERSIST_EXTERNAL_DATA_TO_NEON: 'PASS',
      externalSourceId: row.external_source_id,
      externalRecordId: row.external_record_id,
      externalRecordCode: row.external_record_code,
      snapshotId: row.snapshot_id,
      payloadHash: row.payload_hash,
      provenanceLinkId: row.provenance_link_id,
      taxonConceptId: row.subject_resource_id,
      taxonConceptCode: row.taxon_code,
      captureStatus: row.capture_status,
      generationMode: row.generation_mode,
      relationRole: row.relation_role,
      cardinalities: counts,
    };
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
