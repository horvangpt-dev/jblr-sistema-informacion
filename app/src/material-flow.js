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

function optionalDate(value, field) {
  const text = cleanText(value, 20);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} is invalid`);
  return text;
}

function optionalQuantity(value, field = 'quantityValue') {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} is invalid`);
  return number;
}

function stagingNote(input, fallback) {
  const note = cleanText(input, 1000);
  return note
    ? `STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO · ${note}`
    : `STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO · ${fallback}`;
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
    `, [rev.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

const taxonSql = `
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
  ), 'Taxón no determinado')`;

async function getVisitMaterialFlow(fieldVisitId) {
  const visit = await pool.query(`
    SELECT fv.resource_id AS field_visit_id, r.jblr_code AS field_visit_code,
           fv.sequence_no, fv.visit_purpose, fv.started_at, fv.ended_at
    FROM field.field_visit fv
    JOIN core.resource r ON r.resource_id=fv.resource_id AND r.currency_status='current'
    WHERE fv.resource_id=$1
  `, [fieldVisitId]);
  if (!visit.rows[0]) throw new Error('FieldVisit not found');

  const populations = await pool.query(`
    SELECT p.resource_id AS population_id, r.jblr_code AS population_code,
           p.population_label, ${taxonSql} AS scientific_name
    FROM field.field_visit_population fvp
    JOIN field.population p ON p.resource_id=fvp.population_id
    JOIN core.resource r ON r.resource_id=p.resource_id AND r.currency_status='current'
    WHERE fvp.field_visit_id=$1
    ORDER BY p.population_label NULLS LAST
  `, [fieldVisitId]);

  const events = await pool.query(`
    SELECT ce.resource_id AS collection_event_id, r.jblr_code AS collection_event_code,
           r.validation_status, ce.collection_at, ce.method_text, ce.permit_reference, ce.notes,
           p.resource_id AS population_id, p.population_label,
           (SELECT count(*)::int FROM material.sample_origin so WHERE so.collection_event_id=ce.resource_id) AS sample_count
    FROM field.collection_event ce
    JOIN core.resource r ON r.resource_id=ce.resource_id AND r.currency_status='current'
    LEFT JOIN field.population p ON p.resource_id=ce.population_id
    WHERE ce.field_visit_id=$1
    ORDER BY ce.collection_at DESC NULLS LAST, r.created_at DESC
  `, [fieldVisitId]);

  return { visit: visit.rows[0], populations: populations.rows, collectionEvents: events.rows };
}

async function getCollectionEventDetail(collectionEventId) {
  const result = await pool.query(`
    SELECT ce.resource_id AS collection_event_id, r.jblr_code AS collection_event_code,
           r.validation_status, r.row_version, ce.collection_at, ce.method_text,
           ce.permit_reference, ce.notes,
           fv.resource_id AS field_visit_id, fvr.jblr_code AS field_visit_code,
           fv.sequence_no, fv.visit_purpose,
           p.resource_id AS population_id, pr.jblr_code AS population_code,
           p.population_label, ${taxonSql} AS scientific_name
    FROM field.collection_event ce
    JOIN core.resource r ON r.resource_id=ce.resource_id
    LEFT JOIN field.field_visit fv ON fv.resource_id=ce.field_visit_id
    LEFT JOIN core.resource fvr ON fvr.resource_id=fv.resource_id
    LEFT JOIN field.population p ON p.resource_id=ce.population_id
    LEFT JOIN core.resource pr ON pr.resource_id=p.resource_id
    WHERE ce.resource_id=$1
  `, [collectionEventId]);
  if (!result.rows[0]) return null;

  const samples = await pool.query(`
    SELECT s.resource_id AS sample_id, r.jblr_code AS sample_code, r.validation_status,
           s.sample_kind, s.quantity_value, s.quantity_unit, s.material_state, s.notes,
           so.origin_role, so.proportion,
           (SELECT count(*)::int FROM material.accession_material am WHERE am.sample_id=s.resource_id) AS accession_count
    FROM material.sample_origin so
    JOIN material.sample s ON s.resource_id=so.sample_id
    JOIN core.resource r ON r.resource_id=s.resource_id AND r.currency_status='current'
    WHERE so.collection_event_id=$1
    ORDER BY r.created_at
  `, [collectionEventId]);
  return { ...result.rows[0], samples: samples.rows };
}

async function createCollectionEvent(fieldVisitId, input) {
  const populationId = requiredText(input.populationId, 'populationId', 100);
  const methodText = requiredText(input.methodText, 'methodText', 400);
  const collectionAt = optionalTimestamp(input.collectionAt, 'collectionAt');
  const permitReference = cleanText(input.permitReference, 300);
  const notes = stagingNote(input.notes, 'evento de recolección sintético sin datos sensibles');

  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');
    await assertAuthorizedStaging(client);
    const linked = await client.query(`
      SELECT 1
      FROM field.field_visit_population fvp
      JOIN core.resource vr ON vr.resource_id=fvp.field_visit_id AND vr.currency_status='current'
      JOIN core.resource pr ON pr.resource_id=fvp.population_id AND pr.currency_status='current'
      WHERE fvp.field_visit_id=$1 AND fvp.population_id=$2
    `, [fieldVisitId, populationId]);
    if (!linked.rows[0]) throw new Error('Population not found for current FieldVisit');

    const resource = await client.query(`
      INSERT INTO core.resource(resource_id,resource_type_code,validation_status)
      VALUES(uuidv7(),'COL','unreviewed') RETURNING resource_id
    `);
    id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO field.collection_event(resource_id,field_visit_id,population_id,collection_at,method_text,permit_reference,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7)
    `, [id, fieldVisitId, populationId, collectionAt, methodText, permitReference, notes]);
    await client.query('COMMIT');
    return getCollectionEventDetail(id);
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally { client.release(); }
}

