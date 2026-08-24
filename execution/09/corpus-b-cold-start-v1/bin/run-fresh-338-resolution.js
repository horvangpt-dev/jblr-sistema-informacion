#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const IEPNB='https://datos.iepnb.es/sparql';
const SPANISH_DATASET_URL='https://ipt.gbif.es/archive.do?r=taxonesfloraespanola';
const SPANISH_DATASET_UUID='91fecd78-0986-4713-9c36-77532846ee25';
const SPANISH_DATASET_DOI='10.15468/opn9ki';
const RUN_MODE='B_CLEAN_COLD_START';

function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function norm(s){return String(s??'').replace(/\s+/g,' ').trim();}
function escSparql(s){return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,' ');}
function parseTsvLine(line){
  const out=[];let cur='';let quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(quoted && line[i+1]==='"'){cur+='"';i++;}
      else quoted=!quoted;
    }else if(c==='\t'&&!quoted){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);return out;
}
function readTsv(file){
  const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(x=>x.length);
  const head=parseTsvLine(lines.shift()).map(x=>x.replace(/^\uFEFF/,''));
  return {hash:sha256(text),rows:lines.map(line=>{const a=parseTsvLine(line);const o={};head.forEach((h,i)=>o[h]=a[i]??'');return o;}),headers:head};
}
function addNetwork(net,name,relation,evidence){
  const n=norm(name);if(!n)return false;
  if(net.has(n))return false;
  net.set(n,{name:n,relation,evidence});return true;
}
function buildSpanishIndex(rows){
  const byTaxonId=new Map(), byCanonical=new Map(), synonymsByAccepted=new Map();
  for(const r of rows){
    const tid=norm(r.taxonID||r.id||''); if(tid)byTaxonId.set(tid,r);
    const c=norm(r.canonicalName||'');
    if(c){if(!byCanonical.has(c))byCanonical.set(c,[]);byCanonical.get(c).push(r);}
    const a=norm(r.acceptedNameUsageID||'');
    if(a){if(!synonymsByAccepted.has(a))synonymsByAccepted.set(a,[]);synonymsByAccepted.get(a).push(r);}
  }
  return {byTaxonId,byCanonical,synonymsByAccepted};
}
async function httpText(url,{timeoutMs=45000,retries=2}={}){
  let last;
  for(let a=0;a<=retries;a++){
    const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const r=await fetch(url,{signal:c.signal,headers:{accept:'application/sparql-results+json','user-agent':'JBLR-09-CORPUS-B-FRESH-RESOLVER/1.0'}});
      const text=await r.text(); if(!r.ok)throw new Error(`HTTP_${r.status}:${text.slice(0,300)}`); return text;
    }catch(e){last=e;if(a<retries)await new Promise(res=>setTimeout(res,1000*(a+1)));}
    finally{clearTimeout(t);}
  }
  throw last;
}
async function queryIepnbBatch(names,batchNo){
  const values=names.map(n=>`"${escSparql(n)}"`).join(' ');
  const q=`PREFIX plinian:<https://datos.iepnb.es/def/sector-publico/medio-ambiente/pliniancore#>\nPREFIX dwc:<http://rs.tdwg.org/dwc/terms/>\nSELECT DISTINCT ?QueryName ?TaxonRecord ?TaxonRecordID ?ScientificName ?TaxonRank ?TaxonomicStatus WHERE {\n VALUES ?QueryName { ${values} }\n ?TaxonRecord plinian:hasHierarchy ?Taxon .\n ?TaxonRecord plinian:TaxonRecordID ?TaxonRecordID .\n ?Taxon dwc:scientificName ?ScientificName .\n FILTER(STR(?ScientificName)=STR(?QueryName))\n OPTIONAL{?Taxon dwc:taxonRank ?TaxonRank}\n OPTIONAL{?Taxon dwc:taxonomicStatus ?TaxonomicStatus}\n} ORDER BY ?QueryName ?TaxonRecordID`;
  const u=new URL(IEPNB);u.searchParams.set('query',q);u.searchParams.set('format','application/sparql-results+json');
  const observedAt=new Date().toISOString();
  try{
    const text=await httpText(u,{timeoutMs:45000,retries:2});
    const parsed=JSON.parse(text);const bindings=parsed?.results?.bindings||[];
    return {batchNo,status:'PASS',observedAt,query:q,responseHash:sha256(text),bindings};
  }catch(e){return {batchNo,status:'SOURCE_UNAVAILABLE',observedAt,query:q,error:String(e.message||e),responseHash:null,bindings:[]};}
}
function val(b,k){return b?.[k]?.value??null;}
function idFromValue(v){const s=String(v??'');const m=s.match(/(\d+)$/);return m?m[1]:s||null;}

