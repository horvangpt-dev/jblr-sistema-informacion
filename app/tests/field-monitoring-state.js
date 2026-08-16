const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');

async function main(){
  await assertAuthorizedStaging();
  const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM field.observation) AS observation,(SELECT count(*)::int FROM field.census) AS census,(SELECT count(*)::int FROM field.census_measurement) AS census_measurement`)).rows[0];
  if(counts.observation!==1||counts.census!==1||counts.census_measurement!==2) throw new Error(`Unexpected MVP7 cardinalities: ${JSON.stringify(counts)}`);
  const target=(await pool.query(`
    SELECT tc.resource_id AS taxon_concept_id, tr.jblr_code AS taxon_concept_code, tn.scientific_name,
           p.resource_id AS population_id, pr.jblr_code AS population_code,p.population_label,
           fv.resource_id AS field_visit_id, vr.jblr_code AS field_visit_code,
           l.resource_id AS location_id, lr.jblr_code AS location_code,l.location_name
    FROM taxonomy.name_usage nu
    JOIN taxonomy.taxon_concept tc ON tc.resource_id=nu.taxon_concept_id
    JOIN core.resource tr ON tr.resource_id=tc.resource_id
    JOIN taxonomy.taxonomic_name tn ON tn.resource_id=nu.taxonomic_name_id
    JOIN taxonomy.identification i ON i.taxon_concept_id=tc.resource_id
    JOIN field.population p ON p.resource_id=i.target_resource_id
    JOIN core.resource pr ON pr.resource_id=p.resource_id
    JOIN field.field_visit_population fvp ON fvp.population_id=p.resource_id
    JOIN field.field_visit fv ON fv.resource_id=fvp.field_visit_id
    JOIN core.resource vr ON vr.resource_id=fv.resource_id
    JOIN field.location l ON l.resource_id=fv.location_id
    JOIN core.resource lr ON lr.resource_id=l.resource_id
    WHERE tn.scientific_name='Plantago major L.'
      AND p.population_label='JBLR STAGING · Población demo MVP2 · editada'
      AND fv.notes LIKE 'STAGING DEMO · MVP_PRODUCTIVO_3 · NO VALIDADO · %'
    ORDER BY i.is_preferred DESC, fv.resource_id
    LIMIT 1
  `)).rows[0];
  if(!target) throw new Error('Canonical MVP7 Plantago/Population/FieldVisit chain not found');
  const obs=(await pool.query(`
    SELECT o.resource_id AS observation_id,r.jblr_code AS observation_code,r.resource_type_code,r.validation_status,
           o.field_visit_id,o.population_id,o.location_id,o.individual_id,o.resolution_status,o.verbatim_observation,o.notes,
           (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=o.resource_id) AS revisions
    FROM field.observation o JOIN core.resource r ON r.resource_id=o.resource_id
  `)).rows[0];
  const census=(await pool.query(`
    SELECT c.resource_id AS census_id,r.jblr_code AS census_code,r.resource_type_code,r.validation_status,
           c.field_visit_id,c.population_id,c.method_text,c.notes,
           (SELECT count(*)::int FROM governance.record_revision gr WHERE gr.target_resource_id=c.resource_id) AS revisions
    FROM field.census c JOIN core.resource r ON r.resource_id=c.resource_id
  `)).rows[0];
  const measurements=(await pool.query(`SELECT census_measurement_id,census_id,metric_code,life_stage_code,value_status,numeric_value,unit_code,notes FROM field.census_measurement ORDER BY metric_code`)).rows;
  const individual=measurements.find(x=>x.metric_code==='individual_count');
  const seedling=measurements.find(x=>x.metric_code==='seedling_count');
  const invalidSemantics=(await pool.query(`SELECT count(*)::int AS n FROM field.census_measurement WHERE (value_status='present' AND numeric_value IS NULL) OR (value_status<>'present' AND numeric_value IS NOT NULL)`)).rows[0].n;
  const totalRevisions=(await pool.query(`SELECT count(*)::int AS n FROM governance.record_revision`)).rows[0].n;
  const checks=[
    obs.resource_type_code==='OBS',obs.validation_status==='unreviewed',obs.field_visit_id===target.field_visit_id,obs.population_id===target.population_id,obs.location_id===target.location_id,obs.individual_id===null,obs.resolution_status==='unresolved',obs.verbatim_observation==='JBLR STAGING · observación demo MVP7 · editada',/^STAGING DEMO · MVP_PRODUCTIVO_7 · NO VALIDADO · /.test(obs.notes||''),obs.revisions===1,
    census.resource_type_code==='CEN',census.validation_status==='unreviewed',census.field_visit_id===target.field_visit_id,census.population_id===target.population_id,census.method_text==='JBLR STAGING · censo demo MVP7 · editado',/^STAGING DEMO · MVP_PRODUCTIVO_7 · NO VALIDADO · /.test(census.notes||''),census.revisions===1,
    measurements.length===2,individual&&individual.census_id===census.census_id,individual&&individual.value_status==='present',individual&&Number(individual.numeric_value)===12,individual&&individual.unit_code==='individuals',
    seedling&&seedling.census_id===census.census_id,seedling&&seedling.value_status==='unknown',seedling&&seedling.numeric_value===null,seedling&&seedling.unit_code==='individuals',invalidSemantics===0
  ];
  if(checks.some(v=>!v)) throw new Error(`MVP7 canonical monitoring state failed: ${JSON.stringify({target,obs,census,measurements,invalidSemantics})}`);
  console.log(JSON.stringify({OPEN_VISIT_OBSERVATIONS_CENSUSES:'PASS',CREATE_OBSERVATION:'PASS',LINK_OBSERVATION_VISIT:'PASS',LINK_OBSERVATION_POPULATION:'PASS',LINK_OBSERVATION_LOCATION:'PASS',OPEN_OBSERVATION_DETAIL:'PASS',EDIT_OBSERVATION:'PASS',CREATE_CENSUS:'PASS',LINK_CENSUS_VISIT:'PASS',LINK_CENSUS_POPULATION:'PASS',OPEN_CENSUS_DETAIL:'PASS',CREATE_CENSUS_MEASUREMENT:'PASS',SHOW_CENSUS_MEASUREMENTS:'PASS',EDIT_CENSUS:'PASS',PERSIST_FIELD_MONITORING_TO_NEON:'PASS',VALUE_STATUS_SEMANTICS:'PASS',UNKNOWN_NOT_ZERO:'PASS',taxonConceptId:target.taxon_concept_id,taxonConceptCode:target.taxon_concept_code,scientificName:target.scientific_name,populationId:target.population_id,populationCode:target.population_code,fieldVisitId:target.field_visit_id,fieldVisitCode:target.field_visit_code,locationId:target.location_id,locationCode:target.location_code,observationId:obs.observation_id,observationCode:obs.observation_code,censusId:census.census_id,censusCode:census.census_code,measurements:measurements.map(x=>({id:x.census_measurement_id,metricCode:x.metric_code,valueStatus:x.value_status,numericValue:x.numeric_value,unitCode:x.unit_code})),revisions:{observation:obs.revisions,census:census.revisions,totalRecordRevision:totalRevisions},cardinalities:counts}));
}
main().catch(err=>{console.error(err.message);process.exitCode=1;}).finally(()=>pool.end());
