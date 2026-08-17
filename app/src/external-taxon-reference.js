const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const DEMO_TAXON_CONCEPT_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const DEMO_EXTERNAL_SOURCE_ID = '01a00bd3-4ad7-7060-bba5-f8062d723fc5';
const DEMO_EXTERNAL_ID = 'STAGING-DEMO-TAXON-REF-001';
const DEMO_NOTES = 'STAGING / DEMO / MVP15 · SYNTHETIC EXTERNAL TAXON REFERENCE · NO TAXONOMIC VALIDATION';
const DEMO_SOURCE_CODE = 'STAGING_MVP9';
const DEMO_SOURCE_TYPE = 'synthetic_demo';

function assertDemoTaxonConceptId(id) {
  if (id !== DEMO_TAXON_CONCEPT_ID) throw new Error('MVP15 restricted to the accepted STAGING demo TaxonConcept');
}

function referenceSelect(whereClause = 'etr.taxon_concept_id=$1') {
  return `
    SELECT
      etr.resource_id AS external_taxon_reference_id,
      rr.resource_type_code,
      rr.validation_status,
      rr.row_version,
      rr.created_at,
      etr.taxon_concept_id,
      tc.concept_label,
      tr.jblr_code AS taxon_code,
      tr.validation_status AS taxon_validation_status,
      tr.row_version AS taxon_row_version,
      tc.resolution_status AS taxon_resolution_status,
      tc.notes AS taxon_notes,
      etr.taxonomic_name_id,
      etr.external_source_id,
      es.source_code,
      es.source_name,
      es.source_type,
      es.base_url,
      es.notes AS source_notes,
      etr.backbone_snapshot_id,
      etr.external_id,
      etr.external_url,
      etr.match_type,
      etr.confidence,
      etr.notes
    FROM taxonomy.external_taxon_reference etr
    JOIN core.resource rr ON rr.resource_id=etr.resource_id
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=etr.taxon_concept_id
    LEFT JOIN core.resource tr ON tr.resource_id=tc.resource_id
    JOIN evidence.external_source es ON es.external_source_id=etr.external_source_id
    WHERE ${whereClause}
  `;
}

function assertExistingDemo(row) {
  if (!row) throw new Error('MVP15 fail-closed: missing demo ExternalTaxonReference');
  const checks = [
    [row.resource_type_code === 'ETR', 'resource type'],
    [row.validation_status === 'unreviewed', 'reference validation_status'],
    [Number(row.row_version) === 1, 'reference row_version'],
    [row.taxon_concept_id === DEMO_TAXON_CONCEPT_ID, 'taxon_concept_id'],
    [row.taxonomic_name_id === null, 'taxonomic_name_id'],
    [row.external_source_id === DEMO_EXTERNAL_SOURCE_ID, 'external_source_id'],
    [row.source_code === DEMO_SOURCE_CODE, 'source_code'],
    [row.source_type === DEMO_SOURCE_TYPE, 'source_type'],
    [row.backbone_snapshot_id === null, 'backbone_snapshot_id'],
    [row.external_id === DEMO_EXTERNAL_ID, 'external_id'],
    [row.external_url === null, 'external_url'],
    [row.match_type === null, 'match_type'],
    [row.confidence === null, 'confidence'],
    [row.notes === DEMO_NOTES, 'notes'],
    [row.taxon_validation_status === 'unreviewed', 'TaxonConcept validation_status'],
    [Number(row.taxon_row_version) === 1, 'TaxonConcept row_version'],
    [row.taxon_resolution_status === 'unresolved', 'TaxonConcept resolution_status'],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`MVP15 fail-closed: existing reference conflicts with authorized demo ${failed[1]}`);
}

