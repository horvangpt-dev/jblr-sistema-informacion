#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ENDPOINT='https://datos.iepnb.es/sparql';
const BASE='https://datos.iepnb.es/recurso/sector-publico/medio-ambiente/pliniancore/';
async function q(query,timeoutMs=20000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const u=new URL(ENDPOINT); u.searchParams.set('query',query); u.searchParams.set('format','application/sparql-results+json');
    const r=await fetch(u,{signal:c.signal,headers:{accept:'application/sparql-results+json','user-agent':'JBLR-IEPNB-ID-RESOLVER/1.0'}});
    const text=await r.text(); if(!r.ok) throw new Error(`HTTP_${r.status}:${text.slice(0,300)}`);
    return JSON.parse(text)?.results?.bindings||[];
  } finally { clearTimeout(t); }
}
function simple(rows){return rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v.value])));}
async function main(){
  const requestPath=process.argv[2]||path.resolve(__dirname,'../run-control/SPARQL_ID_RESOLUTION_REQUEST.json');
  const out=process.argv[3]||path.resolve(__dirname,'../run-control/SPARQL_ID_RESOLUTION_RESULT.json');
  const req=JSON.parse(fs.readFileSync(requestPath,'utf8'));
  if(req.crossWithJblr!==false) throw new Error('CROSS_WITH_JBLR_MUST_BE_FALSE');
  const ids=(req.idtaxon||[]).map(String);
  if(!ids.length) throw new Error('NO_IDS_REQUESTED');
  const results=[];
  for(const id of ids){
    const tr=`${BASE}TaxonRecord/${id}`;
    let outgoing=[],hierarchy=[];
    try{outgoing=simple(await q(`SELECT ?p ?o WHERE { <${tr}> ?p ?o } ORDER BY ?p LIMIT 500`));}catch(e){results.push({idtaxon:id,status:'SOURCE_QUERY_FAIL',error:e.message});continue;}
    const h=outgoing.find(x=>/hasHierarchy$/i.test(x.p));
    if(h?.o){try{hierarchy=simple(await q(`SELECT ?p ?o WHERE { <${h.o}> ?p ?o } ORDER BY ?p LIMIT 500`));}catch(e){hierarchy=[{error:e.message}];}}
    const group=(outgoing.find(x=>/grupoTaxonomico$/i.test(x.p))||{}).o||null;
    const candidateNameFacts=hierarchy.filter(x=>x.o && /(scientific|name|nombre|canonical|accepted|taxon)/i.test(x.p));
    results.push({idtaxon:id,status:'PASS',taxonRecordUri:tr,grupoTaxonomico:group,hierarchyUri:h?.o||null,candidateNameFacts,outgoing,hierarchy});
  }
  const result={resolverVersion:'IEPNB_EIDOS_EXACT_ID_RESOLVER_v1',endpoint:ENDPOINT,observedAt:new Date().toISOString(),requestId:req.requestId||null,ids,results,semantics:'EXACT_ID_RESOLUTION_ONLY; NO_RIOJA_OR_JBLR_CORPUS_INPUT; NO_NAME_MATCH_DISCOVERY'};
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:'DONE',ids,summary:results.map(r=>({idtaxon:r.idtaxon,status:r.status,grupoTaxonomico:r.grupoTaxonomico,candidateNameFacts:r.candidateNameFacts?.length||0}))},null,2));
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
