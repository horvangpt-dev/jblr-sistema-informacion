const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const LABEL_BASE = 'JBLR STAGING · Madre demo MVP8';
const LABEL_EDITED = 'JBLR STAGING · Madre demo MVP8 · editada';
const NOTE_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_8 · NO VALIDADO · ';

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
function stagingLabel(value) {
  const label = requiredText(value, 'individualLabel', 300);
  if (!label.startsWith('JBLR STAGING ·')) throw new Error('individualLabel must remain synthetic STAGING');
  return label;
}
function stagingNote(value, fallback = 'individuo sintético sin datos sensibles') {
  const note = cleanText(value, 1000);
  if (note && note.startsWith(NOTE_PREFIX)) return note;
  return `${NOTE_PREFIX}${note || fallback}`;
}
function stripStagingNote(value) {
  return String(value || '').replace(new RegExp(`^${NOTE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
}

async function addRevision(client, targetId, changes, reason) {
  if (!changes.length) return;
  await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE', [targetId]);
  const rev = await client.query(`
    INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
    VALUES (uuidv7(), 'REV', 'unreviewed') RETURNING resource_id
  `);
  const next = await client.query(`
    SELECT COALESCE(MAX(revision_no),0)+1 AS next_no
    FROM governance.record_revision WHERE target_resource_id=$1
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

const scientificNameSql = `COALESCE((
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
), 'Taxón no determinado')`;

async function getPopulationIndividuals(populationId) {
  const population = await pool.query(`
    SELECT p.resource_id AS population_id,r.jblr_code AS population_code,p.population_label,
           p.resolution_status,r.validation_status,${scientificNameSql} AS scientific_name
    FROM field.population p
    JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
    WHERE p.resource_id=$1
  `, [populationId]);
  if (!population.rows[0]) return null;
  const individuals = await pool.query(`
    SELECT i.resource_id AS individual_id,r.jblr_code AS individual_code,r.validation_status,
           i.individual_label,i.first_seen_at,i.last_seen_at,i.notes,
           (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=i.resource_id) AS revision_count
    FROM field.individual i
    JOIN core.resource r ON r.resource_id=i.resource_id AND r.currency_status='current'
    WHERE i.population_id=$1
    ORDER BY r.created_at,i.resource_id
  `, [populationId]);
  return { population: population.rows[0], individuals: individuals.rows };
}

async function getIndividualDetail(individualId) {
  const result = await pool.query(`
    SELECT i.resource_id AS individual_id,r.jblr_code AS individual_code,r.validation_status,r.row_version,
           i.individual_label,i.first_seen_at,i.last_seen_at,i.notes,
           p.resource_id AS population_id,pr.jblr_code AS population_code,p.population_label,
           ${scientificNameSql} AS scientific_name,
           (SELECT count(*)::int FROM field.collection_individual ci WHERE ci.individual_id=i.resource_id) AS collection_link_count,
           (SELECT count(*)::int FROM material.sample_origin so WHERE so.individual_id=i.resource_id) AS sample_origin_count,
           (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=i.resource_id) AS revision_count
    FROM field.individual i
    JOIN core.resource r ON r.resource_id=i.resource_id
    JOIN field.population p ON p.resource_id=i.population_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id
    WHERE i.resource_id=$1
  `, [individualId]);
  return result.rows[0] || null;
}

async function createOrReuseIndividual(populationId, input = {}) {
  const label = stagingLabel(input.individualLabel || LABEL_BASE);
  const notes = stagingNote(input.notes, 'madre demo MVP8; no representa una planta real');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP8:individual:${populationId}`]);
    const population = await client.query(`
      SELECT p.resource_id FROM field.population p
      JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
      WHERE p.resource_id=$1
    `, [populationId]);
    if (!population.rows[0]) throw new Error('Population not found');
    const existing = await client.query(`
      SELECT i.resource_id FROM field.individual i
      JOIN core.resource r ON r.resource_id=i.resource_id AND r.currency_status='current'
      WHERE i.population_id=$1 AND i.individual_label LIKE 'JBLR STAGING · Madre demo MVP8%'
      ORDER BY r.created_at LIMIT 2
    `, [populationId]);
    if (existing.rows.length > 1) throw new Error('MVP8 individual conflicts with duplicate synthetic records');
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { ...(await getIndividualDetail(existing.rows[0].resource_id)), created: false };
    }
    const visit = await client.query(`
      SELECT fv.started_at
      FROM field.field_visit_population fvp
      JOIN field.field_visit fv ON fv.resource_id=fvp.field_visit_id
      JOIN core.resource r ON r.resource_id=fv.resource_id
      WHERE fvp.population_id=$1 AND r.jblr_code='JBLR-VIS-00000016'
      LIMIT 1
    `, [populationId]);
    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'IND','unreviewed') RETURNING resource_id
    `);
    const id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.individual(resource_id,population_id,individual_label,first_seen_at,last_seen_at,notes)
      VALUES($1,$2,$3,$4,NULL,$5)
    `, [id, populationId, label, visit.rows[0]?.started_at || null, notes]);
    await client.query('COMMIT');
    return { ...(await getIndividualDetail(id)), created: true };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function editIndividual(individualId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const current = await client.query(`SELECT * FROM field.individual WHERE resource_id=$1 FOR UPDATE`, [individualId]);
    if (!current.rows[0]) throw new Error('Individual not found');
    const old = current.rows[0];
    const next = {
      individual_label: input.individualLabel === undefined ? old.individual_label : stagingLabel(input.individualLabel),
      notes: input.notes === undefined ? old.notes : stagingNote(input.notes),
    };
    const changes = [];
    if (String(old.individual_label || '') !== String(next.individual_label || '')) changes.push({ field: 'individual_label', oldValue: old.individual_label, newValue: next.individual_label });
    if (String(old.notes || '') !== String(next.notes || '')) changes.push({ field: 'notes', oldValue: old.notes, newValue: next.notes });
    if (changes.length) {
      await client.query(`UPDATE field.individual SET individual_label=$2,notes=$3 WHERE resource_id=$1`, [individualId,next.individual_label,next.notes]);
      await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`, [individualId]);
      await addRevision(client, individualId, changes, 'MVP8 safe Individual edit');
    }
    await client.query('COMMIT');
    return getIndividualDetail(individualId);
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function getCollectionIndividuals(collectionEventId) {
  const event = await pool.query(`
    SELECT ce.resource_id AS collection_event_id,r.jblr_code AS collection_event_code,ce.population_id,
           pr.jblr_code AS population_code,p.population_label,${scientificNameSql} AS scientific_name
    FROM field.collection_event ce
    JOIN core.resource r ON r.resource_id=ce.resource_id AND r.currency_status='current'
    JOIN field.population p ON p.resource_id=ce.population_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id
    WHERE ce.resource_id=$1
  `, [collectionEventId]);
  if (!event.rows[0]) return null;
  const linked = await pool.query(`
    SELECT ci.collection_individual_id,ci.role_code,ci.sequence_no,ci.notes,
           i.resource_id AS individual_id,ir.jblr_code AS individual_code,i.individual_label
    FROM field.collection_individual ci
    JOIN field.individual i ON i.resource_id=ci.individual_id
    JOIN core.resource ir ON ir.resource_id=i.resource_id AND ir.currency_status='current'
    WHERE ci.collection_event_id=$1
    ORDER BY ci.sequence_no NULLS LAST,ci.collection_individual_id
  `, [collectionEventId]);
  const available = await pool.query(`
    SELECT i.resource_id AS individual_id,r.jblr_code AS individual_code,i.individual_label
    FROM field.individual i JOIN core.resource r ON r.resource_id=i.resource_id AND r.currency_status='current'
    WHERE i.population_id=$1 ORDER BY r.created_at
  `, [event.rows[0].population_id]);
  return { event: event.rows[0], individuals: linked.rows, availableIndividuals: available.rows };
}

async function linkCollectionIndividual(collectionEventId, input = {}) {
  const individualId = requiredText(input.individualId, 'individualId', 100);
  const roleCode = cleanText(input.roleCode, 100) || 'mother_plant';
  if (roleCode !== 'mother_plant') throw new Error('roleCode must be mother_plant for synthetic STAGING MVP8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP8:collection-individual:${collectionEventId}:${individualId}`]);
    const pair = await client.query(`
      SELECT ce.population_id AS event_population_id,i.population_id AS individual_population_id
      FROM field.collection_event ce CROSS JOIN field.individual i
      WHERE ce.resource_id=$1 AND i.resource_id=$2
    `,[collectionEventId,individualId]);
    if (!pair.rows[0]) throw new Error('CollectionEvent or Individual not found');
    if (pair.rows[0].event_population_id !== pair.rows[0].individual_population_id) throw new Error('Individual must belong to CollectionEvent Population');
    const existing = await client.query(`
      SELECT * FROM field.collection_individual
      WHERE collection_event_id=$1 AND individual_id=$2
      ORDER BY collection_individual_id LIMIT 2
    `,[collectionEventId,individualId]);
    if (existing.rows.length > 1) throw new Error('CollectionIndividual conflicts with duplicate synthetic records');
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.role_code !== 'mother_plant' || Number(row.sequence_no) !== 1) throw new Error('Existing CollectionIndividual conflicts with MVP8 semantics');
      await client.query('COMMIT');
      return { ...(await getCollectionIndividuals(collectionEventId)), created: false };
    }
    await client.query(`
      INSERT INTO field.collection_individual(collection_individual_id,collection_event_id,individual_id,role_code,sequence_no,notes)
      VALUES(uuidv7(),$1,$2,'mother_plant',1,$3)
    `,[collectionEventId,individualId,`${NOTE_PREFIX}vínculo mother_plant sintético`]);
    await client.query('COMMIT');
    return { ...(await getCollectionIndividuals(collectionEventId)), created: true };
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function getSampleOriginTrace(sampleId) {
  const sample = await pool.query(`
    SELECT s.resource_id AS sample_id,sr.jblr_code AS sample_code,s.sample_kind,
           so.sample_origin_id,so.collection_event_id,so.individual_id,so.origin_role,so.proportion,so.notes AS origin_notes,
           ce.population_id,cer.jblr_code AS collection_event_code,p.population_label,pr.jblr_code AS population_code,
           ${scientificNameSql} AS scientific_name,
           i.individual_label,ir.jblr_code AS individual_code
    FROM material.sample s
    JOIN core.resource sr ON sr.resource_id=s.resource_id
    LEFT JOIN material.sample_origin so ON so.sample_id=s.resource_id
    LEFT JOIN field.collection_event ce ON ce.resource_id=so.collection_event_id
    LEFT JOIN core.resource cer ON cer.resource_id=ce.resource_id
    LEFT JOIN field.population p ON p.resource_id=ce.population_id
    LEFT JOIN core.resource pr ON pr.resource_id=p.resource_id
    LEFT JOIN field.individual i ON i.resource_id=so.individual_id
    LEFT JOIN core.resource ir ON ir.resource_id=i.resource_id
    WHERE s.resource_id=$1
    ORDER BY so.sample_origin_id
  `,[sampleId]);
  if (!sample.rows.length) return null;
  const first = sample.rows[0];
  const origins = sample.rows.filter(r => r.sample_origin_id).map(r => ({
    sample_origin_id:r.sample_origin_id,collection_event_id:r.collection_event_id,collection_event_code:r.collection_event_code,
    individual_id:r.individual_id,individual_code:r.individual_code,individual_label:r.individual_label,
    origin_role:r.origin_role,proportion:r.proportion,notes:r.origin_notes,population_id:r.population_id,population_code:r.population_code,
    population_label:r.population_label,scientific_name:r.scientific_name,
  }));
  let availableIndividuals = [];
  if (first.population_id) {
    const available = await pool.query(`SELECT i.resource_id AS individual_id,r.jblr_code AS individual_code,i.individual_label FROM field.individual i JOIN core.resource r ON r.resource_id=i.resource_id AND r.currency_status='current' WHERE i.population_id=$1 ORDER BY r.created_at`,[first.population_id]);
    availableIndividuals = available.rows;
  }
  return { sample:{sample_id:first.sample_id,sample_code:first.sample_code,sample_kind:first.sample_kind}, origins, availableIndividuals };
}

async function linkSampleOriginIndividual(sampleId, input = {}) {
  const individualId = requiredText(input.individualId, 'individualId', 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`MVP8:sample-origin:${sampleId}`]);
    const origins = await client.query(`SELECT * FROM material.sample_origin WHERE sample_id=$1 ORDER BY sample_origin_id FOR UPDATE`,[sampleId]);
    if (origins.rows.length !== 1) throw new Error('Sample must have exactly one SampleOrigin for MVP8');
    const origin = origins.rows[0];
    if (!origin.collection_event_id) throw new Error('SampleOrigin must retain CollectionEvent');
    const context = await client.query(`
      SELECT ce.population_id AS event_population_id,i.population_id AS individual_population_id
      FROM field.collection_event ce CROSS JOIN field.individual i
      WHERE ce.resource_id=$1 AND i.resource_id=$2
    `,[origin.collection_event_id,individualId]);
    if (!context.rows[0]) throw new Error('CollectionEvent or Individual not found');
    if (context.rows[0].event_population_id !== context.rows[0].individual_population_id) throw new Error('Individual must belong to SampleOrigin CollectionEvent Population');
    if (origin.individual_id && origin.individual_id !== individualId) throw new Error('SampleOrigin individual conflicts with existing provenance');
    const linked = !origin.individual_id;
    if (linked) await client.query(`UPDATE material.sample_origin SET individual_id=$2 WHERE sample_origin_id=$1`,[origin.sample_origin_id,individualId]);
    const verify = await client.query(`SELECT collection_event_id,individual_id FROM material.sample_origin WHERE sample_origin_id=$1`,[origin.sample_origin_id]);
    if (!verify.rows[0].collection_event_id || verify.rows[0].individual_id !== individualId) throw new Error('SampleOrigin traceability verification failed');
    await client.query('COMMIT');
    return { ...(await getSampleOriginTrace(sampleId)), linked };
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

module.exports = {
  LABEL_BASE,LABEL_EDITED,NOTE_PREFIX,stripStagingNote,
  getPopulationIndividuals,createOrReuseIndividual,getIndividualDetail,editIndividual,
  getCollectionIndividuals,linkCollectionIndividual,getSampleOriginTrace,linkSampleOriginIndividual,
};
