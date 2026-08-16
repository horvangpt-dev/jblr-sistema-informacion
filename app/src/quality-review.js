const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const TARGET_RTA_ID = '01a00cd2-04ef-706a-9e14-2d47c9de0a18';
const TARGET_TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const TARGET_AREA_ID = '01a00cd2-031c-785a-bf80-a661b640a4b0';
const METHOD_TEXT = 'STAGING / DEMO / MVP12 QUALITY REVIEW';
const SUMMARY_TEXT = 'STAGING / DEMO. Revisión técnica trazable: NO constituye validación científica, NO constituye una puntuación de calidad y NO modifica la RegionalTaxonAssertion.';

function exactOne(rows, label) {
  if (rows.length > 1) throw new Error(`${label} conflicts with duplicate MVP12 rows`);
  return rows[0] || null;
}

async function getTargetRegionalAssertion(targetId, client = pool) {
  const result = await client.query(`
    SELECT rta.resource_id AS regional_assertion_id,
           rr.resource_type_code,
           rr.validation_status AS regional_assertion_validation_status,
           rr.row_version AS regional_assertion_row_version,
           rta.taxon_concept_id,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=rta.taxon_concept_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name,
           rta.geographic_area_id,
           ga.name AS geographic_area_name,
           ga.area_kind AS geographic_area_kind,
           rta.presence_value_status,rta.presence_term_key,
           rta.origin_value_status,rta.origin_term_key,
           rta.establishment_value_status,rta.establishment_term_key,
           rta.context_value_status,rta.context_term_key,
           rta.temporality_value_status,rta.temporality_term_key,
           rta.catalog_inclusion_value_status,rta.catalog_inclusion_term_key,
           rta.source_resource_id
    FROM taxonomy.regional_taxon_assertion rta
    JOIN core.resource rr ON rr.resource_id=rta.resource_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=rta.taxon_concept_id
    JOIN core.geographic_area ga ON ga.resource_id=rta.geographic_area_id
    WHERE rta.resource_id=$1
  `,[targetId]);
  return result.rows[0] || null;
}

function assertSafeTarget(target) {
  if (!target) throw new Error('RegionalTaxonAssertion target not found');
  if (target.regional_assertion_id !== TARGET_RTA_ID ||
      target.taxon_concept_id !== TARGET_TAXON_ID ||
      target.geographic_area_id !== TARGET_AREA_ID) {
    throw new Error('MVP12 synthetic quality review is restricted to the accepted MVP11 RegionalTaxonAssertion');
  }
  if (target.resource_type_code !== 'RTA') throw new Error('MVP12 target must be a RegionalTaxonAssertion resource');
  if (target.regional_assertion_validation_status !== 'unreviewed' || target.regional_assertion_row_version !== 1) {
    throw new Error('MVP12 target validation state conflicts with accepted MVP11 baseline');
  }
  if (target.presence_value_status !== 'unknown' || target.presence_term_key !== null) {
    throw new Error('MVP12 target presence semantics changed from accepted MVP11 baseline');
  }
  const secondary = [
    [target.origin_value_status,target.origin_term_key],
    [target.establishment_value_status,target.establishment_term_key],
    [target.context_value_status,target.context_term_key],
    [target.temporality_value_status,target.temporality_term_key],
    [target.catalog_inclusion_value_status,target.catalog_inclusion_term_key]
  ];
  if (secondary.some(([status,term]) => status !== 'not_recorded' || term !== null)) {
    throw new Error('MVP12 target not_recorded semantics changed from accepted MVP11 baseline');
  }
  if (target.source_resource_id !== null) throw new Error('MVP12 target source changed from accepted MVP11 baseline');
}

async function listQualityForRegionalAssertion(targetId) {
  const target = await getTargetRegionalAssertion(targetId);
  assertSafeTarget(target);
  const result = await pool.query(`
    SELECT qa.resource_id AS quality_assessment_id,
           r.resource_type_code,r.validation_status,r.row_version,
           qa.target_resource_id,qa.assessed_at,qa.assessed_by_agent_id,
           qa.method_text,qa.score,qa.summary,qa.data_activity_id
    FROM governance.quality_assessment qa
    JOIN core.resource r ON r.resource_id=qa.resource_id
    WHERE qa.target_resource_id=$1
    ORDER BY qa.assessed_at,qa.resource_id
  `,[targetId]);
  return { target, assessments: result.rows };
}

