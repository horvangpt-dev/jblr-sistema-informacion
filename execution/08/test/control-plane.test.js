'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cp = require('../src/control-plane.js');
const { syntheticAdapter } = require('../src/synthetic-adapter.js');

const fixtureRoot = path.resolve(__dirname, '../fixtures/test-release');
const manifestPath = path.join(fixtureRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const members = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'members.json'), 'utf8'));

function workspace() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jblr-08-cp-')); }
function binding(overrides = {}) {
  return {
    TAXONOMIC_UNIVERSE_RELEASE_ID: manifest.release_id,
    TAXONOMIC_UNIVERSE_VERSION: manifest.release_version,
    TAXONOMIC_UNIVERSE_MANIFEST: manifestPath,
    MANIFEST_HASH: manifest.manifest_hash,
    ...overrides
  };
}
function registry(adapter = syntheticAdapter()) {
  return { [adapter.STIME_ID]: { [adapter.STIME_VERSION]: adapter } };
}
function config(overrides = {}) {
  return {
    run_mode: cp.SYNTHETIC_RUN,
    NOT_REAL_BOTANICAL_RUN: true,
    STIME_ID: 'STIME_SYNTHETIC_ECHO',
    STIME_VERSION: 'test-v1',
    selection: { mode: 'taxon', taxon_id: 'SYN-001' },
    retry_policy: { max_retries: 1, retryable_codes: ['SYNTHETIC_TRANSIENT'] },
    dependency_state: {},
    ...overrides
  };
}

function errorCode(fn, code) {
  return assert.rejects(fn, e => e && e.code === code);
}
function errorCodeSync(fn, code) {
  return assert.throws(fn, e => e && e.code === code);
}

test('RC1 manifest canonical hash algorithm reproduces accepted structural hash', () => {
  const rc1 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/rc1-manifest-structural.json'), 'utf8'));
  assert.equal(rc1.manifest_hash, '9c7840663316a0e7c77c66022803794e74a1b75ab38629914ed33bbae3ca7f4c');
  assert.equal(cp.manifestHash(rc1), rc1.manifest_hash);
});

test('synthetic manifest verifies and release loads', () => {
  const r = cp.loadRelease(binding(), { runMode: cp.SYNTHETIC_RUN });
  assert.equal(r.members.length, 5);
  assert.equal(r.verified.state, 'PASS');
});

test('missing mandatory binding refuses run', () => {
  const b = binding(); delete b.MANIFEST_HASH;
  errorCodeSync(() => cp.loadRelease(b, { runMode: cp.SYNTHETIC_RUN }), 'RELEASE_BINDING_MISSING');
});

test('nonexistent release manifest is explicit RELEASE_NOT_FOUND', () => {
  const b = binding({ TAXONOMIC_UNIVERSE_MANIFEST: path.join(fixtureRoot, 'does-not-exist.json') });
  errorCodeSync(() => cp.loadRelease(b, { runMode: cp.SYNTHETIC_RUN }), 'RELEASE_NOT_FOUND');
});

test('wrong manifest hash is refused', () => {
  const bad = { ...manifest, manifest_hash: '0'.repeat(64) };
  const b = binding({ MANIFEST_HASH: bad.manifest_hash });
  errorCodeSync(() => cp.loadRelease(b, { runMode: cp.SYNTHETIC_RUN, manifestObject: bad, membersObject: members }), 'MANIFEST_HASH_INVALID');
});

test('historical input markers are refused even with a valid recomputed hash', () => {
  const bad = { ...manifest, source_corpus_version: 'HISTORICAL_2742' };
  bad.manifest_hash = cp.manifestHash(bad);
  const b = binding({ MANIFEST_HASH: bad.manifest_hash });
  errorCodeSync(() => cp.loadRelease(b, { runMode: cp.SYNTHETIC_RUN, manifestObject: bad, membersObject: members }), 'HISTORICAL_INPUT_REFUSED');
});

test('real run is refused without explicit canonical authorization', async () => {
  await errorCode(() => cp.executeRun({
    config: config({ run_mode: cp.REAL_RUN, NOT_REAL_BOTANICAL_RUN: false }),
    binding: binding(), adapterRegistry: registry(), workspace: workspace()
  }), 'REAL_RUN_NOT_AUTHORIZED');
});

test('release candidate is refused for real run even with authorization', async () => {
  await errorCode(() => cp.executeRun({
    config: config({
      run_mode: cp.REAL_RUN,
      NOT_REAL_BOTANICAL_RUN: false,
      authorization: { DOWNSTREAM_08_REAL_RUN_AUTHORIZED: true, AUTHORITY_EVENT_ID: 'TEST-AUTH-EVENT' }
    }),
    binding: binding(), adapterRegistry: registry(), workspace: workspace()
  }), 'RELEASE_NOT_DOWNSTREAM_CONSUMABLE');
});

