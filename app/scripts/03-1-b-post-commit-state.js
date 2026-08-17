const fs=require('fs');
const path=require('path');
const { verifyPersistentPilot }=require('../src/controlled-real-persistent-pilot');
const { pool }=require('../src/db');

(async()=>{
  const evidenceDir=path.join(__dirname,'..','evidence');
  const manifest=JSON.parse(fs.readFileSync(path.join(evidenceDir,'03-1-b-real-pilot-manifest.json'),'utf8'));
  const result=await verifyPersistentPilot(manifest);
  const required=[
    'REAL_PILOT_PACKET_EXACT','NO_UNAUTHORIZED_FIELDS','NO_SILENT_INFERENCE','NO_AUTOMATIC_TAXONOMIC_VALIDATION',
    'TAXON_NAME_TRACEABLE','LOCATION_TRACEABLE','POPULATION_TRACEABLE','POPULATION_TO_LOCATION','POPULATION_TO_TAXON_CONCEPT',
    'NO_GEOMETRY_CREATED','NO_COORDINATES_WRITTEN','NO_COLLECTION_DATA_CREATED','RESOURCE_IDENTITY_POLICY',
    'PERSISTENT_CANONICAL_JBLR_CODES','UNEXPLAINED_SEQUENCE_DRIFT','REAL_PILOT_MANIFEST_COMPLETE',
    'ACCEPTED_HISTORICAL_RESOURCES_CHANGED','PROVENANCE_TRACEABLE'
  ];
  for(const k of required) if(result.checks[k]!==true) throw new Error(`POST_COMMIT_${k}=FAIL`);
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-post-commit-checks.json'),JSON.stringify(result,null,2));
  const status=[
    'POST_COMMIT_REAL_PILOT_PRESENT=PASS',
    'POST_COMMIT_POPULATION_PERSISTED=PASS',
    'POST_COMMIT_NO_GEOMETRY_CREATED=PASS',
    'POST_COMMIT_NO_COORDINATES_WRITTEN=PASS',
    'POST_COMMIT_NO_COLLECTION_DATA_CREATED=PASS',
    'POST_COMMIT_RESOURCE_IDENTITY_POLICY=PASS',
    'POST_COMMIT_UNEXPLAINED_SEQUENCE_DRIFT=0',
    'POST_COMMIT_ACCEPTED_HISTORICAL_RESOURCES_CHANGED=0',
  ].join('\n')+'\n';
  fs.writeFileSync(path.join(evidenceDir,'03-1-b-post-commit-status.txt'),status);
  process.stdout.write(status);
})().catch((err)=>{console.error(err.stack||err.message||err);process.exitCode=1;}).finally(()=>pool.end());
