#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ENDPOINT='https://datos.iepnb.es/sparql';

async function q(query,timeoutMs=15000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const u=new URL(ENDPOINT);u.searchParams.set('query',query);u.searchParams.set('format','application/sparql-results+json');
    const r=await fetch(u,{signal:c.signal,headers:{accept:'application/sparql-results+json','user-agent':'JBLR-IEPNB-SPARQL-TARGETED/1.0'}});
    const text=await r.text();if(!r.ok)throw new Error(`HTTP_${r.status}:${text.slice(0,300)}`);
    return JSON.parse(text)?.results?.bindings||[];
  }finally{clearTimeout(t);}
}
function compact(rows){return rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,{type:v.type,value:v.value,datatype:v.datatype||null,lang:v['xml:lang']||null}])));}
async function main(){
  const out=process.argv[2]||path.resolve(__dirname,'../run-control/SPARQL_TARGETED_RESULT.json');
  const taxon='https://datos.iepnb.es/recurso/sector-publico/medio-ambiente/pliniancore/TaxonRecord/854';
  const defs=[
    ['taxon854_outgoing',`SELECT ?p ?o WHERE { <${taxon}> ?p ?o } ORDER BY ?p LIMIT 500`],
    ['taxon854_incoming',`SELECT ?s ?p WHERE { ?s ?p <${taxon}> } ORDER BY ?p LIMIT 500`],
    ['taxon854_twohop',`SELECT ?p ?o ?p2 ?o2 WHERE { <${taxon}> ?p ?o . FILTER(isIRI(?o)) OPTIONAL { ?o ?p2 ?o2 } } LIMIT 1000`],
    ['exact_name_astralagus',`SELECT ?s ?p WHERE { ?s ?p "Astragalus devesae" } LIMIT 200`],
    ['grid_predicates_by_known_vocab',`SELECT ?s ?p ?o WHERE { VALUES ?o { "30TWM09" "30TVM99" } ?s ?p ?o } LIMIT 200`]
  ];
  const probes=[];
  for(const [name,query] of defs){try{const rows=await q(query);probes.push({name,status:'PASS',rowCount:rows.length,rows:compact(rows)});}catch(e){probes.push({name,status:'FAIL',error:e.message});}}
  const result={probeVersion:'IEPNB_EIDOS_SPARQL_TARGETED_v1',endpoint:ENDPOINT,controlTaxon:{idtaxon:'854',scientificName:'Astragalus devesae',uri:taxon},observedAt:new Date().toISOString(),probes,semantics:'TARGETED_SCHEMA_DISCOVERY_ONLY; MITECO_PATTERN_LIST_USED_ONLY_TO_SELECT_A_KNOWN_MITECO_ID; NO_RIOJA_CORPUS_INPUT; NO_OCCURRENCE_ASSERTION'};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:'DONE',summary:probes.map(p=>({name:p.name,status:p.status,rowCount:p.rowCount||0})),out},null,2));
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