async function editCollectionEvent(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    const current = await client.query(`SELECT * FROM field.collection_event WHERE resource_id=$1 FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new Error('CollectionEvent not found');
    const old = current.rows[0];
    const next = {
      collection_at: input.collectionAt === undefined ? old.collection_at : optionalTimestamp(input.collectionAt, 'collectionAt'),
      method_text: input.methodText === undefined ? old.method_text : requiredText(input.methodText, 'methodText', 400),
      permit_reference: input.permitReference === undefined ? old.permit_reference : cleanText(input.permitReference, 300),
      notes: input.notes === undefined ? old.notes : stagingNote(input.notes, 'evento de recolección sintético sin datos sensibles'),
    };
    const changes = [];
    for (const [field, value] of Object.entries(next)) {
      const before = old[field] instanceof Date ? old[field].toISOString() : old[field];
      const after = value instanceof Date ? value.toISOString() : value;
      if (String(before ?? '') !== String(after ?? '')) changes.push({ field, oldValue: before, newValue: after });
    }
    if (changes.length) {
      await client.query(`UPDATE field.collection_event SET collection_at=$2,method_text=$3,permit_reference=$4,notes=$5 WHERE resource_id=$1`, [id,next.collection_at,next.method_text,next.permit_reference,next.notes]);
      await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`, [id]);
      await addRevision(client,id,changes,'MVP4 safe CollectionEvent edit');
    }
    await client.query('COMMIT'); return getCollectionEventDetail(id);
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function getSampleDetail(sampleId) {
  const result = await pool.query(`
    SELECT s.resource_id AS sample_id, r.jblr_code AS sample_code, r.validation_status, r.row_version,
           s.sample_kind, s.quantity_value, s.quantity_unit, s.material_state, s.notes,
           so.sample_origin_id, so.origin_role, so.proportion,
           ce.resource_id AS collection_event_id, cer.jblr_code AS collection_event_code,
           ce.collection_at, ce.method_text,
           fv.resource_id AS field_visit_id, fvr.jblr_code AS field_visit_code, fv.visit_purpose,
           p.resource_id AS population_id, pr.jblr_code AS population_code, p.population_label,
           ${taxonSql} AS scientific_name
    FROM material.sample s
    JOIN core.resource r ON r.resource_id=s.resource_id
    LEFT JOIN LATERAL (
      SELECT so2.* FROM material.sample_origin so2 WHERE so2.sample_id=s.resource_id ORDER BY so2.sample_origin_id LIMIT 1
    ) so ON true
    LEFT JOIN field.collection_event ce ON ce.resource_id=so.collection_event_id
    LEFT JOIN core.resource cer ON cer.resource_id=ce.resource_id
    LEFT JOIN field.field_visit fv ON fv.resource_id=ce.field_visit_id
    LEFT JOIN core.resource fvr ON fvr.resource_id=fv.resource_id
    LEFT JOIN field.population p ON p.resource_id=ce.population_id
    LEFT JOIN core.resource pr ON pr.resource_id=p.resource_id
    WHERE s.resource_id=$1
  `, [sampleId]);
  if (!result.rows[0]) return null;
  const accessions = await pool.query(`
    SELECT a.resource_id AS accession_id, r.jblr_code AS accession_code, r.validation_status,
           a.accession_date, a.accession_status, a.notes, am.material_role, am.quantity_value, am.quantity_unit
    FROM material.accession_material am
    JOIN material.accession a ON a.resource_id=am.accession_id
    JOIN core.resource r ON r.resource_id=a.resource_id AND r.currency_status='current'
    WHERE am.sample_id=$1
    ORDER BY r.created_at
  `,[sampleId]);
  return { ...result.rows[0], accessions: accessions.rows };
}

