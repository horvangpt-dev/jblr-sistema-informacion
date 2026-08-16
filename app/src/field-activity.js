const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

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
    `, [
      rev.rows[0].resource_id,
      change.field,
      JSON.stringify(change.oldValue),
      JSON.stringify(change.newValue),
    ]);
  }
}

async function listProspections() {
  const { rows } = await pool.query(`
    SELECT
      p.resource_id AS prospection_id,
      r.jblr_code AS prospection_code,
      r.validation_status,
      r.row_version,
      p.started_at,
      p.ended_at,
      p.purpose,
      p.notes,
      (
        SELECT count(*)::int
        FROM field.field_visit fv
        WHERE fv.prospection_id=p.resource_id
      ) AS visit_count
    FROM field.prospection p
    JOIN core.resource r ON r.resource_id=p.resource_id
    WHERE r.currency_status='current'
    ORDER BY p.started_at DESC NULLS LAST, r.created_at DESC
    LIMIT 100
  `);
  return rows;
}

async function getPopulationFieldActivity(populationId) {
  const population = await pool.query(`
    SELECT
      p.resource_id AS population_id,
      r.jblr_code AS population_code,
      p.population_label,
      p.resolution_status,
      r.validation_status,
      COALESCE((
        SELECT COALESCE(tn.scientific_name, tc.concept_label)
        FROM taxonomy.identification i
        LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
        LEFT JOIN LATERAL (
          SELECT tn2.scientific_name
          FROM taxonomy.name_usage nu
          JOIN taxonomy.taxonomic_name tn2 ON tn2.resource_id=nu.taxonomic_name_id
          WHERE nu.taxon_concept_id=i.taxon_concept_id
          ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                   tn2.scientific_name
          LIMIT 1
        ) tn ON true
        WHERE i.target_resource_id=p.resource_id
        ORDER BY i.is_preferred DESC, i.resource_id
        LIMIT 1
      ), 'Taxón no determinado') AS scientific_name
    FROM field.population p
    JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
    WHERE p.resource_id=$1
  `, [populationId]);
  if (!population.rows[0]) throw new Error('Population not found');

  const visits = await pool.query(`
    SELECT
      fv.resource_id AS field_visit_id,
      vr.jblr_code AS field_visit_code,
      vr.validation_status AS field_visit_validation_status,
      fv.sequence_no,
      fv.started_at,
      fv.ended_at,
      fv.visit_purpose,
      fv.notes AS field_visit_notes,
      pr.resource_id AS prospection_id,
      prr.jblr_code AS prospection_code,
      prr.validation_status AS prospection_validation_status,
      pr.purpose AS prospection_purpose,
      l.resource_id AS location_id,
      lr.jblr_code AS location_code,
      l.location_name,
      l.verbatim_locality,
      fvp.visit_role
    FROM field.field_visit_population fvp
    JOIN field.field_visit fv ON fv.resource_id=fvp.field_visit_id
    JOIN core.resource vr ON vr.resource_id=fv.resource_id AND vr.currency_status='current'
    JOIN field.prospection pr ON pr.resource_id=fv.prospection_id
    JOIN core.resource prr ON prr.resource_id=pr.resource_id AND prr.currency_status='current'
    JOIN field.location l ON l.resource_id=fv.location_id
    JOIN core.resource lr ON lr.resource_id=l.resource_id AND lr.currency_status='current'
    WHERE fvp.population_id=$1
    ORDER BY fv.started_at DESC NULLS LAST, pr.resource_id, fv.sequence_no
  `, [populationId]);

  const locations = await pool.query(`
    SELECT DISTINCT
      l.resource_id AS location_id,
      r.jblr_code AS location_code,
      l.location_name,
      l.verbatim_locality,
      l.location_kind
    FROM field.population_location pl
    JOIN field.location l ON l.resource_id=pl.location_id
    JOIN core.resource r ON r.resource_id=l.resource_id AND r.currency_status='current'
    WHERE pl.population_id=$1
    ORDER BY l.location_name NULLS LAST
  `, [populationId]);

  return {
    population: population.rows[0],
    visits: visits.rows,
    prospections: await listProspections(),
    locations: locations.rows,
  };
}

async function getProspectionDetail(prospectionId) {
  const result = await pool.query(`
    SELECT
      p.resource_id AS prospection_id,
      r.jblr_code AS prospection_code,
      r.validation_status,
      r.currency_status,
      r.created_at,
      r.updated_at,
      r.row_version,
      p.started_at,
      p.ended_at,
      p.purpose,
      p.notes
    FROM field.prospection p
    JOIN core.resource r ON r.resource_id=p.resource_id
    WHERE p.resource_id=$1
  `, [prospectionId]);
  if (!result.rows[0]) return null;

  const visits = await pool.query(`
    SELECT
      fv.resource_id AS field_visit_id,
      r.jblr_code AS field_visit_code,
      fv.sequence_no,
      fv.started_at,
      fv.ended_at,
      fv.visit_purpose,
      l.location_name,
      count(fvp.population_id)::int AS population_count
    FROM field.field_visit fv
    JOIN core.resource r ON r.resource_id=fv.resource_id
    JOIN field.location l ON l.resource_id=fv.location_id
    LEFT JOIN field.field_visit_population fvp ON fvp.field_visit_id=fv.resource_id
    WHERE fv.prospection_id=$1
    GROUP BY fv.resource_id,r.jblr_code,fv.sequence_no,fv.started_at,fv.ended_at,fv.visit_purpose,l.location_name
    ORDER BY fv.sequence_no
  `, [prospectionId]);

  return { ...result.rows[0], visits: visits.rows };
}

async function getFieldVisitDetail(fieldVisitId) {
  const result = await pool.query(`
    SELECT
      fv.resource_id AS field_visit_id,
      vr.jblr_code AS field_visit_code,
      vr.validation_status AS field_visit_validation_status,
      vr.currency_status,
      vr.created_at,
      vr.updated_at,
      vr.row_version,
      fv.sequence_no,
      fv.started_at,
      fv.ended_at,
      fv.visit_purpose,
      fv.notes AS field_visit_notes,
      p.resource_id AS prospection_id,
      pr.jblr_code AS prospection_code,
      pr.validation_status AS prospection_validation_status,
      p.started_at AS prospection_started_at,
      p.ended_at AS prospection_ended_at,
      p.purpose AS prospection_purpose,
      p.notes AS prospection_notes,
      l.resource_id AS location_id,
      lr.jblr_code AS location_code,
      lr.validation_status AS location_validation_status,
      l.location_name,
      l.verbatim_locality,
      l.location_kind,
      l.resolution_status AS location_resolution_status
    FROM field.field_visit fv
    JOIN core.resource vr ON vr.resource_id=fv.resource_id
    JOIN field.prospection p ON p.resource_id=fv.prospection_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id
    JOIN field.location l ON l.resource_id=fv.location_id
    JOIN core.resource lr ON lr.resource_id=l.resource_id
    WHERE fv.resource_id=$1
  `, [fieldVisitId]);
  if (!result.rows[0]) return null;

  const populations = await pool.query(`
    SELECT
      fvp.visit_role,
      p.resource_id AS population_id,
      r.jblr_code AS population_code,
      p.population_label,
      p.resolution_status AS population_resolution_status,
      i.resource_id AS identification_id,
      i.resolution_status AS identification_resolution_status,
      i.is_preferred,
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
    JOIN core.resource r ON r.resource_id=p.resource_id
    LEFT JOIN LATERAL (
      SELECT i2.*
      FROM taxonomy.identification i2
      WHERE i2.target_resource_id=p.resource_id
      ORDER BY i2.is_preferred DESC, i2.resource_id
      LIMIT 1
    ) i ON true
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
    WHERE fvp.field_visit_id=$1
    ORDER BY p.population_label NULLS LAST
  `, [fieldVisitId]);

  return { ...result.rows[0], populations: populations.rows };
}

async function createProspection(input) {
  const purpose = requiredText(input.purpose, 'purpose', 400);
  const startedAt = optionalTimestamp(input.startedAt, 'startedAt');
  const endedAt = optionalTimestamp(input.endedAt, 'endedAt');
  if (startedAt && endedAt && new Date(endedAt) < new Date(startedAt)) throw new Error('endedAt must not precede startedAt');
  const notes = cleanText(input.notes, 1000);
  const stagingNotes = notes
    ? `STAGING DEMO · MVP_PRODUCTIVO_3 · NO VALIDADO · ${notes}`
    : 'STAGING DEMO · MVP_PRODUCTIVO_3 · NO VALIDADO · prospección sintética sin datos sensibles';

  const client = await pool.connect();
  let prospectionId;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'PRS','unreviewed')
      RETURNING resource_id
    `);
    prospectionId = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.prospection(resource_id,started_at,ended_at,purpose,notes)
      VALUES($1,$2,$3,$4,$5)
    `, [prospectionId, startedAt, endedAt, purpose, stagingNotes]);
    await client.query('COMMIT');
    return getProspectionDetail(prospectionId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createFieldVisit(populationId, input) {
  const prospectionId = requiredText(input.prospectionId, 'prospectionId', 100);
  const locationId = requiredText(input.locationId, 'locationId', 100);
  const visitPurpose = requiredText(input.visitPurpose, 'visitPurpose', 400);
  const startedAt = optionalTimestamp(input.startedAt, 'startedAt');
  const endedAt = optionalTimestamp(input.endedAt, 'endedAt');
  if (startedAt && endedAt && new Date(endedAt) < new Date(startedAt)) throw new Error('endedAt must not precede startedAt');
  const notes = cleanText(input.notes, 1000);
  const stagingNotes = notes
    ? `STAGING DEMO · MVP_PRODUCTIVO_3 · NO VALIDADO · ${notes}`
    : 'STAGING DEMO · MVP_PRODUCTIVO_3 · NO VALIDADO · visita sintética sin datos sensibles';

  const client = await pool.connect();
  let fieldVisitId;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);

    const population = await client.query(`
      SELECT p.resource_id FROM field.population p
      JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
      WHERE p.resource_id=$1
    `, [populationId]);
    if (!population.rows[0]) throw new Error('Population not found');

    const location = await client.query(`
      SELECT l.resource_id FROM field.location l
      JOIN core.resource r ON r.resource_id=l.resource_id AND r.currency_status='current'
      WHERE l.resource_id=$1
    `, [locationId]);
    if (!location.rows[0]) throw new Error('Location not found');

    const prospection = await client.query(`
      SELECT p.resource_id FROM field.prospection p
      JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
      WHERE p.resource_id=$1
    `, [prospectionId]);
    if (!prospection.rows[0]) throw new Error('Prospection not found');

    await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE', [prospectionId]);
    const nextSequence = await client.query(`
      SELECT COALESCE(MAX(sequence_no),0)+1 AS sequence_no
      FROM field.field_visit
      WHERE prospection_id=$1
    `, [prospectionId]);

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'VIS','unreviewed')
      RETURNING resource_id
    `);
    fieldVisitId = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.field_visit(
        resource_id,prospection_id,sequence_no,location_id,started_at,ended_at,visit_purpose,notes
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    `, [fieldVisitId, prospectionId, nextSequence.rows[0].sequence_no, locationId, startedAt, endedAt, visitPurpose, stagingNotes]);

    await client.query(`
      INSERT INTO field.field_visit_population(field_visit_id,population_id,visit_role)
      VALUES($1,$2,'observed_population')
    `, [fieldVisitId, populationId]);

    await client.query('COMMIT');
    return getFieldVisitDetail(fieldVisitId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editProspection(prospectionId, input) {
  const purpose = input.purpose === undefined ? undefined : requiredText(input.purpose, 'purpose', 400);
  const notes = input.notes === undefined ? undefined : cleanText(input.notes, 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`SELECT purpose,notes FROM field.prospection WHERE resource_id=$1 FOR UPDATE`, [prospectionId]);
    if (!current.rows[0]) throw new Error('Prospection not found');
    const row = current.rows[0];
    const changes = [];
    if (purpose !== undefined && purpose !== row.purpose) changes.push({ field: 'field.prospection.purpose', oldValue: row.purpose, newValue: purpose });
    if (notes !== undefined && notes !== row.notes) changes.push({ field: 'field.prospection.notes', oldValue: row.notes, newValue: notes });
    if (changes.length) {
      await addRevision(client, prospectionId, changes, 'MVP_PRODUCTIVO_3 basic prospection edit in STAGING');
      await client.query(`
        UPDATE field.prospection
        SET purpose=CASE WHEN $2::boolean THEN $3 ELSE purpose END,
            notes=CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [prospectionId, purpose !== undefined, purpose ?? null, notes !== undefined, notes ?? null]);
      await client.query('UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1', [prospectionId]);
    }
    await client.query('COMMIT');
    return getProspectionDetail(prospectionId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editFieldVisit(fieldVisitId, input) {
  const visitPurpose = input.visitPurpose === undefined ? undefined : requiredText(input.visitPurpose, 'visitPurpose', 400);
  const notes = input.notes === undefined ? undefined : cleanText(input.notes, 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`SELECT visit_purpose,notes FROM field.field_visit WHERE resource_id=$1 FOR UPDATE`, [fieldVisitId]);
    if (!current.rows[0]) throw new Error('FieldVisit not found');
    const row = current.rows[0];
    const changes = [];
    if (visitPurpose !== undefined && visitPurpose !== row.visit_purpose) changes.push({ field: 'field.field_visit.visit_purpose', oldValue: row.visit_purpose, newValue: visitPurpose });
    if (notes !== undefined && notes !== row.notes) changes.push({ field: 'field.field_visit.notes', oldValue: row.notes, newValue: notes });
    if (changes.length) {
      await addRevision(client, fieldVisitId, changes, 'MVP_PRODUCTIVO_3 basic field visit edit in STAGING');
      await client.query(`
        UPDATE field.field_visit
        SET visit_purpose=CASE WHEN $2::boolean THEN $3 ELSE visit_purpose END,
            notes=CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [fieldVisitId, visitPurpose !== undefined, visitPurpose ?? null, notes !== undefined, notes ?? null]);
      await client.query('UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1', [fieldVisitId]);
    }
    await client.query('COMMIT');
    return getFieldVisitDetail(fieldVisitId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listProspections,
  getPopulationFieldActivity,
  getProspectionDetail,
  getFieldVisitDetail,
  createProspection,
  createFieldVisit,
  editProspection,
  editFieldVisit,
};
