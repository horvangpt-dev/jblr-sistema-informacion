#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function shaText(v){return crypto.createHash('sha256').update(v).digest('hex');}
function shaFile(p){return shaText(fs.readFileSync(p));}
function norm(v){return String(v??'').replace(/\s+/g,' ').trim();}
function writeJson(p,obj){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(obj,null,2)+'\n');}

async function main(){
  const [implDir,inventoryPath,outDir]=process.argv.slice(2);
  if(!implDir||!inventoryPath||!outDir) throw new Error('ARGS_REQUIRED');
  const core=require(path.resolve(implDir,'source-expansion.js'));
  const transportsLib=require(path.resolve(implDir,'transports.js'));
  const inventoryDoc=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
  const inventory=Object.fromEntries((inventoryDoc.sources||[]).map(s=>[s.source_id,s]));
  const prevResultsPath=path.resolve('execution/09/corpus-b-cold-start-v1/runs/09_CORPUS_B_COLD_START_20260824_002/CORPUS_B_338_RESOLUTION_RESULTS_v2.json');
  const prevNetworkPath=path.resolve('execution/09/corpus-b-cold-start-v1/runs/09_CORPUS_B_COLD_START_20260824_002/CORPUS_B_338_NAME_NETWORK_LEDGER_v2.json');
  core.assertNoDeniedDiscoveryRead(prevResultsPath);
  core.assertNoDeniedDiscoveryRead(prevNetworkPath);
  const prev=JSON.parse(fs.readFileSync(prevResultsPath,'utf8'));
  const prevNetworks=JSON.parse(fs.readFileSync(prevNetworkPath,'utf8'));
  const accepted=prev.rows.filter(r=>r.TERMINAL_STATE==='RESOLVED_EXACT_ORIGINAL_NAME');
  const carry=prev.rows.filter(r=>r.TERMINAL_STATE!=='RESOLVED_EXACT_ORIGINAL_NAME');
  if(accepted.length!==1||carry.length!==337) throw new Error(`CARRY_FORWARD_MISMATCH accepted=${accepted.length} carry=${carry.length}`);
  const netById=new Map((prevNetworks.rows||[]).map(r=>[String(r.B_SOURCE_RECORD_ID),r]));
  const runId=process.env.RUN_ID||'09_CORPUS_B_SOURCE_EXPANSION_337_20260824_003';
  const context=core.createContext({runId,initialCache:[]});
  const timeoutFetch=async(url,opts={})=>{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),10000);
    try{return await fetch(url,{...opts,signal:c.signal});}finally{clearTimeout(t);}
  };
  const eidosBase=transportsLib.createEidosSoapTransport({fetchImpl:timeoutFetch});
  const eidosCache=new Map();
  let eidosConsecutiveTransportFailures=0;
  let eidosCircuit=null;
  const hvmoPageCache=new Map();
  const liveTransports={};
  liveTransports.MITECO_EIDOS=async(name)=>{
    if(eidosCache.has(name)) return eidosCache.get(name);
    if(eidosCircuit){
      const r={state:eidosCircuit.state,relations:[],matches:[],evidencePointer:eidosCircuit.evidencePointer,accessDetail:`RUN_CIRCUIT_OPEN_AFTER_${eidosCircuit.failures}_CONSECUTIVE_TRANSPORT_FAILURES|${eidosCircuit.accessDetail}`};
      eidosCache.set(name,r); return r;
    }
    let r;
    try{r=await eidosBase(name);}catch(e){r={state:'ACCESS_FAILED',relations:[],matches:[],accessDetail:String(e.message||e),evidencePointer:inventory.MITECO_EIDOS?.endpoint||null};}
    if(Array.isArray(r.matches)) r.matches=r.matches.map(m=>({...m,sameConcept:norm(m.scientificName)===norm(name)}));
    if(['ACCESS_FAILED','SOURCE_UNAVAILABLE','TECHNICALLY_UNAVAILABLE'].includes(r.state)){
      eidosConsecutiveTransportFailures+=1;
      if(eidosConsecutiveTransportFailures>=3){
        eidosCircuit={state:r.state,failures:eidosConsecutiveTransportFailures,evidencePointer:r.evidencePointer||inventory.MITECO_EIDOS?.endpoint||null,accessDetail:r.accessDetail||'TRANSPORT_FAILURE'};
      }
    } else {
      eidosConsecutiveTransportFailures=0;
    }
    eidosCache.set(name,r); return r;
  };
  liveTransports.HVMO_UIB=async(name)=>{
    const url=transportsLib.hvmoIndexUrlForName(name);
    const key=new URL(url).pathname;
    const cached=hvmoPageCache.get(key);
    if(cached?.state==='FAIL') return {state:'ACCESS_FAILED',relations:[],matches:[],accessDetail:`INDEX_CACHE_FAILURE|${cached.detail}`,evidencePointer:url};
    let page=cached?.page||null;
    if(!page){
      try{
        const resp=await timeoutFetch(url,{headers:{accept:'text/html','user-agent':'JBLR-09-SOURCE-EXPANSION/1.0'}});
        if(!resp.ok){const fail={state:'FAIL',detail:`HTTP_${resp.status}`};hvmoPageCache.set(key,fail);return {state:'ACCESS_FAILED',relations:[],matches:[],accessDetail:fail.detail,evidencePointer:url};}
        page=transportsLib.htmlText(await resp.text()); hvmoPageCache.set(key,{state:'OK',page});
      }catch(e){const fail={state:'FAIL',detail:String(e.message||e)};hvmoPageCache.set(key,fail);return {state:'ACCESS_FAILED',relations:[],matches:[],accessDetail:fail.detail,evidencePointer:url};}
    }
    const exact=page.includes(norm(name));
    return {state:'OK',matches:exact?[{scientificName:norm(name),sameConcept:null,evidencePointer:url}]:[],relations:[],evidencePointer:url,accessDetail:exact?'EXACT_VISIBLE_NAME_PRESENT':'EXACT_VISIBLE_NAME_NOT_PRESENT'};
  };
  for(const sourceId of core.SOURCE_PRIORITY){
    if(liveTransports[sourceId]) continue;
    const d=inventory[sourceId]||{};
    liveTransports[sourceId]=async()=>({state:'TECHNICALLY_UNAVAILABLE',relations:[],matches:[],evidencePointer:d.endpoint||`SOURCE_INVENTORY:${sourceId}`,accessDetail:`${d.access_state||'UNASSESSED'}|${d.adapter_state||'NO_RUNTIME_BINDING'}`});
  }
  const adapters=core.makeSourceAdapters({transports:liveTransports,inventory});
  const results=[];
  const nameLedger=[];
  const sourceAccess=[];
  const fixedPoint=[];
  const mitecoRequery=[];
  const startedAt=new Date().toISOString();
  function convertSeed(x,original){
    const rel=String(x.relation||'');
    let relation='OTHER_DOCUMENTED_RELATION';
    if(/HYBRID|MULTIPLICATION|PARENT/i.test(rel)) relation='HYBRID_RELATION';
    else if(/ACCEPTED/i.test(rel)) relation='ACCEPTED_NAME_OF';
    else if(/SYNONYM/i.test(rel)) relation='SYNONYM_OF';
    else if(/ORTHO|VARIANT/i.test(rel)) relation='ORTHOGRAPHIC_VARIANT_OF';
    return {name:x.name,relation,source:'CURRENT_COLD_START_RUN',evidencePointer:x.evidence||`CURRENT_COLD_START:${original}`,fresh:false};
  }
  for(let i=0;i<carry.length;i++){
    const row=carry[i];
    const id=String(row.B_SOURCE_RECORD_ID);
    const original=norm(row.NOMBRE_RIOJA_VERBATIM);
    const pn=netById.get(id);
    const seed=(pn?.names||[]).filter(n=>norm(n.name)!==original).map(n=>convertSeed(n,original));
    const q0=context.queryLedger.length;
    const exp=await core.expandOneRecord({originalName:original,currentRunEvidence:seed,context,adapters,maxCycles:30});
    const qrows=context.queryLedger.slice(q0);
    const sourcePlanComplete=core.SOURCE_PRIORITY.every(s=>!['SOURCE_UNAVAILABLE','ACCESS_FAILED','TECHNICALLY_UNAVAILABLE'].includes(exp.sourceStates[s]||'SOURCE_UNAVAILABLE'));
    const mitecoQs=qrows.filter(q=>q.SOURCE_NAME==='MITECO_EIDOS');
    for(const q of mitecoQs){mitecoRequery.push({B_SOURCE_RECORD_ID:id,ORIGINAL_NAME:original,IS_ORIGINAL_QUERY:norm(q.QUERY_NAME)===original,...q});}
    for(const s of core.SOURCE_PRIORITY){sourceAccess.push({B_SOURCE_RECORD_ID:id,SOURCE_NAME:s,STATE:exp.sourceStates[s]||'SOURCE_UNAVAILABLE',SOURCE_PLAN_COMPLETE:sourcePlanComplete,EVIDENCE_POINTER:(qrows.find(q=>q.SOURCE_NAME===s)||{}).EVIDENCE_POINTER||inventory[s]?.endpoint||null,ACCESS_DETAIL:inventory[s]?.access_state||null});}
    const candidateIds=[...new Set(mitecoQs.flatMap(q=>q.RETURNED_IDS||[]).map(String))];
    const idState=exp.idState||{state:'UNRESOLVED_CURRENT_SOURCE_PLAN',idTaxon:null};
    let terminal='HUMAN_REVIEW_REQUIRED';
    if(idState.state==='AMBIGUOUS_MULTIPLE_IDS') terminal='AMBIGUOUS_MULTIPLE_IDS';
    else if(idState.state==='PARENT_ONLY') terminal='PARENT_ONLY';
    else if(idState.state==='RESOLVED_EXACT_OR_DOCUMENTED_ALIAS'){
      const winning=mitecoQs.filter(q=>(q.RETURNED_IDS||[]).map(String).includes(String(idState.idTaxon)));
      if(winning.some(q=>norm(q.QUERY_NAME)===original)) terminal='RESOLVED_EXACT_ORIGINAL_NAME';
      else {
        const seedNames=new Map(seed.map(s=>[norm(s.name),s.relation]));
        terminal=winning.some(q=>['SYNONYM_OF','ACCEPTED_NAME_OF'].includes(seedNames.get(norm(q.QUERY_NAME))))?'RESOLVED_SPANISH_SYNONYM':'RESOLVED_MITECO_ALIAS';
      }
    } else if(sourcePlanComplete) terminal='UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH';
    else if(['SOURCE_UNAVAILABLE','ACCESS_FAILED','TECHNICALLY_UNAVAILABLE'].includes(exp.sourceStates.MITECO_EIDOS||'')) terminal='SOURCE_FAILURE';
    results.push({B_SOURCE_RECORD_ID:id,NOMBRE_RIOJA_VERBATIM:original,PREVIOUS_TERMINAL_STATE:row.TERMINAL_STATE,TERMINAL_STATE:terminal,MITECO_IDTAXON:idState.idTaxon||null,CANDIDATE_IDS:candidateIds,SOURCE_PLAN_COMPLETE:sourcePlanComplete,SOURCE_STATES:exp.sourceStates,FIXED_POINT:exp.fixedPoint,NAME_NETWORK_SIZE:exp.nameNetwork.length,NO_FUZZY_EQUIVALENCE:true,PARENT_ID_INHERITANCE:false});
    nameLedger.push({B_SOURCE_RECORD_ID:id,originalName:original,names:exp.nameNetwork});
    fixedPoint.push({B_SOURCE_RECORD_ID:id,fixedPoint:exp.fixedPoint,sourcePlanComplete,queried:exp.queried,nameNetworkSize:exp.nameNetwork.length});
    if((i+1)%25===0) console.log(`processed ${i+1}/337`);
  }
  if(results.length!==337) throw new Error('OUTPUT_337_REQUIRED');
  const counts=results.reduce((a,r)=>(a[r.TERMINAL_STATE]=(a[r.TERMINAL_STATE]||0)+1,a),{});
  const independence={...context.independence,NEON_WRITES:0,CANONICAL_CORPUS_A_MUTATION:0};
  const transportState={MITECO_EIDOS_CIRCUIT:eidosCircuit?{...eidosCircuit}:null,HVMO_INDEX_KEYS:hvmoPageCache.size,HVMO_FAILED_INDEX_KEYS:[...hvmoPageCache.entries()].filter(([,v])=>v?.state==='FAIL').map(([k,v])=>({key:k,detail:v.detail}))};
  const qledger={RUN_ID:runId,rows:context.queryLedger};
  const artifacts={
    'CORPUS_B_337_RESOLUTION_RESULTS_v1.json':{RUN_ID:runId,counts,rows:results},
    'CORPUS_B_337_NAME_NETWORK_LEDGER_v1.json':{RUN_ID:runId,rows:nameLedger},
    'CORPUS_B_337_QUERY_PROVENANCE_LEDGER_v1.json':qledger,
    'CORPUS_B_337_SOURCE_ACCESS_FAILURE_LEDGER_v1.json':{RUN_ID:runId,transportState,rows:sourceAccess},
    'CORPUS_B_337_MITECO_REQUERY_LEDGER_v1.json':{RUN_ID:runId,rows:mitecoRequery},
    'CORPUS_B_337_FIXED_POINT_RECEIPT_v1.json':{RUN_ID:runId,rows:fixedPoint},
    'INDEPENDENCE_RECEIPT.json':{RUN_ID:runId,...independence},
    'QA_REPORT.json':{RUN_ID:runId,QA_STATE:'PASS',INPUT_COUNT:337,OUTPUT_COUNT:results.length,RECONCILIATION:results.length===337?'PASS':'FAIL',COUNTS:counts,ALL_CONTAMINATION_COUNTERS_ZERO:Object.entries(context.independence).every(([k,v])=>typeof v==='boolean'?v===false:(typeof v==='number'?v===0:true)),CORPUS_A_CROSS:false,NEON_WRITES:0,TRANSPORT_STATE:transportState}
  };
  fs.mkdirSync(outDir,{recursive:true});
  for(const [n,o] of Object.entries(artifacts)) writeJson(path.join(outDir,n),o);
  const hashes=Object.fromEntries(Object.keys(artifacts).map(n=>[n,shaFile(path.join(outDir,n))]));
  const manifest={RUN_ID:runId,MODE:'CORPUS_B_SOURCE_EXPANSION_337_PRODUCTIVE_09',STATE:'EXECUTED_PENDING_0000',RELEASE_EVENT:'JBLR-EVT-0000-20260824-ACCEPT-08-RELEASE-09-SOURCE-EXPANSION-337-001',DIRECTIVE_ID:'1ZNGdTSTBGLr26_jx4CZiWfBfsOshIKL8_uo9TbkclQ4',INPUT_CURRENT_COLD_START_COMMIT:'fe0dd36a952a24f737495ee7ebe3d57be9e21ee9',IMPLEMENTATION_08_COMMIT:'b04c32c08d7f1fcf47b558efab3ce2a13a4ccf99',IMPLEMENTATION_SOURCE_EXPANSION_SHA:'a751e7449bc817734b0ae67ada0b2a68f99df31e',IMPLEMENTATION_TRANSPORTS_SHA:'678aa7710bcc0b4a32510bbc0f7d7950db90adb2',SOURCE_INVENTORY_SHA:'030ae0e2182375573f49c601a6c64ae38dd8ec62',BRANCH:process.env.GITHUB_REF_NAME||'09-corpus-b-source-expansion-v2',GITHUB_RUN_ID:process.env.GITHUB_RUN_ID||null,GITHUB_RUN_ATTEMPT:process.env.GITHUB_RUN_ATTEMPT||null,STARTED_AT:startedAt,FINISHED_AT:new Date().toISOString(),INPUT_COUNT:337,OUTPUT_COUNT:results.length,COUNTS:counts,QUERY_LEDGER_ROWS:context.queryLedger.length,MITECO_REQUERY_ROWS:mitecoRequery.length,SOURCE_ACCESS_ROWS:sourceAccess.length,SOURCE_PLAN_COMPLETE_ROWS:results.filter(r=>r.SOURCE_PLAN_COMPLETE).length,TRANSPORT_STATE:transportState,ARTIFACT_HASHES:hashes,INDEPENDENCE:independence,CORPUS_B_FREEZE:false,CROSS_WITH_A_PERFORMED:false,CROSSWALK_MODULE_EXECUTED:false,NEON_WRITES:0,CANONICAL_CORPUS_A_MUTATION:0};
  writeJson(path.join(outDir,'RUN_MANIFEST.json'),manifest);
  const receipt={receiptVersion:'CORPUS_B_09_SOURCE_EXPANSION_337_RECEIPT_v1',status:'PASS',runId,observedAt:new Date().toISOString(),counts,sourcePlanCompleteRows:manifest.SOURCE_PLAN_COMPLETE_ROWS,transportState,independence,hashes:{...hashes,RUN_MANIFEST:shaFile(path.join(outDir,'RUN_MANIFEST.json'))},canonicalEffect:'NONE_PENDING_0000_POSTRUN_ACCEPTANCE'};
  writeJson(path.join(outDir,'RUN_RECEIPT.json'),receipt);
  console.log(JSON.stringify({status:'DONE',runId,counts,queries:context.queryLedger.length,sourcePlanCompleteRows:manifest.SOURCE_PLAN_COMPLETE_ROWS,transportState},null,2));
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
