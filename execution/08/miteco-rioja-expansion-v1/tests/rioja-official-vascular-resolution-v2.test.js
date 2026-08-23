'use strict';
const assert=require('assert');
const M=require('../src/rioja-official-vascular-resolution-v2');
let pass=0;function t(name,fn){fn();pass++;console.log('PASS',name);}
function rec(name='Taxon alpha',rank='species'){return M.makeRecord({RIOJA_ID:'R1',NOMBRE_RIOJA_VERBATIM:name,RANK_RIOJA_VERBATIM:rank},'row:1','a'.repeat(64));}
t('1 direct ID closes and preserves row',()=>{let r=rec();assert(M.directStage(r,{MITECO_IDTAXON:'2443'}));assert.equal(r.resolution_status,M.STATUSES.DIRECT);assert.equal(r.rioja_id,'R1');});
t('2 unresolved direct enters aliases',()=>{let r=rec();assert(!M.directStage(r,{}));assert.deepEqual(M.uniqueQueryNames(r),['Taxon alpha']);});
t('3 Spanish source priority',()=>assert(M.SOURCE_PRIORITY.indexOf('ANTHOS')<M.SOURCE_PRIORITY.indexOf('POWO_WCVP')));
t('4 documented synonym promoted',()=>{let r=rec();assert(M.addRelation(r,{source:'ANTHOS',query_name:'Taxon alpha',returned_name:'Taxon beta',relation:'SYNONYM_OF',evidence_pointer:'e:1'}));assert(M.uniqueQueryNames(r).includes('Taxon beta'));});
t('5 similarity not promoted',()=>{let r=rec();assert(!M.addRelation(r,{source:'WEB',returned_name:'Taxon alfa',relation:'FUZZY_MATCH'}));});
t('6 query once per version',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'Taxon alpha',result:'NOT_FOUND'});assert(!M.recordQuery(r,{version:'v1',name:'Taxon alpha',result:'NOT_FOUND'}));assert.equal(r.query_ledger.length,1);});
t('7 single alias resolves',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'Taxon beta',result:'FOUND',candidates:[{idtaxon:'7',group:'Plantas vasculares',identity_evidence:true,scientificName:'Taxon beta'}]});assert.equal(M.resolveCandidates(r),M.STATUSES.SINGLE);});
t('8 aliases converge',()=>{let r=rec();for(const n of ['A','B'])M.recordQuery(r,{version:'v1',name:n,result:'FOUND',candidates:[{idtaxon:'7',group:'Plantas vasculares',identity_evidence:true}]});assert.equal(M.resolveCandidates(r),M.STATUSES.CONVERGENT);});
t('9 multiple IDs ambiguous',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'A',result:'FOUND',candidates:[{idtaxon:'7',group:'Plantas vasculares',identity_evidence:true},{idtaxon:'8',group:'Plantas vasculares',identity_evidence:true}]});assert.equal(M.resolveCandidates(r),M.STATUSES.AMBIGUOUS);});
t('10 parent-only does not inherit',()=>{let r=rec('Taxon alpha subsp. beta','subspecies');M.recordQuery(r,{version:'v1',name:r.nombre_rioja_verbatim,result:'FOUND',candidates:[{idtaxon:'7',group:'Plantas vasculares',identity_evidence:true,relation:'PARENT_OF'}]});assert.equal(M.resolveCandidates(r),M.STATUSES.PARENT);assert.equal(r.miteco_idtaxon,'');});
t('11 hybrid parent not inherited',()=>{let r=rec('A x B','nothospecies');M.recordQuery(r,{version:'v1',name:'A',result:'FOUND',candidates:[{idtaxon:'7',group:'Plantas vasculares',identity_evidence:true,relation:'PARENT_OF'}]});M.resolveCandidates(r);assert.equal(r.miteco_idtaxon,'');});
t('12 source failure distinct',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'A',result:'SOURCE_FAILURE'});assert.equal(M.resolveCandidates(r),M.STATUSES.FAILURE);});
t('13 MITECO native synonym adds name',()=>{let r=rec();assert.equal(M.addMitecoNativeRelations(r,[{query_name:'A',relevant_exact:true,synonym_of:'B',evidence_pointer:'raw:1'}]),1);assert(M.uniqueQueryNames(r).includes('B'));});
t('14 irrelevant first result rejected',()=>{let r=rec();assert.equal(M.addMitecoNativeRelations(r,[{query_name:'A',relevant_exact:false,synonym_of:'Wrong',evidence_pointer:'raw:x'}]),0);});
t('15 native loop deduplicates',()=>{let r=rec();let x={query_name:'A',relevant_exact:true,synonym_of:'B',evidence_pointer:'raw:1'};assert.equal(M.addMitecoNativeRelations(r,[x]),1);assert.equal(M.addMitecoNativeRelations(r,[x]),0);});
t('16 human remainder surfaced',()=>{let r=rec();M.finalizeHuman(r);assert(r.human_review);assert.equal(r.resolution_status,M.STATUSES.NO_ID);});
t('17 raw evidence hashed',()=>{let r=rec();let h=M.addRaw(r,{source:'EIDOS',version:'v1',request:{q:'A'},response:{x:1},timestamp:'2026-08-23T00:00:00Z'});assert(/^[a-f0-9]{64}$/.test(h));assert.equal(r.raw_evidence[0].raw_hash,h);});
t('18 source failure not absence',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'A',result:'SOURCE_FAILURE'});M.resolveCandidates(r);M.finalizeHuman(r);assert.equal(r.resolution_status,M.STATUSES.FAILURE);});
t('19 duplicate relation idempotent',()=>{let r=rec();let e={source:'ANTHOS',query_name:'A',returned_name:'B',relation:'SYNONYM_OF',evidence_pointer:'e'};assert(M.addRelation(r,e));assert(!M.addRelation(r,e));});
t('20 fixpoint controlled',()=>{let r=rec();M.recordQuery(r,{version:'v1',name:'A',result:'NOT_FOUND'});M.finalizeHuman(r);let f=M.fixpointState([r]);assert.equal(f.ALL_PROGRAMMED_QUERY_PAIRS_TERMINAL,true);assert.equal(f.PENDING_AUTOMATIC_RESOLUTION_WORK,0);});
t('21 human audit view present',()=>{let r=rec();M.finalizeHuman(r);assert.equal(M.humanAuditView(r).PENDIENTE_REVISION,true);});
t('22 species/subspecies remain distinct names',()=>{assert.notEqual(M.keyName('A b'),M.keyName('A b subsp. c'));});
t('23 hybrid formula remains distinct',()=>assert.notEqual(M.keyName('A x B'),M.keyName('A')));
t('24 direct ID prevents need for alias stage by terminal status',()=>{let r=rec();M.directStage(r,{idtaxon:'99'});assert.equal(r.resolution_status,M.STATUSES.DIRECT);});
console.log(`RESULT ${pass}/24 PASS`);
// QA_TRIGGER_2026_08_23
