#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ENDPOINT='https://datos.iepnb.es/sparql';
async function q(query,timeoutMs=30000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{const u=new URL(ENDPOINT);u.searchParams.set('query',query);u.searchParams.set('format','application/sparql-results+json');const r=await fetch(u,{signal:c.signal,headers:{accept:'application/sparql-results+json','user-agent':'JBLR-IEPNB-DISTRIBUTIONTYPE/1.0'}});const text=await r.text();if(!r.ok)throw new Error(`HTTP_${r.status}:${text.slice(0,300)}`);return JSON.parse(text)?.results?.bindings||[];}finally{clearTimeout(t);}}
function compact(rows){return rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,{type:v.type,value:v.value,datatype:v.datatype||null,lang:v['xml:lang']||null}])));}
async function main(){const out=process.argv[2]||path.resolve(__dirname,'../run-control/SPARQL_DISTRIBUTIONTYPE_RESULT.json');const taxon='https://datos.iepnb.es/recurso/sector-publico/medio-ambiente/pliniancore/TaxonRecord/854';const dist='https://datos.iepnb.es/recurso/sector-publico/medio-ambiente/pliniancore/DistributionType/854_DISTRIBUTIONTYPE';const defs=[
['distribution_outgoing',`SELECT ?p ?o WHERE { <${dist}> ?p ?o } ORDER BY ?p ?o LIMIT 2000`],
['distribution_incoming',`SELECT ?s ?p WHERE { ?s ?p <${dist}> } ORDER BY ?p ?s LIMIT 2000`],
['distribution_twohop_out',`SELECT ?p ?o ?p2 ?o2 WHERE { <${dist}> ?p ?o . FILTER(isIRI(?o)) OPTIONAL { ?o ?p2 ?o2 } } LIMIT 5000`],
['distribution_twohop_in',`SELECT ?s ?p ?s2 ?p2 WHERE { ?s ?p <${dist}> . OPTIONAL { ?s2 ?p2 ?s } } LIMIT 5000`],
['distribution_literal_gridlike',`SELECT ?s ?p ?o WHERE { <${dist}> (!<urn:never>)* ?s . ?s ?p ?o . FILTER(isLiteral(?o)) FILTER(REGEX(STR(?o), "30T[A-Z]{2}[0-9]{2}", "i")) } LIMIT 5000`],
['taxon_distribution_paths',`SELECT ?p1 ?n1 ?p2 ?n2 ?p3 ?n3 WHERE { <${taxon}> ?p1 ?n1 . FILTER(isIRI(?n1)) OPTIONAL { ?n1 ?p2 ?n2 . FILTER(isIRI(?n2)) OPTIONAL { ?n2 ?p3 ?n3 } } } LIMIT 10000`]
];const probes=[];for(const [name,query] of defs){try{const rows=await q(query);probes.push({name,status:'PASS',rowCount:rows.length,rows:compact(rows)});}catch(e){probes.push({name,status:'FAIL',error:e.message});}}
const result={probeVersion:'IEPNB_EIDOS_DISTRIBUTIONTYPE_v1',endpoint:ENDPOINT,controlTaxon:{idtaxon:'854',taxonUri:taxon,distributionUri:dist},observedAt:new Date().toISOString(),probes,semantics:'SCHEMA_DISCOVERY_ONLY; NO_RIOJA_CORPUS_INPUT; NO_OCCURRENCE_OR_ABSENCE_INFERENCE'};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:'DONE',summary:probes.map(p=>({name:p.name,status:p.status,rowCount:p.rowCount||0})),out},null,2));}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
