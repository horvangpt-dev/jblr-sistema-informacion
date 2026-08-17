const assert = require('assert');
const { planFlow } = require('../src/real-material-flow');

const lavatera = {
  mode: 'retrospective',
  sourceKey: 'ES-0-JBLR-01/26',
  sourceDocumentId: '1Cj8K6IYle933fP0xnkudgtK1u6hM5VLx',
  sourceDocumentTitle: 'ES-0-JBLR-01-26_01_Recoleccion_Campo_REVISADA.xlsx',
  taxonVerbatim: 'Lavatera arborea L.',
  taxonProvisional: true,
  identificationStatus: 'A — Segura; provisional',
  locationName: 'Cárdenas de Rioja · núcleo urbano junto a la carretera principal',
  populationLabel: 'Lavatera arborea L. [provisional] · Cárdenas de Rioja · P01',
  collectionOccurred: true,
  collectionAt: '2026-07-04T19:42:00+02:00',
  collectorName: 'Joaquín Hornos',
  collectionMethod: 'A — Toda la población',
  plantsObserved: 8,
  plantsSampled: 3,
  rawMaterialVerbatim: 'C — Infrutescencias',
  sampleOccurred: true,
  sampleKind: 'infructescences',
  quantityValue: null,
  quantityUnit: null,
  reception: { occurred: false },
  processing: [],
  accession: { occurred: false }
};

const plan = planFlow(lavatera);
assert.equal(plan.mode, 'retrospective');
assert.equal(plan.provisionalTaxon, true);
assert.equal(plan.firstDemonstrableStage, 'CollectionEvent');
assert.deepEqual(plan.stages, ['collection','sample']);
assert.equal(plan.prospectionRequired, false);
assert.equal(plan.fieldVisitRequired, false);
assert.equal(plan.storageStructured, false);
assert.equal(plan.historyStructured, true);
assert.equal(plan.normalized.quantityValue, null);
assert.equal(plan.normalized.rawMaterialVerbatim, 'C — Infrutescencias');

assert.throws(() => planFlow({...lavatera, storage:{center:'JBLR',shelf:'A1'}}), /MODEL_DEFECT/);
assert.throws(() => planFlow({...lavatera, collectionAt:null}), /collectionAt is required/);
assert.throws(() => planFlow({...lavatera, sampleKind:null}), /sampleKind is required/);

const sampleOnly = planFlow({
  mode:'retrospective', sourceKey:'RETRO-SAMPLE-ONLY', sourceDocumentId:'doc-1', sourceDocumentTitle:'source',
  collectionOccurred:false, sampleOccurred:true, sampleKind:'seed', taxonProvisional:false
});
assert.equal(sampleOnly.firstDemonstrableStage,'Sample');
assert.deepEqual(sampleOnly.stages,['sample']);

console.log('REAL_MATERIAL_FLOW_PLANNER=PASS');
console.log('LAVATERA_RETROSPECTIVE_MAPPING=PASS');
console.log('PROSPECTION_FIELDVISIT_OPTIONAL=PASS');
console.log('UNKNOWN_QUANTITY_PRESERVED_NULL=PASS');
console.log('STORAGE_MODEL_GAP_FAIL_CLOSED=PASS');
