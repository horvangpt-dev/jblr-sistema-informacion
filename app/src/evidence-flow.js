const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const MVP6_PREFIX = 'STAGING DEMO · MVP_PRODUCTIVO_6 · NO VALIDADO · ';
const SYNTHETIC_PREFIX = 'JBLR STAGING ·';

function cleanText(value, max = 1200) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`Text exceeds ${max} characters`);
  return text;
}

function requiredText(value, field, max = 500) {
  const text = cleanText(value, max);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function syntheticText(value, field, max = 1000, required = false) {
  const text = required ? requiredText(value, field, max) : cleanText(value, max);
  if (!text) return null;
  if (!text.startsWith(SYNTHETIC_PREFIX)) throw new Error(`${field} must remain explicitly synthetic STAGING text`);
  return text;
}

function publicationYear(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1500 || n > 2500) throw new Error('publicationYear is invalid');
  return n;
}

function stagingNote(value, fallback) {
  const text = cleanText(value, 1200);
  if (!text) return `${MVP6_PREFIX}${fallback}`;
  if (text.startsWith(MVP6_PREFIX)) return text;
  return `${MVP6_PREFIX}${text}`;
}

async function addRevision(client, targetId, changes, reason) {
  if (!changes.length) return;
  await client.query('SELECT resource_id FROM core.resource WHERE resource_id=$1 FOR UPDATE', [targetId]);
  const rev = await client.query(`
    INSERT INTO core.resource(resource_id, resource_type_code, validation_status)
    VALUES (uuidv7(), 'REV', 'unreviewed') RETURNING resource_id
  `);
  const next = await client.query(`SELECT COALESCE(MAX(revision_no),0)+1 AS next_no FROM governance.record_revision WHERE target_resource_id=$1`, [targetId]);
  await client.query(`
    INSERT INTO governance.record_revision(resource_id, target_resource_id, revision_no, operation, reason)
    VALUES ($1,$2,$3,'update',$4)
  `, [rev.rows[0].resource_id, targetId, next.rows[0].next_no, reason]);
  for (const change of changes) {
    await client.query(`
      INSERT INTO governance.revision_change(revision_change_id, record_revision_id, field_path, old_value, new_value, change_kind, sensitive_value)
      VALUES (uuidv7(),$1,$2,$3::jsonb,$4::jsonb,'replace',false)
    `, [rev.rows[0].resource_id, change.field, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)]);
  }
}

async function getTaxonHeader(conceptId, executor = pool) {
  const { rows } = await executor.query(`
    SELECT tc.resource_id AS concept_id, cr.jblr_code AS concept_code, tc.concept_label,
           COALESCE((SELECT tn.scientific_name FROM taxonomy.name_usage nu JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
             WHERE nu.taxon_concept_id=tc.resource_id
             ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END, tn.scientific_name LIMIT 1), tc.concept_label) AS scientific_name
    FROM taxonomy.taxon_concept tc JOIN core.resource cr ON cr.resource_id=tc.resource_id AND cr.currency_status='current'
    WHERE tc.resource_id=$1
  `, [conceptId]);
  return rows[0] || null;
}

async function getBibliographicReference(referenceId) {
  const { rows } = await pool.query(`
    SELECT br.resource_id AS reference_id, r.jblr_code AS reference_code, r.validation_status, r.row_version,
           br.reference_type, br.title, br.authors_text, br.publication_year, br.doi, br.isbn, br.citation_text, br.url, br.external_source_id, br.notes,
           (SELECT count(*)::int FROM evidence.evidence_link el WHERE el.evidence_resource_id=br.resource_id) AS evidence_link_count,
           (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=br.resource_id) AS revision_count
    FROM evidence.bibliographic_reference br JOIN core.resource r ON r.resource_id=br.resource_id AND r.currency_status='current'
    WHERE br.resource_id=$1
  `, [referenceId]);
  return rows[0] || null;
}

