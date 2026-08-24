const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/source-expansion');
const t = require('../src/transports');

const emptyInventory = Object.fromEntries(s.SOURCE_PRIORITY.map(id => [id,{ACCESS_STATE:'TEST',ADAPTER_STATE:'IMPLEMENTED'}]));
function context() { return s.createContext({runId:'QA-08-337'}); }

test('TEST_01 source priority is deterministic and exact', () => {
  assert.deepEqual(s.SOURCE_PRIORITY,['MITECO_EIDOS','FLORA_IBERICA_RJB','ANTHOS_RJB','FLORA_MONTIBERICA','FLORA_ANDALUCIA','HVMO_UIB','ATLAS_FLORA_ARAGON_JACA','FLORA_CATALANA','REGIONAL_SPANISH_SOURCES']);
});

test('TEST_02 exact original name is preserved verbatim', () => {
  const n='Achillea millefolium subsp.  millefolium';
  assert.equal(s.createNameNetwork(n).originalName,n);
});

test('TEST_03 rank markers survive unchanged', () => {
  const n='Adenocarpus hispanicus subsp. neilense';
  assert.equal([...s.createNameNetwork(n).names.keys()][0],n);
});

test('TEST_04 hybrid markers survive unchanged', () => {
  const n='Acer monspessulanum x A. campestre';
  assert.equal([...s.createNameNetwork(n).names.keys()][0],n);
});

test('TEST_05 fresh candidate requires explicit relation and evidence', () => {
  const n=s.createNameNetwork('A');
  assert.equal(s.addEvidenceName(n,{name:'B',relation:'SYNONYM_OF',source:'X',fresh:true}),false);
  assert.equal(s.addEvidenceName(n,{name:'B',relation:'NOT_A_RELATION',source:'X',evidencePointer:'p',fresh:true}),false);
  assert.equal(s.addEvidenceName(n,{name:'B',relation:'SYNONYM_OF',source:'X',evidencePointer:'p',fresh:false}),false);
  assert.equal(s.addEvidenceName(n,{name:'B',relation:'SYNONYM_OF',source:'X',evidencePointer:'p',fresh:true}),true);
});

test('TEST_06 current-run evidence may seed network without historical imports', () => {
  const n=s.createNameNetwork('A',[{name:'B',relation:'SYNONYM_OF',source:'CURRENT_RUN',evidencePointer:'run:e1',fresh:false}]);
  assert.deepEqual([...n.names.keys()],['A','B']);
});

test('TEST_07 source failure never becomes NOT_FOUND', () => {
  assert.equal(s.normalizeAccessResult({state:'SOURCE_UNAVAILABLE'}).state,'SOURCE_UNAVAILABLE');
  assert.equal(s.normalizeAccessResult({state:'ACCESS_FAILED'}).state,'ACCESS_FAILED');
  assert.notEqual(s.normalizeAccessResult({state:'ACCESS_FAILED'}).state,'NOT_FOUND');
});

test('TEST_08 unavailable sources emit explicit unavailable state', async () => {
  const c=context();
  const adapters=s.makeSourceAdapters({inventory:{MITECO_EIDOS:{ADAPTER_STATE:'TECHNICALLY_UNAVAILABLE'}}});
  const r=await adapters.MITECO_EIDOS.query('Acer campestre',c);
  assert.equal(r.state,'TECHNICALLY_UNAVAILABLE');
  assert.deepEqual(r.relations,[]);
});

test('TEST_09 source hierarchy never deletes conflicting evidenced names', async () => {
  const c=context();
  const transports={
    MITECO_EIDOS: async n => ({state:'OK',relations: n==='A'?[{name:'B',relation:'SYNONYM_OF',evidencePointer:'m1'}]:[]}),
    FLORA_IBERICA_RJB: async n => ({state:'OK',relations: n==='A'?[{name:'C',relation:'ACCEPTED_NAME_OF',evidencePointer:'f1'}]:[]}),
  };
  const r=await s.expandOneRecord({originalName:'A',context:c,adapters:s.makeSourceAdapters({transports,inventory:emptyInventory})});
  assert.ok(r.nameNetwork.some(x=>x.name==='B'));
  assert.ok(r.nameNetwork.some(x=>x.name==='C'));
});

test('TEST_10 every Spanish-source fresh name is re-queried in MITECO', async () => {
  const c=context();
  const seen=[];
  const transports={
    MITECO_EIDOS: async n => {seen.push(n);return {state:'OK',relations:[],matches:[]}},
    HVMO_UIB: async n => n==='A'?{state:'OK',relations:[{name:'A2',relation:'SYNONYM_OF',evidencePointer:'uib:1'}]}:{state:'OK',relations:[]},
  };
  await s.expandOneRecord({originalName:'A',context:c,adapters:s.makeSourceAdapters({transports,inventory:emptyInventory})});
  assert.ok(seen.includes('A2'));
});

test('TEST_11 fixed point terminates deterministically', async () => {
  const c=context();
  const transports={
    MITECO_EIDOS: async n => ({state:'OK',relations:n==='A'?[{name:'B',relation:'SYNONYM_OF',evidencePointer:'m'}]:[]}),
    FLORA_MONTIBERICA: async n => ({state:'OK',relations:n==='B'?[{name:'C',relation:'BASIONYM_OF',evidencePointer:'fm'}]:[]}),
  };
  const r=await s.expandOneRecord({originalName:'A',context:c,adapters:s.makeSourceAdapters({transports,inventory:emptyInventory})});
  assert.equal(r.fixedPoint,true);
  assert.deepEqual(r.nameNetwork.map(x=>x.name).sort(),['A','B','C']);
});

