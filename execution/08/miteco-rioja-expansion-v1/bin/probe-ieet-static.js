#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');

const URL='https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/bd_ieet_2015_tcm30-207985.zip';
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
function shell(cmd,cwd,maxBuffer=8*1024*1024){const r=cp.spawnSync('bash',['-lc',cmd],{cwd,encoding:'utf8',maxBuffer});return {status:r.status,stdout:(r.stdout||''),stderr:(r.stderr||'').slice(0,20000)};}

async function main(){
  const out=process.argv[2]||path.resolve(__dirname,'../run-control/STATIC_IEET_PROBE_RESULT.json');
  const registryPath=path.resolve(__dirname,'../contracts/rioja-grid-cell-registry-v1.json');
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const selectedCodes=(registry.payload?.cells||[]).map(c=>String(c.code).replace(/\s+/g,'').toUpperCase());
  if(selectedCodes.length!==77) throw new Error('GRID_REGISTRY_UNEXPECTED_COUNT');
  const work=process.env.RUNNER_TEMP?path.join(process.env.RUNNER_TEMP,'jblr-ieet-static-probe'):path.resolve('.tmp-ieet-static-probe');
  fs.rmSync(work,{recursive:true,force:true}); fs.mkdirSync(work,{recursive:true});
  const codesFile=path.join(work,'selected_codes.json'); fs.writeFileSync(codesFile,JSON.stringify(selectedCodes));
  const result={probeVersion:'MITECO_IEET_STATIC_PROBE_v2',sourceUrl:URL,observedAt:new Date().toISOString(),status:'STARTED',semantics:'SCHEMA_AND_SCOPE_PROBE_ONLY; NOT_CURRENT_EIDOS; NO_JBLR_CORPUS_INPUT; NO_OCCURRENCE_ASSERTION'};
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
      for(let i=0;i<tableNames.length;i++){
        const table=tableNames[i];
        const csvFile=path.join(work,`export-${i}.csv`);
        const ex=shell(`mdb-export ${JSON.stringify(db)} ${JSON.stringify(table)} > ${JSON.stringify(csvFile)}`,work,1024*1024);
        if(ex.status!==0){d.tableProbes.push({table,exportStatus:'FAIL',error:ex.stderr});continue;}
        const pyFile=path.join(work,`summary-${i}.json`);
        const py=`import csv,json,collections,sys\n`+
          `csv_file,codes_file,out_file=sys.argv[1:4]\n`+
          `codes=set(json.load(open(codes_file,encoding='utf-8')))\n`+
          `groups=collections.Counter(); kingdoms=collections.Counter(); divisions=collections.Counter(); classes=collections.Counter(); sel_groups=collections.Counter(); sel_kingdoms=collections.Counter(); sel_divisions=collections.Counter(); sel_classes=collections.Counter(); sel_rows=0; total=0; names=set()\n`+
          `with open(csv_file,encoding='utf-8-sig',newline='',errors='replace') as f:\n`+
          ` r=csv.DictReader(f); fields=r.fieldnames or []\n`+
          ` for row in r:\n`+
          `  total+=1\n`+
          `  g=(row.get('Grupo') or '').strip(); k=(row.get('Reino') or '').strip(); d=(row.get('Division') or '').strip(); c=(row.get('Clase') or '').strip(); code=(row.get('CUTM10x10') or '').replace(' ','').upper().strip()\n`+
          `  if g: groups[g]+=1\n`+
          `  if k: kingdoms[k]+=1\n`+
          `  if d: divisions[d]+=1\n`+
          `  if c: classes[c]+=1\n`+
          `  if code in codes:\n`+
          `   sel_rows+=1\n`+
          `   if g: sel_groups[g]+=1\n`+
          `   if k: sel_kingdoms[k]+=1\n`+
          `   if d: sel_divisions[d]+=1\n`+
          `   if c: sel_classes[c]+=1\n`+
          `   n=(row.get('Nombre') or '').strip()\n`+
          `   if n: names.add(n)\n`+
          `res={'columns':fields,'totalRows':total,'overall':{'Grupo':dict(groups),'Reino':dict(kingdoms),'Division':dict(divisions),'Clase':dict(classes)},'selected77':{'rowCount':sel_rows,'uniqueNames':len(names),'Grupo':dict(sel_groups),'Reino':dict(sel_kingdoms),'Division':dict(sel_divisions),'Clase':dict(sel_classes)}}\n`+
          `json.dump(res,open(out_file,'w',encoding='utf-8'),ensure_ascii=False,indent=2)\n`;
        const helper=path.join(work,`analyze-${i}.py`);fs.writeFileSync(helper,py,'utf8');
        const pa=cp.spawnSync('python3',[helper,csvFile,codesFile,pyFile],{cwd:work,encoding:'utf8',maxBuffer:1024*1024});
        if(pa.status!==0){d.tableProbes.push({table,exportStatus:'PASS',analysisStatus:'FAIL',error:(pa.stderr||'').slice(0,20000)});continue;}
        const summary=JSON.parse(fs.readFileSync(pyFile,'utf8'));
        d.tableProbes.push({table,exportStatus:'PASS',analysisStatus:'PASS',...summary});
      }
      result.databases.push(d);
    }
    result.hasReadableDatabase=result.databases.some(d=>d.tables.length>0);
    result.hasSelectedRiojaRows=result.databases.some(d=>d.tableProbes.some(t=>(t.selected77?.rowCount||0)>0));
    result.selectedRiojaGroupLabels=[...new Set(result.databases.flatMap(d=>d.tableProbes.flatMap(t=>Object.keys(t.selected77?.Grupo||{}))))].sort();
    result.selectedRiojaKingdomLabels=[...new Set(result.databases.flatMap(d=>d.tableProbes.flatMap(t=>Object.keys(t.selected77?.Reino||{}))))].sort();
    result.selectedRiojaDivisionLabels=[...new Set(result.databases.flatMap(d=>d.tableProbes.flatMap(t=>Object.keys(t.selected77?.Division||{}))))].sort();
    result.hasExplicitVascularFloraGroup=result.selectedRiojaGroupLabels.some(x=>/flora|plantas? vasculares?/i.test(x));
    result.status='PASS';
  }catch(e){result.status='FAIL';result.error=e.message;}
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,httpStatus:result.httpStatus||null,archiveBytes:result.archiveBytes||null,hasReadableDatabase:result.hasReadableDatabase||false,hasSelectedRiojaRows:result.hasSelectedRiojaRows||false,selectedRiojaGroupLabels:result.selectedRiojaGroupLabels||[],selectedRiojaKingdomLabels:result.selectedRiojaKingdomLabels||[],selectedRiojaDivisionLabels:result.selectedRiojaDivisionLabels||[],hasExplicitVascularFloraGroup:result.hasExplicitVascularFloraGroup||false,out},null,2));
  if(result.status!=='PASS') process.exitCode=2;
}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1);});
