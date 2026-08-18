'use strict';
const assert=require('assert');
const fs=require('fs'); const os=require('os'); const path=require('path');
const x=require('./stimes-rep-ex-situ-taxon-bank-executor-v1.js');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rep-ex-situ-v1-'));
const universe=[
  {taxon_id:'T1',taxon_name:'Taxon alpha',authorized_synonyms:['Alpha old'],family:'A'},
  {taxon_id:'T2',taxon_name:'Taxon beta',authorized_synonyms:[],family:'B'},
  {taxon_id:'T3',taxon_name:'Taxon gamma',authorized_synonyms:[],family:'C'}
];
const banks=[
  {BANK_ID:'B1',denominator_eligible:true,estado:'CONFIRMADO_ACTIVO',trabaja_flora_silvestre:true},
  {BANK_ID:'B2',denominator_eligible:true,estado:'CONFIRMADO_ACTIVO',trabaja_flora_silvestre:true}
];
const rows1=[
  {scientificName:'Alpha old',catalogNumber:'A1',institutionCode:'I1',countryCode:'ES',stateProvince:'La Rioja',municipality:'M1',locality:'L1',decimalLatitude:42.1,decimalLongitude:-2.5},
  {scientificName:'Taxon beta',catalogNumber:'B1',institutionCode:'I1',countryCode:'ES',stateProvince:'Madrid',municipality:'M2',locality:'L2',decimalLatitude:40.4,decimalLongitude:-3.7}
];
const rows2=[
  {scientificName:'Taxon beta',catalogNumber:'B2',institutionCode:'I2',countryCode:'ES',stateProvince:'Madrid',municipality:'M3',locality:'L3',decimalLatitude:40.5,decimalLongitude:-3.6},
  {scientificName:'Taxon gamma',catalogNumber:'G1',institutionCode:'I2',countryCode:'ES',stateProvince:'Asturias',municipality:'M4',locality:'L4',decimalLatitude:43.3,decimalLongitude:-5.8}
];
fs.writeFileSync(path.join(tmp,'b1.jsonl'),rows1.map(JSON.stringify).join('\n'));
fs.writeFileSync(path.join(tmp,'b2.jsonl'),rows2.map(JSON.stringify).join('\n'));
const manifest={run_id:'TEST',target_snapshot_id:'TEST_SNAPSHOT',sources:[
  {BANK_ID:'B1',source_name:'S1',snapshot_path:'b1.jsonl',snapshot_format:'jsonl',snapshot_complete_for_holdings:true,current_holding_snapshot:true,bank_current_active_verified:true,snapshot_date:'2026-08-18'},
  {BANK_ID:'B2',source_name:'S2',snapshot_path:'b2.jsonl',snapshot_format:'jsonl',snapshot_complete_for_holdings:true,current_holding_snapshot:true,bank_current_active_verified:true,snapshot_date:'2026-08-18'}
]};
let freezeCalls=0;
const core={
  computeRepresentation({taxon,bankChecks,accessions,frozenSnapshot}){
    const locs=new Set(accessions.map(a=>`${a.municipio}|${a.locality_literal}`).filter(Boolean));
    return {subject:taxon,state:frozenSnapshot?'FINAL':'MODEL_SCALE_NOT_FROZEN',n_accesiones_independientes:accessions.length,n_poblaciones_representadas:locs.size,bankChecks};
  },
  freezeModelSnapshot({taxonResults}){
    freezeCalls++; assert(taxonResults.every(r=>r.state==='FINAL'));
    return {status:'FROZEN',P99_A:2,P99_P:2,snapshot_id:'TEST_SNAPSHOT'};
  }
};
const complete=x.runFullUniverse({universe,registry:{active_universe_complete:true,banks},sourceManifest:manifest,baseDir:tmp,core,updatedAt:'2026-08-18'});
assert.equal(complete.all_taxa_matrix_complete,true); assert.equal(complete.model_scale_frozen,true); assert.equal(freezeCalls,1);
assert.equal(complete.matrix[0].bankChecks[0].state,'COMPROBADO_CON_ACCESION'); assert.equal(complete.matrix[0].bankChecks[1].state,'COMPROBADO_SIN_ACCESION');
assert.equal(complete.matrix[0].accessions[0].matched_taxon_name,'Alpha old');
const incompleteManifest=JSON.parse(JSON.stringify(manifest)); incompleteManifest.sources[1].snapshot_complete_for_holdings=false;
const incomplete=x.runFullUniverse({universe,registry:{active_universe_complete:true,banks},sourceManifest:incompleteManifest,baseDir:tmp,core,updatedAt:'2026-08-18'});
assert.equal(incomplete.all_taxa_matrix_complete,false); assert.equal(incomplete.model_scale_frozen,false); assert.equal(incomplete.matrix[0].bankChecks[1].state,'BANCO_NO_COMPROBADO_PARA_EL_TAXON'); assert.equal(freezeCalls,1);
const incompleteUniverse=x.runFullUniverse({universe,registry:{active_universe_complete:false,banks},sourceManifest:manifest,baseDir:tmp,core,updatedAt:'2026-08-18'});
assert.equal(incompleteUniverse.all_taxa_matrix_complete,true); assert.equal(incompleteUniverse.model_scale_frozen,false); assert.equal(freezeCalls,1);
console.log('STIMES_REP_EX_SITU_TAXON_BANK_EXECUTOR_V1_SELFTEST_PASS');
