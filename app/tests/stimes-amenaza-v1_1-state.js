#!/usr/bin/env node
'use strict';
const assert=require('assert');
const {policy,scopeOf,key,scoreScope,execute}=require('../src/stimes/items/amenaza-v1_1');
assert.deepStrictEqual(policy.effective_scope_order,['La Rioja','España','Europa','Mundial','Subsidiario']);
assert.strictEqual(scopeOf({territory_class:'LA_RIOJA'}),'La Rioja');
assert.strictEqual(scopeOf({territory_class:'SPAIN_NATIONAL'}),'España');
assert.strictEqual(scopeOf({territory_class:'EUROPE_CONTINENTAL_OR_EU27'}),'Europa');
assert.strictEqual(scopeOf({territory_class:'GLOBAL'}),'Mundial');
assert.strictEqual(scopeOf({territory_class:'OTHER_EUROPEAN_COUNTRY'}),'Subsidiario');

const ev=[
 {source_key:'RIOJA',territory_class:'LA_RIOJA',territorial_scope:'La Rioja',category_system:'IUCN',source_reference:'R1',weighted_assessment_score:60,category:'VU',logical_unit:'RIOJA|R1'},
 {source_key:'SPAIN',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_reference:'S1',weighted_assessment_score:90,category:'CR',logical_unit:'SPAIN|S1'},
 {source_key:'EU',territory_class:'EUROPE_CONTINENTAL_OR_EU27',territorial_scope:'Europe',category_system:'IUCN',source_reference:'E1',weighted_assessment_score:95,category:'CR',logical_unit:'EU|E1'}
];
let r=execute({taxon:{universe_index:1,input_taxon:'Synthetic taxon',overall_evidence_state:'VALID_SOURCE_EVIDENCE'},evidence_records:ev,provider_score:88});
assert.strictEqual(r.effective_scope,'La Rioja');
assert.strictEqual(r.score_stimes_100,60);
assert.strictEqual(r.score_numeric_projection_100,60);
assert.strictEqual(r.score_numeric_projection_is_placeholder,false);
assert.strictEqual(r.score_native_05,88);
assert.strictEqual(r.score_state,'SCORED');

r=execute({taxon:{universe_index:2,input_taxon:'Synthetic taxon 2',overall_evidence_state:'VALID_SOURCE_EVIDENCE'},evidence_records:ev.slice(1),provider_score:92});
assert.strictEqual(r.effective_scope,'España');
assert.strictEqual(r.score_stimes_100,90);

const multis=[
 {source_key:'A',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_reference:'A',weighted_assessment_score:80,logical_unit:'A'},
 {source_key:'B',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_reference:'B',weighted_assessment_score:40,logical_unit:'B'},
 {source_key:'C',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_reference:'C',weighted_assessment_score:20,logical_unit:'C'},
 {source_key:'D',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_reference:'D',weighted_assessment_score:10,logical_unit:'D'}
];
const s=scoreScope(multis);
assert.strictEqual(s.score,0.8*80+0.2*((80+40+20)/3));
assert.strictEqual(s.selected.length,3);

r=execute({taxon:{universe_index:3,input_taxon:'Unresolved',overall_evidence_state:'TAXON_UNRESOLVED'},evidence_records:[],provider_score:null});
assert.strictEqual(r.score_state,'TAXON_UNRESOLVED');
assert.strictEqual(r.score_stimes_100,null);
assert.strictEqual(r.score_numeric_projection_100,0);
assert.strictEqual(r.score_numeric_projection_is_placeholder,true);
assert.strictEqual(r.score_numeric_projection_semantics,'TECHNICAL_NON_SEMANTIC_NON_PONDERING');
assert.strictEqual(r.effective_scope,null);

r=execute({taxon:{universe_index:4,input_taxon:'Unknown',overall_evidence_state:'UNKNOWN'},evidence_records:[],provider_score:null});
assert.strictEqual(r.score_state,'UNKNOWN');
assert.strictEqual(r.score_stimes_100,null);
assert.strictEqual(r.score_numeric_projection_100,0);
assert.strictEqual(r.score_numeric_projection_is_placeholder,true);

// Distinct provider logical units sharing the same URL must not be collapsed or flagged as conflict.
const historical=[
 {source_key:'EIDOS',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_identifier:'121',source_url:'https://same.example/api',weighted_assessment_score:57.6,logical_unit:'["EIDOS","España||","UICN","121"]',same_unit_conflict:'NO'},
 {source_key:'EIDOS',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',source_identifier:'126',source_url:'https://same.example/api',weighted_assessment_score:64.8,logical_unit:'["EIDOS","España||","UICN","126"]',same_unit_conflict:'NO'}
];
const h=scoreScope(historical);
assert.strictEqual(h.logical_units,2);
assert.strictEqual(h.conflict,false);
assert.notStrictEqual(key(historical[0]),key(historical[1]));

// A provider-declared true same-unit conflict remains explicit and uses the precautionary maximum.
const conflict=[
 {source_key:'X',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',weighted_assessment_score:20,logical_unit:'X|same',same_unit_conflict:'YES'},
 {source_key:'X',territory_class:'SPAIN_NATIONAL',territorial_scope:'España',category_system:'IUCN',weighted_assessment_score:80,logical_unit:'X|same',same_unit_conflict:'YES'}
];
r=execute({taxon:{universe_index:5,input_taxon:'Conflict',overall_evidence_state:'VALID_SOURCE_EVIDENCE'},evidence_records:conflict,provider_score:50});
assert.strictEqual(r.score_stimes_100,80);
assert.strictEqual(r.score_state,'SCORED_WITH_CONFLICT');

console.log('STIMES_AMENAZA_V1_1_CANONICAL_HIERARCHY_ZERO_PROJECTION_AND_LOGICAL_UNIT_PASS');
