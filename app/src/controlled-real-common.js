const crypto = require('crypto');
const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');

const ACTIVATION_ENV = 'JBLR_CONTROLLED_REAL_ENABLED';
const PROBE_MARKER = '03.1-A DISPOSABLE_INTEGRATION_PROBE';

const SNAPSHOT_TABLES = [
  ['core','resource',['resource_id']], ['core','jblr_code_registry',['jblr_code']], ['core','geographic_area',['resource_id']],
  ['taxonomy','taxon_concept',['resource_id']], ['taxonomy','identification',['resource_id']], ['taxonomy','regional_taxon_assertion',['resource_id']], ['taxonomy','external_taxon_reference',['resource_id']],
  ['field','location',['resource_id']], ['field','population',['resource_id']], ['field','population_location',['population_location_id']], ['field','location_geometry_version',['resource_id']], ['field','prospection',['resource_id']], ['field','field_visit',['resource_id']], ['field','field_visit_population',['field_visit_id','population_id']], ['field','observation',['resource_id']], ['field','census',['resource_id']], ['field','individual',['resource_id']], ['field','collection_event',['resource_id']], ['field','collection_individual',['collection_individual_id']],
  ['material','sample',['resource_id']], ['material','sample_origin',['sample_origin_id']], ['material','processing_event',['resource_id']], ['material','process_input',['process_input_id']], ['material','process_output',['process_output_id']], ['material','accession',['resource_id']], ['material','accession_material',['accession_material_id']],
  ['evidence','bibliographic_reference',['resource_id']], ['evidence','assertion',['resource_id']], ['evidence','evidence_link',['evidence_link_id']], ['evidence','external_source',['external_source_id']], ['evidence','external_record',['resource_id']], ['evidence','external_record_snapshot',['resource_id']], ['evidence','provenance_link',['provenance_link_id']],
  ['governance','data_activity',['resource_id']], ['analytics','metric_definition',['metric_definition_id']], ['analytics','metric_target_resource_type',['metric_definition_id','resource_type_code']], ['analytics','analysis_run',['resource_id']], ['analytics','analysis_input',['analysis_input_id']], ['analytics','analysis_result',['resource_id']],
];

function assertControlledRealEnabled() {
  if (process.env[ACTIVATION_ENV] !== 'true') throw new Error('CONTROLLED_REAL is disabled; explicit server-side activation is required');
}

function requiredText(value, field, max = 1000) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return text;
}

function optionalText(value, max = 2000) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`text exceeds ${max} characters`);
  return text;
}

function timestamp(value, field) {
  const text = requiredText(value, field, 80);
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is invalid`);
  return d.toISOString();
}

function optionalNumber(value, field, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} is invalid`);
  if (min !== null && n < min) throw new Error(`${field} is below minimum`);
  if (max !== null && n > max) throw new Error(`${field} exceeds maximum`);
  return n;
}

function normalizeProbeInput(input = {}) {
  const token = requiredText(input.token,'token',120);
  const at = timestamp(input.at,'at');
  const latitude = optionalNumber(input.latitude,'latitude',{min:-90,max:90});
  const longitude = optionalNumber(input.longitude,'longitude',{min:-180,max:180});
  if (latitude === null || longitude === null) throw new Error('latitude and longitude are required');
  if (latitude === 0 && longitude === 0) throw new Error('CONTROLLED_REAL probe must not use automatic zero-coordinate semantics');
  return {
    token, at, latitude, longitude, uncertaintyM: optionalNumber(input.uncertaintyM,'uncertaintyM',{min:0}),
    taxonLabel: requiredText(input.taxonLabel,'taxonLabel',300), populationLabel: requiredText(input.populationLabel,'populationLabel',300),
    locationName: requiredText(input.locationName,'locationName',300), verbatimLocality: optionalText(input.verbatimLocality,500),
    prospectionPurpose: requiredText(input.prospectionPurpose,'prospectionPurpose',400), visitPurpose: requiredText(input.visitPurpose,'visitPurpose',400),
    observationText: requiredText(input.observationText,'observationText',1200), censusMethod: requiredText(input.censusMethod,'censusMethod',1200),
    individualLabel: requiredText(input.individualLabel,'individualLabel',300), collectionMethod: requiredText(input.collectionMethod,'collectionMethod',400),
    permitReference: optionalText(input.permitReference,300), sampleKind: requiredText(input.sampleKind,'sampleKind',200), sourceMaterialState: optionalText(input.sourceMaterialState,200),
    processType: requiredText(input.processType,'processType',200), outputSampleKind: requiredText(input.outputSampleKind,'outputSampleKind',200), outputMaterialState: optionalText(input.outputMaterialState,200),
    accessionStatus: requiredText(input.accessionStatus,'accessionStatus',120), bibliographyTitle: requiredText(input.bibliographyTitle,'bibliographyTitle',500), assertionText: requiredText(input.assertionText,'assertionText',1200),
    externalSourceCode: requiredText(input.externalSourceCode,'externalSourceCode',200), externalSourceName: requiredText(input.externalSourceName,'externalSourceName',400), externalId: requiredText(input.externalId,'externalId',300),
    analysisMetricCode: requiredText(input.analysisMetricCode,'analysisMetricCode',200), analysisValue: optionalNumber(input.analysisValue,'analysisValue'),
  };
}

