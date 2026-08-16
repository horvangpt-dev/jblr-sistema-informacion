const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const MVP7_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_7 · NO VALIDADO · ';

function cleanText(value, max = 1200) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`Text exceeds ${max} characters`);
  return text;
}

function requiredSyntheticText(value, field, max = 1200) {
  const text = cleanText(value, max);
  if (!text) throw new Error(`${field} is required`);
  if (!text.startsWith('JBLR STAGING ·')) throw new Error(`${field} must remain explicitly synthetic STAGING data`);
  return text;
}

function stagingNote(value, fallback) {
  const cleaned = cleanText(value, 1200);
  if (!cleaned) return `${MVP7_PREFIX}${fallback}`;
  return cleaned.startsWith(MVP7_PREFIX) ? cleaned : `${MVP7_PREFIX}${cleaned}`;
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
    INSERT INTO governance.record_revision(resource_id,target_resource_id,revision_no,operation,reason)
    VALUES($1,$2,$3,'update',$4)
  `, [rev.rows[0].resource_id, targetId, next.rows[0].next_no, reason]);
  for (const change of changes) {
    await client.query(`
      INSERT INTO governance.revision_change(
        revision_change_id,record_revision_id,field_path,old_value,new_value,change_kind,sensitive_value
      ) VALUES(uuidv7(),$1,$2,$3::jsonb,$4::jsonb,'replace',false)
    `, [rev.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

async function getVisitContext(db, fieldVisitId) {
  const visit = await db.query(`
    SELECT fv.resource_id AS field_visit_id, vr.jblr_code AS field_visit_code,
           vr.validation_status AS field_visit_validation_status,
           fv.started_at, fv.ended_at, fv.visit_purpose,
           l.resource_id AS location_id, lr.jblr_code AS location_code,
           l.location_name, l.verbatim_locality, l.location_kind,
           l.resolution_status AS location_resolution_status
    FROM field.field_visit fv
    JOIN core.resource vr ON vr.resource_id=fv.resource_id AND vr.currency_status='current'
    JOIN field.location l ON l.resource_id=fv.location_id
    JOIN core.resource lr ON lr.resource_id=l.resource_id AND lr.currency_status='current'
    WHERE fv.resource_id=$1
  `, [fieldVisitId]);
  if (!visit.rows[0]) return null;

  const populations = await db.query(`
    SELECT p.resource_id AS population_id, pr.jblr_code AS population_code,
           p.population_label, p.resolution_status AS population_resolution_status,
           fvp.visit_role,
           i.resource_id AS identification_id,
           i.resolution_status AS identification_resolution_status,
           i.taxon_concept_id,
           COALESCE((
             SELECT tn.scientific_name
             FROM taxonomy.name_usage nu
             JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=i.taxon_concept_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                      tn.scientific_name
             LIMIT 1
           ), tc.concept_label) AS scientific_name
    FROM field.field_visit_population fvp
    JOIN field.population p ON p.resource_id=fvp.population_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id AND pr.currency_status='current'
    LEFT JOIN LATERAL (
      SELECT i2.*
      FROM taxonomy.identification i2
      WHERE i2.target_resource_id=p.resource_id
      ORDER BY i2.is_preferred DESC, i2.resource_id
      LIMIT 1
    ) i ON true
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
    WHERE fvp.field_visit_id=$1
    ORDER BY p.population_label NULLS LAST, p.resource_id
  `, [fieldVisitId]);
  if (populations.rows.length !== 1) throw new Error('MVP7 STAGING visit must have exactly one attached Population');
  return { ...visit.rows[0], ...populations.rows[0] };
}

async function getVisitMonitoring(fieldVisitId) {
  const context = await getVisitContext(pool, fieldVisitId);
  if (!context) return null;
  const observations = await pool.query(`
    SELECT o.resource_id AS observation_id, r.jblr_code AS observation_code,
           r.validation_status, o.observed_at, o.resolution_status,
           o.verbatim_observation, o.notes, o.population_id, o.location_id,
           o.individual_id
    FROM field.observation o
    JOIN core.resource r ON r.resource_id=o.resource_id AND r.currency_status='current'
    WHERE o.field_visit_id=$1
    ORDER BY o.observed_at DESC NULLS LAST, r.created_at
  `, [fieldVisitId]);
  const censuses = await pool.query(`
    SELECT c.resource_id AS census_id, r.jblr_code AS census_code,
           r.validation_status, c.census_at, c.method_text, c.notes,
           c.population_id,
           (SELECT count(*)::int FROM field.census_measurement cm WHERE cm.census_id=c.resource_id) AS measurement_count
    FROM field.census c
    JOIN core.resource r ON r.resource_id=c.resource_id AND r.currency_status='current'
    WHERE c.field_visit_id=$1
    ORDER BY c.census_at DESC, r.created_at
  `, [fieldVisitId]);
  return { context, observations: observations.rows, censuses: censuses.rows };
}

async function getObservationDetail(observationId) {
  const result = await pool.query(`
    SELECT o.resource_id AS observation_id, r.jblr_code AS observation_code,
           r.validation_status, r.currency_status, r.row_version,
           o.field_visit_id, o.observed_at, o.population_id, o.individual_id,
           o.location_id, o.resolution_status, o.verbatim_observation, o.notes
    FROM field.observation o
    JOIN core.resource r ON r.resource_id=o.resource_id
    WHERE o.resource_id=$1
  `, [observationId]);
  if (!result.rows[0]) return null;
  const context = await getVisitContext(pool, result.rows[0].field_visit_id);
  return { ...result.rows[0], context };
}

async function createOrReuseObservation(fieldVisitId, input) {
  const verbatim = requiredSyntheticText(input.verbatimObservation, 'verbatimObservation');
  const notes = stagingNote(input.notes, 'observación cualitativa sintética MVP7');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`mvp7-observation:${fieldVisitId}`]);
    const context = await getVisitContext(client, fieldVisitId);
    if (!context) throw new Error('FieldVisit not found');
    const existing = await client.query(`
      SELECT o.resource_id
      FROM field.observation o
      WHERE o.field_visit_id=$1 AND o.population_id=$2 AND o.location_id=$3
        AND o.notes LIKE $4
      ORDER BY o.resource_id
      LIMIT 1
    `, [fieldVisitId, context.population_id, context.location_id, `${MVP7_PREFIX}%`]);
    let observationId = existing.rows[0]?.resource_id;
    let created = false;
    if (!observationId) {
      const resource = await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'OBS','unreviewed') RETURNING resource_id
      `);
      observationId = resource.rows[0].resource_id;
      await client.query(`
        INSERT INTO field.observation(
          resource_id,field_visit_id,observed_at,population_id,individual_id,location_id,
          resolution_status,verbatim_observation,notes
        ) VALUES($1,$2,COALESCE($3::timestamptz,current_timestamp),$4,NULL,$5,'unresolved',$6,$7)
      `, [observationId, fieldVisitId, context.started_at, context.population_id, context.location_id, verbatim, notes]);
      created = true;
    }
    await client.query('COMMIT');
    return { ...(await getObservationDetail(observationId)), created };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

