const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const common = require('./controlled-real-common');
const { createFieldMaterial } = require('./controlled-real-field-material');
const { createEvidenceAnalysis } = require('./controlled-real-evidence-analysis');
const { verifyProbe, reverseDisposableProbe } = require('./controlled-real-verify-reverse');

async function createDisposableProbe(input={}) {
  common.assertControlledRealEnabled(); const p=common.normalizeProbeInput(input);
  const manifest={version:'03.1-A',marker:common.PROBE_MARKER,token:p.token,createdAt:new Date().toISOString(),probeLatitude:p.latitude,probeLongitude:p.longitude,coreResources:[],entities:{},relations:{},nonResourceRows:{},resourceIdentity:{}};
  const client=await pool.connect();
  try{
    await client.query('BEGIN'); await assertAuthorizedStaging(client); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`JBLR:03.1-A:${p.token}`]);
    manifest.sequenceBeforeCreate=(await client.query('SELECT last_value,is_called FROM core.jblr_code_sequence')).rows[0];
    await createFieldMaterial(client,p,manifest); await createEvidenceAnalysis(client,p,manifest);
    const checks=await verifyProbe(client,manifest); if(!Object.values(checks).every((v)=>v===true)) throw new Error(`Probe verification failed: ${JSON.stringify(checks)}`);
    await client.query('COMMIT'); return {manifest,checks};
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}

module.exports={ACTIVATION_ENV:common.ACTIVATION_ENV,PROBE_MARKER:common.PROBE_MARKER,assertControlledRealEnabled:common.assertControlledRealEnabled,baselineSnapshot:common.baselineSnapshot,compareSnapshots:common.compareSnapshots,createDisposableProbe,verifyProbe,reverseDisposableProbe};
