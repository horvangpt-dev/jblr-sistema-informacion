#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');

const ENDPOINT='https://datos.iepnb.es/sparql';

async function querySparql(query, timeoutMs=60000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const u=new URL(ENDPOINT);
    u.searchParams.set('query',query);
    u.searchParams.set('format','application/sparql-results+json');
    const r=await fetch(u,{signal:controller.signal,headers:{accept:'application/sparql-results+json,application/json;q=0.9,*/*;q=0.5','user-agent':'JBLR-IEPNB-SPARQL-PROBE/1.0'}});
    const text=await r.text();
    if(!r.ok) throw new Error(`SPARQL_HTTP_${r.status}:${text.slice(0,300)}`);
    let json;
    try{json=JSON.parse(text);}catch{throw new Error(`SPARQL_NON_JSON:${text.slice(0,300)}`);}
    return json;
  }finally{clearTimeout(timer);}
}

function bindings(json){return json?.results?.bindings || [];}
function compact(rows){return rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v.value])));}

async function main(){
  const out=process.argv[2] || path.resolve(__dirname,'../run-control/SPARQL_PROBE_RESULT.json');
  const probes=[];
  const definitions=[
    ['endpoint_basic',`SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1`],
    ['plinian_predicates',`PREFIX plinian:<https://datos.iepnb.es/def/sector-publico/medio-ambiente/pliniancore#> SELECT DISTINCT ?p WHERE { ?s ?p ?o . FILTER(STRSTARTS(STR(?p), STR(plinian:))) } ORDER BY ?p LIMIT 300`],
    ['distribution_like_predicates',`SELECT DISTINCT ?p WHERE { ?s ?p ?o . FILTER(REGEX(STR(?p), 'distrib|grid|cuad|spatial|range', 'i')) } ORDER BY ?p LIMIT 300`],
    ['rioja_cell_literal',`SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(STR(?o) = '30TWM09' || CONTAINS(STR(?s),'30TWM09') || CONTAINS(STR(?o),'30TWM09')) } LIMIT 200`],
    ['rioja_cell_partial_literal',`SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(STR(?o) = '30TVM99' || CONTAINS(STR(?s),'30TVM99') || CONTAINS(STR(?o),'30TVM99')) } LIMIT 100`],
    ['taxon_record_sample',`PREFIX plinian:<https://datos.iepnb.es/def/sector-publico/medio-ambiente/pliniancore#> SELECT ?taxonRecord ?id ?p ?o WHERE { ?taxonRecord plinian:TaxonRecordID ?id ; ?p ?o . } LIMIT 200`]
  ];
  for(const [name,q] of definitions){
    try{
      const j=await querySparql(q);
      const rows=compact(bindings(j));
      probes.push({name,status:'PASS',rowCount:rows.length,rows});
    }catch(e){probes.push({name,status:'FAIL',error:e.message});}
  }
  const result={
    probeVersion:'IEPNB_EIDOS_SPARQL_PROBE_v1',
    endpoint:ENDPOINT,
    observedAt:new Date().toISOString(),
    probes,
    semantics:'DISCOVERY_PROBE_ONLY; NO_JBLR_CORPUS_INPUT; NO_OCCURRENCE_ASSERTION'
  };
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  const pass=probes.filter(p=>p.status==='PASS').length;
  console.log(JSON.stringify({status:pass? 'PASS_WITH_RESULTS':'FAIL',passed:pass,total:probes.length,out},null,2));
  if(!pass) process.exitCode=2;
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
