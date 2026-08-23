#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {
  buildIndependentCorpus, fetchAllPages, freezeOutputs, sha256Utf8
}=require('../src/miteco-rioja-independent-discovery');

function arg(name, def=null){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:def;}
function has(name){return process.argv.includes(name);}
if (['--rc2','--jblr-corpus','--rioja-corpus'].some(has)) {
  console.error('FORBIDDEN_EXISTING_RIOJA_CORPUS_INPUT'); process.exit(64);
}
const manifestPath=arg('--manifest');
const cachePath=arg('--vascular-cache');
const outDir=arg('--out','artifacts/miteco-rioja-independent-discovery');
const rawDir=arg('--raw-dir');
const live=has('--live');
if(!manifestPath||(!live&&!rawDir)){
  console.error('Usage: --manifest FILE [--vascular-cache FILE] (--live | --raw-dir DIR) [--out DIR]');
  process.exit(64);
}
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const vascularCache=cachePath?JSON.parse(fs.readFileSync(cachePath,'utf8')):null;
(async()=>{
  let pages, sourceMode, bbox=null, rawPageManifest=[];
  if(live){
    sourceMode='LIVE_EIDOS_WFS';
    const rawOut=path.join(outDir,'raw');
    const fetched=await fetchAllPages({manifest,onPage:async({meta,text})=>{
      fs.mkdirSync(rawOut,{recursive:true});
      const file=path.join(rawOut,`page-${String(meta.pageNo).padStart(4,'0')}.json`);
      fs.writeFileSync(file,text,'utf8');
      rawPageManifest.push({...meta,file:path.relative(outDir,file),sha256:sha256Utf8(text)});
    }});
    pages=fetched.pages; bbox=fetched.bbox;
  } else {
    sourceMode='OFFLINE_RAW_EIDOS_PAGES';
    const files=fs.readdirSync(rawDir).filter(f=>f.endsWith('.json')).sort();
    if(!files.length) throw new Error('NO_RAW_PAGES_FOUND');
    pages=files.map(f=>{
      const text=fs.readFileSync(path.join(rawDir,f),'utf8');
      rawPageManifest.push({file:f,sha256:sha256Utf8(text)});
      return JSON.parse(text);
    });
  }
  const result=buildIndependentCorpus({manifest,vascularCache,pages,config:{sourceMode}});
  const frozen=freezeOutputs({outDir,result,runMeta:{sourceMode,bbox,rawPageManifest}});
  console.log(JSON.stringify({status:'PASS',counts:result.counts,runManifestHash:frozen.hashes.runManifest},null,2));
})().catch(e=>{console.error(e.stack||String(e));process.exit(1);});
