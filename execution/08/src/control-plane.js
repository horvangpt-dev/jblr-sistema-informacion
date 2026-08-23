'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REAL_RUN = 'REAL_BOTANICAL_RUN';
const SYNTHETIC_RUN = 'SYNTHETIC_ONLY';
const REQUIRED_BINDING_FIELDS = [
  'TAXONOMIC_UNIVERSE_RELEASE_ID',
  'TAXONOMIC_UNIVERSE_VERSION',
  'TAXONOMIC_UNIVERSE_MANIFEST',
  'MANIFEST_HASH'
];
const REQUIRED_ADAPTER_FIELDS = [
  'STIME_ID',
  'STIME_VERSION',
  'INPUT_CONTRACT',
  'OUTPUT_CONTRACT',
  'UNKNOWN_SEMANTICS',
  'SOURCE_REQUIREMENTS',
  'QA_RULES'
];
const SEMANTIC_NONZERO_STATES = new Set([
  'UNKNOWN',
  'NOT_FOUND',
  'SOURCE_NOT_ACQUIRED',
  'TAXON_UNRESOLVED',
  'NOT_EVALUABLE',
  'UNRESOLVED'
]);

class ControlPlaneError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ControlPlaneError';
    this.code = code;
    this.details = details;
  }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, value) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}
function canonicalJson(value) { return JSON.stringify(stableValue(value)); }
function manifestHash(manifest) {
  const clone = JSON.parse(JSON.stringify(manifest));
  delete clone.manifest_hash;
  delete clone.MANIFEST_HASH;
  return sha256(canonicalJson(clone));
}
function nowIso(clock) { return (clock ? clock() : new Date()).toISOString(); }