async function getQualityAssessment(assessmentId, client = pool) {
  const result = await client.query(`
    SELECT qa.resource_id AS quality_assessment_id,
           qr.resource_type_code AS quality_resource_type,
           qr.validation_status AS quality_validation_status,
           qr.row_version AS quality_row_version,
           qa.target_resource_id,qa.assessed_at,qa.assessed_by_agent_id,
           qa.method_text,qa.score,qa.summary,qa.data_activity_id,
           rta.taxon_concept_id,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=rta.taxon_concept_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ),tc.concept_label,'Taxón no determinado') AS scientific_name,
           rta.geographic_area_id,ga.name AS geographic_area_name,ga.area_kind AS geographic_area_kind,
           rr.validation_status AS regional_assertion_validation_status,
           rr.row_version AS regional_assertion_row_version,
           rta.presence_value_status,rta.presence_term_key,
           rta.origin_value_status,rta.origin_term_key,
           rta.establishment_value_status,rta.establishment_term_key,
           rta.context_value_status,rta.context_term_key,
           rta.temporality_value_status,rta.temporality_term_key,
           rta.catalog_inclusion_value_status,rta.catalog_inclusion_term_key,
           rta.source_resource_id
    FROM governance.quality_assessment qa
    JOIN core.resource qr ON qr.resource_id=qa.resource_id
    JOIN taxonomy.regional_taxon_assertion rta ON rta.resource_id=qa.target_resource_id
    JOIN core.resource rr ON rr.resource_id=rta.resource_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=rta.taxon_concept_id
    JOIN core.geographic_area ga ON ga.resource_id=rta.geographic_area_id
    WHERE qa.resource_id=$1
  `,[assessmentId]);
  return result.rows[0] || null;
}

async function createOrReuseQualityAssessment(targetId) {
  if (targetId !== TARGET_RTA_ID) {
    throw new Error('MVP12 synthetic quality review is restricted to the accepted MVP11 RegionalTaxonAssertion');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`MVP12:quality:${targetId}:${METHOD_TEXT}`]);

    const target = await getTargetRegionalAssertion(targetId, client);
    assertSafeTarget(target);

    const demoRows = (await client.query(`
      SELECT qa.*,r.resource_type_code,r.validation_status,r.row_version
      FROM governance.quality_assessment qa
      JOIN core.resource r ON r.resource_id=qa.resource_id
      WHERE qa.target_resource_id=$1 AND qa.method_text=$2
      ORDER BY qa.resource_id
    `,[targetId,METHOD_TEXT])).rows;

    let assessment = exactOne(demoRows,'QualityAssessment MVP12');
    let created = false;
    if (!assessment) {
      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'QAS','unreviewed')
        RETURNING resource_id
      `)).rows[0];
      assessment = (await client.query(`
        INSERT INTO governance.quality_assessment(
          resource_id,target_resource_id,assessed_by_agent_id,method_text,score,summary,data_activity_id
        ) VALUES($1,$2,NULL,$3,NULL,$4,NULL)
        RETURNING *
      `,[resource.resource_id,targetId,METHOD_TEXT,SUMMARY_TEXT])).rows[0];
      created = true;
    } else if (
      assessment.resource_type_code !== 'QAS' ||
      assessment.validation_status !== 'unreviewed' ||
      assessment.assessed_by_agent_id !== null ||
      assessment.score !== null ||
      assessment.data_activity_id !== null ||
      assessment.summary !== SUMMARY_TEXT
    ) {
      throw new Error('Existing QualityAssessment conflicts with MVP12 safe demo semantics');
    }

    const qualityFlagCount = (await client.query('SELECT count(*)::int AS n FROM governance.quality_flag WHERE quality_assessment_id=$1',[assessment.resource_id])).rows[0].n;
    if (qualityFlagCount !== 0) throw new Error('MVP12 QualityAssessment must not have QualityFlag rows');
    const validationEventCount = (await client.query('SELECT count(*)::int AS n FROM governance.validation_event WHERE target_resource_id=$1',[targetId])).rows[0].n;
    if (validationEventCount !== 0) throw new Error('MVP12 must not create ValidationEvent rows');

    await client.query('COMMIT');
    return { created, assessment: await getQualityAssessment(assessment.resource_id) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  TARGET_RTA_ID,
  TARGET_TAXON_ID,
  TARGET_AREA_ID,
  METHOD_TEXT,
  SUMMARY_TEXT,
  listQualityForRegionalAssertion,
  getQualityAssessment,
  createOrReuseQualityAssessment,
  getTargetRegionalAssertion,
  assertSafeTarget
};
