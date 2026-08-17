const { pool } = require('../src/db');
const { assertAuthorizedStaging } = require('../src/staging');
const refs = require('../src/external-taxon-reference');

const GEO_ID='01a00d2a-fdb9-7506-b1f6-e84e172c6ab5';
const GEO_CREATED_AT='2026-08-17T00:41:55.629Z';
const VALIDATION_EVENT_ID='01a00d10-7d9b-7e10-859e-36f0e6b580c7';
const QUALITY_ID='01a00ce6-7146-7388-99cf-55299f3ab39c';
const SNAPSHOT_ID='01a00bd3-59a5-755d-8100-8850279516d9';
const SNAPSHOT_HASH='f550a5eacddde3288d726c1e0fd2d9b7c6df929cff965d89d4568bcd6a74eea7';
const ANALYSIS_RESULT_ID='01a00ca7-8ee3-796b-aa85-f23b9632f57c';

function assert(condition,message){ if(!condition) throw new Error(message); }
async function one(sql,params=[]){ const {rows}=await pool.query(sql,params); return rows[0]; }

(async()=>{
  try {
    await assertAuthorizedStaging();
    const beforeTaxon=await one(`SELECT r.validation_status,r.row_version,tc.concept_label,tc.resolution_status,tc.notes FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id WHERE tc.resource_id=$1`,[refs.DEMO_TAXON_CONCEPT_ID]);
    assert(beforeTaxon && beforeTaxon.validation_status==='unreviewed' && Number(beforeTaxon.row_version)===1,'TaxonConcept initial state mismatch');

    const first=await refs.createOrReuseDemoReference(refs.DEMO_TAXON_CONCEPT_ID);
    const second=await refs.createOrReuseDemoReference(refs.DEMO_TAXON_CONCEPT_ID);
    assert(first.reference.external_taxon_reference_id===second.reference.external_taxon_reference_id,'Repeated create/reuse changed ExternalTaxonReference identity');
    assert(String(first.reference.created_at)===String(second.reference.created_at),'Repeated create/reuse changed created_at');
    assert(second.created===false,'Second create/reuse must reuse ExternalTaxonReference');

    const row=await one(`
      SELECT etr.*,r.resource_type_code,r.validation_status,r.row_version,r.created_at,
             es.source_code,es.source_name,es.source_type,es.base_url
      FROM taxonomy.external_taxon_reference etr
      JOIN core.resource r ON r.resource_id=etr.resource_id
      JOIN evidence.external_source es ON es.external_source_id=etr.external_source_id
      WHERE etr.external_id=$1
    `,[refs.DEMO_EXTERNAL_ID]);
    assert(row,'ExternalTaxonReference missing');
    assert(row.resource_type_code==='ETR','resource type must be ETR');
    assert(row.validation_status==='unreviewed' && Number(row.row_version)===1,'ETR review state changed');
    assert(row.taxon_concept_id===refs.DEMO_TAXON_CONCEPT_ID,'taxon_concept_id mismatch');
    assert(row.taxonomic_name_id===null,'taxonomic_name_id must remain NULL');
    assert(row.external_source_id===refs.DEMO_EXTERNAL_SOURCE_ID,'external_source_id mismatch');
    assert(row.backbone_snapshot_id===null,'backbone_snapshot_id must remain NULL');
    assert(row.external_id===refs.DEMO_EXTERNAL_ID,'external_id changed');
    assert(row.external_url===null,'external_url must remain NULL');
    assert(row.match_type===null,'match_type must remain NULL');
    assert(row.confidence===null,'confidence must remain NULL, not zero');
    assert(row.notes===refs.DEMO_NOTES,'notes changed');
    assert(row.source_code==='STAGING_MVP9' && row.source_type==='synthetic_demo' && row.base_url===null,'MVP9 ExternalSource changed');

    const afterTaxon=await one(`SELECT r.validation_status,r.row_version,tc.concept_label,tc.resolution_status,tc.notes FROM taxonomy.taxon_concept tc JOIN core.resource r ON r.resource_id=tc.resource_id WHERE tc.resource_id=$1`,[refs.DEMO_TAXON_CONCEPT_ID]);
    assert(JSON.stringify(afterTaxon)===JSON.stringify(beforeTaxon),'TaxonConcept was modified by MVP15');

    const geo=await one(`SELECT lgv.resource_id,r.created_at,lgv.version_no,ST_AsText(lgv.geom) AS wkt,lgv.uncertainty_m,lgv.is_preferred FROM field.location_geometry_version lgv JOIN core.resource r ON r.resource_id=lgv.resource_id WHERE lgv.resource_id=$1`,[GEO_ID]);
    assert(geo && new Date(geo.created_at).toISOString()===GEO_CREATED_AT && Number(geo.version_no)===1 && geo.wkt==='POINT(0 0)' && geo.uncertainty_m===null && geo.is_preferred===true,'MVP14 georeference changed');

    const ve=await one(`SELECT target_resource_id,from_validation_status,to_validation_status,occurred_at FROM governance.validation_event WHERE resource_id=$1`,[VALIDATION_EVENT_ID]);
    assert(ve && ve.from_validation_status==='unreviewed' && ve.to_validation_status==='pending_review','MVP13 review state changed');
    const qa=await one(`SELECT score,assessed_by_agent_id,data_activity_id FROM governance.quality_assessment WHERE resource_id=$1`,[QUALITY_ID]);
    assert(qa && qa.score===null && qa.assessed_by_agent_id===null && qa.data_activity_id===null,'MVP12 QualityAssessment changed');
    const snap=await one(`SELECT payload_hash FROM evidence.external_record_snapshot WHERE resource_id=$1`,[SNAPSHOT_ID]);
    assert(snap && snap.payload_hash===SNAPSHOT_HASH,'MVP9 snapshot changed');
    const analysis=await one(`SELECT value_status,numeric_value FROM analytics.analysis_result WHERE resource_id=$1`,[ANALYSIS_RESULT_ID]);
    assert(analysis && analysis.value_status==='present' && Number(analysis.numeric_value)===7.5,'MVP10 analysis changed');

    const counts=(await pool.query(`SELECT
      (SELECT count(*)::int FROM taxonomy.external_taxon_reference) AS external_taxon_reference,
      (SELECT count(*)::int FROM evidence.external_source) AS external_source,
      (SELECT count(*)::int FROM evidence.external_record) AS external_record,
      (SELECT count(*)::int FROM evidence.external_record_snapshot) AS external_record_snapshot,
      (SELECT count(*)::int FROM evidence.provenance_link) AS provenance_link,
      (SELECT count(*)::int FROM field.location_geometry_version) AS location_geometry_version,
      (SELECT count(*)::int FROM field.location) AS location,
      (SELECT count(*)::int FROM field.population) AS population,
      (SELECT count(*)::int FROM field.population_location) AS population_location,
      (SELECT count(*)::int FROM governance.validation_event) AS validation_event,
      (SELECT count(*)::int FROM governance.quality_assessment) AS quality_assessment,
      (SELECT count(*)::int FROM governance.quality_flag) AS quality_flag,
      (SELECT count(*)::int FROM taxonomy.identification) AS identification,
      (SELECT count(*)::int FROM taxonomy.taxon_concept) AS taxon_concept,
      (SELECT count(*)::int FROM taxonomy.taxonomic_name) AS taxonomic_name,
      (SELECT count(*)::int FROM taxonomy.name_usage) AS name_usage,
      (SELECT count(*)::int FROM analytics.analysis_run) AS analysis_run,
      (SELECT count(*)::int FROM analytics.analysis_result) AS analysis_result,
      (SELECT count(*)::int FROM evidence.assertion) AS assertion,
      (SELECT count(*)::int FROM evidence.digital_asset) AS digital_asset
    `)).rows[0];
    const expected={external_taxon_reference:1,external_source:1,external_record:1,external_record_snapshot:1,provenance_link:1,location_geometry_version:1,location:1,population:1,population_location:1,validation_event:1,quality_assessment:1,quality_flag:0,identification:1,taxon_concept:4,taxonomic_name:4,name_usage:4,analysis_run:1,analysis_result:1,assertion:1,digital_asset:0};
    for(const [key,value] of Object.entries(expected)) assert(counts[key]===value,`${key} cardinality changed: ${counts[key]} != ${value}`);

    console.log(JSON.stringify({
      OPEN_EXTERNAL_TAXON_REFERENCES:'PASS',CREATE_EXTERNAL_TAXON_REFERENCE:'PASS',OPEN_EXTERNAL_TAXON_REFERENCE:'PASS',
      LINK_REFERENCE_TO_TAXON_CONCEPT:'PASS',LINK_REFERENCE_TO_EXTERNAL_SOURCE:'PASS',TRACE_REFERENCE_TO_TAXON_CONCEPT:'PASS',TRACE_REFERENCE_TO_EXTERNAL_SOURCE:'PASS',
      EXTERNAL_REFERENCE_NOT_TAXON_CONCEPT:'PASS',EXTERNAL_REFERENCE_NOT_TAXONOMIC_NAME:'PASS',EXTERNAL_IDENTIFIER_NOT_TAXONOMIC_IDENTITY:'PASS',
      EXTERNAL_IDENTIFIER_NOT_IDENTIFICATION:'PASS',EXTERNAL_REFERENCE_NOT_SCIENTIFIC_VALIDATION:'PASS',EXTERNAL_SOURCE_NOT_VALIDATED_AUTHORITY:'PASS',REFERENCE_NOT_ASSERTION:'PASS',IMPORT_NOT_VALIDATION:'PASS',
      TAXONOMIC_NAME_NULL_PRESERVED:'PASS',BACKBONE_SNAPSHOT_NULL_PRESERVED:'PASS',EXTERNAL_URL_NULL_PRESERVED:'PASS',MATCH_TYPE_NULL_PRESERVED:'PASS',CONFIDENCE_NULL_NOT_ZERO:'PASS',
      NO_REAL_EXTERNAL_IDENTIFIER:'PASS',NO_NEW_EXTERNAL_SOURCE:'PASS',NO_NEW_IDENTIFICATION:'PASS',NO_NEW_TAXON_CONCEPT:'PASS',NO_NEW_TAXONOMIC_NAME:'PASS',
      NO_DUPLICATE_EXTERNAL_TAXON_REFERENCE:'PASS',REPEAT_DOES_NOT_CHANGE_EXTERNAL_REFERENCE:'PASS',PRESERVE_MVP14_GEOREFERENCE:'PASS',PRESERVE_MVP13_REVIEW_STATE:'PASS',
      PRESERVE_MVP12_QUALITY_ASSESSMENT:'PASS',PRESERVE_MVP10_ANALYSIS:'PASS',PRESERVE_MVP9_EXTERNAL_DATA:'PASS',PERSIST_EXTERNAL_TAXON_REFERENCE_TO_NEON:'PASS',
      externalTaxonReferenceId:row.resource_id,createdAt:row.created_at,externalId:row.external_id,confidence:row.confidence,matchType:row.match_type,externalUrl:row.external_url,cardinalities:counts
    }));
  } finally { await pool.end(); }
})().catch((err)=>{ console.error(err.stack||err.message); process.exit(1); });
