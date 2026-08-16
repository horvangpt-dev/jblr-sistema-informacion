const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function main() {
  await assertAuthorizedStaging();
  const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM evidence.bibliographic_reference) AS bibliographic_reference,(SELECT count(*)::int FROM evidence.assertion) AS assertion,(SELECT count(*)::int FROM evidence.evidence_link) AS evidence_link,(SELECT count(*)::int FROM evidence.provenance_link) AS provenance_link`)).rows[0];
  if(counts.bibliographic_reference!==1||counts.assertion!==1||counts.evidence_link!==1||counts.provenance_link!==0) throw new Error(`Unexpected MVP6 cardinalities: ${JSON.stringify(counts)}`);
  const taxon=(await pool.query(`
    SELECT tc.resource_id AS concept_id,cr.jblr_code AS concept_code,tn.scientific_name
    FROM taxonomy.name_usage nu JOIN taxonomy.taxon_concept tc ON tc.resource_id=nu.taxon_concept_id JOIN core.resource cr ON cr.resource_id=tc.resource_id JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
    WHERE tn.scientific_name='Plantago major L.' ORDER BY CASE nu.usage_role WHEN 'accepted' THEN 0 WHEN 'unresolved' THEN 1 ELSE 2 END,tc.resource_id LIMIT 1
  `)).rows[0];
  if(!taxon) throw new Error('Plantago major L. TaxonConcept not found');
  const {rows}=await pool.query(`
    SELECT a.resource_id AS assertion_id,ar.jblr_code AS assertion_code,ar.resource_type_code AS assertion_resource_type,ar.validation_status AS assertion_validation,
      a.subject_resource_id,a.predicate_code,a.statement_text,a.asserted_by_agent_id,a.resolution_status,a.scope_note,a.notes AS assertion_notes,
      br.resource_id AS reference_id,rr.jblr_code AS reference_code,rr.resource_type_code AS reference_resource_type,rr.validation_status AS reference_validation,
      br.reference_type,br.title,br.authors_text,br.publication_year,br.doi,br.isbn,br.citation_text,br.url,br.external_source_id,br.notes AS reference_notes,
      el.evidence_link_id,el.assertion_id AS link_assertion_id,el.evidence_resource_id,el.relation_role,el.confidence,el.notes AS evidence_link_notes,
      (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=a.resource_id) AS assertion_revisions,
      (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=br.resource_id) AS reference_revisions
    FROM evidence.assertion a JOIN core.resource ar ON ar.resource_id=a.resource_id JOIN evidence.evidence_link el ON el.assertion_id=a.resource_id
    JOIN evidence.bibliographic_reference br ON br.resource_id=el.evidence_resource_id JOIN core.resource rr ON rr.resource_id=br.resource_id
  `);
  if(rows.length!==1) throw new Error(`Expected one MVP6 evidence chain, got ${rows.length}`);
  const r=rows[0];
  const checks=[
    r.assertion_resource_type==='ASN',r.reference_resource_type==='REF',r.assertion_validation==='unreviewed',r.reference_validation==='unreviewed',r.assertion_id!==r.reference_id,
    r.subject_resource_id===taxon.concept_id,r.predicate_code==='synthetic_demo',r.statement_text==='JBLR STAGING · afirmación sintética MVP6 · editada · no constituye conclusión científica',
    r.asserted_by_agent_id===null,r.resolution_status==='unresolved',/^JBLR STAGING ·/.test(r.scope_note||''),/^STAGING DEMO · MVP_PRODUCTIVO_6 · NO VALIDADO · /.test(r.assertion_notes||''),
    r.reference_type==='synthetic_demo',r.title==='JBLR STAGING · Referencia bibliográfica demo MVP6 · editada',/^JBLR STAGING ·/.test(r.authors_text||''),r.publication_year===2026,
    r.doi===null,r.isbn===null,/^JBLR STAGING ·/.test(r.citation_text||''),r.url===null,r.external_source_id===null,/^STAGING DEMO · MVP_PRODUCTIVO_6 · NO VALIDADO · /.test(r.reference_notes||''),
    r.link_assertion_id===r.assertion_id,r.evidence_resource_id===r.reference_id,r.relation_role==='supports',r.confidence===null,/^STAGING DEMO · MVP_PRODUCTIVO_6 · NO VALIDADO · /.test(r.evidence_link_notes||''),
    r.assertion_revisions===1,r.reference_revisions===1
  ];
  if(checks.some(v=>!v)) throw new Error(`MVP6 canonical evidence state failed: ${JSON.stringify({taxon,row:r})}`);
  console.log(JSON.stringify({OPEN_TAXON_EVIDENCE:'PASS',CREATE_BIBLIOGRAPHIC_REFERENCE:'PASS',OPEN_BIBLIOGRAPHIC_REFERENCE:'PASS',CREATE_ASSERTION:'PASS',OPEN_ASSERTION:'PASS',LINK_ASSERTION_EVIDENCE:'PASS',SHOW_ASSERTION_EVIDENCE:'PASS',EDIT_BIBLIOGRAPHIC_REFERENCE:'PASS',EDIT_ASSERTION:'PASS',PERSIST_EVIDENCE_TO_NEON:'PASS',ASSERTION_REMAINS_UNRESOLVED:'PASS',REFERENCE_DOES_NOT_EQUAL_ASSERTION:'PASS',taxonConceptId:taxon.concept_id,taxonConceptCode:taxon.concept_code,scientificName:taxon.scientific_name,bibliographicReferenceId:r.reference_id,bibliographicReferenceCode:r.reference_code,assertionId:r.assertion_id,assertionCode:r.assertion_code,evidenceLinkId:r.evidence_link_id,relationRole:r.relation_role,confidence:r.confidence,resolutionStatus:r.resolution_status,revisions:{reference:r.reference_revisions,assertion:r.assertion_revisions},cardinalities:counts}));
}
main().catch(err=>{console.error(err.message);process.exitCode=1;}).finally(()=>pool.end());
