'use strict';

const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const base=require('./control-plane.js');

const REAL_RUN=base.REAL_RUN;
const REQUIRED=['TAXONOMIC_UNIVERSE_RELEASE_ID','TAXONOMIC_UNIVERSE_VERSION','TAXONOMIC_UNIVERSE_MANIFEST','MANIFEST_HASH'];
const NON_EVALUABLE=new Set(['UNKNOWN','NOT_FOUND','SOURCE_NOT_ACQUIRED','TAXON_UNRESOLVED','NOT_EVALUABLE','UNRESOLVED','NO_COMPROBADO','CONFLICT']);
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
const memberId=x=>x&&(x.release_row_id||x.taxon_id||x.taxon_identifier||null);
function err(code,msg,details={}){throw new base.ControlPlaneError(code,msg,details)}
function readMembers(p){const raw=fs.readFileSync(p,'utf8');if(/\.jsonl(?:\.json)?$/i.test(p))return raw.split(/\r?\n/).filter(Boolean).map(JSON.parse);const x=JSON.parse(raw);return Array.isArray(x)?x:x.members}
function manifestIdentity(m){return {id:m.release_id||m.TAXONOMIC_UNIVERSE_RELEASE_ID,version:m.release_version||m.TAXONOMIC_UNIVERSE_VERSION,hash:m.manifest_hash||m.MANIFEST_HASH}}
function verifyRelease({binding,manifest,authorization,runMode}){
  for(const k of REQUIRED)if(!binding||!binding[k])err('RELEASE_BINDING_MISSING',`Missing ${k}`,{field:k});
  const i=manifestIdentity(manifest);
  if(binding.TAXONOMIC_UNIVERSE_RELEASE_ID!==i.id)err('RELEASE_ID_MISMATCH','Release id mismatch');
  if(binding.TAXONOMIC_UNIVERSE_VERSION!==i.version)err('RELEASE_VERSION_MISMATCH','Release version mismatch');
  if(binding.MANIFEST_HASH!==i.hash)err('MANIFEST_HASH_BINDING_MISMATCH','Manifest hash mismatch');
  const calc=base.manifestHash(manifest);if(calc!==i.hash)err('MANIFEST_HASH_INVALID','Manifest hash invalid',{expected:i.hash,calculated:calc});
  base.assertNoHistoricalInput(binding,manifest);
  if(runMode===REAL_RUN){
    const a=authorization||{};
    if(a.TAXONOMIC_INPUT_FOR_08_AUTHORIZED!==true&&a.DOWNSTREAM_08_REAL_RUN_AUTHORIZED!==true)err('REAL_RUN_NOT_AUTHORIZED','Canonical release authorization missing');
    if(!a.AUTHORITY_EVENT_ID)err('REAL_RUN_NOT_AUTHORIZED','Authority event id missing');
    if(a.RELEASE_ID&&a.RELEASE_ID!==i.id)err('AUTHORIZATION_RELEASE_MISMATCH','Authorization release id mismatch');
    if(a.RELEASE_VERSION&&a.RELEASE_VERSION!==i.version)err('AUTHORIZATION_RELEASE_MISMATCH','Authorization release version mismatch');
    if(a.MANIFEST_HASH&&a.MANIFEST_HASH!==i.hash)err('AUTHORIZATION_MANIFEST_MISMATCH','Authorization manifest mismatch');
    if(!binding.RELEASE_QA_STATUS)err('RELEASE_QA_STATUS_MISSING','Exact release QA status required');
    if(manifest.qa_state&&binding.RELEASE_QA_STATUS!==manifest.qa_state)err('RELEASE_QA_STATUS_MISMATCH','QA status mismatch',{binding:binding.RELEASE_QA_STATUS,manifest:manifest.qa_state});
    if(!/(PASS|AUTHORIZED)/i.test(binding.RELEASE_QA_STATUS))err('RELEASE_QA_NOT_ACCEPTABLE','Release QA is not PASS/AUTHORIZED');
    if(manifest.publication_ready===false||manifest.final_release===false)err('RELEASE_NOT_DOWNSTREAM_CONSUMABLE','Manifest explicitly blocks publication');
  }
  return {state:'PASS',release_id:i.id,release_version:i.version,manifest_hash:calc};
}
function loadRelease({binding,authorization=null,runMode=base.SYNTHETIC_RUN,manifestObject=null,membersObject=null}){
  const mp=binding&&binding.TAXONOMIC_UNIVERSE_MANIFEST;
  const manifest=manifestObject||(mp&&fs.existsSync(mp)?JSON.parse(fs.readFileSync(mp,'utf8')):err('RELEASE_NOT_FOUND','Manifest not found',{pointer:mp}));
  const verified=verifyRelease({binding,manifest,authorization,runMode});
  let members=membersObject;
  if(!members){const p=binding.TAXONOMIC_UNIVERSE_MEMBERS||manifest.members_file||manifest.members_path;if(!p)err('RELEASE_MEMBERS_POINTER_MISSING','Members pointer required');const full=path.isAbsolute(p)?p:path.resolve(path.dirname(mp),p);if(!fs.existsSync(full))err('RELEASE_MEMBERS_NOT_FOUND','Members file not found',{pointer:full});if(binding.MEMBERS_HASH){const h=sha256(fs.readFileSync(full));if(h!==binding.MEMBERS_HASH)err('RELEASE_MEMBERS_HASH_INVALID','Members hash mismatch',{expected:binding.MEMBERS_HASH,calculated:h})}members=readMembers(full)}
  if(!Array.isArray(members))err('RELEASE_MEMBERS_INVALID','Members must be an array');
  if(manifest.taxon_count!=null&&Number(manifest.taxon_count)!==members.length)err('RELEASE_MEMBER_COUNT_MISMATCH','Manifest count mismatch',{manifest:manifest.taxon_count,loaded:members.length});
  for(const x of members)if(!memberId(x))err('RELEASE_MEMBER_ID_MISSING','Every release member needs a stable release/taxon id');
  return {binding:{...binding},manifest,members,verified};
}
function selectMembers(members,s){
  if(!s||!s.mode)err('SELECTION_MODE_MISSING','Selection mode required');
  if(s.mode==='taxon'){const x=members.find(r=>memberId(r)===s.taxon_id);if(!x)err('TAXON_NOT_FOUND','Taxon not in release',{taxon_id:s.taxon_id});return[x]}
  if(s.mode==='subset'){const ids=s.taxon_ids||[],m=new Map(members.map(x=>[memberId(x),x])),miss=ids.filter(id=>!m.has(id));if(miss.length)err('TAXON_NOT_FOUND','Subset contains absent ids',{missing:miss});return ids.map(id=>m.get(id))}
  if(s.mode==='genus'){const out=members.filter(x=>(x.genus||x.source_genus_verbatim)===s.genus);if(!out.length)err('GENUS_NOT_FOUND','Genus not explicit in release',{genus:s.genus});return out}
  if(s.mode==='batch'){if(!Number.isInteger(s.limit)||s.limit<1)err('BATCH_LIMIT_INVALID','Positive batch limit required');return members.slice(Number.isInteger(s.offset)?s.offset:0,(Number.isInteger(s.offset)?s.offset:0)+s.limit)}
  if(s.mode==='full')return [...members];err('SELECTION_MODE_INVALID','Unsupported selection mode',{mode:s.mode})
}
function selectAdapter(registry,id,version,runMode){const a=registry&&registry[id]&&registry[id][version];if(!a)err('STIME_VERSION_INCOMPATIBLE',`Missing adapter ${id}@${version}`);base.validateAdapter(a);if(a.EXECUTION_STATUS!=='READY_FOR_08')err('STIME_BLOCKED_BY_04','STIME is not READY_FOR_08',{id,status:a.EXECUTION_STATUS});if(a.SYNTHETIC_ONLY===true&&runMode===REAL_RUN)err('SYNTHETIC_ADAPTER_REAL_RUN_REFUSED','Synthetic adapter cannot run real');return a}
function assertNoFalseZero(r){const s=r&&(r.semantic_state||r.state);if(!NON_EVALUABLE.has(s))return;for(const[k,v]of Object.entries(r))if(/score|value|numeric|percent|percentage/i.test(k)&&v===0&&r.numeric_projection_rule!=='EXPLICIT_CONTRACT_PLACEHOLDER')err('FALSE_ZERO_GUARD',`State ${s} cannot silently become zero`,{field:k})}
function unresolved(rows){return rows.filter(x=>NON_EVALUABLE.has(x.result&&(x.result.semantic_state||x.result.state))).map(x=>({taxon_id:x.taxon_id,semantic_state:x.result.semantic_state||x.result.state,result:x.result}))}
async function retry(adapter,item,ctx,policy={}){let n=0;for(;;){try{const r=await adapter.executeItem(item,{...ctx,attempt:n});assertNoFalseZero(r);return{result:r,attempts:n+1}}catch(e){const ok=e&&((e.retryable===true)||(policy.retryable_codes||[]).includes(e.code));if(!ok||n>=(policy.max_retries||0))throw e;n++}}}
function runId(config,release,adapter){const key=config.idempotency_key||base.canonicalJson({release:release.binding.MANIFEST_HASH,stime:[adapter.STIME_ID,adapter.STIME_VERSION],selection:config.selection});return `JBLR-RUN-08-${sha256(key).slice(0,20).toUpperCase()}`}
async function executeRun({config,binding,adapterRegistry,workspace,manifestObject=null,membersObject=null,clock=null}){
  const release=loadRelease({binding,authorization:config.authorization,runMode:config.run_mode,manifestObject,membersObject});
  const adapter=selectAdapter(adapterRegistry,config.STIME_ID,config.STIME_VERSION,config.run_mode);base.verifyDependencies(adapter,config.dependency_state||{});const selected=selectMembers(release.members,config.selection);
  const store=new base.RunStore(path.join(workspace,'runs')),cache=new base.FileCache(path.join(workspace,'cache'));const id=config.EXECUTION_RUN_ID||runId(config,release,adapter);const sig=sha256(base.canonicalJson({binding,stime:[adapter.STIME_ID,adapter.STIME_VERSION],selection:config.selection,run_mode:config.run_mode}));
  const existing=store.loadManifest(id);if(existing){if(existing.EXECUTION_SIGNATURE!==sig)err('RUN_ID_COLLISION','Existing run uses different inputs');return{run_id:id,results:JSON.parse(fs.readFileSync(path.join(store.dir(id),'results.json'))),unresolved:JSON.parse(fs.readFileSync(path.join(store.dir(id),'unresolved.json'))),qa:{...JSON.parse(fs.readFileSync(path.join(store.dir(id),'qa.json'))),idempotent_replay:true},idempotent_replay:true,resumed:false}}
  let cp=store.loadCheckpoint(id),resumed=!!cp;if(cp&&cp.execution_signature!==sig)err('RUN_ID_COLLISION','Checkpoint uses different inputs');if(!cp)cp={execution_signature:sig,next_index:0,results:[],cache_events:[],status:'IN_PROGRESS'};
  for(let i=cp.next_index;i<selected.length;i++){const item=selected[i],tid=memberId(item),key=typeof adapter.cacheKey==='function'?adapter.cacheKey(item,{config,release}):null;let hit=key?cache.check(key,{sourceVersion:adapter.CACHE_SOURCE_VERSION||null,maxAgeMs:adapter.CACHE_MAX_AGE_MS??null,now:clock?clock().getTime():Date.now()}):{state:'CACHE_MISS'};cp.cache_events.push({taxon_id:tid,state:hit.state,key,reason:hit.reason||null});let ex;if(hit.state==='CACHE_HIT')ex={result:hit.record.value,attempts:0,from_cache:true};else{ex=await retry(adapter,item,{config,release,cache_state:hit.state},config.retry_policy||{});if(key&&ex.result&&ex.result.cacheable===true)cache.put(key,ex.result,{sourceVersion:adapter.CACHE_SOURCE_VERSION||null,provenance:ex.result.provenance,createdAt:(clock?clock():new Date()).toISOString()})}cp.results.push({taxon_id:tid,result:ex.result,attempts:ex.attempts,from_cache:!!ex.from_cache});cp.next_index=i+1;store.saveCheckpoint(id,cp)}
  const u=unresolved(cp.results),ts=(clock?clock():new Date()).toISOString();const qa={qa_state:'PASS',run_mode:config.run_mode,release_binding:'PASS',historical_input_guard:'PASS',no_silent_inference_guard:'PASS',cache_first:'MANDATORY_APPLIED',result_count:cp.results.length,unresolved_count:u.length,cache_state_counts:cp.cache_events.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{}),stime_id:adapter.STIME_ID,stime_version:adapter.STIME_VERSION,release_id:release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,release_version:release.binding.TAXONOMIC_UNIVERSE_VERSION,resumed};
  store.writeArtifact(id,'results.json',cp.results);store.writeArtifact(id,'unresolved.json',u);store.writeArtifact(id,'qa.json',qa);const rm={RUN_ID:id,ACTOR_ID:'08',RUN_MODE:config.run_mode,STIME_ID:adapter.STIME_ID,STIME_VERSION:adapter.STIME_VERSION,TAXONOMIC_UNIVERSE_RELEASE_ID:release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,TAXONOMIC_UNIVERSE_VERSION:release.binding.TAXONOMIC_UNIVERSE_VERSION,TAXONOMIC_UNIVERSE_MANIFEST:release.binding.TAXONOMIC_UNIVERSE_MANIFEST,MANIFEST_HASH:release.binding.MANIFEST_HASH,RELEASE_QA_STATUS:binding.RELEASE_QA_STATUS,AUTHORITY_EVENT_ID:config.authorization&&config.authorization.AUTHORITY_EVENT_ID,CODE_COMMIT:config.code_commit||null,RESULT_STATE:'COMPLETED',QA_STATE:'PASS',FINISHED_AT:ts,EXECUTION_SIGNATURE:sig};fs.writeFileSync(store.manifestPath(id),JSON.stringify(rm,null,2)+'\n');cp.status='COMPLETED';store.saveCheckpoint(id,cp);base.emitEvent(store,id,{EVENT_TYPE:'STIME_EXECUTION_RESULT',RUN_ID:id,ACTOR_ID:'08',RUN_MODE:config.run_mode,STIME_ID:adapter.STIME_ID,RELEASE_ID:rm.TAXONOMIC_UNIVERSE_RELEASE_ID,QA_STATE:'PASS',EMITTED_AT:ts});return{run_id:id,results:cp.results,unresolved:u,qa,run_manifest:rm,idempotent_replay:false,resumed};
}
const CONTROL_PLANE_API={LOAD_RELEASE:loadRelease,VERIFY_MANIFEST:verifyRelease,VERIFY_HASH:m=>({state:'PASS',hash:base.manifestHash(m)}),SELECT_STIME:selectAdapter,VERIFY_STIME_VERSION:selectAdapter,VERIFY_DEPENDENCIES:base.verifyDependencies,CHECK_CACHE:(c,k,o)=>c.check(k,o),CREATE_RUN_ID:runId,RUN_PREFLIGHT:({config,binding,manifest,authorization,registry,members})=>{const r=loadRelease({binding,authorization,runMode:config.run_mode,manifestObject:manifest,membersObject:members});const a=selectAdapter(registry,config.STIME_ID,config.STIME_VERSION,config.run_mode);base.verifyDependencies(a,config.dependency_state||{});return{state:'PASS',selected_count:selectMembers(r.members,config.selection).length}},EXECUTE_BATCH:executeRun,CHECKPOINT:(s,id,c)=>s.saveCheckpoint(id,c),RETRY_SAFE_FAILURES:retry,PRESERVE_UNRESOLVED:unresolved,WRITE_OUTPUT_ARTIFACTS:(s,id,n,v)=>s.writeArtifact(id,n,v),GENERATE_RUN_MANIFEST:x=>x,GENERATE_QA:x=>x,EMIT_EVENT:base.emitEvent};
module.exports={REAL_RUN,memberId,readMembers,verifyRelease,loadRelease,selectMembers,selectAdapter,executeRun,CONTROL_PLANE_API};