test('synthetic adapter cannot be used for a real run', () => {
  errorCodeSync(() => cp.selectStime(registry(), 'STIME_SYNTHETIC_ECHO', 'test-v1', cp.REAL_RUN), 'SYNTHETIC_ADAPTER_REAL_RUN_REFUSED');
});

test('incompatible STIME version is refused', async () => {
  await errorCode(() => cp.executeRun({
    config: config({ STIME_VERSION: 'missing-version' }), binding: binding(), adapterRegistry: registry(), workspace: workspace()
  }), 'STIME_VERSION_INCOMPATIBLE');
});

test('adapter default inference is refused unless explicitly allowed by contract', () => {
  const a = syntheticAdapter();
  a.SYNTHETIC_ONLY = false;
  a.DEFAULT_INFERENCES = ['origin_country=ES'];
  errorCodeSync(() => cp.validateAdapter(a), 'NO_SILENT_INFERENCE_GUARD');
});

test('unknown, not_found and source unavailable remain explicit and nonzero', async () => {
  const w = workspace();
  const r = await cp.executeRun({
    config: config({ selection: { mode: 'subset', taxon_ids: ['SYN-002','SYN-003','SYN-004'] }, idempotency_key: 'states' }),
    binding: binding(), adapterRegistry: registry(), workspace: w
  });
  assert.deepEqual(r.results.map(x => x.result.semantic_state), ['UNKNOWN','NOT_FOUND','SOURCE_NOT_ACQUIRED']);
  assert.ok(r.results.every(x => x.result.value === null));
  assert.equal(r.unresolved.length, 3);
  assert.equal(r.qa.semantic_state_counts.UNKNOWN, 1);
  assert.equal(r.qa.semantic_state_counts.NOT_FOUND, 1);
  assert.equal(r.qa.semantic_state_counts.SOURCE_NOT_ACQUIRED, 1);
});

test('false zero under unresolved semantics is rejected', async () => {
  const a = syntheticAdapter();
  a.executeItem = async () => ({ semantic_state: 'UNKNOWN', score: 0, provenance: { source: 'SYN' } });
  await errorCode(() => cp.executeRun({
    config: config({ idempotency_key: 'false-zero' }), binding: binding(), adapterRegistry: registry(a), workspace: workspace()
  }), 'FALSE_ZERO_GUARD');
});

test('explicit contract technical placeholder may carry zero without changing semantic state', async () => {
  const a = syntheticAdapter();
  a.executeItem = async () => ({ semantic_state: 'UNKNOWN', score: 0, numeric_projection_rule: 'EXPLICIT_CONTRACT_PLACEHOLDER', provenance: { source: 'SYN' } });
  const r = await cp.executeRun({
    config: config({ idempotency_key: 'explicit-placeholder' }), binding: binding(), adapterRegistry: registry(a), workspace: workspace()
  });
  assert.equal(r.results[0].result.semantic_state, 'UNKNOWN');
  assert.equal(r.results[0].result.score, 0);
});

test('taxon not present in bound release is refused', async () => {
  await errorCode(() => cp.executeRun({
    config: config({ selection: { mode: 'taxon', taxon_id: 'DOES-NOT-EXIST' } }), binding: binding(), adapterRegistry: registry(), workspace: workspace()
  }), 'TAXON_NOT_FOUND');
});

test('selection supports explicit genus, batch, subset and full release', () => {
  assert.equal(cp.selectMembers(members, { mode: 'genus', genus: 'Alpha' }).length, 2);
  assert.deepEqual(cp.selectMembers(members, { mode: 'batch', offset: 1, limit: 2 }).map(x=>x.taxon_id), ['SYN-002','SYN-003']);
  assert.deepEqual(cp.selectMembers(members, { mode: 'subset', taxon_ids: ['SYN-003','SYN-005'] }).map(x=>x.taxon_id), ['SYN-003','SYN-005']);
  assert.equal(cp.selectMembers(members, { mode: 'full' }).length, 5);
});

test('retryable failure is retried and recorded', async () => {
  const r = await cp.executeRun({
    config: config({ selection: { mode: 'taxon', taxon_id: 'SYN-005' }, idempotency_key: 'retry' }),
    binding: binding(), adapterRegistry: registry(), workspace: workspace()
  });
  assert.equal(r.results[0].attempts, 2);
  assert.equal(r.results[0].result.semantic_state, 'EVALUATED');
});

