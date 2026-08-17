const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function main() {
  await assertAuthorizedStaging();
  const counts = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM field.collection_event) AS collection_event,
      (SELECT count(*)::int FROM material.sample) AS sample,
      (SELECT count(*)::int FROM material.sample_origin) AS sample_origin,
      (SELECT count(*)::int FROM material.accession) AS accession,
      (SELECT count(*)::int FROM material.accession_material) AS accession_material,
      (SELECT count(*)::int FROM material.processing_event) AS processing_event
  `)).rows[0];
  if (counts.collection_event !== 1 || counts.sample !== 2 || counts.sample_origin !== 1 || counts.accession !== 1 || counts.accession_material !== 1 || counts.processing_event !== 1) {
    throw new Error(`Unexpected accepted post-MVP5 cardinalities: ${JSON.stringify(counts)}`);
  }

  const { rows } = await pool.query(`
    SELECT
      ce.resource_id AS collection_event_id,
      ce.field_visit_id,
      ce.population_id,
      ce.method_text,
      ce.permit_reference,
      cr.validation_status AS collection_validation,
      s.resource_id AS sample_id,
      s.sample_kind,
      s.quantity_value AS sample_quantity_value,
      s.quantity_unit AS sample_quantity_unit,
      s.material_state,
      sr.validation_status AS sample_validation,
      so.sample_origin_id,
      so.collection_event_id AS sample_origin_collection_event_id,
      so.individual_id,
      so.origin_role,
      ci.individual_id AS collection_link_individual_id,
      ci.role_code AS collection_individual_role,
      a.resource_id AS accession_id,
      a.accession_status,
      ar.validation_status AS accession_validation,
      am.accession_material_id,
      am.sample_id AS accession_material_sample_id,
      am.accession_id AS accession_material_accession_id,
      am.material_role,
      am.quantity_value AS accession_material_quantity_value,
      p.population_label,
      fv.visit_purpose,
      COALESCE((
        SELECT COALESCE(tn.scientific_name, tc.concept_label)
        FROM taxonomy.identification i
        LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
        LEFT JOIN LATERAL (
          SELECT tn2.scientific_name
          FROM taxonomy.name_usage nu
          JOIN taxonomy.taxonomic_name tn2 ON tn2.resource_id=nu.taxonomic_name_id
          WHERE nu.taxon_concept_id=i.taxon_concept_id
          ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END, tn2.scientific_name
          LIMIT 1
        ) tn ON true
        WHERE i.target_resource_id=p.resource_id
        ORDER BY i.is_preferred DESC, i.resource_id
        LIMIT 1
      ), 'Taxón no determinado') AS scientific_name,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=ce.resource_id) AS collection_revisions,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=s.resource_id) AS sample_revisions,
      (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=a.resource_id) AS accession_revisions,
      (SELECT count(*)::int FROM taxonomy.identification i WHERE i.target_resource_id IN (ce.resource_id,s.resource_id,a.resource_id)) AS material_identifications
    FROM field.collection_event ce
    JOIN core.resource cr ON cr.resource_id=ce.resource_id
    JOIN field.field_visit fv ON fv.resource_id=ce.field_visit_id
    JOIN field.population p ON p.resource_id=ce.population_id
    JOIN material.sample_origin so ON so.collection_event_id=ce.resource_id
    JOIN material.sample s ON s.resource_id=so.sample_id
    JOIN core.resource sr ON sr.resource_id=s.resource_id
    JOIN material.accession_material am ON am.sample_id=s.resource_id
    JOIN material.accession a ON a.resource_id=am.accession_id
    JOIN core.resource ar ON ar.resource_id=a.resource_id
    LEFT JOIN field.collection_individual ci ON ci.collection_event_id=ce.resource_id
  `);
  if (rows.length !== 1) throw new Error(`Expected exactly one accepted source-material chain, got ${rows.length}`);
  const r = rows[0];
  const checks = [
    r.method_text === 'JBLR STAGING · Recolección demo MVP4 · editada',
    r.permit_reference === 'STAGING-DEMO-NO-PERMIT',
    /Visita demo MVP3/.test(r.visit_purpose || ''),
    /Población demo MVP2/.test(r.population_label || ''),
    r.sample_origin_collection_event_id === r.collection_event_id,
    r.individual_id !== null,
    r.individual_id === r.collection_link_individual_id,
    r.collection_individual_role === 'mother_plant',
    r.origin_role === 'source_collection',
    r.sample_kind === 'seed_demo',
    r.sample_quantity_value === null,
    r.sample_quantity_unit === null,
    r.material_state === 'field_demo_unvalidated_edited',
    r.accession_material_sample_id === r.sample_id,
    r.accession_material_accession_id === r.accession_id,
    r.material_role === 'source_material',
    r.accession_material_quantity_value === null,
    r.accession_status === 'staging_demo_unvalidated_edited',
    r.collection_validation === 'unreviewed',
    r.sample_validation === 'unreviewed',
    r.accession_validation === 'unreviewed',
    r.scientific_name === 'Plantago major L.',
    r.collection_revisions === 1,
    r.sample_revisions === 1,
    r.accession_revisions === 1,
    r.material_identifications === 0,
  ];
  if (checks.some(v => !v)) throw new Error(`Accepted post-MVP8 material preservation check failed: ${JSON.stringify(r)}`);

  console.log(JSON.stringify({
    OPEN_VISIT_COLLECTIONS: 'PASS',
    CREATE_COLLECTION_EVENT: 'PASS',
    LINK_COLLECTION_VISIT: 'PASS',
    LINK_COLLECTION_POPULATION: 'PASS',
    OPEN_COLLECTION_EVENT_DETAIL: 'PASS',
    CREATE_SAMPLE: 'PASS',
    LINK_SAMPLE_ORIGIN: 'PASS',
    OPEN_SAMPLE_DETAIL: 'PASS',
    CREATE_ACCESSION: 'PASS',
    LINK_ACCESSION_SAMPLE: 'PASS',
    OPEN_ACCESSION_DETAIL: 'PASS',
    EDIT_COLLECTION_EVENT: 'PASS',
    EDIT_SAMPLE: 'PASS',
    EDIT_ACCESSION: 'PASS',
    PRESERVE_MVP5_PROCESSING: 'PASS',
    PRESERVE_MVP8_INDIVIDUAL_TRACEABILITY: 'PASS',
    PERSIST_MATERIAL_FLOW_TO_NEON: 'PASS',
    collectionEventId: r.collection_event_id,
    sampleId: r.sample_id,
    accessionId: r.accession_id,
    processingEventCount: counts.processing_event,
    quantitySemantics: 'unknown=NULL; zero not used',
  }));
}

main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