async function createSample(collectionEventId, input) {
  const sampleKind = requiredText(input.sampleKind, 'sampleKind', 200);
  const quantityValue = optionalQuantity(input.quantityValue);
  const quantityUnit = quantityValue === null ? null : requiredText(input.quantityUnit, 'quantityUnit', 80);
  const materialState = cleanText(input.materialState, 200);
  const notes = stagingNote(input.notes, 'muestra sintética sin datos sensibles');
  const client = await pool.connect(); let id;
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    const event = await client.query(`SELECT ce.resource_id FROM field.collection_event ce JOIN core.resource r ON r.resource_id=ce.resource_id AND r.currency_status='current' WHERE ce.resource_id=$1`,[collectionEventId]);
    if (!event.rows[0]) throw new Error('CollectionEvent not found');
    const resource = await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),'SMP','unreviewed') RETURNING resource_id`);
    id=resource.rows[0].resource_id;
    await client.query(`INSERT INTO material.sample(resource_id,sample_kind,quantity_value,quantity_unit,material_state,notes) VALUES($1,$2,$3,$4,$5,$6)`,[id,sampleKind,quantityValue,quantityUnit,materialState,notes]);
    await client.query(`INSERT INTO material.sample_origin(sample_origin_id,sample_id,collection_event_id,origin_role,proportion,notes) VALUES(uuidv7(),$1,$2,'source_collection',NULL,'STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO')`,[id,collectionEventId]);
    await client.query('COMMIT'); return getSampleDetail(id);
  } catch(err){await client.query('ROLLBACK');throw err;} finally{client.release();}
}

async function editSample(id,input){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await assertAuthorizedStaging(client);
    const current=await client.query(`SELECT * FROM material.sample WHERE resource_id=$1 FOR UPDATE`,[id]);
    if(!current.rows[0])throw new Error('Sample not found');
    const old=current.rows[0];
    const quantityValue=input.quantityValue===undefined?old.quantity_value:optionalQuantity(input.quantityValue);
    const quantityUnit=input.quantityValue===undefined&&input.quantityUnit===undefined?old.quantity_unit:(quantityValue===null?null:requiredText(input.quantityUnit,'quantityUnit',80));
    const next={sample_kind:input.sampleKind===undefined?old.sample_kind:requiredText(input.sampleKind,'sampleKind',200),quantity_value:quantityValue,quantity_unit:quantityUnit,material_state:input.materialState===undefined?old.material_state:cleanText(input.materialState,200),notes:input.notes===undefined?old.notes:stagingNote(input.notes,'muestra sintética sin datos sensibles')};
    const changes=[];for(const [field,value] of Object.entries(next)){if(String(old[field]??'')!==String(value??''))changes.push({field,oldValue:old[field],newValue:value});}
    if(changes.length){await client.query(`UPDATE material.sample SET sample_kind=$2,quantity_value=$3,quantity_unit=$4,material_state=$5,notes=$6 WHERE resource_id=$1`,[id,next.sample_kind,next.quantity_value,next.quantity_unit,next.material_state,next.notes]);await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`,[id]);await addRevision(client,id,changes,'MVP4 safe Sample edit');}
    await client.query('COMMIT');return getSampleDetail(id);
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}