async function getAssertion(assertionId) {
  const assertion = await pool.query(`
    SELECT a.resource_id AS assertion_id, r.jblr_code AS assertion_code, r.validation_status, r.row_version,
           a.subject_resource_id, a.predicate_code, a.statement_text, a.asserted_by_agent_id, a.asserted_at, a.resolution_status, a.scope_note, a.notes,
           (SELECT count(*)::int FROM governance.record_revision rr WHERE rr.target_resource_id=a.resource_id) AS revision_count
    FROM evidence.assertion a JOIN core.resource r ON r.resource_id=a.resource_id AND r.currency_status='current' WHERE a.resource_id=$1
  `, [assertionId]);
  if (!assertion.rows[0]) return null;
  const evidence = await pool.query(`
    SELECT el.evidence_link_id, el.relation_role, el.confidence, el.notes AS evidence_link_notes,
           br.resource_id AS reference_id, rr.jblr_code AS reference_code, rr.validation_status AS reference_validation_status,
           br.reference_type, br.title, br.authors_text, br.publication_year, br.citation_text, br.doi, br.isbn
    FROM evidence.evidence_link el
    JOIN evidence.bibliographic_reference br ON br.resource_id=el.evidence_resource_id
    JOIN core.resource rr ON rr.resource_id=br.resource_id AND rr.currency_status='current'
    WHERE el.assertion_id=$1
    ORDER BY CASE el.relation_role WHEN 'supports' THEN 0 WHEN 'corroborates' THEN 1 WHEN 'contradicts' THEN 2 ELSE 3 END, rr.created_at, el.evidence_link_id
  `, [assertionId]);
  return { ...assertion.rows[0], evidence: evidence.rows };
}

async function getTaxonEvidence(conceptId) {
  const taxon = await getTaxonHeader(conceptId);
  if (!taxon) return null;
  const assertions = await pool.query(`
    SELECT a.resource_id AS assertion_id, r.jblr_code AS assertion_code, r.validation_status, a.subject_resource_id, a.predicate_code,
           a.statement_text, a.asserted_at, a.resolution_status, a.scope_note, a.notes,
           (SELECT count(*)::int FROM evidence.evidence_link el WHERE el.assertion_id=a.resource_id) AS evidence_count
    FROM evidence.assertion a JOIN core.resource r ON r.resource_id=a.resource_id AND r.currency_status='current'
    WHERE a.subject_resource_id=$1 ORDER BY r.created_at, a.resource_id
  `, [conceptId]);
  const references = await pool.query(`
    SELECT br.resource_id AS reference_id, r.jblr_code AS reference_code, r.validation_status, br.reference_type, br.title, br.authors_text,
           br.publication_year, br.citation_text, br.doi, br.isbn, br.external_source_id, br.notes,
           (SELECT count(*)::int FROM evidence.evidence_link el WHERE el.evidence_resource_id=br.resource_id) AS evidence_link_count
    FROM evidence.bibliographic_reference br JOIN core.resource r ON r.resource_id=br.resource_id AND r.currency_status='current'
    WHERE br.notes LIKE $1 ORDER BY r.created_at, br.resource_id
  `, [`${MVP6_PREFIX}%`]);
  return { taxon, assertions: assertions.rows, references: references.rows };
}

