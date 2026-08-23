'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const a=require('../miteco-rioja-expansion-v1/src/eidos-distribution-adapter');

test('EIDOS01 parse vascular ID list',()=>assert.deepEqual(a.parseVascularIdList('1, 2;3|3'),['1','2','3']));
test('EIDOS02 reject unexpected ID-list encoding',()=>assert.throws(()=>a.parseVascularIdList('1,A'),/SOURCE_SCHEMA_CHANGED_UNHANDLED/));
test('EIDOS03 extract aggregate feature',()=>{
  const f=a.extractEidosDistributionFeature({id:'x.1',properties:{id:1,cuadricula:'30TWM45',total_taxones_plantvas:2,lista_idstaxon_filtro_plantvas:'101,102'},geometry:{type:'MultiPolygon',coordinates:[]}});
  assert.deepEqual(f.vascularTaxonIds,['101','102']);
  assert.equal(f.spatialUnitNativeCode,'30TWM45');
});
test('EIDOS04 build WFS JSON request',()=>assert.match(a.buildEidosDistributionRequest({bbox:[480000,4640000,610000,4730000]}),/typeNames=especies%3Adistribucion_especies/));
test('EIDOS05 pagination continues when incomplete',()=>assert.deepEqual(a.pageCompleteness({numberMatched:25000,numberReturned:10000,startIndex:0,count:10000}),{complete:false,nextIndex:10000}));
test('EIDOS06 pagination completes exactly',()=>assert.deepEqual(a.pageCompleteness({numberMatched:25000,numberReturned:5000,startIndex:20000,count:10000}),{complete:true,nextIndex:null}));
