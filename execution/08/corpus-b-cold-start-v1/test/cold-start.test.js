const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/core');

const row = (overrides={}) => ({
  'Nombre Científico':'Acer monspessulanum x A. campestre','Nombre común':'---','Reino':'Plantae','Phylum':'Tracheophyta','Clase':'Magnoliopsida','Orden':'Sapindales','Familia':'Sapindaceae','Fuente Información':'RAW B','Id.':1891,'Especie EIDOS':'',...overrides
});

test('TEST_01 forbidden A/RC2 path read causes hard failure', () => {
  assert.throws(() => c.assertAllowedDiscoveryRead('data/Corpus_A/RC2_2210.csv'), /CONTAMINATED_INPUT/);
});

test('TEST_02 previous cache read causes hard failure', () => {
  assert.throws(() => c.createRunContext({runId:'r', initialCache:[['x','y']]}), /PRIOR_CACHE_READ_PROHIBITED/);
});

test('TEST_03 previous static MITECO-list input causes hard failure', () => {
  assert.throws(() => c.assertNoPriorStaticMitecoInput('previous_static_MITECO_list.csv'), /PROHIBITED/);
});

test('TEST_04 prior synonym ledger import causes hard failure', () => {
  assert.throws(() => c.assertNoPriorSynonymLedger('prior_synonym_ledger.json'), /PROHIBITED/);
});

test('TEST_05 raw B row preservation is lossless', () => {
  const original = row({'Fuente Información':'texto, con comas', 'Especie EIDOS':'  '});
  const p = c.preserveRawRow(original,{sourceRowPointer:25, sourceSnapshotId:'src'});
  assert.deepEqual(p.RAW_ROW, original);
  assert.equal(typeof p.SOURCE_RECORD_HASH, 'string'); assert.equal(p.SOURCE_RECORD_HASH.length,64);
});

test('TEST_06 hybrid/rank tokens survive parsing and query generation', () => {
  const original='Acer monspessulanum x A. campestre';
  const n=c.createNameNetwork(original);
  assert.equal([...n.names.keys()][0], original);
  assert.match([...n.names.keys()][0], / x /);
  const sub='Achillea millefolium subsp. millefolium';
  assert.equal(c.createNameNetwork(sub).originalName, sub);
});

test('TEST_07 SOURCE_UNAVAILABLE never becomes NOT_FOUND', () => {
  assert.equal(c.normalizeSourceFailure({state:'SOURCE_UNAVAILABLE'}).state,'SOURCE_UNAVAILABLE');
  assert.notEqual(c.normalizeSourceFailure({state:'SOURCE_UNAVAILABLE'}).state,'NOT_FOUND');
});

test('TEST_08 parent-level match never becomes child identity', () => {
  const r=c.classifyIdMatches([{idTaxon:100,parentOnly:true,rank:'species'}],{requiredRank:'subspecies'});
  assert.equal(r.state,'PARENT_ONLY'); assert.equal(r.idTaxon,null); assert.equal(r.parentReferenceId,'100');
});

test('TEST_09 NAME_NETWORK expands only from explicit fresh evidence', () => {
  const n=c.createNameNetwork('A');
  assert.equal(c.addFreshEvidenceName(n,{name:'B',relation:'SYNONYM_OF',evidencePointer:'p',fresh:false}),false);
  assert.equal(c.addFreshEvidenceName(n,{name:'B',relation:'SYNONYM_OF',evidencePointer:null,fresh:true}),false);
  assert.equal(c.addFreshEvidenceName(n,{name:'B',relation:'SYNONYM_OF',evidencePointer:'p',fresh:true}),true);
});

test('TEST_10 fixed-point loop terminates deterministically', async () => {
  const seen=[];
  const queryMiteco=async n=>{seen.push(n); return n==='A'?{relations:[{name:'B',relation:'SYNONYM_OF',evidencePointer:'m1'}]}:{relations:[]}};
  const r=await c.resolveFreshQueueItem('A',{queryMiteco});
  assert.equal(r.fixedPoint,true); assert.deepEqual(r.queriedMiteco,['A','B']);
});

test('TEST_11 MITECO internal aliases are re-queried', async () => {
  const seen=[];
  const queryMiteco=async n=>{seen.push(n); return n==='Old'?{relations:[{name:'Accepted',relation:'ACCEPTED_NAME_OF',evidencePointer:'miteco'}]}:{relations:[]}};
  await c.resolveFreshQueueItem('Old',{queryMiteco});
  assert.deepEqual(seen,['Old','Accepted']);
});

test('TEST_12 Spanish synonym result is re-queried against MITECO', async () => {
  const seen=[];
  const queryMiteco=async n=>{seen.push(n);return {relations:[]}};
  const querySpanish=async n=>n==='A'?{relations:[{name:'A2',relation:'SYNONYM_OF',evidencePointer:'anthos'}]}:{relations:[]};
  await c.resolveFreshQueueItem('A',{queryMiteco,querySpanish});
  assert.deepEqual(seen,['A','A2']);
});

test('TEST_13 multiple incompatible IDs produce conflict, never arbitrary selection', () => {
  const r=c.classifyIdMatches([{idTaxon:1,sameConcept:true,rank:'species'},{idTaxon:2,sameConcept:true,rank:'species'}],{requiredRank:'species'});
  assert.equal(r.state,'AMBIGUOUS_MULTIPLE_IDS'); assert.deepEqual(r.ids,['1','2']);
});

test('TEST_14 empty-cache assertion is machine-verifiable', () => {
  const ctx=c.createRunContext({runId:'r'});
  assert.equal(ctx.cache.size,0); assert.equal(ctx.independence.CACHE_INITIAL_STATE,'EMPTY');
});

test('TEST_15 crosswalk code cannot run in B-clean mode', () => {
  assert.throws(() => c.assertCrosswalkDisabled(), /CROSSWALK_PROHIBITED/);
});

test('TEST_16 independence metrics are emitted into RUN_MANIFEST', () => {
  const ctx=c.createRunContext({runId:'r'});
  const rows=[row({'Nombre Científico':'Abies alba','Id.':4516,'Especie EIDOS':'1899 Abies alba'}),row()];
  const ex=c.extractSourceRows(rows,{runContext:ctx,sourceSnapshotId:'src',expected:{VASCULAR_RAW_ROWS:2,EIDOS_PRESENT_AND_PARSEABLE:1,EIDOS_EMPTY_IN_SOURCE:1,EIDOS_PARSE_FAILURE:0}});
  const m=c.buildRunManifest(ctx,ex);
  assert.equal(m.CORPUS_A_ROWS_READ_FOR_DISCOVERY,0); assert.equal(m.RC2_ROWS_READ_FOR_DISCOVERY,0);
  assert.equal(m.CROSS_WITH_A_PERFORMED,false); assert.equal(m.CROSSWALK_MODULE_EXECUTED,false);
  assert.equal(m.PRODUCTIVE_TAXON_RESOLUTION_BY_08,0); assert.equal(m.PRODUCTIVE_EXTRACTION_BY_08,0);
  assert.deepEqual(m.EXTRACTION_METRICS,ex.metrics);
});