async function editObservation(observationId, input) {
  const verbatim = input.verbatimObservation === undefined ? undefined : requiredSyntheticText(input.verbatimObservation, 'verbatimObservation');
  const notes = input.notes === undefined ? undefined : stagingNote(input.notes, 'observación cualitativa sintética MVP7');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`
      SELECT verbatim_observation,notes,resolution_status
      FROM field.observation WHERE resource_id=$1 FOR UPDATE
    `, [observationId]);
    if (!current.rows[0]) throw new Error('Observation not found');
    if (current.rows[0].resolution_status !== 'unresolved') throw new Error('Observation resolution_status must remain unresolved in MVP7');
    const changes = [];
    if (verbatim !== undefined && verbatim !== current.rows[0].verbatim_observation) changes.push({field:'field.observation.verbatim_observation',oldValue:current.rows[0].verbatim_observation,newValue:verbatim});
    if (notes !== undefined && notes !== current.rows[0].notes) changes.push({field:'field.observation.notes',oldValue:current.rows[0].notes,newValue:notes});
    if (changes.length) {
      await addRevision(client, observationId, changes, 'MVP_PRODUCTIVO_7 Observation safe edit in STAGING');
      await client.query(`
        UPDATE field.observation
        SET verbatim_observation=CASE WHEN $2::boolean THEN $3 ELSE verbatim_observation END,
            notes=CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [observationId, verbatim !== undefined, verbatim ?? null, notes !== undefined, notes ?? null]);
      await client.query(`UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1`, [observationId]);
    }
    await client.query('COMMIT');
    return getObservationDetail(observationId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

async function getCensusDetail(censusId) {
  const result = await pool.query(`
    SELECT c.resource_id AS census_id, r.jblr_code AS census_code,
           r.validation_status, r.currency_status, r.row_version,
           c.field_visit_id, c.population_id, c.census_at, c.method_text, c.notes
    FROM field.census c
    JOIN core.resource r ON r.resource_id=c.resource_id
    WHERE c.resource_id=$1
  `, [censusId]);
  if (!result.rows[0]) return null;
  const measurements = await pool.query(`
    SELECT census_measurement_id,metric_code,life_stage_code,value_status,
           numeric_value,unit_code,notes
    FROM field.census_measurement
    WHERE census_id=$1
    ORDER BY metric_code
  `, [censusId]);
  const context = await getVisitContext(pool, result.rows[0].field_visit_id);
  return { ...result.rows[0], context, measurements: measurements.rows };
}

async function createOrReuseCensus(fieldVisitId, input) {
  const methodText = requiredSyntheticText(input.methodText, 'methodText');
  const notes = stagingNote(input.notes, 'censo sintético MVP7; no es un protocolo científico real');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`mvp7-census:${fieldVisitId}`]);
    const context = await getVisitContext(client, fieldVisitId);
    if (!context) throw new Error('FieldVisit not found');
    const existing = await client.query(`
      SELECT c.resource_id
      FROM field.census c
      WHERE c.field_visit_id=$1 AND c.population_id=$2 AND c.notes LIKE $3
      ORDER BY c.resource_id LIMIT 1
    `, [fieldVisitId, context.population_id, `${MVP7_PREFIX}%`]);
    let censusId = existing.rows[0]?.resource_id;
    let created = false;
    if (!censusId) {
      const resource = await client.query(`
        INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
        VALUES(uuidv7(),'CEN','unreviewed') RETURNING resource_id
      `);
      censusId = resource.rows[0].resource_id;
      await client.query(`
        INSERT INTO field.census(resource_id,field_visit_id,population_id,census_at,method_text,notes)
        VALUES($1,$2,$3,COALESCE($4::timestamptz,current_timestamp),$5,$6)
      `, [censusId, fieldVisitId, context.population_id, context.started_at, methodText, notes]);
      created = true;
    }
    await client.query('COMMIT');
    return { ...(await getCensusDetail(censusId)), created };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

async function createOrReuseMeasurements(censusId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`mvp7-measurements:${censusId}`]);
    const census = await client.query(`SELECT resource_id FROM field.census WHERE resource_id=$1 FOR UPDATE`, [censusId]);
    if (!census.rows[0]) throw new Error('Census not found');
    const desired = [
      { metric:'individual_count', status:'present', numeric:12, unit:'individuals', note:'conteo sintético conocido: 12' },
      { metric:'seedling_count', status:'unknown', numeric:null, unit:'individuals', note:'valor sintético desconocido: NULL, nunca 0' },
    ];
    let createdCount = 0;
    for (const d of desired) {
      const existing = await client.query(`
        SELECT census_measurement_id,value_status,numeric_value,unit_code
        FROM field.census_measurement
        WHERE census_id=$1 AND metric_code=$2
        ORDER BY census_measurement_id LIMIT 1
      `, [censusId, d.metric]);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const numericMatches = d.numeric === null ? row.numeric_value === null : Number(row.numeric_value) === d.numeric;
        if (row.value_status !== d.status || !numericMatches || row.unit_code !== d.unit) {
          throw new Error(`Existing MVP7 measurement ${d.metric} conflicts with required synthetic semantics`);
        }
        continue;
      }
      await client.query(`
        INSERT INTO field.census_measurement(
          census_measurement_id,census_id,metric_code,life_stage_code,value_status,numeric_value,unit_code,notes
        ) VALUES(uuidv7(),$1,$2,NULL,$3,$4,$5,$6)
      `, [censusId, d.metric, d.status, d.numeric, d.unit, `${MVP7_PREFIX}${d.note}`]);
      createdCount += 1;
    }
    await client.query('COMMIT');
    return { ...(await getCensusDetail(censusId)), createdCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

async function editCensus(censusId, input) {
  const methodText = input.methodText === undefined ? undefined : requiredSyntheticText(input.methodText, 'methodText');
  const notes = input.notes === undefined ? undefined : stagingNote(input.notes, 'censo sintético MVP7; no es un protocolo científico real');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`SELECT method_text,notes FROM field.census WHERE resource_id=$1 FOR UPDATE`, [censusId]);
    if (!current.rows[0]) throw new Error('Census not found');
    const changes = [];
    if (methodText !== undefined && methodText !== current.rows[0].method_text) changes.push({field:'field.census.method_text',oldValue:current.rows[0].method_text,newValue:methodText});
    if (notes !== undefined && notes !== current.rows[0].notes) changes.push({field:'field.census.notes',oldValue:current.rows[0].notes,newValue:notes});
    if (changes.length) {
      await addRevision(client, censusId, changes, 'MVP_PRODUCTIVO_7 Census safe edit in STAGING');
      await client.query(`
        UPDATE field.census
        SET method_text=CASE WHEN $2::boolean THEN $3 ELSE method_text END,
            notes=CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [censusId, methodText !== undefined, methodText ?? null, notes !== undefined, notes ?? null]);
      await client.query(`UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1`, [censusId]);
    }
    await client.query('COMMIT');
    return getCensusDetail(censusId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { client.release(); }
}

module.exports = {
  getVisitMonitoring,
  getObservationDetail,
  createOrReuseObservation,
  editObservation,
  getCensusDetail,
  createOrReuseCensus,
  createOrReuseMeasurements,
  editCensus,
};