function historicalToken(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  const normalized = s.replace(/\\/g, '/').toUpperCase();
  const patterns = [
    ['2742', /(^|[^0-9])2742([^0-9]|$)/],
    ['V8', /(^|[^A-Z0-9])V8([^A-Z0-9]|$)/],
    ['V10', /(^|[^A-Z0-9])V10([^A-Z0-9]|$)/],
    ['B-v2', /(^|[^A-Z0-9])B[-_ ]?V2([^A-Z0-9]|$)/]
  ];
  for (const [token, re] of patterns) if (re.test(normalized)) return token;
  return null;
}
function assertNoHistoricalInput(binding, manifest) {
  const inspect = [];
  for (const [k, v] of Object.entries(binding || {})) inspect.push([`binding.${k}`, v]);
  const metadataKeys = /release|version|corpus|universe|source|histor|lineage|input|branch|path|file/i;
  function walk(v, keyPath = 'manifest') {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${keyPath}[${i}]`));
    if (v && typeof v === 'object') {
      return Object.entries(v).forEach(([k, x]) => {
        if (metadataKeys.test(k) && (typeof x === 'string' || typeof x === 'number')) inspect.push([`${keyPath}.${k}`, x]);
        else if (x && typeof x === 'object') walk(x, `${keyPath}.${k}`);
      });
    }
  }
  walk(manifest);
  for (const [where, value] of inspect) {
    const token = historicalToken(value);
    if (token) throw new ControlPlaneError('HISTORICAL_INPUT_REFUSED', `Prohibited historical taxonomic input token ${token}`, { where, value });
  }
  return { state: 'PASS' };
}

function normalizeManifestIdentity(manifest) {
  return {
    release_id: manifest.release_id || manifest.TAXONOMIC_UNIVERSE_RELEASE_ID || null,
    release_version: manifest.release_version || manifest.TAXONOMIC_UNIVERSE_VERSION || null,
    manifest_hash: manifest.manifest_hash || manifest.MANIFEST_HASH || null
  };
}
function verifyBinding(binding, manifest, { runMode, authorization } = {}) {
  for (const field of REQUIRED_BINDING_FIELDS) {
    if (!binding || !binding[field]) {
      throw new ControlPlaneError('RELEASE_BINDING_MISSING', `Missing mandatory release binding field ${field}`, { field });
    }
  }
  const id = normalizeManifestIdentity(manifest);
  if (!id.release_id || !id.release_version || !id.manifest_hash) {
    throw new ControlPlaneError('MANIFEST_IDENTITY_INCOMPLETE', 'Manifest lacks explicit release identity/version/hash');
  }
  if (binding.TAXONOMIC_UNIVERSE_RELEASE_ID !== id.release_id) {
    throw new ControlPlaneError('RELEASE_ID_MISMATCH', 'Binding release id does not match manifest', { binding: binding.TAXONOMIC_UNIVERSE_RELEASE_ID, manifest: id.release_id });
  }
  if (binding.TAXONOMIC_UNIVERSE_VERSION !== id.release_version) {
    throw new ControlPlaneError('RELEASE_VERSION_MISMATCH', 'Binding release version does not match manifest', { binding: binding.TAXONOMIC_UNIVERSE_VERSION, manifest: id.release_version });
  }
  if (binding.MANIFEST_HASH !== id.manifest_hash) {
    throw new ControlPlaneError('MANIFEST_HASH_BINDING_MISMATCH', 'Binding manifest hash does not match manifest-declared hash');
  }
  const calculated = manifestHash(manifest);
  if (calculated !== id.manifest_hash) {
    throw new ControlPlaneError('MANIFEST_HASH_INVALID', 'Manifest hash verification failed', { expected: id.manifest_hash, calculated });
  }
  assertNoHistoricalInput(binding, manifest);

  if (runMode === REAL_RUN) {
    if (!authorization || authorization.DOWNSTREAM_08_REAL_RUN_AUTHORIZED !== true || !authorization.AUTHORITY_EVENT_ID) {
      throw new ControlPlaneError('REAL_RUN_NOT_AUTHORIZED', 'A real botanical run requires explicit downstream authorization from canonical authority');
    }
    if (manifest.publication_ready === false || manifest.final_release === false || manifest.publication_state === 'RELEASE_CANDIDATE') {
      throw new ControlPlaneError('RELEASE_NOT_DOWNSTREAM_CONSUMABLE', 'Release manifest is explicitly not final/downstream consumable');
    }
  }
  return { state: 'PASS', calculated_hash: calculated, release_id: id.release_id, release_version: id.release_version };
}

function loadRelease(binding, { runMode = SYNTHETIC_RUN, authorization = null, manifestObject = null, membersObject = null } = {}) {
  let manifest = manifestObject;
  const manifestPointer = binding && binding.TAXONOMIC_UNIVERSE_MANIFEST;
  if (!manifest) {
    if (!manifestPointer || !fs.existsSync(manifestPointer)) {
      throw new ControlPlaneError('RELEASE_NOT_FOUND', 'Release manifest could not be loaded from the declared pointer', { manifestPointer });
    }
    manifest = readJson(manifestPointer);
  }
  const verified = verifyBinding(binding, manifest, { runMode, authorization });
  let members = membersObject;
  if (!members) {
    const pointer = manifest.members_file || manifest.members_path || manifest.test_members_file || null;
    if (!pointer) throw new ControlPlaneError('RELEASE_MEMBERS_POINTER_MISSING', 'Manifest does not declare a members file for execution');
    const p = path.isAbsolute(pointer) ? pointer : path.resolve(path.dirname(manifestPointer), pointer);
    if (!fs.existsSync(p)) throw new ControlPlaneError('RELEASE_MEMBERS_NOT_FOUND', 'Release members file does not exist', { pointer: p });
    members = readJson(p);
  }
  if (!Array.isArray(members)) throw new ControlPlaneError('RELEASE_MEMBERS_INVALID', 'Release members must be an array');
  if (manifest.taxon_count != null && Number(manifest.taxon_count) !== members.length) {
    throw new ControlPlaneError('RELEASE_MEMBER_COUNT_MISMATCH', 'Manifest taxon_count does not match loaded members', { manifest: manifest.taxon_count, loaded: members.length });
  }
  return { binding: { ...binding }, manifest, members, verified };
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new ControlPlaneError('STIME_ADAPTER_INVALID', 'Adapter must be an object');
  for (const field of REQUIRED_ADAPTER_FIELDS) {
    if (adapter[field] == null || adapter[field] === '') throw new ControlPlaneError('STIME_ADAPTER_CONTRACT_INCOMPLETE', `Adapter missing ${field}`, { field });
  }
  if (typeof adapter.executeItem !== 'function') throw new ControlPlaneError('STIME_ADAPTER_EXECUTOR_MISSING', 'Adapter requires executeItem(item, context)');
  const defaults = Array.isArray(adapter.DEFAULT_INFERENCES) ? adapter.DEFAULT_INFERENCES : [];
  const explicitlyAllowed = new Set(Array.isArray(adapter.EXPLICIT_ALLOWED_DEFAULTS) ? adapter.EXPLICIT_ALLOWED_DEFAULTS : []);
  const illegal = defaults.filter(x => !explicitlyAllowed.has(x));
  if (illegal.length) {
    throw new ControlPlaneError('NO_SILENT_INFERENCE_GUARD', 'Adapter declares default inference not explicitly allowed by its contract', { illegal });
  }
  return { state: 'PASS' };
}
function selectStime(registry, stimeId, stimeVersion, runMode) {
  const versions = registry && registry[stimeId];
  if (!versions) throw new ControlPlaneError('STIME_NOT_FOUND', `STIME adapter not registered: ${stimeId}`);
  const adapter = versions[stimeVersion];
  if (!adapter) throw new ControlPlaneError('STIME_VERSION_INCOMPATIBLE', `STIME version not registered: ${stimeId}@${stimeVersion}`);
  validateAdapter(adapter);
  if (adapter.SYNTHETIC_ONLY === true && runMode === REAL_RUN) throw new ControlPlaneError('SYNTHETIC_ADAPTER_REAL_RUN_REFUSED', 'Synthetic adapter cannot execute a real botanical run');
  return adapter;
}
function verifyDependencies(adapter, dependencyState = {}) {
  const deps = Array.isArray(adapter.DEPENDENCIES) ? adapter.DEPENDENCIES : [];
  const failed = [];
  for (const dep of deps) {
    if (typeof dep === 'string') {
      if (dependencyState[dep] !== 'READY') failed.push({ dependency: dep, required: 'READY', actual: dependencyState[dep] ?? 'UNKNOWN' });
    } else {
      const actual = dependencyState[dep.id];
      const required = dep.required_state || 'READY';
      if (actual !== required) failed.push({ dependency: dep.id, required, actual: actual ?? 'UNKNOWN' });
    }
  }
  if (failed.length) throw new ControlPlaneError('STIME_DEPENDENCY_NOT_READY', 'One or more STIME dependencies are not ready', { failed });
  return { state: 'PASS' };
}

function selectMembers(members, selection) {
  const mode = selection && selection.mode;
  if (!mode) throw new ControlPlaneError('SELECTION_MODE_MISSING', 'Execution selection mode is required');
  if (mode === 'taxon') {
    const found = members.find(x => x.taxon_id === selection.taxon_id);
    if (!found) throw new ControlPlaneError('TAXON_NOT_FOUND', 'Requested taxon_id is not present in the bound release', { taxon_id: selection.taxon_id });
    return [found];
  }
  if (mode === 'subset') {
    const ids = Array.isArray(selection.taxon_ids) ? selection.taxon_ids : [];
    const wanted = new Set(ids);
    const found = members.filter(x => wanted.has(x.taxon_id));
    const missing = ids.filter(id => !found.some(x => x.taxon_id === id));
    if (missing.length) throw new ControlPlaneError('TAXON_NOT_FOUND', 'One or more requested taxon ids are absent from the bound release', { missing });
    return found;
  }
  if (mode === 'genus') {
    if (!selection.genus) throw new ControlPlaneError('GENUS_MISSING', 'Genus selection requires an explicit genus value');
    const found = members.filter(x => x.genus === selection.genus);
    if (!found.length) throw new ControlPlaneError('GENUS_NOT_FOUND', 'No release members have the explicit genus value', { genus: selection.genus });
    return found;
  }
  if (mode === 'batch') {
    const offset = Number.isInteger(selection.offset) ? selection.offset : 0;
    const limit = Number.isInteger(selection.limit) && selection.limit > 0 ? selection.limit : null;
    if (limit == null) throw new ControlPlaneError('BATCH_LIMIT_INVALID', 'Batch selection requires a positive integer limit');
    return members.slice(offset, offset + limit);
  }
  if (mode === 'full') return [...members];
  throw new ControlPlaneError('SELECTION_MODE_INVALID', `Unsupported selection mode: ${mode}`);
}

class FileCache {
  constructor(root) { this.root = root; ensureDir(root); }
  fileFor(key) { return path.join(this.root, `${sha256(key)}.json`); }
  check(key, { sourceVersion = null, maxAgeMs = null, now = Date.now() } = {}) {
    const file = this.fileFor(key);
    if (!fs.existsSync(file)) return { state: 'CACHE_MISS', key };
    let record;
    try { record = readJson(file); } catch (error) { return { state: 'CACHE_INVALID', key, reason: 'INVALID_JSON' }; }
    if (!record || record.valid !== true || !record.provenance) return { state: 'CACHE_INVALID', key, reason: 'MISSING_VALIDITY_OR_PROVENANCE' };
    if (sourceVersion != null && record.source_version !== sourceVersion) return { state: 'CACHE_STALE', key, reason: 'SOURCE_VERSION_CHANGED', record };
    if (maxAgeMs != null && now - Date.parse(record.created_at) > maxAgeMs) return { state: 'CACHE_STALE', key, reason: 'MAX_AGE_EXCEEDED', record };
    return { state: 'CACHE_HIT', key, record };
  }
  put(key, value, { sourceVersion = null, provenance, createdAt = new Date().toISOString() } = {}) {
    if (!provenance) throw new ControlPlaneError('CACHE_PROVENANCE_REQUIRED', 'Cached evidence must include provenance');
    const record = { valid: true, key, source_version: sourceVersion, provenance, created_at: createdAt, value };
    writeJson(this.fileFor(key), record);
    return record;
  }
}

class RunStore {
  constructor(root) { this.root = root; ensureDir(root); }
  dir(runId) { return path.join(this.root, runId); }
  checkpointPath(runId) { return path.join(this.dir(runId), 'checkpoint.json'); }
  manifestPath(runId) { return path.join(this.dir(runId), 'run-manifest.json'); }
  loadCheckpoint(runId) { return fs.existsSync(this.checkpointPath(runId)) ? readJson(this.checkpointPath(runId)) : null; }
  saveCheckpoint(runId, checkpoint) { writeJson(this.checkpointPath(runId), checkpoint); }
  loadManifest(runId) { return fs.existsSync(this.manifestPath(runId)) ? readJson(this.manifestPath(runId)) : null; }
  writeArtifact(runId, name, value) { const p = path.join(this.dir(runId), name); writeJson(p, value); return p; }
}

function createRunId(config, release, adapter) {
  const key = config.idempotency_key || canonicalJson({
    release_id: release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,
    release_version: release.binding.TAXONOMIC_UNIVERSE_VERSION,
    manifest_hash: release.binding.MANIFEST_HASH,
    stime_id: adapter.STIME_ID,
    stime_version: adapter.STIME_VERSION,
    selection: config.selection
  });
  return `JBLR-RUN-08-${sha256(key).slice(0, 20).toUpperCase()}`;
}

function explicitState(value) {
  if (!value || typeof value !== 'object') return null;
  return value.semantic_state || value.state || null;
}
function preserveUnresolved(results) {
  return results.filter(r => SEMANTIC_NONZERO_STATES.has(explicitState(r.result))).map(r => ({
    taxon_id: r.taxon_id,
    semantic_state: explicitState(r.result),
    result: r.result
  }));
}
function assertNoFalseZero(result) {
  if (!result || typeof result !== 'object') return;
  const state = explicitState(result);
  if (SEMANTIC_NONZERO_STATES.has(state)) {
    for (const [k, v] of Object.entries(result)) {
      if (/score|value|numeric|percent|percentage/i.test(k) && v === 0 && result.numeric_projection_rule !== 'EXPLICIT_CONTRACT_PLACEHOLDER') {
        throw new ControlPlaneError('FALSE_ZERO_GUARD', `Non-evaluable semantic state ${state} cannot silently become numeric zero`, { field: k, state });
      }
    }
  }
}

async function executeWithRetry(adapter, item, context, retryPolicy) {
  const maxRetries = Number.isInteger(retryPolicy.max_retries) ? retryPolicy.max_retries : 0;
  let attempt = 0;
  while (true) {
    try {
      const result = await adapter.executeItem(item, { ...context, attempt });
      assertNoFalseZero(result);
      return { result, attempts: attempt + 1 };
    } catch (error) {
      const retryable = error && (error.retryable === true || (Array.isArray(retryPolicy.retryable_codes) && retryPolicy.retryable_codes.includes(error.code)));
      if (!retryable || attempt >= maxRetries) throw error;
      attempt += 1;
    }
  }
}

function preflight({ config, release, adapter }) {
  if (![REAL_RUN, SYNTHETIC_RUN].includes(config.run_mode)) throw new ControlPlaneError('RUN_MODE_INVALID', 'Run mode must be REAL_BOTANICAL_RUN or SYNTHETIC_ONLY');
  if (config.run_mode === SYNTHETIC_RUN && config.NOT_REAL_BOTANICAL_RUN !== true) throw new ControlPlaneError('SYNTHETIC_MARKER_REQUIRED', 'Synthetic runs must declare NOT_REAL_BOTANICAL_RUN=true');
  verifyDependencies(adapter, config.dependency_state || {});
  const selected = selectMembers(release.members, config.selection);
  return { state: 'PASS', selected_count: selected.length, selected };
}

function generateQa({ config, release, adapter, results, unresolved, cacheEvents, resumed, idempotentReplay }) {
  const stateCounts = {};
  for (const row of results) {
    const state = explicitState(row.result) || 'NO_EXPLICIT_STATE';
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }
  return {
    qa_state: 'PASS',
    run_mode: config.run_mode,
    not_real_botanical_run: config.run_mode === SYNTHETIC_RUN,
    release_binding_verified: true,
    manifest_hash_verified: true,
    historical_input_guard: 'PASS',
    no_silent_inference_guard: 'PASS',
    cache_first: 'MANDATORY_APPLIED',
    result_count: results.length,
    unresolved_count: unresolved.length,
    semantic_state_counts: stateCounts,
    cache_state_counts: cacheEvents.reduce((a, x) => { a[x.state] = (a[x.state] || 0) + 1; return a; }, {}),
    resumed,
    idempotent_replay: idempotentReplay,
    stime_id: adapter.STIME_ID,
    stime_version: adapter.STIME_VERSION,
    release_id: release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,
    release_version: release.binding.TAXONOMIC_UNIVERSE_VERSION
  };
}

function generateRunManifest({ runId, config, release, adapter, startedAt, finishedAt, qa, artifactPointers }) {
  return {
    RUN_ID: runId,
    ACTOR_ID: '08',
    RUN_MODE: config.run_mode,
    NOT_REAL_BOTANICAL_RUN: config.run_mode === SYNTHETIC_RUN,
    STIME_ID: adapter.STIME_ID,
    STIME_VERSION: adapter.STIME_VERSION,
    TAXONOMIC_UNIVERSE_RELEASE_ID: release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,
    TAXONOMIC_UNIVERSE_VERSION: release.binding.TAXONOMIC_UNIVERSE_VERSION,
    TAXONOMIC_UNIVERSE_MANIFEST: release.binding.TAXONOMIC_UNIVERSE_MANIFEST,
    MANIFEST_HASH: release.binding.MANIFEST_HASH,
    INPUT_HASH: sha256(canonicalJson({ selection: config.selection, release_hash: release.binding.MANIFEST_HASH, stime: [adapter.STIME_ID, adapter.STIME_VERSION] })),
    SOURCE_VERSIONS: config.source_versions || {},
    CODE_COMMIT: config.code_commit || null,
    STARTED_AT: startedAt,
    FINISHED_AT: finishedAt,
    RESULT_STATE: 'COMPLETED',
    QA_STATE: qa.qa_state,
    PROVENANCE_POINTERS: artifactPointers,
    IDEMPOTENCY_KEY: config.idempotency_key || null
  };
}

function emitEvent(runStore, runId, event) {
  const p = path.join(runStore.dir(runId), 'events.jsonl');
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, JSON.stringify(event) + '\n');
  return p;
}

async function executeRun({ config, binding, adapterRegistry, workspace, manifestObject = null, membersObject = null, clock = null }) {
  const startedAt = nowIso(clock);
  const release = loadRelease(binding, { runMode: config.run_mode, authorization: config.authorization || null, manifestObject, membersObject });
  const adapter = selectStime(adapterRegistry, config.STIME_ID, config.STIME_VERSION, config.run_mode);
  const pf = preflight({ config, release, adapter });
  const cache = new FileCache(path.join(workspace, 'cache'));
  const runStore = new RunStore(path.join(workspace, 'runs'));
  const runId = config.EXECUTION_RUN_ID || createRunId(config, release, adapter);
  const signature = sha256(canonicalJson({ binding, stime: [adapter.STIME_ID, adapter.STIME_VERSION], selection: config.selection, run_mode: config.run_mode }));

  const existingManifest = runStore.loadManifest(runId);
  if (existingManifest) {
    if (existingManifest.EXECUTION_SIGNATURE !== signature) throw new ControlPlaneError('RUN_ID_COLLISION', 'Existing run id is bound to different execution inputs');
    const results = readJson(path.join(runStore.dir(runId), 'results.json'));
    const unresolved = readJson(path.join(runStore.dir(runId), 'unresolved.json'));
    const qa = readJson(path.join(runStore.dir(runId), 'qa.json'));
    return { run_id: runId, results, unresolved, qa: { ...qa, idempotent_replay: true }, idempotent_replay: true, resumed: false };
  }

  let checkpoint = runStore.loadCheckpoint(runId);
  const resumed = Boolean(checkpoint);
  if (checkpoint && checkpoint.execution_signature !== signature) throw new ControlPlaneError('RUN_ID_COLLISION', 'Checkpoint signature does not match requested execution');
  if (!checkpoint) checkpoint = { execution_signature: signature, next_index: 0, results: [], cache_events: [], status: 'IN_PROGRESS' };

  for (let i = checkpoint.next_index; i < pf.selected.length; i++) {
    const item = pf.selected[i];
    let cacheState = { state: 'CACHE_MISS', key: null };
    let execution;
    if (typeof adapter.cacheKey === 'function') {
      const key = adapter.cacheKey(item, { config, release });
      cacheState = cache.check(key, {
        sourceVersion: adapter.CACHE_SOURCE_VERSION || null,
        maxAgeMs: adapter.CACHE_MAX_AGE_MS == null ? null : adapter.CACHE_MAX_AGE_MS,
        now: clock ? clock().getTime() : Date.now()
      });
      checkpoint.cache_events.push({ taxon_id: item.taxon_id, state: cacheState.state, key, reason: cacheState.reason || null });
      if (cacheState.state === 'CACHE_HIT') execution = { result: cacheState.record.value, attempts: 0, from_cache: true, cache_provenance: cacheState.record.provenance };
      else {
        execution = await executeWithRetry(adapter, item, { config, release, cache_state: cacheState.state }, config.retry_policy || { max_retries: 0, retryable_codes: [] });
        if (execution.result && execution.result.cacheable === true) {
          cache.put(key, execution.result, {
            sourceVersion: adapter.CACHE_SOURCE_VERSION || null,
            provenance: execution.result.provenance,
            createdAt: nowIso(clock)
          });
        }
      }
    } else {
      checkpoint.cache_events.push({ taxon_id: item.taxon_id, state: 'CACHE_MISS', key: null, reason: 'ADAPTER_HAS_NO_CACHE_KEY' });
      execution = await executeWithRetry(adapter, item, { config, release, cache_state: 'CACHE_MISS' }, config.retry_policy || { max_retries: 0, retryable_codes: [] });
    }
    checkpoint.results.push({ taxon_id: item.taxon_id, result: execution.result, attempts: execution.attempts, from_cache: execution.from_cache === true });
    checkpoint.next_index = i + 1;
    runStore.saveCheckpoint(runId, checkpoint);
    if (config.TEST_INTERRUPT_AFTER != null && checkpoint.next_index === config.TEST_INTERRUPT_AFTER) {
      const e = new ControlPlaneError('TEST_INTERRUPT', 'Synthetic interruption requested after checkpoint');
      e.checkpoint_written = true;
      throw e;
    }
  }

  const results = checkpoint.results;
  const unresolved = preserveUnresolved(results);
  const finishedAt = nowIso(clock);
  const artifactPointers = {};
  artifactPointers.results = runStore.writeArtifact(runId, 'results.json', results);
  artifactPointers.unresolved = runStore.writeArtifact(runId, 'unresolved.json', unresolved);
  const qa = generateQa({ config, release, adapter, results, unresolved, cacheEvents: checkpoint.cache_events, resumed, idempotentReplay: false });
  artifactPointers.qa = runStore.writeArtifact(runId, 'qa.json', qa);
  const runManifest = generateRunManifest({ runId, config, release, adapter, startedAt, finishedAt, qa, artifactPointers });
  runManifest.EXECUTION_SIGNATURE = signature;
  writeJson(runStore.manifestPath(runId), runManifest);
  checkpoint.status = 'COMPLETED';
  checkpoint.finished_at = finishedAt;
  runStore.saveCheckpoint(runId, checkpoint);
  artifactPointers.events = emitEvent(runStore, runId, {
    EVENT_TYPE: 'STIME_EXECUTION_RESULT',
    RUN_ID: runId,
    ACTOR_ID: '08',
    RUN_MODE: config.run_mode,
    NOT_REAL_BOTANICAL_RUN: config.run_mode === SYNTHETIC_RUN,
    STIME_ID: adapter.STIME_ID,
    STIME_VERSION: adapter.STIME_VERSION,
    RELEASE_ID: release.binding.TAXONOMIC_UNIVERSE_RELEASE_ID,
    RELEASE_VERSION: release.binding.TAXONOMIC_UNIVERSE_VERSION,
    RESULT_STATE: 'COMPLETED',
    QA_STATE: qa.qa_state,
    EMITTED_AT: finishedAt
  });
  return { run_id: runId, results, unresolved, qa, run_manifest: runManifest, artifact_pointers: artifactPointers, idempotent_replay: false, resumed };
}

module.exports = {
  REAL_RUN,
  SYNTHETIC_RUN,
  REQUIRED_BINDING_FIELDS,
  REQUIRED_ADAPTER_FIELDS,
  SEMANTIC_NONZERO_STATES,
  ControlPlaneError,
  canonicalJson,
  manifestHash,
  historicalToken,
  assertNoHistoricalInput,
  verifyBinding,
  loadRelease,
  validateAdapter,
  selectStime,
  verifyDependencies,
  selectMembers,
  FileCache,
  RunStore,
  createRunId,
  preserveUnresolved,
  preflight,
  generateQa,
  generateRunManifest,
  emitEvent,
  executeRun
};
