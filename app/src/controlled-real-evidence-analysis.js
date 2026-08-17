const { PROBE_MARKER, newResource, hashPayload } = require('./controlled-real-common');

async function createEvidenceAnalysis(client,p,manifest) {
  const taxonId=manifest.entities.taxonConcept;

  const areaId=await newResource(client,'GAR',manifest,'geographicArea');
  await client.query(`INSERT INTO core.geographic_area(resource_id,area_kind,name,notes) VALUES($1,'integration_probe',$2,$3)`,[areaId,`03.1 probe area ${p.token}`,`${PROBE_MARKER} · technical area`]);
  const regionalId=await newResource(client,'RTA',manifest,'regionalTaxonAssertion');
  await client.query(`INSERT INTO taxonomy.regional_taxon_assertion(resource_id,taxon_concept_id,geographic_area_id,presence_value_status,origin_value_status,establishment_value_status,context_value_status,temporality_value_status,catalog_inclusion_value_status,notes) VALUES($1,$2,$3,'unknown','not_recorded','not_recorded','not_recorded','not_recorded','not_recorded',$4)`,[regionalId,taxonId,areaId,`${PROBE_MARKER} · unknown is intentional`]);

  const referenceId=await newResource(client,'REF',manifest,'bibliographicReference');
  await client.query(`INSERT INTO evidence.bibliographic_reference(resource_id,reference_type,title,notes) VALUES($1,'integration_probe',$2,$3)`,[referenceId,p.bibliographyTitle,`${PROBE_MARKER} · technical reference, not scientific bibliography`]);
  const assertionId=await newResource(client,'ASN',manifest,'assertion');
  await client.query(`INSERT INTO evidence.assertion(resource_id,subject_resource_id,predicate_code,statement_text,asserted_at,resolution_status,notes) VALUES($1,$2,'integration_probe',$3,$4,'unresolved',$5)`,[assertionId,taxonId,p.assertionText,p.at,`${PROBE_MARKER} · technical assertion`]);
  manifest.relations.evidenceLink=(await client.query(`INSERT INTO evidence.evidence_link(evidence_link_id,assertion_id,evidence_resource_id,relation_role,notes) VALUES(uuidv7(),$1,$2,'supports',$3) RETURNING evidence_link_id`,[assertionId,referenceId,`${PROBE_MARKER} · technical evidence link`])).rows[0].evidence_link_id;

  const externalSourceId=(await client.query(`INSERT INTO evidence.external_source(external_source_id,source_code,source_name,source_type,is_active,notes) VALUES(uuidv7(),$1,$2,'integration_probe',true,$3) RETURNING external_source_id`,[p.externalSourceCode,p.externalSourceName,`${PROBE_MARKER} · technical external source`])).rows[0].external_source_id;
  manifest.nonResourceRows.externalSource=externalSourceId;

  const externalRecordId=await newResource(client,'EXT',manifest,'externalRecord');
  await client.query(`INSERT INTO evidence.external_record(resource_id,external_source_id,external_id,record_type,notes) VALUES($1,$2,$3,'integration_probe',$4)`,[externalRecordId,externalSourceId,p.externalId,`${PROBE_MARKER} · technical external record`]);
  const rawPayload={probe:p.token,marker:PROBE_MARKER,externalId:p.externalId}; const payloadHash=hashPayload(rawPayload);
  const snapshotId=await newResource(client,'EXS',manifest,'externalRecordSnapshot');
  await client.query(`INSERT INTO evidence.external_record_snapshot(resource_id,external_record_id,retrieved_at,payload_hash,raw_payload,normalized_payload,schema_version,capture_status,notes) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,'03.1-probe','captured',$7)`,[snapshotId,externalRecordId,p.at,payloadHash,JSON.stringify(rawPayload),JSON.stringify({probe:p.token}),`${PROBE_MARKER} · technical snapshot`]);
  manifest.relations.provenanceLink=(await client.query(`INSERT INTO evidence.provenance_link(provenance_link_id,subject_resource_id,source_resource_id,external_source_id,generation_mode,relation_role,notes) VALUES(uuidv7(),$1,$2,$3,'manual','source',$4) RETURNING provenance_link_id`,[taxonId,snapshotId,externalSourceId,`${PROBE_MARKER} · snapshot provenance`])).rows[0].provenance_link_id;

  const externalTaxonReferenceId=await newResource(client,'ETR',manifest,'externalTaxonReference');
  await client.query(`INSERT INTO taxonomy.external_taxon_reference(resource_id,taxon_concept_id,external_source_id,external_id,notes) VALUES($1,$2,$3,$4,$5)`,[externalTaxonReferenceId,taxonId,externalSourceId,p.externalId,`${PROBE_MARKER} · traceable external reference; no validation`]);

  const metricId=(await client.query(`INSERT INTO analytics.metric_definition(metric_definition_id,metric_code,label,value_type,description,is_active) VALUES(uuidv7(),$1,$2,'numeric',$3,true) RETURNING metric_definition_id`,[p.analysisMetricCode,`03.1 probe metric ${p.token}`,`${PROBE_MARKER} · technical metric without scientific meaning`])).rows[0].metric_definition_id;
  manifest.nonResourceRows.metricDefinition=metricId;
  await client.query(`INSERT INTO analytics.metric_target_resource_type(metric_definition_id,resource_type_code) VALUES($1,'TXC')`,[metricId]); manifest.relations.metricTarget=`${metricId}:TXC`;

  const activityId=await newResource(client,'ACT',manifest,'dataActivity');
  await client.query(`INSERT INTO governance.data_activity(resource_id,activity_type,started_at,ended_at,software_name,software_version,parameters,process_outcome,notes) VALUES($1,'integration_probe',$2,$2,'JBLR','03.1-A',$3::jsonb,'completed',$4)`,[activityId,p.at,JSON.stringify({probe:p.token}),`${PROBE_MARKER} · technical activity`]);
  const analysisRunId=await newResource(client,'ANR',manifest,'analysisRun');
  await client.query(`INSERT INTO analytics.analysis_run(resource_id,data_activity_id,module_code,method_version,parameters,run_status,closed_at,notes) VALUES($1,$2,'controlled_real_probe','03.1-A',$3::jsonb,'closed',$4,$5)`,[analysisRunId,activityId,JSON.stringify({probe:p.token}),p.at,`${PROBE_MARKER} · technical analysis run`]);
  manifest.relations.analysisInput=(await client.query(`INSERT INTO analytics.analysis_input(analysis_input_id,analysis_run_id,input_resource_id,input_role,input_hash,ordinal) VALUES(uuidv7(),$1,$2,'source_snapshot',$3,1) RETURNING analysis_input_id`,[analysisRunId,snapshotId,payloadHash])).rows[0].analysis_input_id;
  const resultId=await newResource(client,'RSL',manifest,'analysisResult');
  await client.query(`INSERT INTO analytics.analysis_result(resource_id,analysis_run_id,metric_definition_id,subject_resource_id,value_status,numeric_value,computed_at,notes) VALUES($1,$2,$3,$4,'present',$5,$6,$7)`,[resultId,analysisRunId,metricId,taxonId,p.analysisValue===null?1:p.analysisValue,p.at,`${PROBE_MARKER} · technical result without scientific meaning`]);
}

module.exports={createEvidenceAnalysis};
