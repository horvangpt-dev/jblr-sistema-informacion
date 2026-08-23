'use strict';

const SCOPE_ORDER = ['La Rioja', 'España', 'Europa', 'Mundial', 'Subsidiario'];

function clean(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function fold(v) { return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function scopeOf(r) {
  const t = fold(r.territory_class), s = fold(r.territorial_scope);
  if (t === 'LA_RIOJA' || s === 'LA RIOJA') return 'La Rioja';
  if (t.startsWith('SPAIN_') || ['ESPAÑA','PENÍNSULA','PENINSULA','REGIÓN ATLÁNTICA','REGION ATLANTICA'].includes(s)) return 'España';
  if (t === 'EUROPE_CONTINENTAL_OR_EU27' || s === 'EUROPE' || s === 'EUROPA') return 'Europa';
  if (t === 'GLOBAL' || s === 'MUNDIAL' || s === 'GLOBAL') return 'Mundial';
  if (t === 'OTHER_EUROPEAN_COUNTRY' || t === 'OTHER_EUROPEAN_SUBNATIONAL' || ['COUNTRY','SUB_COUNTRY'].includes(s)) return 'Subsidiario';
  return null;
}
function logicalUnitKey(r) {
  const explicit = clean(r.logical_unit);
  if (explicit) return explicit;
  return [r.source_key || r.source, r.territorial_scope, r.authority_or_category_system || r.category_system || r.normalized_system, r.dataset_or_reference_identity || r.source_identifier || r.source_reference || r.source_url].map(clean).join('||');
}
function scoreScope(records) {
  const by = new Map();
  for (const r of records || []) {
    const score = Number(r.weighted_assessment_score);
    if (!Number.isFinite(score)) continue;
    const key = logicalUnitKey(r);
    const explicitConflict = fold(r.same_unit_conflict) === 'YES';
    const prior = by.get(key);
    if (!prior || score > prior.score) by.set(key, { score, record: r, conflict: explicitConflict || Boolean(prior && prior.conflict) });
    else prior.conflict = prior.conflict || explicitConflict;
  }
  const units = [...by.values()].sort((a,b) => b.score - a.score);
  if (!units.length) return null;
  const top = units.slice(0,3);
  const highest = top[0].score;
  const mean = top.reduce((sum,x) => sum + x.score, 0) / top.length;
  return { score: Math.min(100, 0.8 * highest + 0.2 * mean), principal: top[0].record, logical_units: units.length, conflict: units.some(x => x.conflict), selected: top.map(x => x.record) };
}
function executeAmenaza({ taxon, evidence_records = [], provider_score = null, scope_states = {}, conflict_taxon = false, downstream_requires_number = false, materialized_at = null }) {
  const grouped = new Map(SCOPE_ORDER.map(x => [x, []]));
  for (const r of evidence_records) { const scope = scopeOf(r); if (scope) grouped.get(scope).push(r); }
  let effectiveScope = null, scored = null;
  for (const scope of SCOPE_ORDER) { const candidate = scoreScope(grouped.get(scope)); if (candidate) { effectiveScope = scope; scored = candidate; break; } }
  const taxonState = fold(taxon && (taxon.overall_evidence_state || taxon.identity_state));
  const taxonUnresolved = taxonState === 'TAXON_UNRESOLVED';
  const sourceNotAcquired = evidence_records.length === 0 && Object.values(scope_states).some(v => fold(v) === 'SOURCE_NOT_ACQUIRED');
  const semanticScore = taxonUnresolved || !scored ? null : scored.score;
  let state = 'UNKNOWN';
  if (taxonUnresolved) state = 'TAXON_UNRESOLVED';
  else if (sourceNotAcquired) state = 'SOURCE_NOT_ACQUIRED';
  else if (scored) state = (conflict_taxon || scored.conflict) ? 'SCORED_WITH_CONFLICT' : 'SCORED';
  const placeholder = semanticScore === null && downstream_requires_number === true;
  return {
    semantic_state: state,
    score_state: state,
    score_native_05: provider_score == null || provider_score === '' ? null : Number(provider_score),
    score_stimes_100: semanticScore,
    score_numeric_projection_100: placeholder ? 0 : semanticScore,
    score_numeric_projection_is_placeholder: placeholder,
    score_numeric_projection_semantics: placeholder ? 'TECHNICAL_NON_SEMANTIC_NON_PONDERING' : (semanticScore == null ? null : 'EVALUABLE_SCORE'),
    numeric_projection_rule: placeholder ? 'EXPLICIT_CONTRACT_PLACEHOLDER' : null,
    effective_scope: semanticScore == null ? null : effectiveScope,
    scope_states: { ...scope_states },
    selected_assessments: semanticScore == null ? [] : scored.selected,
    principal_evidence: semanticScore == null ? null : scored.principal,
    evidence_records: [...evidence_records],
    reliability: { state: 'PENDIENTE_DE_DEFINICION', numeric_value: null, category: null },
    model_version: 'AMENAZA_SCORING_MODEL_v1_2',
    execution_policy_version: 'AMENAZA_STIMES_EXECUTION_POLICY_v1_1 v1.1.1',
    materialized_at,
    provenance: { evidence_count: evidence_records.length },
    cacheable: false
  };
}
module.exports = { SCOPE_ORDER, scopeOf, logicalUnitKey, scoreScope, executeAmenaza };