async function createOrReuseBibliographicReference(input = {}) {
  const title = syntheticText(input.title, 'title', 500, true);
  const authorsText = syntheticText(input.authorsText, 'authorsText', 500, false);
  const year = publicationYear(input.publicationYear);
  const citationText = syntheticText(input.citationText, 'citationText', 1200, false);
  const notes = stagingNote(input.notes, 'referencia bibliográfica completamente sintética; no es una publicación real');
  const client = await pool.connect(); let id;
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('JBLR_MVP6_REFERENCE'))`);
    const existing = await client.query(`
      SELECT br.resource_id FROM evidence.bibliographic_reference br JOIN core.resource r ON r.resource_id=br.resource_id AND r.currency_status='current'
      WHERE br.notes LIKE $1 ORDER BY r.created_at, br.resource_id LIMIT 1
    `, [`${MVP6_PREFIX}%`]);
    if (existing.rows[0]) { id = existing.rows[0].resource_id; await client.query('COMMIT'); return { ...(await getBibliographicReference(id)), created:false }; }
    const resource = await client.query(`INSERT INTO core.resource(resource_id, resource_type_code, validation_status) VALUES(uuidv7(),'REF','unreviewed') RETURNING resource_id`);
    id = resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO evidence.bibliographic_reference(resource_id, reference_type, title, authors_text, publication_year, doi, isbn, citation_text, url, external_source_id, notes)
      VALUES($1,'synthetic_demo',$2,$3,$4,NULL,NULL,$5,NULL,NULL,$6)
    `, [id,title,authorsText,year,citationText,notes]);
    await client.query('COMMIT'); return { ...(await getBibliographicReference(id)), created:true };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function createOrReuseAssertion(subjectResourceId, input = {}) {
  const statementText = syntheticText(input.statementText, 'statementText', 1200, true);
  const scopeNote = syntheticText(input.scopeNote, 'scopeNote', 1000, false);
  const notes = stagingNote(input.notes, 'afirmación sintética; no constituye conclusión científica');
  const client = await pool.connect(); let id;
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    const taxon = await getTaxonHeader(subjectResourceId, client); if (!taxon) throw new Error('Taxon concept not found');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`JBLR_MVP6_ASSERTION_${subjectResourceId}`]);
    const existing = await client.query(`
      SELECT a.resource_id FROM evidence.assertion a JOIN core.resource r ON r.resource_id=a.resource_id AND r.currency_status='current'
      WHERE a.subject_resource_id=$1 AND a.notes LIKE $2 ORDER BY r.created_at, a.resource_id LIMIT 1
    `, [subjectResourceId,`${MVP6_PREFIX}%`]);
    if (existing.rows[0]) { id=existing.rows[0].resource_id; await client.query('COMMIT'); return { ...(await getAssertion(id)), created:false }; }
    const resource = await client.query(`INSERT INTO core.resource(resource_id, resource_type_code, validation_status) VALUES(uuidv7(),'ASN','unreviewed') RETURNING resource_id`);
    id=resource.rows[0].resource_id;
    await client.query(`
      INSERT INTO evidence.assertion(resource_id, subject_resource_id, predicate_code, statement_text, asserted_by_agent_id, asserted_at, resolution_status, scope_note, notes)
      VALUES($1,$2,'synthetic_demo',$3,NULL,current_timestamp,'unresolved',$4,$5)
    `,[id,subjectResourceId,statementText,scopeNote,notes]);
    await client.query('COMMIT'); return { ...(await getAssertion(id)), created:true };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function createOrReuseEvidenceLink(assertionId, referenceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`JBLR_MVP6_LINK_${assertionId}_${referenceId}`]);
    const assertion = await client.query(`SELECT resource_id,resolution_status FROM evidence.assertion WHERE resource_id=$1`,[assertionId]);
    if (!assertion.rows[0]) throw new Error('Assertion not found');
    if (assertion.rows[0].resolution_status !== 'unresolved') throw new Error('MVP6 assertion must remain unresolved');
    const reference = await client.query(`SELECT resource_id FROM evidence.bibliographic_reference WHERE resource_id=$1`,[referenceId]);
    if (!reference.rows[0]) throw new Error('BibliographicReference not found');
    const existing = await client.query(`SELECT evidence_link_id FROM evidence.evidence_link WHERE assertion_id=$1 AND evidence_resource_id=$2 AND relation_role='supports' ORDER BY evidence_link_id LIMIT 1`,[assertionId,referenceId]);
    let evidenceLinkId, created=false;
    if (existing.rows[0]) evidenceLinkId=existing.rows[0].evidence_link_id;
    else {
      const result = await client.query(`
        INSERT INTO evidence.evidence_link(evidence_link_id, assertion_id, evidence_resource_id, relation_role, confidence, notes)
        VALUES(uuidv7(),$1,$2,'supports',NULL,$3) RETURNING evidence_link_id
      `,[assertionId,referenceId,`${MVP6_PREFIX}vínculo sintético; supports no equivale a validación científica`]);
      evidenceLinkId=result.rows[0].evidence_link_id; created=true;
    }
    await client.query('COMMIT'); return { evidenceLinkId, created, assertion:await getAssertion(assertionId) };
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