async function resourceIdentityPolicy(client,typeCode) {
  const row=(await client.query('SELECT requires_jblr_code,code_prefix FROM core.resource_type WHERE resource_type_code=$1',[typeCode])).rows[0];
  if (!row) throw new Error(`Unknown resource type ${typeCode}`);
  if (row.requires_jblr_code && !row.code_prefix) throw new Error(`Physical identity inconsistency: ${typeCode} requires JBLR code but has no code prefix`);
  return {requiresJblrCode:row.requires_jblr_code===true,codePrefix:row.code_prefix||null};
}

async function nextProbeJblrCode(client,typeCode,codePrefix,manifest) {
  if (!codePrefix) throw new Error(`Missing JBLR code prefix for required resource type ${typeCode}`);
  if (!manifest.codeSeed) {
    const seed = parseInt(crypto.createHash('sha256').update(manifest.token).digest('hex').slice(0,8),16);
    manifest.codeSeed = 90000000 + (seed % 8000000); manifest.codeCursor = 0; manifest.jblrCodes = [];
  }
  for (let tries=0; tries<10000; tries+=1) {
    const n=manifest.codeSeed + manifest.codeCursor++; if (n>98999999) manifest.codeCursor=0;
    const code=`JBLR-${codePrefix}-${String(n).padStart(8,'0')}`;
    if (!(await client.query('SELECT 1 FROM core.jblr_code_registry WHERE jblr_code=$1',[code])).rows[0]) { manifest.jblrCodes.push(code); return code; }
  }
  throw new Error('Unable to allocate reversible probe JBLR code');
}

async function newResource(client,typeCode,manifest,key) {
  const policy=await resourceIdentityPolicy(client,typeCode);
  const jblrCode=policy.requiresJblrCode?await nextProbeJblrCode(client,typeCode,policy.codePrefix,manifest):null;
  const row=(await client.query(`INSERT INTO core.resource(resource_id,resource_type_code,jblr_code,validation_status) VALUES(uuidv7(),$1,$2,'unreviewed') RETURNING resource_id,jblr_code`,[typeCode,jblrCode])).rows[0];
  manifest.coreResources.push(row.resource_id); manifest.entities[key]=row.resource_id;
  if (!manifest.resourceIdentity) manifest.resourceIdentity={};
  manifest.resourceIdentity[key]={resourceId:row.resource_id,resourceTypeCode:typeCode,requiresJblrCode:policy.requiresJblrCode,codePrefix:policy.codePrefix,jblrCode:row.jblr_code};
  return row.resource_id;
}

function hashPayload(value) { return crypto.createHash('sha256').update(JSON.stringify(value,Object.keys(value).sort()),'utf8').digest('hex'); }

async function baselineSnapshot(client=pool) {
  await assertAuthorizedStaging(client); const tables={};
  for (const [schema,table,orderColumns] of SNAPSHOT_TABLES) {
    const order=orderColumns.map((c)=>`t.${c}`).join(',');
    tables[`${schema}.${table}`]=(await client.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY ${order}),'')) AS hash FROM ${schema}.${table} t`)).rows[0];
  }
  const sequence=(await client.query('SELECT last_value,is_called FROM core.jblr_code_sequence')).rows[0];
  return {tables,sequence};
}

function compareSnapshots(before,after) {
  const changedTables=[]; for (const key of Object.keys(before.tables)) if (JSON.stringify(before.tables[key])!==JSON.stringify(after.tables[key])) changedTables.push(key);
  const sequenceChanged=JSON.stringify(before.sequence)!==JSON.stringify(after.sequence);
  return {exact:changedTables.length===0 && !sequenceChanged,changedTables,sequenceChanged};
}

module.exports={ACTIVATION_ENV,PROBE_MARKER,assertControlledRealEnabled,normalizeProbeInput,newResource,hashPayload,baselineSnapshot,compareSnapshots};
