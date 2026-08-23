#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');

const URL='https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/bd_ieet_2015_tcm30-207985.zip';
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
function shell(cmd,cwd){const r=cp.spawnSync('bash',['-lc',cmd],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});return {status:r.status,stdout:(r.stdout||'').slice(0,200000),stderr:(r.stderr||'').slice(0,20000)};}

async function main(){
  const out=process.argv[2]||path.resolve(__dirname,'../run-control/STATIC_IEET_PROBE_RESULT.json');
  const work=process.env.RUNNER_TEMP?path.join(process.env.RUNNER_TEMP,'jblr-ieet-static-probe'):path.resolve('.tmp-ieet-static-probe');
  fs.rmSync(work,{recursive:true,force:true}); fs.mkdirSync(work,{recursive:true});
  const result={probeVersion:'MITECO_IEET_STATIC_PROBE_v1',sourceUrl:URL,observedAt:new Date().toISOString(),status:'STARTED',semantics:'SCHEMA_PROBE_ONLY; NOT_CURRENT_EIDOS; NO_JBLR_CORPUS_INPUT; NO_OCCURRENCE_ASSERTION'};
  try{
    const r=await fetch(URL,{headers:{'user-agent':'Mozilla/5.0 JBLR/1.0','accept':'application/zip,application/octet-stream;q=0.9,*/*;q=0.5','referer':'https://www.miteco.gob.es/'}});
    result.httpStatus=r.status;
    if(!r.ok) throw new Error(`STATIC_SOURCE_HTTP_${r.status}`);
    const buf=Buffer.from(await r.arrayBuffer());
    result.archiveBytes=buf.length; result.archiveSha256=sha256(buf);
    const zip=path.join(work,'bd_ieet.zip'); fs.writeFileSync(zip,buf);
    const listing=shell(`unzip -Z1 ${JSON.stringify(zip)}`,work);
    result.archiveFiles=listing.stdout.split(/\r?\n/).filter(Boolean).slice(0,500);
    const unzip=shell(`unzip -oq ${JSON.stringify(zip)} -d extracted`,work);
    if(unzip.status!==0) throw new Error(`UNZIP_FAILED:${unzip.stderr}`);
    const dbfind=shell(`find extracted -type f \\( -iname '*.mdb' -o -iname '*.accdb' \\) -print`,work);
    result.databaseFiles=dbfind.stdout.split(/\r?\n/).filter(Boolean);
    result.databases=[];
    for(const rel of result.databaseFiles){
      const db=path.join(work,rel);
      const tables=shell(`mdb-tables -1 ${JSON.stringify(db)}`,work);
      const tableNames=tables.stdout.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const d={file:rel,tables:tableNames,tableProbes:[]};
      for(const table of tableNames.slice(0,30)){
        const qdb=JSON.stringify(db), qt=JSON.stringify(table);
        const sample=shell(`mdb-export ${qdb} ${qt} | head -n 30`,work);
        const plant=shell(`mdb-export ${qdb} ${qt} | grep -Eim 30 'planta|flora|vascular|pterid|magnoli|angiosper|gymnosper' || true`,work);
        d.tableProbes.push({table,sample:sample.stdout.slice(0,30000),plantKeywordMatches:plant.stdout.slice(0,30000)});
      }
      result.databases.push(d);
    }
    result.hasReadableDatabase=result.databases.some(d=>d.tables.length>0);
    result.hasPlantKeywordEvidence=result.databases.some(d=>d.tableProbes.some(t=>t.plantKeywordMatches.trim().length>0));
    result.status='PASS';
  }catch(e){result.status='FAIL';result.error=e.message;}
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,httpStatus:result.httpStatus||null,archiveBytes:result.archiveBytes||null,databaseFiles:result.databaseFiles||[],hasReadableDatabase:result.hasReadableDatabase||false,hasPlantKeywordEvidence:result.hasPlantKeywordEvidence||false,out},null,2));
  if(result.status!=='PASS') process.exitCode=2;
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