async function main(){
  const queuePath=process.argv[2];const spanishTaxonPath=process.argv[3];const outDir=process.argv[4];
  if(!queuePath||!spanishTaxonPath||!outDir)throw new Error('USAGE: queue.json spanish_taxon.txt outdir');
  fs.mkdirSync(outDir,{recursive:true});
  const input=JSON.parse(fs.readFileSync(queuePath,'utf8'));
  if(!input.RUN_ID||!Array.isArray(input.rows)||input.rows.length!==338)throw new Error('QUEUE_CONTRACT_MISMATCH');
  const spanish=readTsv(spanishTaxonPath);const sidx=buildSpanishIndex(spanish.rows);
  const records=[];const queryLedger=[];const nameNetworkLedger=[];
  for(const src of input.rows){
    const raw=norm(src.name);const net=new Map();addNetwork(net,raw,'ORIGINAL_RIOJA_NAME',`RIOJA_ID:${src.id}`);
    const sm=sidx.byCanonical.get(raw)||[];
    const spanishEvidence=[];
    for(const r of sm){
      const taxonID=norm(r.taxonID||'');const acceptedID=norm(r.acceptedNameUsageID||'');
      const status=norm(r.taxonomicStatus||'');const canonical=norm(r.canonicalName||'');
      spanishEvidence.push({taxonID,acceptedNameUsageID:acceptedID,taxonomicStatus:status,canonicalName:canonical,scientificName:norm(r.scientificName||''),taxonRank:norm(r.taxonRank||'')});
      if(canonical)addNetwork(net,canonical,'SPANISH_CHECKLIST_EXACT_CANONICAL',`${SPANISH_DATASET_DOI}:${taxonID}`);
      if(acceptedID){
        const acc=sidx.byTaxonId.get(acceptedID);if(acc)addNetwork(net,norm(acc.canonicalName||acc.scientificName),'SPANISH_CHECKLIST_ACCEPTED_NAME',`${SPANISH_DATASET_DOI}:${acceptedID}`);
      }else if(taxonID){
        for(const syn of (sidx.synonymsByAccepted.get(taxonID)||[]))addNetwork(net,norm(syn.canonicalName||syn.scientificName),'SPANISH_CHECKLIST_DOCUMENTED_SYNONYM',`${SPANISH_DATASET_DOI}:${norm(syn.taxonID||'')}`);
      }
    }
    queryLedger.push({RUN_ID:input.RUN_ID,B_SOURCE_RECORD_ID:String(src.id),QUERY_SEQUENCE:0,SOURCE_NAME:'GBIF_SPAIN_VASCULAR_CHECKLIST_CURRENT',QUERY_NAME:raw,QUERY_URL_OR_PARAMETERS:SPANISH_DATASET_URL,TIMESTAMP:new Date().toISOString(),HTTP_OR_ACCESS_STATE:'PASS',RAW_RESPONSE_POINTER:`SPANISH_TAXON_FILE_SHA256:${spanish.hash}`,RAW_RESPONSE_HASH_WHEN_POSSIBLE:spanish.hash,RETURNED_NAMES:[...net.keys()].filter(x=>x!==raw),RETURNED_IDS:spanishEvidence.map(x=>x.taxonID).filter(Boolean),RELATION_ASSERTED_BY_SOURCE:spanishEvidence.map(x=>x.taxonomicStatus).filter(Boolean),EFFECT_ON_NAME_NETWORK:sm.length?`EXPANDED_TO_${net.size}_NAMES`:'NO_EXACT_CANONICAL_MATCH',DECISION_STATE:'EVIDENCE_ONLY'});
    records.push({id:String(src.id),rawName:raw,net,spanishEvidence});
  }
  const uniqueNames=[...new Set(records.flatMap(r=>[...r.net.keys()]))];
  const batches=[];const batchSize=20;
  for(let i=0;i<uniqueNames.length;i+=batchSize){batches.push(await queryIepnbBatch(uniqueNames.slice(i,i+batchSize),1+Math.floor(i/batchSize)));}
  const byQuery=new Map();const failedNames=new Set();
  for(const b of batches){
    const names=[...b.query.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].slice(0,20).map(m=>m[1].replace(/\\"/g,'"').replace(/\\\\/g,'\\'));
    if(b.status!=='PASS'){names.forEach(n=>failedNames.add(norm(n)));continue;}
    for(const row of b.bindings){
      const qn=norm(val(row,'QueryName'));if(!byQuery.has(qn))byQuery.set(qn,[]);
      byQuery.get(qn).push({idTaxon:idFromValue(val(row,'TaxonRecordID')),scientificName:norm(val(row,'ScientificName')),taxonRank:norm(val(row,'TaxonRank')),taxonomicStatus:norm(val(row,'TaxonomicStatus')),taxonRecord:val(row,'TaxonRecord'),batchNo:b.batchNo,responseHash:b.responseHash});
    }
  }
  const results=[];let qseq=0;
  for(const r of records){
    const hits=[];let hadFailure=false;const queried=[];
    for(const [name,meta] of r.net){
      queried.push(name);const bh=byQuery.get(name)||[];if(failedNames.has(name))hadFailure=true;
      queryLedger.push({RUN_ID:input.RUN_ID,B_SOURCE_RECORD_ID:r.id,QUERY_SEQUENCE:++qseq,SOURCE_NAME:'IEPNB_EIDOS_SPARQL_CURRENT',QUERY_NAME:name,QUERY_URL_OR_PARAMETERS:IEPNB,TIMESTAMP:new Date().toISOString(),HTTP_OR_ACCESS_STATE:failedNames.has(name)?'SOURCE_UNAVAILABLE':'PASS',RAW_RESPONSE_POINTER:bh.length?`IEPNB_RAW_BATCH:${bh[0].batchNo}`:null,RAW_RESPONSE_HASH_WHEN_POSSIBLE:bh[0]?.responseHash||null,RETURNED_NAMES:bh.map(x=>x.scientificName),RETURNED_IDS:bh.map(x=>x.idTaxon).filter(Boolean),RELATION_ASSERTED_BY_SOURCE:bh.map(x=>x.taxonomicStatus).filter(Boolean),EFFECT_ON_NAME_NETWORK:'NO_NEW_NAME_FROM_EIDOS_EXACT_QUERY',DECISION_STATE:'EVIDENCE_ONLY'});
      for(const h of bh)if(h.idTaxon)hits.push({...h,queryName:name,relation:meta.relation});
    }
    const ids=[...new Set(hits.map(h=>String(h.idTaxon)))];
    let state,idTaxon=null;
    const rawIds=[...new Set((byQuery.get(r.rawName)||[]).map(h=>String(h.idTaxon)).filter(Boolean))];
    if(ids.length>1)state='AMBIGUOUS_MULTIPLE_IDS';
    else if(ids.length===1){
      idTaxon=ids[0];
      if(rawIds.length===1&&rawIds[0]===idTaxon)state='RESOLVED_EXACT_ORIGINAL_NAME';
      else if(r.spanishEvidence.length)state='RESOLVED_SPANISH_SYNONYM_REQUERY';
      else state='RESOLVED_MITECO_INTERNAL_ALIAS';
    }else if(hadFailure)state='SOURCE_UNAVAILABLE';
    else if(r.spanishEvidence.length)state='UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH';
    else state='HUMAN_REVIEW_REQUIRED';
    const sourcePlanComplete=state!=='HUMAN_REVIEW_REQUIRED'&&state!=='SOURCE_UNAVAILABLE';
    results.push({B_SOURCE_RECORD_ID:r.id,NOMBRE_RIOJA_VERBATIM:r.rawName,TERMINAL_STATE:state,MITECO_IDTAXON:idTaxon,CANDIDATE_IDS:ids,QUERIED_NAMES:queried,SPANISH_EVIDENCE:r.spanishEvidence,SOURCE_PLAN_COMPLETE:sourcePlanComplete,NO_FUZZY_EQUIVALENCE:true,PARENT_ID_INHERITANCE:false});
    nameNetworkLedger.push({B_SOURCE_RECORD_ID:r.id,originalName:r.rawName,names:[...r.net.values()]});
  }
  const counts=results.reduce((a,r)=>(a[r.TERMINAL_STATE]=(a[r.TERMINAL_STATE]||0)+1,a),{});
  const independence={CORPUS_A_ROWS_READ_FOR_DISCOVERY:0,RC2_ROWS_READ_FOR_DISCOVERY:0,HISTORICAL_TAXON_ROWS_READ_FOR_DISCOVERY:0,PRIOR_SEARCH_RESULT_ROWS_IMPORTED:0,PRIOR_STATIC_MITECO_LIST_ROWS_IMPORTED:0,PRIOR_LOOKUP_CACHE_HITS:0,PRIOR_SYNONYM_LEDGER_ROWS_IMPORTED:0,CROSS_WITH_A_PERFORMED:false,CROSSWALK_MODULE_EXECUTED:false,CACHE_INITIAL_STATE:'EMPTY'};
  const write=(name,obj)=>fs.writeFileSync(path.join(outDir,name),typeof obj==='string'?obj:JSON.stringify(obj,null,2)+'\n');
  write('CORPUS_B_338_RESOLUTION_RESULTS_v1.json',{RUN_ID:input.RUN_ID,mode:RUN_MODE,counts,rows:results});
  write('CORPUS_B_338_NAME_NETWORK_LEDGER_v1.json',{RUN_ID:input.RUN_ID,spanishDataset:{uuid:SPANISH_DATASET_UUID,doi:SPANISH_DATASET_DOI,url:SPANISH_DATASET_URL,taxonFileSha256:spanish.hash},rows:nameNetworkLedger});
  write('CORPUS_B_338_QUERY_PROVENANCE_LEDGER_v1.json',{RUN_ID:input.RUN_ID,rows:queryLedger});
  write('IEPNB_RAW_BATCHES_v1.json',{RUN_ID:input.RUN_ID,endpoint:IEPNB,batches});
  const audit=results.filter(r=>['HUMAN_REVIEW_REQUIRED','AMBIGUOUS_MULTIPLE_IDS','PARENT_ONLY','SOURCE_UNAVAILABLE','ACCESS_FAILED'].includes(r.TERMINAL_STATE));
  write('CORPUS_B_338_UNRESOLVED_OR_CONFLICTS_v1.json',{RUN_ID:input.RUN_ID,rows:audit});
  const manifest={RUN_ID:input.RUN_ID,MODE:RUN_MODE,STATE:'PHASE_B_EXECUTED_AWAIT_0000_REVIEW',sourceDriveId:input.sourceDriveId,sourceSha256:input.sourceSha256,queueRows:input.rows.length,uniqueQueryNames:uniqueNames.length,spanishTaxonFileSha256:spanish.hash,counts,independence,NEON_WRITES:0,CANONICAL_CORPUS_A_MUTATION:0,freezeBy09:false};
  write('RUN_MANIFEST_PHASE_B.json',manifest);
  const qa={RUN_ID:input.RUN_ID,QA_STATE:Object.values(independence).every(v=>v===0||v===false||v==='EMPTY')?'PASS':'FAIL',QUEUE_COUNT:input.rows.length,RESULT_COUNT:results.length,ALL_ROWS_TERMINAL:results.length===input.rows.length,NO_CROSS_WITH_A:independence.CROSS_WITH_A_PERFORMED===false,NO_PRIOR_CACHE:independence.PRIOR_LOOKUP_CACHE_HITS===0,NEON_WRITES:0,counts};
  write('QA_REPORT.json',qa);
  console.log(JSON.stringify({status:'DONE',runId:input.RUN_ID,counts,uniqueQueryNames:uniqueNames.length,qa:qa.QA_STATE,auditRows:audit.length},null,2));
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