test('TEST_12 multiple incompatible MITECO IDs produce conflict', () => {
  const r=s.classifyMitecoMatches([{idTaxon:1,sameConcept:true,rank:'species'},{idTaxon:2,sameConcept:true,rank:'species'}],{requiredRank:'species'});
  assert.equal(r.state,'AMBIGUOUS_MULTIPLE_IDS');
  assert.equal(r.idTaxon,null);
});

test('TEST_13 parent ID is never inherited as child identity', () => {
  const r=s.classifyMitecoMatches([{idTaxon:99,parentOnly:true,rank:'species'}],{requiredRank:'subspecies'});
  assert.equal(r.state,'PARENT_ONLY');
  assert.equal(r.idTaxon,null);
  assert.equal(r.parentReferenceId,'99');
});

test('TEST_14 cache namespace starts empty and prior cache fails closed', () => {
  const c=context();
  assert.equal(c.cache.size,0);
  assert.throws(()=>s.createContext({runId:'x',initialCache:[['a','b']]}),/PRIOR_CACHE_READ_PROHIBITED/);
});

test('TEST_15 denied historical/A/RC2 discovery paths fail closed', () => {
  for (const x of ['Corpus_A.csv','RC2_2210.json','historical_taxon_results.json','previous_static_MITECO.csv','prior_synonym_ledger.json','old_crosswalk.csv']) {
    assert.throws(()=>s.assertNoDeniedDiscoveryRead(x),/CONTAMINATED_INPUT/);
  }
});

test('TEST_16 controlled QA manifest proves zero productive execution and zero contamination counters', () => {
  const c=context();
  const m=s.buildQaManifest(c);
  assert.equal(m.PRODUCTIVE_RESOLUTION_BY_08,0);
  assert.equal(m.PRODUCTIVE_EXTRACTION_BY_08,0);
  assert.equal(m.CORPUS_A_ROWS_READ_FOR_DISCOVERY,0);
  assert.equal(m.RC2_ROWS_READ_FOR_DISCOVERY,0);
  assert.equal(m.HISTORICAL_TAXON_ROWS_READ_FOR_DISCOVERY,0);
  assert.equal(m.PRIOR_LOOKUP_CACHE_HITS,0);
  assert.equal(m.CROSS_WITH_A_PERFORMED,false);
  assert.equal(m.CROSSWALK_MODULE_EXECUTED,false);
  assert.equal(m.NEON_WRITES,0);
  assert.equal(m.CACHE_INITIAL_STATE,'EMPTY');
});

test('TEST_17 access exceptions become ACCESS_FAILED, never inferred absence', async () => {
  const c=context();
  const adapters=s.makeSourceAdapters({transports:{HVMO_UIB:async()=>{throw new Error('timeout')}},inventory:emptyInventory});
  const r=await adapters.HVMO_UIB.query('A',c);
  assert.equal(r.state,'ACCESS_FAILED');
  assert.notEqual(r.state,'NOT_FOUND');
});

test('TEST_18 query ledger preserves exact query name and evidence state', async () => {
  const c=context();
  const n='Acer monspessulanum x A. campestre';
  const adapters=s.makeSourceAdapters({transports:{HVMO_UIB:async()=>({state:'OK',evidencePointer:'uib:index'})},inventory:emptyInventory});
  await adapters.HVMO_UIB.query(n,c);
  assert.equal(c.queryLedger[0].QUERY_NAME,n);
  assert.equal(c.queryLedger[0].EVIDENCE_POINTER,'uib:index');
});

test('TEST_19 EIDOS SOAP request preserves exact taxon text with XML-safe escaping', () => {
  const n='Acer x test <alpha> & beta';
  const xml=t.buildEidosBuscarTaxonesEnvelope(n);
  assert.match(xml,/Acer x test &lt;alpha&gt; &amp; beta/);
  assert.match(xml,/<impl:buscarTaxones/);
});

test('TEST_20 EIDOS response parser preserves returned TAXONID and scientific name', () => {
  const xml='<taxon><TAXONID>4439</TAXONID><SCIENTIFICNAME>Erythronium dens-canis L.</SCIENTIFICNAME></taxon>';
  const r=t.parseEidosBuscarTaxonesXml(xml,'eidos:test');
  assert.equal(r.matches[0].idTaxon,'4439');
  assert.equal(r.matches[0].scientificName,'Erythronium dens-canis L.');
});

test('TEST_21 HVMO deterministic index URL derives only the initial letter', () => {
  assert.equal(t.hvmoIndexUrlForName('Acer monspessulanum x A. campestre'),'https://herbarivirtual.uib.es/es/general/A/per-nom-cientific');
});

test('TEST_22 HVMO HTTP failure returns ACCESS_FAILED and never NOT_FOUND', async () => {
  const tr=t.createHvmoIndexTransport({fetchImpl:async()=>({ok:false,status:503})});
  const r=await tr('Acer campestre');
  assert.equal(r.state,'ACCESS_FAILED');
  assert.notEqual(r.state,'NOT_FOUND');
});
