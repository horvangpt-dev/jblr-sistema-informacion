const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const { PROBE_MARKER, assertControlledRealEnabled } = require('./controlled-real-common');

async function verifyProbe(clientOrManifest,maybeManifest) {
  const client=maybeManifest?clientOrManifest:pool; const manifest=maybeManifest||clientOrManifest; await assertAuthorizedStaging(client);
  const e=manifest.entities,r=manifest.relations;
  const q=(await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM taxonomy.identification i WHERE i.resource_id=$1 AND i.target_resource_id=$2 AND i.taxon_concept_id=$3 AND i.resolution_status='unresolved') AS taxon_population,
      EXISTS(SELECT 1 FROM field.population_location pl WHERE pl.population_location_id=$4 AND pl.population_id=$2 AND pl.location_id=$5) AS population_location,
      EXISTS(SELECT 1 FROM field.location_geometry_version lgv WHERE lgv.resource_id=$6 AND lgv.location_id=$5 AND ST_X(lgv.geom)=$34 AND ST_Y(lgv.geom)=$35) AS geometry,
      EXISTS(SELECT 1 FROM field.field_visit fv WHERE fv.resource_id=$7 AND fv.prospection_id=$8 AND fv.location_id=$5) AS prospection_visit,
      EXISTS(SELECT 1 FROM field.observation o WHERE o.resource_id=$9 AND o.field_visit_id=$7 AND o.population_id=$2) AS observation,
      EXISTS(SELECT 1 FROM field.census c WHERE c.resource_id=$10 AND c.field_visit_id=$7 AND c.population_id=$2) AS census,
      EXISTS(SELECT 1 FROM field.collection_individual ci WHERE ci.collection_individual_id=$11 AND ci.collection_event_id=$12 AND ci.individual_id=$13) AS individual_collection,
      EXISTS(SELECT 1 FROM material.sample_origin so WHERE so.sample_origin_id=$14 AND so.sample_id=$15 AND so.collection_event_id=$12) AS collection_sample,
      EXISTS(SELECT 1 FROM material.process_input pi WHERE pi.process_input_id=$16 AND pi.processing_event_id=$17 AND pi.sample_id=$15) AS process_input,
      EXISTS(SELECT 1 FROM material.process_output po WHERE po.process_output_id=$18 AND po.processing_event_id=$17 AND po.sample_id=$19 AND po.sample_id<>$15) AS process_output,
      EXISTS(SELECT 1 FROM material.accession_material am WHERE am.accession_material_id=$20 AND am.accession_id=$21 AND am.sample_id=$19) AS accession_output,
      EXISTS(SELECT 1 FROM taxonomy.regional_taxon_assertion rta WHERE rta.resource_id=$22 AND rta.taxon_concept_id=$3) AS regional,
      EXISTS(SELECT 1 FROM evidence.evidence_link el WHERE el.evidence_link_id=$23 AND el.assertion_id=$24 AND el.evidence_resource_id=$25) AS evidence,
      EXISTS(SELECT 1 FROM evidence.provenance_link pl WHERE pl.provenance_link_id=$26 AND pl.subject_resource_id=$3 AND pl.source_resource_id=$27) AS provenance,
      EXISTS(SELECT 1 FROM taxonomy.external_taxon_reference etr WHERE etr.resource_id=$28 AND etr.taxon_concept_id=$3 AND etr.external_source_id=$29) AS external_reference,
      EXISTS(SELECT 1 FROM analytics.analysis_input ai WHERE ai.analysis_input_id=$30 AND ai.analysis_run_id=$31 AND ai.input_resource_id=$27) AS analysis_input,
      EXISTS(SELECT 1 FROM analytics.analysis_result ar WHERE ar.resource_id=$32 AND ar.analysis_run_id=$31 AND ar.subject_resource_id=$3) AS analysis_result,
      NOT EXISTS(SELECT 1 FROM core.resource cr WHERE cr.resource_id=ANY($33::uuid[]) AND cr.validation_status<>'unreviewed') AS no_auto_validation
  `,[e.identification,e.population,e.taxonConcept,r.populationLocation,e.location,e.locationGeometryVersion,e.fieldVisit,e.prospection,e.observation,e.census,r.collectionIndividual,e.collectionEvent,e.individual,r.sampleOrigin,e.sourceSample,r.processInput,e.processingEvent,r.processOutput,e.outputSample,r.accessionMaterial,e.accession,e.regionalTaxonAssertion,r.evidenceLink,e.assertion,e.bibliographicReference,r.provenanceLink,e.externalRecordSnapshot,e.externalTaxonReference,manifest.nonResourceRows.externalSource,r.analysisInput,e.analysisRun,e.analysisResult,manifest.coreResources,manifest.probeLongitude,manifest.probeLatitude])).rows[0];
  return {
    TAXON_TO_POPULATION_TO_LOCATION:q.taxon_population&&q.population_location, LOCATION_TO_GEOMETRY_VERSION:q.geometry,
    PROSPECTION_TO_FIELD_VISIT:q.prospection_visit, OBSERVATION_CENSUS_TRACEABLE:q.observation&&q.census,
    INDIVIDUAL_TO_COLLECTION:q.individual_collection, COLLECTION_TO_SAMPLE:q.collection_sample,
    INPUT_SAMPLE_CREATED:!!e.sourceSample, PROCESSING_EVENT_CREATED:!!e.processingEvent, OUTPUT_SAMPLE_CREATED:!!e.outputSample,
    OUTPUT_SAMPLE_NOT_INPUT_SAMPLE:e.outputSample!==e.sourceSample, OUTPUT_SAMPLE_LINKED_AS_PROCESS_OUTPUT:q.process_output,
    CREATE_ACCESSION_FROM_OUTPUT_SAMPLE:q.accession_output, ACCESSION_MATERIAL_POINTS_TO_OUTPUT_SAMPLE:q.accession_output,
    ACCESSION_NOT_FORCED_TO_SOURCE_SAMPLE:q.accession_output&&e.outputSample!==e.sourceSample,
    BIBLIOGRAPHY_ASSERTION_EVIDENCE:q.evidence, EXTERNAL_RECORD_SNAPSHOT_PROVENANCE:q.provenance,
    EXTERNAL_TAXON_REFERENCE_TRACEABLE:q.external_reference, ANALYSIS_INPUT_RUN_RESULT_TRACEABLE:q.analysis_input&&q.analysis_result,
    NO_AUTOMATIC_TAXONOMIC_VALIDATION:q.no_auto_validation,
  };
}

async function reverseDisposableProbe(manifest) {
  assertControlledRealEnabled();
  if(!manifest||manifest.version!=='03.1-A'||manifest.marker!==PROBE_MARKER) throw new Error('Invalid 03.1-A reversal manifest');
  const client=await pool.connect();
  try{
    await client.query('BEGIN'); await assertAuthorizedStaging(client); const e=manifest.entities,nr=manifest.nonResourceRows,r=manifest.relations;
    await client.query('DELETE FROM analytics.analysis_input WHERE analysis_input_id=$1',[r.analysisInput]);
    await client.query('DELETE FROM analytics.analysis_result WHERE resource_id=$1',[e.analysisResult]); await client.query('DELETE FROM analytics.analysis_run WHERE resource_id=$1',[e.analysisRun]);
    await client.query('DELETE FROM governance.data_activity WHERE resource_id=$1',[e.dataActivity]); await client.query('DELETE FROM analytics.metric_target_resource_type WHERE metric_definition_id=$1',[nr.metricDefinition]); await client.query('DELETE FROM analytics.metric_definition WHERE metric_definition_id=$1',[nr.metricDefinition]);
    await client.query('DELETE FROM taxonomy.external_taxon_reference WHERE resource_id=$1',[e.externalTaxonReference]); await client.query('DELETE FROM evidence.provenance_link WHERE provenance_link_id=$1',[r.provenanceLink]);
    await client.query('DELETE FROM evidence.external_record_snapshot WHERE resource_id=$1',[e.externalRecordSnapshot]); await client.query('DELETE FROM evidence.external_record WHERE resource_id=$1',[e.externalRecord]); await client.query('DELETE FROM evidence.external_source WHERE external_source_id=$1',[nr.externalSource]);
    await client.query('DELETE FROM evidence.evidence_link WHERE evidence_link_id=$1',[r.evidenceLink]); await client.query('DELETE FROM evidence.assertion WHERE resource_id=$1',[e.assertion]); await client.query('DELETE FROM evidence.bibliographic_reference WHERE resource_id=$1',[e.bibliographicReference]);
    await client.query('DELETE FROM taxonomy.regional_taxon_assertion WHERE resource_id=$1',[e.regionalTaxonAssertion]); await client.query('DELETE FROM core.geographic_area WHERE resource_id=$1',[e.geographicArea]);
    await client.query('DELETE FROM material.accession_material WHERE accession_material_id=$1',[r.accessionMaterial]); await client.query('DELETE FROM material.accession WHERE resource_id=$1',[e.accession]);
    await client.query('DELETE FROM material.process_output WHERE process_output_id=$1',[r.processOutput]); await client.query('DELETE FROM material.process_input WHERE process_input_id=$1',[r.processInput]); await client.query('DELETE FROM material.processing_event WHERE resource_id=$1',[e.processingEvent]);
    await client.query('DELETE FROM material.sample WHERE resource_id=$1',[e.outputSample]); await client.query('DELETE FROM material.sample_origin WHERE sample_origin_id=$1',[r.sampleOrigin]); await client.query('DELETE FROM material.sample WHERE resource_id=$1',[e.sourceSample]);
    await client.query('DELETE FROM field.collection_individual WHERE collection_individual_id=$1',[r.collectionIndividual]); await client.query('DELETE FROM field.collection_event WHERE resource_id=$1',[e.collectionEvent]); await client.query('DELETE FROM field.individual WHERE resource_id=$1',[e.individual]);
    await client.query('DELETE FROM field.census WHERE resource_id=$1',[e.census]); await client.query('DELETE FROM field.observation WHERE resource_id=$1',[e.observation]); await client.query('DELETE FROM field.field_visit_population WHERE field_visit_id=$1 AND population_id=$2',[e.fieldVisit,e.population]);
    await client.query('DELETE FROM field.field_visit WHERE resource_id=$1',[e.fieldVisit]); await client.query('DELETE FROM field.prospection WHERE resource_id=$1',[e.prospection]); await client.query('DELETE FROM taxonomy.identification WHERE resource_id=$1',[e.identification]);
    await client.query('DELETE FROM field.population_location WHERE population_location_id=$1',[r.populationLocation]); await client.query('DELETE FROM field.population WHERE resource_id=$1',[e.population]); await client.query('DELETE FROM field.location_geometry_version WHERE resource_id=$1',[e.locationGeometryVersion]); await client.query('DELETE FROM field.location WHERE resource_id=$1',[e.location]); await client.query('DELETE FROM taxonomy.taxon_concept WHERE resource_id=$1',[e.taxonConcept]);
    const before=(await client.query('SELECT count(*)::int AS n FROM core.resource WHERE resource_id=ANY($1::uuid[])',[manifest.coreResources])).rows[0].n; if(before!==manifest.coreResources.length) throw new Error('Reversal manifest/core resource mismatch before core cleanup');
    await client.query('DELETE FROM core.resource WHERE resource_id=ANY($1::uuid[])',[manifest.coreResources]); await client.query('DELETE FROM core.jblr_code_registry WHERE first_resource_id=ANY($1::uuid[])',[manifest.coreResources]);
    const remaining=(await client.query('SELECT count(*)::int AS n FROM core.resource WHERE resource_id=ANY($1::uuid[])',[manifest.coreResources])).rows[0].n; if(remaining!==0) throw new Error(`Probe resources remaining after reversal: ${remaining}`);
    await client.query('COMMIT'); return {remaining};
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}

module.exports={verifyProbe,reverseDisposableProbe};
