const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function main(){
  await assertAuthorizedStaging();
  const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM field.individual) AS individual,(SELECT count(*)::int FROM field.collection_individual) AS collection_individual,(SELECT count(*)::int FROM material.sample_origin) AS sample_origin,(SELECT count(*)::int FROM governance.record_revision) AS record_revision`)).rows[0];
  if(counts.individual!==1||counts.collection_individual!==1||counts.sample_origin!==1)throw new Error(`Unexpected MVP8 cardinalities: ${JSON.stringify(counts)}`);
  const {rows}=await pool.query(`
    SELECT i.resource_id AS individual_id,ir.jblr_code AS individual_code,ir.resource_type_code,ir.validation_status,
      i.population_id,i.individual_label,i.first_seen_at,i.last_seen_at,i.notes,
      p.population_label,pr.jblr_code AS population_code,
      ci.collection_individual_id,ci.collection_event_id,ci.role_code,ci.sequence_no,ci.notes AS collection_individual_notes,
      cer.jblr_code AS collection_event_code,
      s.resource_id AS sample_id,sr.jblr_code AS sample_code,
      so.sample_origin_id,so.collection_event_id AS origin_collection_event_id,so.individual_id AS origin_individual_id,so.origin_role,
      fv.resource_id AS field_visit_id,fvr.jblr_code AS field_visit_code,fv.started_at AS field_visit_started_at,
      (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=i.resource_id) AS individual_revisions,
      (SELECT count(*)::int FROM field.observation o WHERE o.individual_id IS NOT NULL) AS observations_with_individual
    FROM field.individual i
    JOIN core.resource ir ON ir.resource_id=i.resource_id
    JOIN field.population p ON p.resource_id=i.population_id JOIN core.resource pr ON pr.resource_id=p.resource_id
    JOIN field.collection_individual ci ON ci.individual_id=i.resource_id
    JOIN field.collection_event ce ON ce.resource_id=ci.collection_event_id JOIN core.resource cer ON cer.resource_id=ce.resource_id
    JOIN material.sample_origin so ON so.collection_event_id=ce.resource_id AND so.individual_id=i.resource_id
    JOIN material.sample s ON s.resource_id=so.sample_id JOIN core.resource sr ON sr.resource_id=s.resource_id
    JOIN field.field_visit fv ON fv.resource_id=ce.field_visit_id JOIN core.resource fvr ON fvr.resource_id=fv.resource_id
  `);
  if(rows.length!==1)throw new Error(`Expected one MVP8 trace chain, got ${rows.length}`);
  const r=rows[0];
  const checks=[
    r.resource_type_code==='IND',r.validation_status==='unreviewed',r.population_code==='JBLR-POP-00000013',
    r.individual_label==='JBLR STAGING · Madre demo MVP8 · editada',/^STAGING DEMO · MVP_PRODUCTIVO_8 · NO VALIDADO · /.test(r.notes||''),
    r.last_seen_at===null,r.field_visit_code==='JBLR-VIS-00000016',
    (r.first_seen_at===null&&r.field_visit_started_at===null)||(r.first_seen_at&&r.field_visit_started_at&&new Date(r.first_seen_at).toISOString()===new Date(r.field_visit_started_at).toISOString()),
    r.collection_event_code==='JBLR-COL-00000017',r.collection_event_id===r.origin_collection_event_id,
    r.role_code==='mother_plant',Number(r.sequence_no)===1,/^STAGING DEMO · MVP_PRODUCTIVO_8 · NO VALIDADO · /.test(r.collection_individual_notes||''),
    r.sample_code==='JBLR-SMP-00000018',r.origin_individual_id===r.individual_id,r.origin_collection_event_id!==null,
    r.individual_revisions===1,r.observations_with_individual===0,counts.record_revision===14
  ];
  if(checks.some(v=>!v))throw new Error(`MVP8 canonical traceability failed: ${JSON.stringify(r)}`);
  console.log(JSON.stringify({
    OPEN_POPULATION_INDIVIDUALS:'PASS',CREATE_INDIVIDUAL:'PASS',LINK_INDIVIDUAL_POPULATION:'PASS',OPEN_INDIVIDUAL_DETAIL:'PASS',EDIT_INDIVIDUAL:'PASS',
    OPEN_COLLECTION_INDIVIDUALS:'PASS',LINK_COLLECTION_INDIVIDUAL:'PASS',SHOW_COLLECTION_INDIVIDUAL_ROLE:'PASS',LINK_SAMPLE_ORIGIN_INDIVIDUAL:'PASS',
    TRACE_SAMPLE_TO_INDIVIDUAL:'PASS',TRACE_SAMPLE_TO_COLLECTION_EVENT:'PASS',TRACE_INDIVIDUAL_TO_POPULATION:'PASS',PERSIST_INDIVIDUAL_TRACEABILITY_TO_NEON:'PASS',
    individualId:r.individual_id,individualCode:r.individual_code,populationId:r.population_id,populationCode:r.population_code,
    collectionIndividualId:r.collection_individual_id,collectionEventId:r.collection_event_id,collectionEventCode:r.collection_event_code,
    sampleOriginId:r.sample_origin_id,sampleId:r.sample_id,sampleCode:r.sample_code,roleCode:r.role_code,sequenceNo:r.sequence_no,
    sampleOriginCollectionEventId:r.origin_collection_event_id,sampleOriginIndividualId:r.origin_individual_id,
    firstSeenAt:r.first_seen_at,lastSeenAt:r.last_seen_at,revisions:{individual:r.individual_revisions,totalRecordRevision:counts.record_revision},cardinalities:counts
  }));
}
main().catch(err=>{console.error(err.message);process.exitCode=1;}).finally(()=>pool.end());