test('checkpoint is written and execution resumes without duplicating completed items', async () => {
  const w = workspace();
  const base = config({ selection: { mode: 'full' }, idempotency_key: 'resume', TEST_INTERRUPT_AFTER: 2 });
  await errorCode(() => cp.executeRun({ config: base, binding: binding(), adapterRegistry: registry(), workspace: w }), 'TEST_INTERRUPT');
  const resumed = await cp.executeRun({
    config: { ...base, TEST_INTERRUPT_AFTER: null }, binding: binding(), adapterRegistry: registry(), workspace: w
  });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.results.length, 5);
  assert.equal(new Set(resumed.results.map(x => x.taxon_id)).size, 5);
});

test('duplicate completed run is idempotent replay', async () => {
  const w = workspace();
  const c = config({ idempotency_key: 'dup-run' });
  const first = await cp.executeRun({ config: c, binding: binding(), adapterRegistry: registry(), workspace: w });
  const second = await cp.executeRun({ config: c, binding: binding(), adapterRegistry: registry(), workspace: w });
  assert.equal(first.run_id, second.run_id);
  assert.equal(second.idempotent_replay, true);
  assert.equal(second.qa.idempotent_replay, true);
});

test('cache-first reports miss then hit with provenance', async () => {
  const w = workspace();
  const a = syntheticAdapter();
  const r1 = await cp.executeRun({ config: config({ idempotency_key: 'cache-miss' }), binding: binding(), adapterRegistry: registry(a), workspace: w });
  assert.equal(r1.qa.cache_state_counts.CACHE_MISS, 1);
  const r2 = await cp.executeRun({ config: config({ idempotency_key: 'cache-hit' }), binding: binding(), adapterRegistry: registry(a), workspace: w });
  assert.equal(r2.qa.cache_state_counts.CACHE_HIT, 1);
  assert.equal(r2.results[0].from_cache, true);
});

test('cache stale state is explicit when source version changes', async () => {
  const w = workspace();
  const a1 = syntheticAdapter({ cacheSourceVersion: 'source-v1' });
  await cp.executeRun({ config: config({ idempotency_key: 'stale-1' }), binding: binding(), adapterRegistry: registry(a1), workspace: w });
  const a2 = syntheticAdapter({ cacheSourceVersion: 'source-v2' });
  const r = await cp.executeRun({ config: config({ idempotency_key: 'stale-2' }), binding: binding(), adapterRegistry: registry(a2), workspace: w });
  assert.equal(r.qa.cache_state_counts.CACHE_STALE, 1);
});

test('cache invalid state is explicit and does not become absence', async () => {
  const w = workspace();
  const a = syntheticAdapter();
  await cp.executeRun({ config: config({ idempotency_key: 'invalid-cache-1' }), binding: binding(), adapterRegistry: registry(a), workspace: w });
  const cache = new cp.FileCache(path.join(w, 'cache'));
  fs.writeFileSync(cache.fileFor('STIME_SYNTHETIC_ECHO|SYN-001'), '{not-json');
  const r = await cp.executeRun({ config: config({ idempotency_key: 'invalid-cache-2' }), binding: binding(), adapterRegistry: registry(a), workspace: w });
  assert.equal(r.qa.cache_state_counts.CACHE_INVALID, 1);
});

test('dependency gate refuses non-ready dependency', async () => {
  const a = syntheticAdapter();
  a.DEPENDENCIES = [{ id: 'UPSTREAM_A', required_state: 'READY' }];
  await errorCode(() => cp.executeRun({
    config: config({ dependency_state: { UPSTREAM_A: 'NOT_READY' }, idempotency_key: 'dep' }),
    binding: binding(), adapterRegistry: registry(a), workspace: workspace()
  }), 'STIME_DEPENDENCY_NOT_READY');
});

test('completed synthetic run materializes result, unresolved, QA, run manifest, checkpoint and event artifacts', async () => {
  const w = workspace();
  const r = await cp.executeRun({
    config: config({ selection: { mode: 'subset', taxon_ids: ['SYN-001','SYN-002'] }, idempotency_key: 'artifacts' }),
    binding: binding(), adapterRegistry: registry(), workspace: w
  });
  const d = path.join(w, 'runs', r.run_id);
  for (const name of ['results.json','unresolved.json','qa.json','run-manifest.json','checkpoint.json','events.jsonl']) {
    assert.equal(fs.existsSync(path.join(d, name)), true, name);
  }
  const rm = JSON.parse(fs.readFileSync(path.join(d,'run-manifest.json'),'utf8'));
  assert.equal(rm.ACTOR_ID, '08');
  assert.equal(rm.NOT_REAL_BOTANICAL_RUN, true);
  assert.equal(rm.TAXONOMIC_UNIVERSE_RELEASE_ID, manifest.release_id);
  assert.equal(rm.MANIFEST_HASH, manifest.manifest_hash);
});
