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

async function listLocations(query = '') {
  const q = cleanText(query, 200);
  const params = q ? [q] : [];
  const where = q
    ? `AND (l.location_name ILIKE '%' || $1 || '%' OR l.verbatim_locality ILIKE '%' || $1 || '%')`
    : '';
  const { rows } = await pool.query(`
    SELECT
      l.resource_id AS location_id,
      r.jblr_code AS location_code,
      l.location_name,
      l.verbatim_locality,
      l.location_kind,
      l.resolution_status,
      l.notes,
      r.validation_status,
      r.row_version
    FROM field.location l
    JOIN core.resource r ON r.resource_id=l.resource_id
    WHERE r.currency_status='current'
    ${where}
    ORDER BY l.location_name NULLS LAST, r.created_at
    LIMIT 100
  `, params);
  return rows;
}

async function getTaxonPopulations(conceptId) {
  const taxon = await pool.query(`
    SELECT
      tc.resource_id AS concept_id,
      tc.concept_label,
      COALESCE((
        SELECT tn.scientific_name
        FROM taxonomy.name_usage nu
        JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
        WHERE nu.taxon_concept_id=tc.resource_id
        ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                 tn.scientific_name
        LIMIT 1
      ), tc.concept_label) AS scientific_name
    FROM taxonomy.taxon_concept tc
    JOIN core.resource r ON r.resource_id=tc.resource_id AND r.currency_status='current'
    WHERE tc.resource_id=$1
  `, [conceptId]);
  if (!taxon.rows[0]) throw new Error('Taxon concept not found');

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (p.resource_id)
      p.resource_id AS population_id,
      pr.jblr_code AS population_code,
      p.population_label,
      p.resolution_status,
      p.valid_from,
      p.valid_to,
      p.notes,
      pr.validation_status,
      i.resource_id AS identification_id,
      i.resolution_status AS identification_resolution_status,
      i.is_preferred,
      (
        SELECT count(*)::int
        FROM field.population_location pl
        WHERE pl.population_id=p.resource_id
      ) AS location_count,
      (
        SELECT string_agg(COALESCE(l.location_name, lr.jblr_code), ' · ' ORDER BY COALESCE(l.location_name, lr.jblr_code))
        FROM field.population_location pl
        JOIN field.location l ON l.resource_id=pl.location_id
        JOIN core.resource lr ON lr.resource_id=l.resource_id
        WHERE pl.population_id=p.resource_id
      ) AS location_labels
    FROM taxonomy.identification i
    JOIN field.population p ON p.resource_id=i.target_resource_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id AND pr.currency_status='current'
    WHERE i.taxon_concept_id=$1
    ORDER BY p.resource_id, i.is_preferred DESC, i.resource_id
  `, [conceptId]);

  return { taxon: taxon.rows[0], populations: rows };
}

async function getPopulationDetail(populationId) {
  const result = await pool.query(`
    SELECT
      p.resource_id AS population_id,
      r.jblr_code AS population_code,
      r.validation_status,
      r.currency_status,
      r.created_at,
      r.updated_at,
      r.row_version,
      p.population_label,
      p.resolution_status,
      p.valid_from,
      p.valid_to,
      p.notes
    FROM field.population p
    JOIN core.resource r ON r.resource_id=p.resource_id
    WHERE p.resource_id=$1
  `, [populationId]);
  if (!result.rows[0]) return null;

  const identifications = await pool.query(`
    SELECT
      i.resource_id AS identification_id,
      ir.jblr_code AS identification_code,
      i.taxon_concept_id,
      i.taxonomic_name_id,
      i.verbatim_identification,
      i.resolution_status AS identification_resolution_status,
      i.is_preferred,
      i.confidence,
      i.qualifier,
      i.notes AS identification_notes,
      tc.concept_label,
      COALESCE((
        SELECT tn.scientific_name
        FROM taxonomy.name_usage nu
        JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
        WHERE nu.taxon_concept_id=tc.resource_id
        ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
                 tn.scientific_name
        LIMIT 1
      ), tc.concept_label) AS scientific_name
    FROM taxonomy.identification i
    JOIN core.resource ir ON ir.resource_id=i.resource_id
    LEFT JOIN taxonomy.taxon_concept tc ON tc.resource_id=i.taxon_concept_id
    WHERE i.target_resource_id=$1
    ORDER BY i.is_preferred DESC, ir.created_at
  `, [populationId]);

  const locations = await pool.query(`
    SELECT
      pl.population_location_id,
      pl.relation_role,
      pl.confidence AS relation_confidence,
      pl.valid_from AS relation_valid_from,
      pl.valid_to AS relation_valid_to,
      l.resource_id AS location_id,
      lr.jblr_code AS location_code,
      lr.validation_status AS location_validation_status,
      lr.row_version AS location_row_version,
      l.location_name,
      l.verbatim_locality,
      l.location_kind,
      l.resolution_status AS location_resolution_status,
      l.notes AS location_notes
    FROM field.population_location pl
    JOIN field.location l ON l.resource_id=pl.location_id
    JOIN core.resource lr ON lr.resource_id=l.resource_id
    WHERE pl.population_id=$1
    ORDER BY l.location_name NULLS LAST, pl.population_location_id
  `, [populationId]);

  return {
    ...result.rows[0],
    identifications: identifications.rows,
    locations: locations.rows,
  };
}

async function createLocation(input) {
  const locationName = requiredText(input.locationName, 'locationName', 300);
  const verbatimLocality = cleanText(input.verbatimLocality, 500);
  const locationKind = cleanText(input.locationKind, 120);
  const notes = cleanText(input.notes, 800);
  const stagingNotes = notes
    ? `STAGING DEMO · MVP_PRODUCTIVO_2 · ${notes}`
    : 'STAGING DEMO · MVP_PRODUCTIVO_2 · localización sintética sin datos sensibles';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const duplicate = await client.query(`
      SELECT l.resource_id
      FROM field.location l
      JOIN core.resource r ON r.resource_id=l.resource_id AND r.currency_status='current'
      WHERE lower(l.location_name)=lower($1)
      LIMIT 1
    `, [locationName]);
    if (duplicate.rows[0]) throw new Error('A current STAGING location with this name already exists');

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'LOC','unreviewed')
      RETURNING resource_id
    `);
    const locationId = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.location(
        resource_id, location_name, verbatim_locality, location_kind, resolution_status, notes
      ) VALUES($1,$2,$3,$4,'unresolved',$5)
    `, [locationId, locationName, verbatimLocality, locationKind, stagingNotes]);
    await client.query('COMMIT');
    const locations = await listLocations(locationName);
    return locations.find((row) => row.location_id === locationId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createPopulation(conceptId, input) {
  const populationLabel = requiredText(input.populationLabel, 'populationLabel', 300);
  const locationId = requiredText(input.locationId, 'locationId', 100);
  const notes = cleanText(input.notes, 800);
  const stagingNotes = notes
    ? `STAGING DEMO · MVP_PRODUCTIVO_2 · ${notes}`
    : 'STAGING DEMO · MVP_PRODUCTIVO_2 · población sintética sin datos sensibles';

  const client = await pool.connect();
  let populationId;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);

    const concept = await client.query(`
      SELECT tc.resource_id
      FROM taxonomy.taxon_concept tc
      JOIN core.resource r ON r.resource_id=tc.resource_id AND r.currency_status='current'
      WHERE tc.resource_id=$1
    `, [conceptId]);
    if (!concept.rows[0]) throw new Error('Taxon concept not found');

    const location = await client.query(`
      SELECT l.resource_id
      FROM field.location l
      JOIN core.resource r ON r.resource_id=l.resource_id AND r.currency_status='current'
      WHERE l.resource_id=$1
    `, [locationId]);
    if (!location.rows[0]) throw new Error('Location not found');

    const duplicate = await client.query(`
      SELECT p.resource_id
      FROM taxonomy.identification i
      JOIN field.population p ON p.resource_id=i.target_resource_id
      JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
      WHERE i.taxon_concept_id=$1 AND lower(p.population_label)=lower($2)
      LIMIT 1
    `, [conceptId, populationLabel]);
    if (duplicate.rows[0]) throw new Error('A current STAGING population with this label already exists for the taxon');

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'POP','unreviewed')
      RETURNING resource_id
    `);
    populationId = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.population(resource_id,population_label,resolution_status,notes)
      VALUES($1,$2,'unresolved',$3)
    `, [populationId, populationLabel, stagingNotes]);

    await client.query(`
      INSERT INTO field.population_location(
        population_location_id,population_id,location_id,notes
      ) VALUES(uuidv7(),$1,$2,'STAGING DEMO · MVP_PRODUCTIVO_2 · vínculo población-localización')
    `, [populationId, locationId]);

    const identificationResource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'IDN','unreviewed')
      RETURNING resource_id
    `);
    await client.query(`
      INSERT INTO taxonomy.identification(
        resource_id,target_resource_id,taxon_concept_id,resolution_status,is_preferred,notes
      ) VALUES(
        $1,$2,$3,'unresolved',true,
        'STAGING DEMO · MVP_PRODUCTIVO_2 · determinación asociativa no validada taxonómicamente'
      )
    `, [identificationResource.rows[0].resource_id, populationId, conceptId]);

    await client.query('COMMIT');
    return getPopulationDetail(populationId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editPopulation(populationId, input) {
  const label = input.populationLabel === undefined
    ? undefined
    : requiredText(input.populationLabel, 'populationLabel', 300);
  const notes = input.notes === undefined ? undefined : cleanText(input.notes, 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`
      SELECT population_label,notes FROM field.population WHERE resource_id=$1 FOR UPDATE
    `, [populationId]);
    if (!current.rows[0]) throw new Error('Population not found');
    const row = current.rows[0];
    const changes = [];
    if (label !== undefined && label !== row.population_label) {
      changes.push({ field: 'field.population.population_label', oldValue: row.population_label, newValue: label });
    }
    if (notes !== undefined && notes !== row.notes) {
      changes.push({ field: 'field.population.notes', oldValue: row.notes, newValue: notes });
    }
    if (changes.length) {
      await addRevision(client, populationId, changes, 'MVP_PRODUCTIVO_2 basic population edit in STAGING');
      await client.query(`
        UPDATE field.population
        SET population_label=CASE WHEN $2::boolean THEN $3 ELSE population_label END,
            notes=CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [populationId, label !== undefined, label ?? null, notes !== undefined, notes ?? null]);
      await client.query(`
        UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1
      `, [populationId]);
    }
    await client.query('COMMIT');
    return getPopulationDetail(populationId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function editLocation(locationId, input) {
  const locationName = input.locationName === undefined
    ? undefined
    : requiredText(input.locationName, 'locationName', 300);
  const verbatimLocality = input.verbatimLocality === undefined
    ? undefined
    : cleanText(input.verbatimLocality, 500);
  const locationKind = input.locationKind === undefined
    ? undefined
    : cleanText(input.locationKind, 120);
  const notes = input.notes === undefined ? undefined : cleanText(input.notes, 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`
      SELECT location_name,verbatim_locality,location_kind,notes
      FROM field.location WHERE resource_id=$1 FOR UPDATE
    `, [locationId]);
    if (!current.rows[0]) throw new Error('Location not found');
    const row = current.rows[0];
    const changes = [];
    const candidates = [
      ['field.location.location_name', 'location_name', locationName],
      ['field.location.verbatim_locality', 'verbatim_locality', verbatimLocality],
      ['field.location.location_kind', 'location_kind', locationKind],
      ['field.location.notes', 'notes', notes],
    ];
    for (const [field, key, value] of candidates) {
      if (value !== undefined && value !== row[key]) {
        changes.push({ field, oldValue: row[key], newValue: value });
      }
    }
    if (changes.length) {
      await addRevision(client, locationId, changes, 'MVP_PRODUCTIVO_2 basic location edit in STAGING');
      await client.query(`
        UPDATE field.location
        SET location_name=CASE WHEN $2::boolean THEN $3 ELSE location_name END,
            verbatim_locality=CASE WHEN $4::boolean THEN $5 ELSE verbatim_locality END,
            location_kind=CASE WHEN $6::boolean THEN $7 ELSE location_kind END,
            notes=CASE WHEN $8::boolean THEN $9 ELSE notes END
        WHERE resource_id=$1
      `, [
        locationId,
        locationName !== undefined, locationName ?? null,
        verbatimLocality !== undefined, verbatimLocality ?? null,
        locationKind !== undefined, locationKind ?? null,
        notes !== undefined, notes ?? null,
      ]);
      await client.query(`
        UPDATE core.resource SET updated_at=current_timestamp,row_version=row_version+1 WHERE resource_id=$1
      `, [locationId]);
    }
    await client.query('COMMIT');
    const locations = await listLocations(locationName ?? row.location_name ?? '');
    return locations.find((item) => item.location_id === locationId) || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listLocations,
  getTaxonPopulations,
  getPopulationDetail,
  createLocation,
  createPopulation,
  editPopulation,
  editLocation,
};
