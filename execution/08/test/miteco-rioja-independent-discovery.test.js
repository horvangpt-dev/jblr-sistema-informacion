'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalJson } = require('../miteco-rioja-expansion-v1/src/eidos-distribution-adapter');
const {
  normalizeGridCode,
  loadCellRegistry,
  processFeature,
  aggregateEvidence,
  computeQa,
  freezePayload
} = require('../miteco-rioja-expansion-v1/src/independent-discovery-core');

function registryDoc() {
  const payload = {
    version: 'TEST_REGISTRY_v1',
    sourceManifestVersion: 'TEST_MANIFEST',
    sourceManifestSha256: 'abc',
    sourceManifestDriveId: 'x',
    crs: 'EPSG:25830',
    cellSizeM: 10000,
    selectedCount: 2,
    fullyWithinCount: 1,
    partialCount: 1,
    cells: [
      { code: '30TWM45', relation: 'FULLY_WITHIN_RIOJA', lowerLeftEasting: 540000, lowerLeftNorthing: 4640000, nativeId: '1' },
      { code: '30TWM46', relation: 'PARTIAL_INTERSECTION', lowerLeftEasting: 540000, lowerLeftNorthing: 4650000, nativeId: '2' }
    ]
  };
  const sha256 = crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
  return { sha256, payload };
}

function f(id, code, ids, declared = ids.length) {
  return {
    id,
    properties: {
      cuadricula: code,
      total_taxones_plantvas: declared,
      lista_idstaxon_filtro_plantvas: ids.join(',')
    },
    geometry: { type: 'MultiPolygon', coordinates: [] }
  };
}

test('MRD01 normalize grid code', () => assert.equal(normalizeGridCode('30T WM45'), '30TWM45'));

test('MRD02 registry verifies counts and bbox', () => {
  const r = loadCellRegistry(registryDoc());
  assert.deepEqual(r.bbox, [540000, 4640000, 550000, 4660000]);
});

test('MRD03 full cell produces confirmed territorial evidence', () => {
  const r = loadCellRegistry(registryDoc());
  const x = processFeature(f('a', '30TWM45', ['101']), r);
  assert.equal(x.evidence[0].territorialEvidenceState, 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
});

test('MRD04 partial-only cell remains border candidate', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence([processFeature(f('b', '30TWM46', ['103']), r)]);
  assert.equal(a.taxa[0].territorialEvidenceState, 'BORDER_GRID_CANDIDATE');
});

test('MRD05 taxon in full and partial is confirmed with both evidence units', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence([
    processFeature(f('a', '30TWM45', ['102']), r),
    processFeature(f('b', '30TWM46', ['102']), r)
  ]);
  assert.equal(a.taxa.length, 1);
  assert.equal(a.taxa[0].territorialEvidenceState, 'DISTRIBUTION_UNIT_FULLY_WITHIN_RIOJA');
  assert.equal(a.taxa[0].distributionUnits.length, 2);
});

test('MRD06 outside cell is preserved as outside, not Rioja evidence', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence([processFeature(f('x', '30TWM99', ['999']), r)]);
  assert.equal(a.taxa.length, 0);
  assert.equal(a.outsideFeatures.length, 1);
});

test('MRD07 declared count mismatch hard-stops', () => {
  const r = loadCellRegistry(registryDoc());
  assert.throws(() => processFeature(f('a', '30TWM45', ['101'], 2), r), /VASCULAR_ID_COUNT_MISMATCH/);
});

test('MRD08 identity map resolves exact ID without name matching', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence(
    [processFeature(f('a', '30TWM45', ['101']), r)],
    { byId: { '101': { scientificName: 'Planta test', sourcePointer: 'MITECO' } } }
  );
  assert.equal(a.taxa[0].mitecoNameCurrent, 'Planta test');
  assert.equal(a.taxa[0].identityResolutionState, 'OFFICIAL_ID_LOOKUP_EXACT');
});

test('MRD09 duplicate raw feature IDs fail systemic QA', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence([
    processFeature(f('a', '30TWM45', ['101']), r),
    processFeature(f('a', '30TWM46', ['102']), r)
  ]);
  const qa = computeQa({
    registry: r,
    aggregate: a,
    acquisition: { paginationComplete: true, sourceErrors: 0, gridWindowCoveredCount: 2, rawRequestCount: 1, rawFeatureCount: 2 }
  });
  assert.equal(qa.systemicQa, 'FAIL');
  assert.ok(qa.fatalConditions.includes('DUPLICATE_RAW_FEATURE_IDS'));
});

test('MRD10 freeze payload explicitly forbids JBLR cross', () => {
  const r = loadCellRegistry(registryDoc());
  const a = aggregateEvidence([processFeature(f('a', '30TWM45', ['101']), r)]);
  const z = freezePayload({
    registry: r,
    aggregate: a,
    acquisition: { paginationComplete: true, sourceErrors: 0, gridWindowCoveredCount: 2, rawRequestCount: 1, rawFeatureCount: 1 }
  });
  assert.equal(z.payload.independenceGuard.existingRiojaCorpusInputUsed, false);
  assert.equal(z.payload.independenceGuard.crossWithJblrAllowed, false);
});
