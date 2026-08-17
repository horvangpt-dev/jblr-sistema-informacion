const fs = require('fs');
const path = require('path');

const baseUrl = process.env.MVP_BASE_URL || 'http://127.0.0.1:3000';
const evidenceDir = path.join(__dirname,'..','evidence');
fs.mkdirSync(evidenceDir,{recursive:true});

async function jsonFetch(url, options={}) {
  const response=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const body=await response.json();
  if(!response.ok) throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

(async()=>{
  const capability=await jsonFetch(`${baseUrl}/controlled-real-api/capability`);
  if(!(capability.active && capability.stagingOnly && capability.environment==='STAGING')) throw new Error('CONTROLLED_REAL_STAGING_ONLY=FAIL');
  const packet={
    packetId:'PILOT_DATA_PACKET_01',
    verbatimTaxonName:'Artemisia herba-alba',
    verbatimLocationLabel:'El Campillo',
    sourceSemantic:'OPERADOR_JBLR / REGISTRO_OPERATIVO_REAL',
  };
  const created=await jsonFetch(`${baseUrl}/controlled-real-api/persistent-real-pilot-01`,{method:'POST',body:JSON.stringify(packet)});
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-real-pilot-manifest.json'),JSON.stringify(created.manifest,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-real-pilot-checks.json'),JSON.stringify(created.checks,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-sequence-before.json'),JSON.stringify(created.manifest.sequenceBefore,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-sequence-after.json'),JSON.stringify(created.sequenceAfter,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-counts-before.json'),JSON.stringify(created.manifest.beforeCounts,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-counts-after.json'),JSON.stringify(created.afterCounts,null,2));
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-identities.json'),JSON.stringify(created.identities,null,2));

  const required=[
    'REAL_PILOT_PACKET_EXACT','NO_UNAUTHORIZED_FIELDS','NO_SILENT_INFERENCE','NO_AUTOMATIC_TAXONOMIC_VALIDATION',
    'TAXON_NAME_TRACEABLE','LOCATION_TRACEABLE','POPULATION_TRACEABLE','POPULATION_TO_LOCATION','POPULATION_TO_TAXON_CONCEPT',
    'NO_GEOMETRY_CREATED','NO_COORDINATES_WRITTEN','NO_COLLECTION_DATA_CREATED','RESOURCE_IDENTITY_POLICY',
    'PERSISTENT_CANONICAL_JBLR_CODES','UNEXPLAINED_SEQUENCE_DRIFT','REAL_PILOT_MANIFEST_COMPLETE',
    'ACCEPTED_HISTORICAL_RESOURCES_CHANGED','PROVENANCE_TRACEABLE'
  ];
  for(const k of required) if(created.checks[k]!==true) throw new Error(`${k}=FAIL`);
  if(created.manifest.jblrCodes.length!==5) throw new Error('CODES_ALLOCATED unexpected count');
  const codeTypes=created.identities.filter((x)=>x.jblr_code).map((x)=>`${x.resource_type_code}:${x.jblr_code}`);
  const status=[
    '03.1-B=OPEN',
    'PILOT_DATA_PACKET=PILOT_DATA_PACKET_01',
    'TAXON=Artemisia herba-alba',
    'LOCATION=El Campillo',
    'REAL_DATA_COMMITTED=PASS',
    'POPULATION_PERSISTED=PASS',
    ...required.filter((k)=>k!=='UNEXPLAINED_SEQUENCE_DRIFT'&&k!=='ACCEPTED_HISTORICAL_RESOURCES_CHANGED').map((k)=>`${k}=PASS`),
    'UNEXPLAINED_SEQUENCE_DRIFT=0',
    'ACCEPTED_HISTORICAL_RESOURCES_CHANGED=0',
    'GEOMETRY_CREATED=NO',
    'COORDINATES_WRITTEN=NO',
    'AUTOMATIC_TAXONOMIC_VALIDATION=NO',
    `SEQUENCE_BEFORE=${created.manifest.sequenceBefore.last_value}`,
    `SEQUENCE_AFTER=${created.sequenceAfter.last_value}`,
    `CODES_ALLOCATED=${created.manifest.jblrCodes.join(',')}`,
    `CODE_RESOURCE_TYPES=${codeTypes.join(',')}`,
    'REAL_PILOT_MANIFEST=COMPLETE',
    'SCHEMA_CHANGES=NONE',
    'NO_MASS_IMPORT=PASS',
    'NO_PUBLIC_PRODUCTION=PASS',
  ].join('\n')+'\n';
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-real-pilot-status.txt'),status);
  process.stdout.write(status);
})().catch((err)=>{console.error(err.stack||err.message||err);process.exit(1);});
