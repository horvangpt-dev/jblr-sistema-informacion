const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

function cleanText(value, max = 500) {
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

async function listRanks() {
  const { rows } = await pool.query(`
    SELECT term_key, term_code, label
    FROM taxonomy.term
    WHERE term_domain = 'rank' AND is_active = true
    ORDER BY sort_order NULLS LAST, label
  `);
  return rows;
}

async function searchTaxa(query) {
  const q = requiredText(query, 'query', 200);
  const { rows } = await pool.query(`
    WITH best_name AS (
      SELECT DISTINCT ON (tc.resource_id)
        tc.resource_id AS concept_id,
        cr.jblr_code AS concept_code,
        tc.concept_label,
        tc.resolution_status,
        tn.resource_id AS name_id,
        nr.jblr_code AS name_code,
        tn.scientific_name,
        tn.canonical_name,
        tn.authorship,
        COALESCE(t.label, tn.rank_term_key) AS rank_label,
        nu.usage_role,
        GREATEST(similarity(tn.scientific_name, $1), similarity(tn.canonical_name, $1)) AS score
      FROM taxonomy.name_usage nu
      JOIN taxonomy.taxon_concept tc ON tc.resource_id = nu.taxon_concept_id
      JOIN core.resource cr ON cr.resource_id = tc.resource_id AND cr.currency_status = 'current'
      JOIN taxonomy.taxonomic_name tn ON tn.resource_id = nu.taxonomic_name_id
      JOIN core.resource nr ON nr.resource_id = tn.resource_id AND nr.currency_status = 'current'
      LEFT JOIN taxonomy.term t ON t.term_key = COALESCE(tn.rank_term_key, tc.rank_term_key)
      WHERE tn.scientific_name ILIKE '%' || $1 || '%'
         OR tn.canonical_name ILIKE '%' || $1 || '%'
         OR similarity(tn.scientific_name, $1) >= 0.18
         OR similarity(tn.canonical_name, $1) >= 0.18
      ORDER BY tc.resource_id,
        CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
        GREATEST(similarity(tn.scientific_name, $1), similarity(tn.canonical_name, $1)) DESC,
        tn.scientific_name
    )
    SELECT * FROM best_name
    ORDER BY
      CASE WHEN scientific_name ILIKE $1 || '%' OR canonical_name ILIKE $1 || '%' THEN 0 ELSE 1 END,
      score DESC,
      scientific_name
    LIMIT 50
  `, [q]);
  return rows;
}

async function getTaxonDetail(conceptId) {
  const conceptResult = await pool.query(`
    SELECT
      tc.resource_id AS concept_id,
      cr.jblr_code AS concept_code,
      cr.validation_status AS concept_validation_status,
      cr.currency_status AS concept_currency_status,
      tc.concept_label,
      tc.rank_term_key,
      COALESCE(t.label, tc.rank_term_key) AS rank_label,
      tc.resolution_status,
      tc.notes AS concept_notes,
      tc.parent_concept_id,
      tc.according_to_resource_id,
      cr.created_at,
      cr.updated_at,
      cr.row_version
    FROM taxonomy.taxon_concept tc
    JOIN core.resource cr ON cr.resource_id = tc.resource_id
    LEFT JOIN taxonomy.term t ON t.term_key = tc.rank_term_key
    WHERE tc.resource_id = $1
  `, [conceptId]);

  if (!conceptResult.rows[0]) return null;

  const namesResult = await pool.query(`
    SELECT
      tn.resource_id AS name_id,
      nr.jblr_code AS name_code,
      nr.validation_status AS name_validation_status,
      tn.scientific_name,
      tn.canonical_name,
      tn.authorship,
      tn.rank_term_key,
      COALESCE(t.label, tn.rank_term_key) AS rank_label,
      tn.genus,
      tn.specific_epithet,
      tn.infraspecific_epithet,
      tn.nomenclatural_code,
      tn.notes AS name_notes,
      nu.usage_role,
      nu.verbatim_name,
      nu.valid_from,
      nu.valid_to
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxonomic_name tn ON tn.resource_id = nu.taxonomic_name_id
    JOIN core.resource nr ON nr.resource_id = tn.resource_id
    LEFT JOIN taxonomy.term t ON t.term_key = tn.rank_term_key
    WHERE nu.taxon_concept_id = $1
    ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,
             tn.scientific_name
  `, [conceptId]);

  const countsResult = await pool.query(`
    WITH identified AS (
      SELECT DISTINCT i.target_resource_id, r.resource_type_code
      FROM taxonomy.identification i
      JOIN core.resource r ON r.resource_id = i.target_resource_id
      WHERE i.taxon_concept_id = $1
    ), linked_content AS (
      SELECT DISTINCT ci.resource_id, r.resource_type_code
      FROM evidence.content_link cl
      JOIN evidence.content_item ci ON ci.resource_id = cl.content_item_id
      JOIN core.resource r ON r.resource_id = ci.resource_id
      WHERE cl.target_resource_id = $1
    )
    SELECT
      count(*) FILTER (WHERE resource_type_code = 'POP')::int AS populations,
      count(*) FILTER (WHERE resource_type_code IN ('PRS','VIS'))::int AS prospections_visits,
      count(*) FILTER (WHERE resource_type_code = 'SMP')::int AS samples,
      count(*) FILTER (WHERE resource_type_code = 'ACC')::int AS accessions,
      count(*) FILTER (WHERE resource_type_code = 'REF')::int AS bibliography,
      count(*) FILTER (WHERE resource_type_code IN ('DOC','MED','AST'))::int AS assets_documents
    FROM (
      SELECT * FROM identified
      UNION
      SELECT * FROM linked_content
    ) x
  `, [conceptId]);

  return {
    ...conceptResult.rows[0],
    names: namesResult.rows,
    counts: countsResult.rows[0] || {
      populations: 0, prospections_visits: 0, samples: 0,
      accessions: 0, bibliography: 0, assets_documents: 0,
    },
  };
}

async function getStagingTreatment(client) {
  const { rows } = await client.query(`
    SELECT ci.resource_id
    FROM evidence.content_item ci
    JOIN core.resource r ON r.resource_id = ci.resource_id
    WHERE ci.title = 'JBLR STAGING · MVP_PRODUCTIVO_1 · tratamiento de demostración'
      AND r.currency_status = 'current'
    ORDER BY r.created_at
    LIMIT 1
  `);
  if (!rows[0]) throw new Error('STAGING treatment resource is missing; run npm run seed:staging');
  return rows[0].resource_id;
}

async function createTaxon(input) {
  const scientificName = requiredText(input.scientificName, 'scientificName', 300);
  const canonicalName = requiredText(input.canonicalName, 'canonicalName', 300);
  const authorship = cleanText(input.authorship, 200);
  const rankTermKey = cleanText(input.rankTermKey, 120);
  const conceptLabel = cleanText(input.conceptLabel, 300) || scientificName;
  const genus = cleanText(input.genus, 150);
  const specificEpithet = cleanText(input.specificEpithet, 150);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);

    if (rankTermKey) {
      const rank = await client.query(`SELECT 1 FROM taxonomy.term WHERE term_key=$1 AND term_domain='rank' AND is_active=true`, [rankTermKey]);
      if (!rank.rows[0]) throw new Error('Invalid rankTermKey');
    }

    const treatmentId = await getStagingTreatment(client);

    const existing = await client.query(`
      SELECT 1 FROM taxonomy.taxonomic_name
      WHERE lower(scientific_name) = lower($1)
      LIMIT 1
    `, [scientificName]);
    if (existing.rows[0]) throw new Error('A taxonomic name with this scientific name already exists in STAGING');

    const conceptRes = await client.query(`
      INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
      VALUES (uuidv7(), 'TXC', 'unreviewed')
      RETURNING resource_id, jblr_code
    `);
    const conceptId = conceptRes.rows[0].resource_id;

    await client.query(`
      INSERT INTO taxonomy.taxon_concept(resource_id, rank_term_key, concept_label, according_to_resource_id, resolution_status, notes)
      VALUES ($1, $2, $3, $4, 'unresolved', 'STAGING DEMO · MVP_PRODUCTIVO_1 · no validado científicamente')
    `, [conceptId, rankTermKey, conceptLabel, treatmentId]);

    const nameRes = await client.query(`
      INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
      VALUES (uuidv7(), 'NAM', 'unreviewed')
      RETURNING resource_id, jblr_code
    `);
    const nameId = nameRes.rows[0].resource_id;

    await client.query(`
      INSERT INTO taxonomy.taxonomic_name(
        resource_id, rank_term_key, scientific_name, canonical_name, authorship,
        genus, specific_epithet, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'STAGING DEMO · MVP_PRODUCTIVO_1 · no validado científicamente')
    `, [nameId, rankTermKey, scientificName, canonicalName, authorship, genus, specificEpithet]);

    const usageRes = await client.query(`
      INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
      VALUES (uuidv7(), 'NUS', 'unreviewed')
      RETURNING resource_id
    `);

    await client.query(`
      INSERT INTO taxonomy.name_usage(
        resource_id, taxon_concept_id, taxonomic_name_id, treatment_resource_id,
        usage_role, verbatim_name, notes
      ) VALUES ($1,$2,$3,$4,'unresolved',$5,'STAGING DEMO · relación sin validar')
    `, [usageRes.rows[0].resource_id, conceptId, nameId, treatmentId, scientificName]);

    await client.query('COMMIT');
    return getTaxonDetail(conceptId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addRevision(client, targetId, changes) {
  if (!changes.length) return;
  await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE', [targetId]);
  const revResource = await client.query(`
    INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
    VALUES (uuidv7(), 'REV', 'unreviewed')
    RETURNING resource_id
  `);
  const revisionNo = await client.query(`
    SELECT COALESCE(MAX(revision_no),0)+1 AS next_no
    FROM governance.record_revision
    WHERE target_resource_id=$1
  `, [targetId]);
  await client.query(`
    INSERT INTO governance.record_revision(resource_id, target_resource_id, revision_no, operation, reason)
    VALUES ($1,$2,$3,'update','MVP_PRODUCTIVO_1 basic edit in STAGING')
  `, [revResource.rows[0].resource_id, targetId, revisionNo.rows[0].next_no]);
  for (const change of changes) {
    await client.query(`
      INSERT INTO governance.revision_change(
        revision_change_id, record_revision_id, field_path, old_value, new_value, change_kind, sensitive_value
      ) VALUES (uuidv7(), $1, $2, $3::jsonb, $4::jsonb, 'replace', false)
    `, [revResource.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

async function editTaxon(conceptId, input) {
  const conceptLabel = input.conceptLabel === undefined ? undefined : requiredText(input.conceptLabel, 'conceptLabel', 300);
  const nameNotes = input.nameNotes === undefined ? undefined : cleanText(input.nameNotes, 1000);
  const conceptNotes = input.conceptNotes === undefined ? undefined : cleanText(input.conceptNotes, 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const concept = await client.query(`
      SELECT tc.resource_id, tc.concept_label, tc.notes
      FROM taxonomy.taxon_concept tc
      WHERE tc.resource_id=$1
      FOR UPDATE
    `, [conceptId]);
    if (!concept.rows[0]) throw new Error('Taxon concept not found');

    const primaryName = await client.query(`
      SELECT tn.resource_id, tn.notes
      FROM taxonomy.name_usage nu
      JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
      WHERE nu.taxon_concept_id=$1
      ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END, tn.scientific_name
      LIMIT 1
      FOR UPDATE OF tn
    `, [conceptId]);
    if (!primaryName.rows[0]) throw new Error('No associated taxonomic name found');

    const conceptChanges = [];
    const nameChanges = [];
    const c = concept.rows[0];
    const n = primaryName.rows[0];

    if (conceptLabel !== undefined && conceptLabel !== c.concept_label) conceptChanges.push({ field: 'taxonomy.taxon_concept.concept_label', oldValue: c.concept_label, newValue: conceptLabel });
    if (conceptNotes !== undefined && conceptNotes !== c.notes) conceptChanges.push({ field: 'taxonomy.taxon_concept.notes', oldValue: c.notes, newValue: conceptNotes });
    if (nameNotes !== undefined && nameNotes !== n.notes) nameChanges.push({ field: 'taxonomy.taxonomic_name.notes', oldValue: n.notes, newValue: nameNotes });

    if (conceptChanges.length) {
      await addRevision(client, conceptId, conceptChanges);
      await client.query(`
        UPDATE taxonomy.taxon_concept
        SET concept_label = CASE WHEN $2::boolean THEN $3 ELSE concept_label END,
            notes = CASE WHEN $4::boolean THEN $5 ELSE notes END
        WHERE resource_id=$1
      `, [conceptId, conceptLabel !== undefined, conceptLabel ?? null, conceptNotes !== undefined, conceptNotes ?? null]);
      await client.query(`UPDATE core.resource SET updated_at=current_timestamp, row_version=row_version+1 WHERE resource_id=$1`, [conceptId]);
    }

    if (nameChanges.length) {
      await addRevision(client, n.resource_id, nameChanges);
      await client.query(`
        UPDATE taxonomy.taxonomic_name
        SET notes = CASE WHEN $2::boolean THEN $3 ELSE notes END
        WHERE resource_id=$1
      `, [n.resource_id, nameNotes !== undefined, nameNotes ?? null]);
      await client.query(`UPDATE core.resource SET updated_at=current_timestamp, row_version=row_version+1 WHERE resource_id=$1`, [n.resource_id]);
    }

    await client.query('COMMIT');
    return getTaxonDetail(conceptId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listRanks, searchTaxa, getTaxonDetail, createTaxon, editTaxon };