function changed(oldValue,newValue){ const before=oldValue instanceof Date?oldValue.toISOString():oldValue; const after=newValue instanceof Date?newValue.toISOString():newValue; return String(before??'')!==String(after??''); }

async function editBibliographicReference(referenceId,input={}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    const current=await client.query(`SELECT * FROM evidence.bibliographic_reference WHERE resource_id=$1 FOR UPDATE`,[referenceId]);
    if(!current.rows[0]) throw new Error('BibliographicReference not found'); const old=current.rows[0];
    const next={
      title:input.title===undefined?old.title:syntheticText(input.title,'title',500,true),
      authors_text:input.authorsText===undefined?old.authors_text:syntheticText(input.authorsText,'authorsText',500,false),
      publication_year:input.publicationYear===undefined?old.publication_year:publicationYear(input.publicationYear),
      citation_text:input.citationText===undefined?old.citation_text:syntheticText(input.citationText,'citationText',1200,false),
      notes:input.notes===undefined?old.notes:stagingNote(input.notes,'referencia bibliográfica completamente sintética; no es una publicación real')
    };
    const changes=[]; for(const [field,value] of Object.entries(next)) if(changed(old[field],value)) changes.push({field:`evidence.bibliographic_reference.${field}`,oldValue:old[field],newValue:value});
    if(changes.length){
      await client.query(`UPDATE evidence.bibliographic_reference SET title=$2,authors_text=$3,publication_year=$4,citation_text=$5,notes=$6 WHERE resource_id=$1`,[referenceId,next.title,next.authors_text,next.publication_year,next.citation_text,next.notes]);
      await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`,[referenceId]);
      await addRevision(client,referenceId,changes,'MVP6 safe BibliographicReference edit');
    }
    await client.query('COMMIT'); return getBibliographicReference(referenceId);
  } catch(err){ await client.query('ROLLBACK'); throw err; } finally{ client.release(); }
}

async function editAssertion(assertionId,input={}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN'); await assertAuthorizedStaging(client);
    const current=await client.query(`SELECT * FROM evidence.assertion WHERE resource_id=$1 FOR UPDATE`,[assertionId]);
    if(!current.rows[0]) throw new Error('Assertion not found'); const old=current.rows[0];
    if(old.resolution_status!=='unresolved') throw new Error('MVP6 assertion must remain unresolved');
    const next={
      statement_text:input.statementText===undefined?old.statement_text:syntheticText(input.statementText,'statementText',1200,true),
      scope_note:input.scopeNote===undefined?old.scope_note:syntheticText(input.scopeNote,'scopeNote',1000,false),
      notes:input.notes===undefined?old.notes:stagingNote(input.notes,'afirmación sintética; no constituye conclusión científica')
    };
    const changes=[]; for(const [field,value] of Object.entries(next)) if(changed(old[field],value)) changes.push({field:`evidence.assertion.${field}`,oldValue:old[field],newValue:value});
    if(changes.length){
      await client.query(`UPDATE evidence.assertion SET statement_text=$2,scope_note=$3,notes=$4 WHERE resource_id=$1`,[assertionId,next.statement_text,next.scope_note,next.notes]);
      await client.query(`UPDATE core.resource SET updated_at=clock_timestamp(),row_version=row_version+1 WHERE resource_id=$1`,[assertionId]);
      await addRevision(client,assertionId,changes,'MVP6 safe Assertion edit');
    }
    await client.query('COMMIT'); return getAssertion(assertionId);
  } catch(err){ await client.query('ROLLBACK'); throw err; } finally{ client.release(); }
}

module.exports={getTaxonEvidence,getAssertion,getBibliographicReference,createOrReuseBibliographicReference,createOrReuseAssertion,createOrReuseEvidenceLink,editBibliographicReference,editAssertion};
