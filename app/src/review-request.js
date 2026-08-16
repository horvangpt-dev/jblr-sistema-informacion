const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const TARGET_RTA_ID = '01a00cd2-04ef-706a-9e14-2d47c9de0a18';
const TARGET_TAXON_ID = '01a009e0-2f68-7881-a991-0fd47ae3f2a8';
const TARGET_AREA_ID = '01a00cd2-031c-785a-bf80-a661b640a4b0';
const QUALITY_ASSESSMENT_ID = '01a00ce6-7146-7388-99cf-55299f3ab39c';
const QUALITY_METHOD_TEXT = 'STAGING / DEMO / MVP12 QUALITY REVIEW';
const REVIEW_REASON = 'STAGING / DEMO / MVP13 REVIEW REQUEST · NO SCIENTIFIC VALIDATION';

function exactOne(rows, label) {
  if (rows.length > 1) throw new Error(`${label} conflicts with duplicate rows`);
  return rows[0] || null;
}

function reviewStatusLabel(status) {
  if (status === 'unreviewed') return 'SIN REVISAR';
  if (status === 'pending_review') return 'PENDIENTE DE REVISIÓN';
  return String(status || 'NO REGISTRADO');
}

async function getTargetRegionalAssertion(targetId, client = pool) {
  const result = await client.query(`
    SELECT rta.resource_id AS regional_assertion_id,
           rr.resource_type_code,
           rr.validation_status AS regional_assertion_validation_status,
           rr.row_version AS regional_assertion_row_version,
           rr.updated_at AS regional_assertion_updated_at,
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
  const row = result.rows[0] || null;
  if (row) row.review_status_label = reviewStatusLabel(row.regional_assertion_validation_status);
  return row;
}

function assertBotanicalSemantics(target) {
  if (!target) throw new Error('RegionalTaxonAssertion target not found');
  if (target.regional_assertion_id !== TARGET_RTA_ID ||
      target.taxon_concept_id !== TARGET_TAXON_ID ||
      target.geographic_area_id !== TARGET_AREA_ID) {
    throw new Error('MVP13 review request is restricted to the accepted MVP11 RegionalTaxonAssertion');
  }
  if (target.resource_type_code !== 'RTA') throw new Error('MVP13 target must be a RegionalTaxonAssertion resource');
  if (target.presence_value_status !== 'unknown' || target.presence_term_key !== null) {
    throw new Error('MVP13 target presence semantics differ from the accepted regional baseline');
  }
  const secondary = [
    [target.origin_value_status,target.origin_term_key],
    [target.establishment_value_status,target.establishment_term_key],
    [target.context_value_status,target.context_term_key],
    [target.temporality_value_status,target.temporality_term_key],
    [target.catalog_inclusion_value_status,target.catalog_inclusion_term_key]
  ];
  if (secondary.some(([status,term]) => status !== 'not_recorded' || term !== null)) {
    throw new Error('MVP13 target not_recorded semantics differ from the accepted regional baseline');
  }
  if (target.source_resource_id !== null) throw new Error('MVP13 target source must remain NULL');
}

function assertAllowedTargetState(target) {
  const status = target.regional_assertion_validation_status;
  const version = target.regional_assertion_row_version;
  const initial = status === 'unreviewed' && version === 1;
  const requested = status === 'pending_review' && version === 2;
  if (!initial && !requested) {
    throw new Error(`MVP13 fail-closed target state: ${status} / row_version ${version}`);
  }
}

async function preservedQuality(client = pool) {
  const rows = (await client.query(`
    SELECT qa.*,r.resource_type_code,r.validation_status
    FROM governance.quality_assessment qa
    JOIN core.resource r ON r.resource_id=qa.resource_id
    WHERE qa.resource_id=$1
  `,[QUALITY_ASSESSMENT_ID])).rows;
  const qa = exactOne(rows,'MVP12 QualityAssessment');
  if (!qa || qa.target_resource_id !== TARGET_RTA_ID || qa.resource_type_code !== 'QAS' ||
      qa.method_text !== QUALITY_METHOD_TEXT || qa.assessed_by_agent_id !== null ||
      qa.score !== null || qa.data_activity_id !== null) {
    throw new Error('MVP13 requires the accepted MVP12 QualityAssessment to remain unchanged');
  }
  const qualityFlagCount = (await client.query('SELECT count(*)::int AS n FROM governance.quality_flag')).rows[0].n;
  if (qualityFlagCount !== 0) throw new Error('QualityFlag is out of scope for MVP13');
  return qa;
}

function assertDemoEvent(event) {
  if (!event) throw new Error('ValidationEvent demo not found');
  if (event.resource_type_code !== 'VLE' ||
      event.target_resource_id !== TARGET_RTA_ID ||
      event.from_validation_status !== 'unreviewed' ||
      event.to_validation_status !== 'pending_review' ||
      event.reviewed_by_agent_id !== null ||
      event.data_activity_id !== null ||
      event.reason !== REVIEW_REASON) {
    throw new Error('Existing ValidationEvent conflicts with MVP13 authorized review-request semantics');
  }
}

async function getTargetValidationEvents(targetId, client = pool) {
  return (await client.query(`
    SELECT ve.resource_id AS validation_event_id,
           r.resource_type_code,r.validation_status AS validation_event_validation_status,r.row_version AS validation_event_row_version,
           ve.target_resource_id,ve.from_validation_status,ve.to_validation_status,
           ve.reviewed_by_agent_id,ve.occurred_at,ve.data_activity_id,ve.reason
    FROM governance.validation_event ve
    JOIN core.resource r ON r.resource_id=ve.resource_id
    WHERE ve.target_resource_id=$1
    ORDER BY ve.occurred_at,ve.resource_id
  `,[targetId])).rows;
}

async function listRegionalReview(targetId) {
  if (targetId !== TARGET_RTA_ID) throw new Error('MVP13 review target is not authorized');
  const target = await getTargetRegionalAssertion(targetId);
  assertBotanicalSemantics(target);
  assertAllowedTargetState(target);
  await preservedQuality();
  const events = await getTargetValidationEvents(targetId);
  if (events.length > 1) throw new Error('MVP13 fail-closed: multiple ValidationEvent rows exist for target');
  const event = events[0] || null;
  if (target.regional_assertion_validation_status === 'unreviewed' && event) {
    throw new Error('MVP13 fail-closed: event exists while target remains unreviewed');
  }
  if (target.regional_assertion_validation_status === 'pending_review') {
    if (!event) throw new Error('MVP13 fail-closed: target is pending_review but demo event is missing');
    assertDemoEvent(event);
  }
  return { target, events };
}

async function getValidationEvent(eventId, client = pool) {
  const result = await client.query(`
    SELECT ve.resource_id AS validation_event_id,
           vr.resource_type_code AS validation_event_resource_type,
           vr.validation_status AS validation_event_validation_status,
           vr.row_version AS validation_event_row_version,
           ve.target_resource_id,ve.from_validation_status,ve.to_validation_status,
           ve.reviewed_by_agent_id,ve.occurred_at,ve.data_activity_id,ve.reason,
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
           rta.geographic_area_id,ga.name AS geographic_area_name,ga.area_kind AS geographic_area_kind,
           rta.presence_value_status,rta.presence_term_key,rta.source_resource_id
    FROM governance.validation_event ve
    JOIN core.resource vr ON vr.resource_id=ve.resource_id
    JOIN taxonomy.regional_taxon_assertion rta ON rta.resource_id=ve.target_resource_id
    JOIN core.resource rr ON rr.resource_id=rta.resource_id
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=rta.taxon_concept_id
    JOIN core.geographic_area ga ON ga.resource_id=rta.geographic_area_id
    WHERE ve.resource_id=$1
  `,[eventId]);
  return result.rows[0] || null;
}

async function requestRegionalReview(targetId) {
  if (targetId !== TARGET_RTA_ID) throw new Error('MVP13 review target is not authorized');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`MVP13:review-request:${targetId}:${REVIEW_REASON}`]);

    const locked = await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE',[targetId]);
    if (locked.rows.length !== 1) throw new Error('RegionalTaxonAssertion target not found');

    const target = await getTargetRegionalAssertion(targetId, client);
    assertBotanicalSemantics(target);
    assertAllowedTargetState(target);
    await preservedQuality(client);

    const events = await getTargetValidationEvents(targetId, client);
    if (events.length > 1) throw new Error('MVP13 fail-closed: multiple ValidationEvent rows exist for target');
    let event = events[0] || null;
    let created = false;

    if (target.regional_assertion_validation_status === 'unreviewed') {
      if (target.regional_assertion_row_version !== 1) {
        throw new Error('MVP13 fail-closed: unreviewed target must have row_version 1');
      }
      if (event) throw new Error('MVP13 fail-closed: ValidationEvent exists while target is unreviewed');

      const resource = (await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'VLE','unreviewed')
        RETURNING resource_id
      `)).rows[0];

      event = (await client.query(`
        INSERT INTO governance.validation_event(
          resource_id,target_resource_id,from_validation_status,to_validation_status,
          reviewed_by_agent_id,data_activity_id,reason
        ) VALUES($1,$2,'unreviewed','pending_review',NULL,NULL,$3)
        RETURNING *
      `,[resource.resource_id,targetId,REVIEW_REASON])).rows[0];

      const updated = await client.query(`
        UPDATE core.resource
        SET validation_status='pending_review',
            updated_at=CURRENT_TIMESTAMP,
            row_version=row_version+1
        WHERE resource_id=$1
          AND validation_status='unreviewed'
          AND row_version=1
        RETURNING resource_id,validation_status,row_version
      `,[targetId]);
      if (updated.rows.length !== 1 || updated.rows[0].validation_status !== 'pending_review' || updated.rows[0].row_version !== 2) {
        throw new Error('MVP13 atomic target transition failed');
      }
      created = true;
    } else if (target.regional_assertion_validation_status === 'pending_review') {
      if (target.regional_assertion_row_version !== 2) {
        throw new Error('MVP13 fail-closed: pending_review target must have row_version 2');
      }
      if (!event) throw new Error('MVP13 fail-closed: pending_review target has no ValidationEvent');
      assertDemoEvent(event);
    } else {
      throw new Error(`MVP13 unauthorized transition from ${target.regional_assertion_validation_status}`);
    }

    if (event && !event.resource_type_code) {
      event = (await getTargetValidationEvents(targetId, client))[0];
    }
    assertDemoEvent(event);

    const after = await getTargetRegionalAssertion(targetId, client);
    assertBotanicalSemantics(after);
    if (after.regional_assertion_validation_status !== 'pending_review' || after.regional_assertion_row_version !== 2) {
      throw new Error('MVP13 target did not finish in pending_review / row_version 2');
    }
    await preservedQuality(client);

    await client.query('COMMIT');
    return {
      created,
      target: await getTargetRegionalAssertion(targetId),
      event: await getValidationEvent(event.validation_event_id || event.resource_id)
    };
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
  QUALITY_ASSESSMENT_ID,
  REVIEW_REASON,
  reviewStatusLabel,
  getTargetRegionalAssertion,
  getTargetValidationEvents,
  listRegionalReview,
  getValidationEvent,
  requestRegionalReview,
  assertBotanicalSemantics,
  assertAllowedTargetState,
  assertDemoEvent,
  preservedQuality
};