async function getTaxonReferences(taxonConceptId) {
  assertDemoTaxonConceptId(taxonConceptId);
  const taxon = await pool.query(`
    SELECT tc.resource_id AS taxon_concept_id,tc.concept_label,tc.resolution_status,tc.notes,
           r.jblr_code,r.validation_status,r.row_version
    FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id
    WHERE tc.resource_id=$1
  `,[taxonConceptId]);
  if (!taxon.rows[0]) throw new Error('TaxonConcept not found');
  const refs = await pool.query(`${referenceSelect()} ORDER BY rr.created_at,etr.resource_id`,[taxonConceptId]);
  return { taxon: taxon.rows[0], references: refs.rows };
}

async function createOrReuseDemoReference(taxonConceptId) {
  assertDemoTaxonConceptId(taxonConceptId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('JBLR:MVP15:EXTERNAL-TAXON-REFERENCE:DEMO'))`);

    const taxon = await client.query(`
      SELECT tc.resource_id,tc.concept_label,tc.resolution_status,tc.notes,r.jblr_code,r.validation_status,r.row_version
      FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id
      WHERE tc.resource_id=$1 AND r.currency_status='current'
      FOR UPDATE OF tc
    `,[taxonConceptId]);
    if (!taxon.rows[0]) throw new Error('TaxonConcept not found');
    const t = taxon.rows[0];
    if (t.validation_status !== 'unreviewed' || Number(t.row_version) !== 1 || t.resolution_status !== 'unresolved') {
      throw new Error('MVP15 fail-closed: TaxonConcept state changed');
    }

    const source = await client.query(`
      SELECT external_source_id,source_code,source_name,source_type,base_url,notes
      FROM evidence.external_source WHERE external_source_id=$1
    `,[DEMO_EXTERNAL_SOURCE_ID]);
    if (source.rows.length !== 1) throw new Error('MVP15 fail-closed: accepted MVP9 ExternalSource missing or duplicated');
    const s = source.rows[0];
    if (s.source_code !== DEMO_SOURCE_CODE || s.source_type !== DEMO_SOURCE_TYPE || s.base_url !== null) {
      throw new Error('MVP15 fail-closed: accepted MVP9 ExternalSource changed');
    }

    const existing = await client.query(`${referenceSelect('etr.external_id=$1')} FOR UPDATE OF etr`,[DEMO_EXTERNAL_ID]);
    if (existing.rows.length > 1) throw new Error('MVP15 fail-closed: duplicate demo ExternalTaxonReference history');
    if (existing.rows.length === 1) {
      assertExistingDemo(existing.rows[0]);
      await client.query('COMMIT');
      return { created:false, reference:existing.rows[0] };
    }

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'ETR','unreviewed')
      RETURNING resource_id
    `);
    const id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO taxonomy.external_taxon_reference(
        resource_id,taxon_concept_id,taxonomic_name_id,external_source_id,backbone_snapshot_id,
        external_id,external_url,match_type,confidence,notes
      ) VALUES($1,$2,NULL,$3,NULL,$4,NULL,NULL,NULL,$5)
    `,[id,DEMO_TAXON_CONCEPT_ID,DEMO_EXTERNAL_SOURCE_ID,DEMO_EXTERNAL_ID,DEMO_NOTES]);

    const inserted = await client.query(referenceSelect('etr.resource_id=$1'),[id]);
    assertExistingDemo(inserted.rows[0]);
    await client.query('COMMIT');
    return { created:true, reference:inserted.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getReference(id) {
  const result = await pool.query(referenceSelect('etr.resource_id=$1'),[id]);
  if (!result.rows[0]) return null;
  if (result.rows[0].external_id === DEMO_EXTERNAL_ID) assertExistingDemo(result.rows[0]);
  return result.rows[0];
}

module.exports = {
  DEMO_TAXON_CONCEPT_ID,
  DEMO_EXTERNAL_SOURCE_ID,
  DEMO_EXTERNAL_ID,
  DEMO_NOTES,
  getTaxonReferences,
  createOrReuseDemoReference,
  getReference,
};
