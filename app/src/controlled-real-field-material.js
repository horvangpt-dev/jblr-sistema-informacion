const { PROBE_MARKER, newResource } = require('./controlled-real-common');

async function createFieldMaterial(client,p,manifest) {
  const taxonId=await newResource(client,'TXC',manifest,'taxonConcept');
  await client.query(`INSERT INTO taxonomy.taxon_concept(resource_id,concept_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[taxonId,p.taxonLabel,`${PROBE_MARKER} · technical probe only`]);

  const locationId=await newResource(client,'LOC',manifest,'location');
  await client.query(`INSERT INTO field.location(resource_id,location_name,verbatim_locality,location_kind,resolution_status,notes) VALUES($1,$2,$3,'integration_probe','unresolved',$4)`,[locationId,p.locationName,p.verbatimLocality,`${PROBE_MARKER} · technical location`]);

  const geoId=await newResource(client,'LGE',manifest,'locationGeometryVersion');
  await client.query(`
    INSERT INTO field.location_geometry_version(
      resource_id,location_id,version_no,geom,geometry_role,source_srid,verbatim_coordinates,source_geometry_text,
      uncertainty_m,georeference_method,source_resource_id,is_preferred,notes
    ) VALUES($1,$2,1,ST_SetSRID(ST_MakePoint($3,$4),4326),'exact',4326,$5,$6,$7,$8,NULL,true,$9)
  `,[geoId,locationId,p.longitude,p.latitude,`${p.latitude}, ${p.longitude}`,`POINT(${p.longitude} ${p.latitude})`,p.uncertaintyM,'03.1 controlled-real supplied coordinates',`${PROBE_MARKER} · supplied coordinates`]);

  const populationId=await newResource(client,'POP',manifest,'population');
  await client.query(`INSERT INTO field.population(resource_id,population_label,resolution_status,notes) VALUES($1,$2,'unresolved',$3)`,[populationId,p.populationLabel,`${PROBE_MARKER} · technical population`]);
  manifest.relations.populationLocation=(await client.query(`INSERT INTO field.population_location(population_location_id,population_id,location_id,relation_role,notes) VALUES(uuidv7(),$1,$2,'primary',$3) RETURNING population_location_id`,[populationId,locationId,`${PROBE_MARKER} · population-location`])).rows[0].population_location_id;

  const identificationId=await newResource(client,'IDN',manifest,'identification');
  await client.query(`INSERT INTO taxonomy.identification(resource_id,target_resource_id,taxon_concept_id,resolution_status,is_preferred,notes) VALUES($1,$2,$3,'unresolved',true,$4)`,[identificationId,populationId,taxonId,`${PROBE_MARKER} · association only; not validation`]);

  const prospectionId=await newResource(client,'PRS',manifest,'prospection');
  await client.query(`INSERT INTO field.prospection(resource_id,started_at,ended_at,purpose,notes) VALUES($1,$2,$2,$3,$4)`,[prospectionId,p.at,p.prospectionPurpose,`${PROBE_MARKER} · technical prospection`]);

  const visitId=await newResource(client,'VIS',manifest,'fieldVisit');
  await client.query(`INSERT INTO field.field_visit(resource_id,prospection_id,sequence_no,location_id,started_at,ended_at,visit_purpose,notes) VALUES($1,$2,1,$3,$4,$4,$5,$6)`,[visitId,prospectionId,locationId,p.at,p.visitPurpose,`${PROBE_MARKER} · technical visit`]);
  await client.query(`INSERT INTO field.field_visit_population(field_visit_id,population_id,visit_role) VALUES($1,$2,'observed_population')`,[visitId,populationId]);
  manifest.relations.fieldVisitPopulation=`${visitId}:${populationId}`;

  const observationId=await newResource(client,'OBS',manifest,'observation');
  await client.query(`INSERT INTO field.observation(resource_id,field_visit_id,observed_at,population_id,location_id,resolution_status,verbatim_observation,notes) VALUES($1,$2,$3,$4,$5,'unresolved',$6,$7)`,[observationId,visitId,p.at,populationId,locationId,p.observationText,`${PROBE_MARKER} · technical observation`]);

  const censusId=await newResource(client,'CEN',manifest,'census');
  await client.query(`INSERT INTO field.census(resource_id,field_visit_id,population_id,census_at,method_text,notes) VALUES($1,$2,$3,$4,$5,$6)`,[censusId,visitId,populationId,p.at,p.censusMethod,`${PROBE_MARKER} · technical census`]);

  const individualId=await newResource(client,'IND',manifest,'individual');
  await client.query(`INSERT INTO field.individual(resource_id,population_id,individual_label,first_seen_at,last_seen_at,notes) VALUES($1,$2,$3,$4,$4,$5)`,[individualId,populationId,p.individualLabel,p.at,`${PROBE_MARKER} · technical individual`]);

  const collectionId=await newResource(client,'COL',manifest,'collectionEvent');
  await client.query(`INSERT INTO field.collection_event(resource_id,field_visit_id,population_id,collection_at,method_text,permit_reference,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,[collectionId,visitId,populationId,p.at,p.collectionMethod,p.permitReference,`${PROBE_MARKER} · technical collection`]);
  manifest.relations.collectionIndividual=(await client.query(`INSERT INTO field.collection_individual(collection_individual_id,collection_event_id,individual_id,role_code,sequence_no,notes) VALUES(uuidv7(),$1,$2,'mother_plant',1,$3) RETURNING collection_individual_id`,[collectionId,individualId,`${PROBE_MARKER} · collection-individual`])).rows[0].collection_individual_id;

  const sourceSampleId=await newResource(client,'SMP',manifest,'sourceSample');
  await client.query(`INSERT INTO material.sample(resource_id,sample_kind,material_state,notes) VALUES($1,$2,$3,$4)`,[sourceSampleId,p.sampleKind,p.sourceMaterialState,`${PROBE_MARKER} · source sample`]);
  manifest.relations.sampleOrigin=(await client.query(`INSERT INTO material.sample_origin(sample_origin_id,sample_id,collection_event_id,individual_id,origin_role,notes) VALUES(uuidv7(),$1,$2,$3,'source_collection',$4) RETURNING sample_origin_id`,[sourceSampleId,collectionId,individualId,`${PROBE_MARKER} · sample origin`])).rows[0].sample_origin_id;

  const processingId=await newResource(client,'PRC',manifest,'processingEvent');
  await client.query(`INSERT INTO material.processing_event(resource_id,process_type,started_at,ended_at,notes) VALUES($1,$2,$3,$3,$4)`,[processingId,p.processType,p.at,`${PROBE_MARKER} · supplied processing values`]);
  manifest.relations.processInput=(await client.query(`INSERT INTO material.process_input(process_input_id,processing_event_id,sample_id,ordinal) VALUES(uuidv7(),$1,$2,1) RETURNING process_input_id`,[processingId,sourceSampleId])).rows[0].process_input_id;

  const outputSampleId=await newResource(client,'SMP',manifest,'outputSample');
  await client.query(`INSERT INTO material.sample(resource_id,sample_kind,material_state,notes) VALUES($1,$2,$3,$4)`,[outputSampleId,p.outputSampleKind,p.outputMaterialState,`${PROBE_MARKER} · output sample with supplied values`]);
  manifest.relations.processOutput=(await client.query(`INSERT INTO material.process_output(process_output_id,processing_event_id,sample_id,ordinal) VALUES(uuidv7(),$1,$2,1) RETURNING process_output_id`,[processingId,outputSampleId])).rows[0].process_output_id;

  const accessionId=await newResource(client,'ACC',manifest,'accession');
  await client.query(`INSERT INTO material.accession(resource_id,accession_date,accession_status,notes) VALUES($1,$2::date,$3,$4)`,[accessionId,p.at.slice(0,10),p.accessionStatus,`${PROBE_MARKER} · accession from processed output sample`]);
  manifest.relations.accessionMaterial=(await client.query(`INSERT INTO material.accession_material(accession_material_id,accession_id,sample_id,material_role,notes) VALUES(uuidv7(),$1,$2,'processed_output',$3) RETURNING accession_material_id`,[accessionId,outputSampleId,`${PROBE_MARKER} · accession material points to output sample`])).rows[0].accession_material_id;
}

module.exports={createFieldMaterial};
