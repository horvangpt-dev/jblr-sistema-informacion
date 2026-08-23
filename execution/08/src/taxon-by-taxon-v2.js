'use strict';
const crypto = require('node:crypto');
const PROTOCOL_VERSION = 'TAXON_BY_TAXON_v2';
const REGISTRY_VERSION = 'FIELD_SOURCE_REGISTRY_v1';
const STIME_VERSION = 'STIME_00_FIELD_PROTOCOLS_v1';
const RC2 = Object.freeze({
release_id: 'JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2',
release_version: 'v1-rc2',
manifest_pointer: '14f5gaqfLo5doi86REqkN9STnXJJSX0nS',
manifest_sha256: '3336c3481754c77e23f8103b37e1d6b3ffc130dd8ed7cae2df253a06fc0b931a',
qa_pointer: '1Nw_4iAe4HSkRmmHQXNKuSGkOunsf-E-n',
record_count: 2210,
});
const SOURCE_CONFIG = Object.freeze({
EIDOS_LIVE_MITECO_IEPNB: {
fields: new Set(['ID_TAXON_GOBIERNO', 'TAX_EIDOS']),
transport: 'MITECO_EIDOS_TAXONOMY_LIVE_SERVICE',
endpoint: null,
version: null,
binding_state: 'UNVERIFIED_EXTERNAL_ENDPOINT',
},
ANTHOS_RJB_CSIC: {
fields: new Set(['TAX_ANTHOS']),
transport: 'ANTHOS_OFFICIAL_SERVICE_OR_OFFICIAL_RJB_CSIC_DARWIN_CORE_ARCHIVE',
endpoint: null,
version: null,
binding_state: 'UNVERIFIED_EXTERNAL_ENDPOINT_OR_DATASET_VERSION',
},
KEW_POWO_WCVP: {
fields: new Set(['TAX_POWO_WCVP']),
transport: 'POWO_CURRENT_PORTAL_OR_VERSIONED_WCVP_DOWNLOAD_FROM_POWO',
endpoint: 'https://powo.science.kew.org/',
version: null,
binding_state: 'PORTAL_IDENTITY_BOUND_DATASET_VERSION_UNVERIFIED',
},
WORLD_FLORA_ONLINE: {
fields: new Set(['TAX_WFO']),
transport: 'WFO_CURRENT_PORTAL_API_OR_VERSIONED_OFFICIAL_BACKBONE',
endpoint: 'https://www.worldfloraonline.org/',
version: null,
binding_state: 'PORTAL_IDENTITY_BOUND_DATASET_VERSION_UNVERIFIED',
},
EUROPLUSMED_PLANTBASE: {
fields: new Set(['TAX_EUROMED']),
transport: 'CURRENT_EUROPLUSMED_PORTAL',
endpoint: null,
version: null,
binding_state: 'CURRENT_ENDPOINT_UNVERIFIED',
},
HISTORICAL_SOURCE_REGISTRY: {
fields: new Set(['TAX_HISTORICOS']),
transport: 'VERSIONED_EVIDENCE_REGISTRY',
endpoint: null,
version: 'HISTORICAL_SOURCE_REGISTRY_v1',
binding_state: 'INTERNAL_REGISTRY_BOUND',
},
});
const TERMINAL_STATES = new Set([
'FOUND_VALIDATED','FOUND_MULTIPLE_CANDIDATES','FOUND_RELATED_ONLY','FOUND_PARENT_ONLY',
'NOT_FOUND','SOURCE_UNAVAILABLE','SOURCE_ERROR','AMBIGUOUS','CONFLICT','BLOCKED','NOT_EXECUTED'
]);
function sha256(value) {
return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function stableTaxonWorkKey(releaseId, corpusRowId) {
return `TWK-${sha256(`${releaseId}|${corpusRowId}`).slice(0, 24)}`;
}
function queryKey(unit) {
return sha256([
unit.corpus_release_id,
unit.taxon_work_key,
unit.field_target,
unit.source_target,
unit.query_value_verbatim,
unit.protocol_version,
unit.source_adapter_version,
].join('|'));
}
function validateReleaseBinding(binding) {
const values = Object.values(binding || {}).join(' ');
if (/2742|\bV8\b|\bV10\b|B-v2/i.test(values)) {
return { ok: false, state: 'SYSTEMIC_STOP', reason: 'HISTORICAL_UNIVERSE_BINDING_ATTEMPT' };
}
const required = ['corpus_release_id','corpus_release_version','corpus_manifest_pointer','corpus_manifest_sha256','corpus_qa_state'];
for (const k of required) {
if (!binding || binding[k] == null || binding[k] === '') {
return { ok: false, state: 'BLOCKED_INVALID_CORPUS_BINDING', reason: `MISSING_${k.toUpperCase()}` };
}
}
if (binding.corpus_release_id !== RC2.release_id ||
binding.corpus_release_version !== RC2.release_version ||
binding.corpus_manifest_pointer !== RC2.manifest_pointer ||
binding.corpus_manifest_sha256 !== RC2.manifest_sha256 ||
!['PASS','ACCEPTED','PUBLISHED_AUTHORIZED_FOR_DOWNSTREAM_MEMBERSHIP_INPUT'].includes(binding.corpus_qa_state)) {
return { ok: false, state: 'BLOCKED_INVALID_CORPUS_BINDING', reason: 'RC2_BINDING_MISMATCH' };
}
return { ok: true, state: 'VALID_RC2_BINDING' };
}
function normalizeRank(name) {
const s = String(name || '');
if (/\bsubsp\./i.test(s)) return 'subspecies';
if (/\bsubvar\./i.test(s)) return 'subvariety';
if (/\bvar\./i.test(s)) return 'variety';
if (/(?:^|\s)(gr\.|grupo)(?:\s|$)/i.test(s)) return 'group';
if (/(?:^|\s)sp\.(?:\s|$)/i.test(s)) return 'genus_sp';
return 'species';
}
function hasHybridToken(name) {
return /(^|\s)[×x](\s|$)/u.test(String(name || ''));
}
function identityGuard(queryName, candidate) {
const qRank = normalizeRank(queryName);
const cRank = candidate.rank || normalizeRank(candidate.returned_name);
if (hasHybridToken(queryName) !== hasHybridToken(candidate.returned_name)) {
return { exact: false, state: 'FOUND_RELATED_ONLY', reason: 'HYBRID_TOKEN_MISMATCH' };
}
if (qRank !== cRank) {
if (candidate.parent_of_query === true) return { exact: false, state: 'FOUND_PARENT_ONLY', reason: 'PARENT_ONLY' };
return { exact: false, state: 'FOUND_RELATED_ONLY', reason: 'RANK_MISMATCH' };
}
if (candidate.parent_of_query === true) return { exact: false, state: 'FOUND_PARENT_ONLY', reason: 'PARENT_ONLY' };
if (candidate.ambiguous === true) return { exact: false, state: 'AMBIGUOUS', reason: 'AMBIGUOUS_CANDIDATE' };
if (candidate.fuzzy_only === true) return { exact: false, state: 'FOUND_RELATED_ONLY', reason: 'FUZZY_NOT_IDENTITY' };
if (candidate.same_taxon !== true) return { exact: false, state: 'FOUND_RELATED_ONLY', reason: 'SAME_TAXON_NOT_EVIDENCED' };
return { exact: true, state: 'FOUND_VALIDATED', reason: 'EXACT_SAME_TAXON' };
}
class FixtureAdapter {
constructor(sourceId, fixtures = {}, options = {}) {
if (!SOURCE_CONFIG[sourceId]) throw new Error(`UNKNOWN_SOURCE:${sourceId}`);
this.sourceId = sourceId;
this.fixtures = fixtures;
this.version = options.version || 'fixture-v1';
this.adapterVersion = options.adapterVersion || `${sourceId}-adapter-v1`;
}
query(unit, attempt = 0) {
const key = `${unit.field_target}|${unit.query_value_verbatim}`;
const fixture = this.fixtures[key] ?? this.fixtures[unit.query_value_verbatim] ?? { status: 200, scope_complete: true, candidates: [] };
if (Array.isArray(fixture.sequence)) return fixture.sequence[Math.min(attempt, fixture.sequence.length - 1)];
return fixture;
}
}
class TaxonByTaxonEngine {
constructor({ binding, adapters = {}, idMappingGate = 'HOLD_PENDING_0000', maxRetries = 2 } = {}) {
this.binding = binding;
this.adapters = adapters;
this.idMappingGate = idMappingGate;
this.maxRetries = maxRetries;
this.resultsByQueryKey = new Map();
this.assertions = new Map();
this.rawEvidence = new Map();
this.namesByTaxon = new Map();
this.coverage = new Map();
this.previousIds = new Map();
this.historicalByTaxon = new Map();
this.metrics = { cross_taxon_mutations: 0, assertions_without_evidence: 0, false_not_found_from_source_error: 0, untracked_query_names: 0 };
}
assertBinding() {
const v = validateReleaseBinding(this.binding);
if (!v.ok && v.state === 'SYSTEMIC_STOP') throw new Error(`SYSTEMIC_STOP:${v.reason}`);
return v;
}
makeUnit({ run_id='RUN-CONTROLLED', corpus_row_id='ROW:0001', field_target, source_target, query_value_verbatim, query_value_origin='TAX_RIOJA', query_reason='INITIAL_RIOJA_QUERY', id_taxon_jblr_current=null }) {
const taxon_work_key = stableTaxonWorkKey(this.binding.corpus_release_id, corpus_row_id);
return {
run_id,
query_unit_id: `QU-${sha256(`${run_id}|${corpus_row_id}|${field_target}|${source_target}|${query_value_verbatim}`).slice(0,20)}`,
protocol_version: PROTOCOL_VERSION,
corpus_release_id: this.binding.corpus_release_id,
corpus_release_version: this.binding.corpus_release_version,
corpus_manifest_pointer: this.binding.corpus_manifest_pointer,
corpus_manifest_sha256: this.binding.corpus_manifest_sha256,
corpus_row_id,
taxon_work_key,
id_taxon_jblr_current,
field_target,
source_target,
source_adapter_version: this.adapters[source_target]?.adapterVersion || `${source_target}-adapter-v1`,
query_value_verbatim,
query_value_transport: query_value_verbatim,
transport_transformation_rule: 'IDENTITY',
query_value_origin,
query_reason,
};
}
_authorized(unit) {
const cfg = SOURCE_CONFIG[unit.source_target];
return !!cfg && cfg.fields.has(unit.field_target);
}
_captureRaw(unit, response, attempt) {
const raw = JSON.stringify(response);
const pointer = `memory://raw/${unit.query_unit_id}/attempt-${attempt}`;
this.rawEvidence.set(pointer, raw);
return { pointer, hash: sha256(raw) };
}
_writeAssertion(unit, candidate, rawPointer, result) {
if (!rawPointer) {
this.metrics.assertions_without_evidence += 1;
throw new Error('ASSERTION_WITHOUT_EVIDENCE');
}
if (candidate.output_taxon_work_key && candidate.output_taxon_work_key !== unit.taxon_work_key) {
this.metrics.cross_taxon_mutations += 1;
throw new Error('SYSTEMIC_STOP:CROSS_TAXON_MUTATION_ATTEMPT');
}
const key = `${unit.taxon_work_key}|${unit.field_target}`;
const value = unit.field_target === 'ID_TAXON_GOBIERNO' ? candidate.external_id : candidate.accepted_name || candidate.returned_name;
const assertion = {
taxon_work_key: unit.taxon_work_key,
field_target: unit.field_target,
field_value: value || null,
source_target: unit.source_target,
evidence_pointer: rawPointer,
assertion_rule_id: `${STIME_VERSION}:${unit.field_target}`,
};
const prior = this.assertions.get(key);
if (!prior || JSON.stringify(prior) !== JSON.stringify(assertion)) this.assertions.set(key, assertion);
result.field_value = assertion.field_value;
result.field_state = 'ASSERTED_FROM_VALIDATED_SOURCE_EVIDENCE';
result.assertion_rule_id = assertion.assertion_rule_id;
result.assertion_evidence_pointer = rawPointer;
}
_recordName(unit, name, relation='SOURCE_VALIDATED') {
if (!name) return false;
const set = this.namesByTaxon.get(unit.taxon_work_key) || new Map();
const normalized = String(name);
const existing = set.get(normalized);
if (!existing) {
set.set(normalized, { value: normalized, relation, origin: unit.field_target, evidence: unit.query_unit_id, sources_terminal: new Set() });
this.namesByTaxon.set(unit.taxon_work_key, set);
return true;
}
return false;
}
execute(unit) {
const binding = this.assertBinding();
if (!binding.ok) return { core_state: 'BLOCKED', qa_state: 'FAIL', qa_notes: binding.reason };
if (unit.protocol_version !== PROTOCOL_VERSION || unit.corpus_release_id !== this.binding.corpus_release_id) throw new Error('SYSTEMIC_STOP:SCHEMA_OR_BINDING_MISMATCH');
if (!this._authorized(unit)) throw new Error('SYSTEMIC_STOP:SOURCE_FIELD_NOT_AUTHORIZED');
this._recordName(unit, unit.query_value_verbatim, 'AUTHORIZED_QUERY_INPUT');
const qk = queryKey(unit);
if (this.resultsByQueryKey.has(qk)) return this.resultsByQueryKey.get(qk);
const adapter = this.adapters[unit.source_target];
if (!adapter) throw new Error(`SOURCE_ADAPTER_MISSING:${unit.source_target}`);
let response;
let raw;
let attempt = 0;
for (; attempt <= this.maxRetries; attempt++) {
response = adapter.query(unit, attempt);
raw = this._captureRaw(unit, response, attempt);
const status = response.status;
const retryable = response.timeout || status === 429 || (typeof status === 'number' && status >= 500);
if (!retryable) break;
}
const result = {
run_id: unit.run_id,
query_unit_id: unit.query_unit_id,
protocol_version: PROTOCOL_VERSION,
taxon_work_key: unit.taxon_work_key,
id_taxon_jblr_at_query: unit.id_taxon_jblr_current,
field_target: unit.field_target,
source_target: unit.source_target,
query_value_verbatim: unit.query_value_verbatim,
query_value_transport: unit.query_value_transport,
source_request_pointer: `fixture://${unit.source_target}/${encodeURIComponent(unit.query_value_transport || unit.query_value_verbatim)}`,
source_response_status: String(response.status ?? (response.timeout ? 'TIMEOUT' : 'UNKNOWN')),
raw_payload_pointer: raw?.pointer || null,
raw_payload_hash: raw?.hash || null,
source_snapshot_version: adapter.version,
queried_at: new Date().toISOString(),
candidate_count: Array.isArray(response.candidates) ? response.candidates.length : 0,
candidates: Array.isArray(response.candidates) ? response.candidates : [],
field_value: null,
field_state: null,
assertion_rule_id: null,
assertion_evidence_pointer: null,
parent_reference_id: null,
new_validated_query_names: [],
retry_count: Math.min(attempt, this.maxRetries),
qa_state: 'PASS',
qa_notes: null,
};
const retryExhausted = response.timeout || response.status === 429 || (typeof response.status === 'number' && response.status >= 500);
if (retryExhausted) {
result.core_state = response.parser_error ? 'SOURCE_ERROR' : 'SOURCE_UNAVAILABLE';
result.qa_state = 'REVIEW_REQUIRED';
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
if (response.parser_error) {
if (response.systemic) throw new Error('SYSTEMIC_STOP:PARSER_SYSTEMICALLY_BROKEN');
result.core_state = 'SOURCE_ERROR';
result.qa_state = 'REVIEW_REQUIRED';
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
if (!raw?.pointer) {
result.core_state = 'BLOCKED';
result.qa_state = 'FAIL';
result.qa_notes = 'RAW_EVIDENCE_NOT_PRESERVED';
this.resultsByQueryKey.set(qk, result);
return result;
}
const candidates = result.candidates;
if (!candidates.length) {
if (response.status >= 200 && response.status < 300 && response.scope_complete === true) {
result.core_state = 'NOT_FOUND';
} else {
result.core_state = 'SOURCE_ERROR';
result.qa_state = 'REVIEW_REQUIRED';
}
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
if (candidates.length > 1 && !response.selected_index && response.selected_index !== 0) {
result.core_state = 'FOUND_MULTIPLE_CANDIDATES';
result.qa_state = 'REVIEW_REQUIRED';
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
const candidate = candidates[response.selected_index ?? 0];
if (unit.source_target === 'EUROPLUSMED_PLANTBASE' && candidate.legacy_only === true) {
result.core_state = 'SOURCE_UNAVAILABLE';
result.qa_state = 'REVIEW_REQUIRED';
result.qa_notes = 'LEGACY_EUROMED_SUPPORT_ONLY_CURRENT_FIELD_UNRESOLVED';
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
const guard = identityGuard(unit.query_value_verbatim, candidate);
result.core_state = guard.state;
if (!guard.exact) {
if (guard.state === 'FOUND_PARENT_ONLY') result.parent_reference_id = candidate.external_id || null;
result.qa_state = 'REVIEW_REQUIRED';
result.qa_notes = guard.reason;
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
result.core_state = 'FOUND_VALIDATED';
this._writeAssertion(unit, candidate, raw.pointer, result);
const discovered = candidate.accepted_name || candidate.returned_name;
if (discovered && discovered !== unit.query_value_verbatim && this._recordName(unit, discovered)) result.new_validated_query_names.push(discovered);
if (candidate.synonyms) {
for (const syn of candidate.synonyms) if (candidate.synonym_relations_evidenced !== false && this._recordName(unit, syn, 'SOURCE_ASSERTED_SYNONYM')) result.new_validated_query_names.push(syn);
}
this.resultsByQueryKey.set(qk, result);
this._markCoverage(unit, result.core_state);
return result;
}
_markCoverage(unit, state) {
const key = `${unit.taxon_work_key}|${unit.query_value_verbatim}|${unit.source_target}`;
this.coverage.set(key, state);
const names = this.namesByTaxon.get(unit.taxon_work_key);
if (names?.has(unit.query_value_verbatim) && TERMINAL_STATES.has(state)) names.get(unit.query_value_verbatim).sources_terminal.add(unit.source_target);
}
deriveJblrId(taxonWorkKey, governmentId, currentId=null) {
if (!['OPEN_CANONICAL','OPEN_CANONICAL_TEST_ONLY'].includes(this.idMappingGate)) {
return { id_taxon_jblr: currentId, state: 'HOLD_PENDING_0000_ID_MAPPING_RESOLUTION', previous_ids: this.previousIds.get(taxonWorkKey) || [] };
}
const previous = this.previousIds.get(taxonWorkKey) || [];
if (governmentId) {
if (currentId && currentId !== governmentId && !previous.includes(currentId)) previous.push(currentId);
this.previousIds.set(taxonWorkKey, previous);
return { id_taxon_jblr: governmentId, state: currentId && currentId !== governmentId ? 'TEMPORARY_SUPERSEDED_BY_GOVERNMENT_ID' : 'GOVERNMENT_ID_INHERITED', previous_ids: [...previous] };
}
const temp = currentId || `JBLR-TEMP-${sha256(taxonWorkKey).slice(0,16).toUpperCase()}`;
return { id_taxon_jblr: temp, state: 'TEMPORARY_JBLR_GENERATED', previous_ids: [...previous] };
}
addValidatedHistoricalName(taxonWorkKey, name, evidencePointer, source='HISTORICAL_SOURCE_REGISTRY') {
if (!evidencePointer) return { promoted: false, state: 'CANDIDATE_ONLY_NO_RELATION_EVIDENCE' };
const mockUnit = { taxon_work_key: taxonWorkKey, field_target: 'TAX_HISTORICOS', query_unit_id: `HIST-${sha256(name).slice(0,8)}` };
const promoted = this._recordName(mockUnit, name, 'HISTORICAL_RELATION_EVIDENCED');
const list = this.historicalByTaxon.get(taxonWorkKey) || [];
if (!list.some(x => x.name === name)) list.push({ name, evidence_pointer: evidencePointer, source });
this.historicalByTaxon.set(taxonWorkKey, list);
return { promoted, state: promoted ? 'HISTORICAL_NAME_PROMOTED' : 'ALREADY_TRACKED', field: `TAX_HISTORICO_${list.findIndex(x=>x.name===name)+1}` };
}
pendingPairs(taxonWorkKey, requiredSources) {
const names = this.namesByTaxon.get(taxonWorkKey) || new Map();
const pending = [];
for (const item of names.values()) {
for (const source of requiredSources) {
const key = `${taxonWorkKey}|${item.value}|${source}`;
if (!TERMINAL_STATES.has(this.coverage.get(key))) pending.push([item.value, source]);
}
}
return pending;
}
fixpointReached(taxonWorkKey, requiredSources) {
return this.pendingPairs(taxonWorkKey, requiredSources).length === 0;
}
humanView(taxonWorkKey, taxRioja) {
const row = { TAXON_WORK_KEY: taxonWorkKey, TAX_RIOJA: taxRioja, ID_TAXON_GOBIERNO: null, ID_TAXON_JBLR: null, TAX_EIDOS: null, TAX_ANTHOS: null, TAX_POWO_WCVP: null, TAX_WFO: null, TAX_EUROMED: null };
const historical = (this.historicalByTaxon.get(taxonWorkKey) || []).map(x => x.name);
for (const assertion of this.assertions.values()) {
if (assertion.taxon_work_key !== taxonWorkKey) continue;
if (assertion.field_target !== 'TAX_HISTORICOS') row[assertion.field_target] = assertion.field_value;
}
historical.forEach((v, i) => { row[`TAX_HISTORICO_${i+1}`] = v; });
return row;
}
reviewRequired(taxonWorkKey) {
const reviewStates = new Set(['FOUND_MULTIPLE_CANDIDATES','FOUND_RELATED_ONLY','FOUND_PARENT_ONLY','SOURCE_UNAVAILABLE','SOURCE_ERROR','AMBIGUOUS','CONFLICT','BLOCKED']);
return [...this.resultsByQueryKey.values()].filter(r => r.taxon_work_key === taxonWorkKey && reviewStates.has(r.core_state));
}
qaRun() {
const pass = this.metrics.cross_taxon_mutations === 0 && this.metrics.assertions_without_evidence === 0 && this.metrics.false_not_found_from_source_error === 0 && this.metrics.untracked_query_names === 0;
return { state: pass ? 'PASS' : 'FAIL', ...this.metrics };
}
}
module.exports = {
PROTOCOL_VERSION, REGISTRY_VERSION, STIME_VERSION, RC2, SOURCE_CONFIG,
stableTaxonWorkKey, queryKey, validateReleaseBinding, identityGuard,
FixtureAdapter, TaxonByTaxonEngine,
};
