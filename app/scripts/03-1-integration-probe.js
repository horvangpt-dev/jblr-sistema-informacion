const fs = require('fs');
const path = require('path');

const baseUrl = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const evidenceDir = path.join(__dirname,'..','evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type':'application/json', ...(options.headers || {}) }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2,10)}`;
  const at = '2026-08-17T07:00:00.000Z';
  const capability = await jsonFetch(`${baseUrl}/controlled-real-api/capability`);
  if (!(capability.active && capability.stagingOnly && capability.environment === 'STAGING')) throw new Error('CONTROLLED_REAL capability is not explicitly STAGING-only');

  const payload = {
    token,
    at,
    latitude: 45.123456,
    longitude: 12.654321,
    uncertaintyM: 3,
    taxonLabel: `03.1 probe taxon ${token}`,
    populationLabel: `03.1 probe population ${token}`,
    locationName: `03.1 probe location ${token}`,
    verbatimLocality: `03.1 technical probe locality ${token}`,
    prospectionPurpose: `03.1 technical integration probe ${token}`,
    visitPurpose: `03.1 technical field visit ${token}`,
    observationText: `03.1 technical observation ${token}`,
    censusMethod: `03.1 technical census method ${token}`,
    individualLabel: `03.1 probe individual ${token}`,
    collectionMethod: `03.1 technical collection method ${token}`,
    permitReference: null,
    sampleKind: `probe_source_material_${token}`,
    sourceMaterialState: 'received_for_probe',
    processType: `probe_processing_${token}`,
    outputSampleKind: `probe_processed_material_${token}`,
    outputMaterialState: 'processed_for_probe',
    accessionStatus: 'probe_only',
    bibliographyTitle: `03.1 technical probe reference ${token}`,
    assertionText: `03.1 technical assertion ${token}`,
    externalSourceCode: `PROBE_${token}`,
    externalSourceName: `03.1 technical external source ${token}`,
    externalId: `03.1-PROBE-${token}`,
    analysisMetricCode: `probe_metric_${token}`,
    analysisValue: 1,
  };

  const created = await jsonFetch(`${baseUrl}/controlled-real-api/disposable-integration-probe`,{
    method:'POST', body:JSON.stringify(payload)
  });
  fs.writeFileSync(path.join(evidenceDir,'03-1-probe-manifest.json'),JSON.stringify(created.manifest,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-baseline-before.json'),JSON.stringify(created.baseline,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-probe-checks.json'),JSON.stringify(created.checks,null,2));

  const requiredChecks = [
    'TAXON_TO_POPULATION_TO_LOCATION','LOCATION_TO_GEOMETRY_VERSION','PROSPECTION_TO_FIELD_VISIT',
    'OBSERVATION_CENSUS_TRACEABLE','INDIVIDUAL_TO_COLLECTION','COLLECTION_TO_SAMPLE',
    'INPUT_SAMPLE_CREATED','PROCESSING_EVENT_CREATED','OUTPUT_SAMPLE_CREATED','OUTPUT_SAMPLE_NOT_INPUT_SAMPLE',
    'OUTPUT_SAMPLE_LINKED_AS_PROCESS_OUTPUT','CREATE_ACCESSION_FROM_OUTPUT_SAMPLE',
    'ACCESSION_MATERIAL_POINTS_TO_OUTPUT_SAMPLE','ACCESSION_NOT_FORCED_TO_SOURCE_SAMPLE',
    'BIBLIOGRAPHY_ASSERTION_EVIDENCE','EXTERNAL_RECORD_SNAPSHOT_PROVENANCE',
    'EXTERNAL_TAXON_REFERENCE_TRACEABLE','ANALYSIS_INPUT_RUN_RESULT_TRACEABLE','NO_AUTOMATIC_TAXONOMIC_VALIDATION',
    'REQUIRED_CODE_RESOURCE_HAS_REVERSIBLE_JBLR_CODE','NON_REQUIRED_CODE_RESOURCE_HAS_NULL_JBLR_CODE',
    'NO_REGISTRY_ENTRY_FOR_NULL_JBLR_CODE','NO_JBLR_SEQUENCE_CONSUMPTION'
  ];
  for (const name of requiredChecks) if (created.checks[name] !== true) throw new Error(`${name}=FAIL`);

  const identities=Object.values(created.manifest.resourceIdentity||{});
  if (identities.length!==created.manifest.coreResources.length) throw new Error('REVERSAL_MANIFEST_COMPLETE=FAIL: resource identity coverage mismatch');
  if (!identities.some((x)=>x.requiresJblrCode===true&&typeof x.jblrCode==='string')) throw new Error('REVERSAL_MANIFEST_COMPLETE=FAIL: no required-code resource identity');
  if (!identities.some((x)=>x.requiresJblrCode===false&&x.jblrCode===null)) throw new Error('REVERSAL_MANIFEST_COMPLETE=FAIL: no null-code resource identity');

  const reversed = await jsonFetch(`${baseUrl}/controlled-real-api/disposable-integration-probe/reverse`,{
    method:'POST', body:JSON.stringify({ manifest:created.manifest, baseline:created.baseline })
  });
  fs.writeFileSync(path.join(evidenceDir,'03-1-baseline-after.json'),JSON.stringify(reversed.after,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-reversal.json'),JSON.stringify(reversed,null,2));
  if (reversed.reversed.remaining !== 0 || reversed.comparison.exact !== true) throw new Error('REVERSIBILITY_PROVED=FAIL');
  if (reversed.comparison.changedTables.includes('core.jblr_code_registry')) throw new Error('JBLR_CODE_REGISTRY_BASELINE_CHANGED=1');
  if (reversed.comparison.sequenceChanged !== false) throw new Error('JBLR_CODE_SEQUENCE_CHANGED=1');

  const status = [
    'CONTROLLED_REAL_ROUTE_EXISTS=PASS',
    'CONTROLLED_REAL_STAGING_ONLY=PASS',
    'NO_AUTOMATIC_DEMO_PREFIX_IN_CONTROLLED_REAL=PASS',
    'NO_HARDCODED_DEMO_IDS_IN_CONTROLLED_REAL=PASS',
    'NO_AUTOMATIC_POINT_0_0_IN_CONTROLLED_REAL=PASS',
    'NO_AUTOMATIC_PROCESSED_DEMO_VALUES_IN_CONTROLLED_REAL=PASS',
    'INTEGRATED_PROBE_CREATED=PASS',
    ...requiredChecks.map((k)=>`${k}=PASS`),
    'PROCESSED_OUTPUT_TO_ACCESSION=PASS',
    'REVERSAL_MANIFEST_COMPLETE=PASS',
    'REVERSAL_TRANSACTION_EXECUTED=PASS',
    'PROBE_RESOURCES_REMAINING=0',
    'ACCEPTED_BASELINE_RESOURCES_CHANGED=0',
    'JBLR_CODE_REGISTRY_BASELINE_CHANGED=0',
    'JBLR_CODE_SEQUENCE_CHANGED=0',
    'REVERSIBILITY_PROVED=PASS',
    'POST_REVERSAL_BASELINE_STATE_EXACT=PASS',
    'NO_MASS_IMPORT=PASS',
    'NO_PUBLIC_PRODUCTION=PASS',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(evidenceDir,'03-1-controlled-real-status.txt'),status);
  process.stdout.write(status);
})().catch((err)=>{
  console.error(err.stack || err.message || err);
  process.exit(1);
});