async function getAccessionDetail(accessionId){
  const result=await pool.query(`SELECT a.resource_id AS accession_id,r.jblr_code AS accession_code,r.validation_status,r.row_version,a.accession_date,a.accession_status,a.notes FROM material.accession a JOIN core.resource r ON r.resource_id=a.resource_id WHERE a.resource_id=$1`,[accessionId]);
  if(!result.rows[0])return null;
  const materials=await pool.query(`
    SELECT am.accession_material_id,am.material_role,am.quantity_value AS linked_quantity_value,am.quantity_unit AS linked_quantity_unit,
           s.resource_id AS sample_id,sr.jblr_code AS sample_code,s.sample_kind,s.quantity_value,s.quantity_unit,s.material_state,s.notes AS sample_notes,
           ce.resource_id AS collection_event_id,cer.jblr_code AS collection_event_code,ce.method_text,
           p.resource_id AS population_id,p.population_label,${taxonSql} AS scientific_name
    FROM material.accession_material am
    JOIN material.sample s ON s.resource_id=am.sample_id
    JOIN core.resource sr ON sr.resource_id=s.resource_id
    LEFT JOIN LATERAL (SELECT so2.* FROM material.sample_origin so2 WHERE so2.sample_id=s.resource_id ORDER BY so2.sample_origin_id LIMIT 1) so ON true
    LEFT JOIN field.collection_event ce ON ce.resource_id=so.collection_event_id
    LEFT JOIN core.resource cer ON cer.resource_id=ce.resource_id
    LEFT JOIN field.population p ON p.resource_id=ce.population_id
    WHERE am.accession_id=$1 ORDER BY am.accession_material_id
  `,[accessionId]);
  return {...result.rows[0],materials:materials.rows};
}

async function createAccession(sampleId,input){
  const accessionDate=optionalDate(input.accessionDate,'accessionDate');
  const accessionStatus=requiredText(input.accessionStatus,'accessionStatus',120);
  const notes=stagingNote(input.notes,'accesión sintética sin datos sensibles');
  const client=await pool.connect();let id;
  try{
    await client.query('BEGIN');await assertAuthorizedStaging(client);
    const sample=await client.query(`SELECT s.resource_id FROM material.sample s JOIN core.resource r ON r.resource_id=s.resource_id AND r.currency_status='current' WHERE s.resource_id=$1`,[sampleId]);
    if(!sample.rows[0])throw new Error('Sample not found');
    const resource=await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,validation_status) VALUES(uuidv7(),'ACC','unreviewed') RETURNING resource_id`);id=resource.rows[0].resource_id;
    await client.query(`INSERT INTO material.accession(resource_id,accession_date,accession_status,curator_agent_id,notes) VALUES($1,$2,$3,NULL,$4)`,[id,accessionDate,accessionStatus,notes]);
    await client.query(`INSERT INTO material.accession_material(accession_material_id,accession_id,sample_id,material_role,quantity_value,quantity_unit,notes) VALUES(uuidv7(),$1,$2,'source_material',NULL,NULL,'STAGING DEMO · MVP_PRODUCTIVO_4 · NO VALIDADO')`,[id,sampleId]);
    await client.query('COMMIT');return getAccessionDetail(id);
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}

async function editAccession(id,input){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await assertAuthorizedStaging(client);
    const current=await client.query(`SELECT * FROM material.accession WHERE resource_id=$1 FOR UPDATE`,[id]);if(!current.rows[0])throw new Error('Accession not found');const old=current.rows[0];
    const next={accession_date:input.accessionDate===undefined?old.accession_date:optionalDate(input.accessionDate,'accessionDate'),accession_status:input.accessionStatus===undefined?old.accession_status:requiredText(input.accessionStatus,'accessionStatus',120),notes:input.notes===undefined?old.notes:stagingNote(input.notes,'accesión sintética sin datos sensibles')};
    const changes=[];for(const [field,value] of Object.entries(next)){const before=old[field] instanceof Date?old[field].toISOString().slice(0,10):old[field];if(String(before??'')!==String(value??''))changes.push({field,oldValue:before,newValue:value});}
    if(changes.length){await client.query(`UPDATE material.accession SET accession_date=$2,accession_status=$3,notes=$4 WHERE resource_id=$1`,[id,next.accession_date,next.accession_status,next.notes]);await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`,[id]);await addRevision(client,id,changes,'MVP4 safe Accession edit');}
    await client.query('COMMIT');return getAccessionDetail(id);
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}

module.exports={getVisitMaterialFlow,getCollectionEventDetail,createCollectionEvent,editCollectionEvent,getSampleDetail,createSample,editSample,getAccessionDetail,createAccession,editAccession};
