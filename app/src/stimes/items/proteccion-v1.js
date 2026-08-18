'use strict';

const contract = require('./proteccion-v1.contract.json');
const equivalence = require('./proteccion-category-equivalence-v2.json');

const MAP = new Map(equivalence.entries.map(e => [e.category_class, e]));
const APPLICABLE = new Set(['APPLICABLE_LA_RIOJA','APPLICABLE_NATIONAL','APPLICABLE_EU','APPLICABLE_INTERNATIONAL']);
const EFFECTIVE_MAPPING_STATES = new Set([
  'ACTIVE_WHEN_PRIMARY_LAW_VERIFIED',
  'ACTIVE_WHEN_PRIMARY_LAW_AND_TAXON_ANNEX_VERIFIED',
  'ACTIVE_WHEN_PRIMARY_LAW_TAXON_AND_SITE_VERIFIED',
  'SOURCE_DEPENDENT_PRIMARY_VERIFICATION_REQUIRED'
]);
const NON_PROTECTIVE_MAPPING_STATES = new Set([
  'CONTEXT_ONLY_NOT_EFFECTIVE_PROTECTION',
  'HISTORICAL_OR_CONTEXT_ONLY_NOT_EFFECTIVE_CURRENT_PROTECTION'
]);

function text(value) { return String(value == null ? '' : value).trim(); }
function folded(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function resolveApplicability(record) {
  const explicitSub = folded(record.sub_country || record.autonomous_community);
  const jurisdiction = folded(record.jurisdiction_name);
  const scope = folded(record.jurisdiction_level || record.territorial_scope || record.scope_normalized);
  const autonomousSignal = scope.includes('AUTONOM') || folded(record.jurisdiction_level).includes('AUTONOM');

  if (explicitSub) {
    if (explicitSub.includes('LA RIOJA')) return 'APPLICABLE_LA_RIOJA';
    return 'EXTERNAL_AUTONOMOUS_REFERENCE';
  }
  if (autonomousSignal) {
    if (jurisdiction.includes('LA RIOJA')) return 'APPLICABLE_LA_RIOJA';
    if (jurisdiction) return 'EXTERNAL_AUTONOMOUS_REFERENCE';
    return 'UNKNOWN_JURISDICTION';
  }
  if (scope.includes('LA RIOJA') || jurisdiction.includes('LA RIOJA')) return 'APPLICABLE_LA_RIOJA';
  if (scope.includes('NACIONAL') || scope.includes('SPAIN') || scope.includes('ESPANA') || scope.includes('STATE') || jurisdiction === 'ESPANA' || jurisdiction === 'SPAIN') return 'APPLICABLE_NATIONAL';
  if (scope.includes('EUROPE') || scope === 'EU' || scope.includes('UNION EUROPEA') || jurisdiction === 'EU' || jurisdiction.includes('UNION EUROPEA')) return 'APPLICABLE_EU';
  if (scope.includes('INTERNACIONAL') || scope.includes('INTERNATIONAL') || scope.includes('GLOBAL') || jurisdiction.includes('INTERNACIONAL') || jurisdiction.includes('INTERNATIONAL')) return 'APPLICABLE_INTERNATIONAL';
  return 'UNKNOWN_JURISDICTION';
}

function resolveCurrentness(record) {
  if (record.currentness_verified !== true) return 'CURRENTNESS_NOT_VERIFIED';
  const status = folded(record.currentness_status || record.source_currentness);
  if (['CURRENT','SOURCE_MARKED_CURRENT','VIGENTE'].includes(status)) return 'CURRENT_VERIFIED';
  if (['NOT_CURRENT','SOURCE_MARKED_NOT_CURRENT','DEROGADA','DEROGADO','SUPERSEDED','REPEALED'].includes(status)) return 'NOT_CURRENT_VERIFIED';
  return 'CURRENTNESS_UNKNOWN';
}

function literalGuardSatisfied(record, mapping) {
  if (!mapping || !mapping.literal_guard) return true;
  const literal = folded(record.original_category || record.annex_or_list);
  if (mapping.literal_guard === 'CITES_A_OR_APPENDIX_I_V1') {
    if (literal.includes('APENDICE II') || literal.includes('APPENDIX II') || literal.includes('ANEXO B') || literal.includes('ANNEX B')) return false;
    return literal.includes('APENDICE I') || literal.includes('APPENDIX I') || literal.includes('ANEXO A') || literal.includes('ANNEX A');
  }
  if (mapping.literal_guard === 'CITES_B_OR_APPENDIX_II_V1') {
    return literal.includes('APENDICE II') || literal.includes('APPENDIX II') || literal.includes('ANEXO B') || literal.includes('ANNEX B');
  }
  if (mapping.literal_guard === 'CITES_D_V1') return literal.includes('ANEXO D') || literal.includes('ANNEX D');
  return false;
}

function normalizeRecord(record) {
  const z = clone(record);
  z.applicability_resolution = resolveApplicability(record);
  z.currentness_resolution = resolveCurrentness(record);
  const mapping = MAP.get(record.category_class);
  z.equivalence_version = equivalence.table_id;
  z.mapping_state = mapping ? mapping.effective_eligibility : 'NO_EQUIVALENCE_FOUND';
  z.score_native_05_category = mapping && typeof mapping.source_model_score_100 === 'number' ? mapping.source_model_score_100 : null;
  z.score_100_from_equivalence = mapping && typeof mapping.effective_score_100 === 'number' ? mapping.effective_score_100 : null;
  z.literal_guard_satisfied = literalGuardSatisfied(record, mapping);
  return z;
}

function isTaxonResolved(record) {
  return record.taxon_resolved === true || ['RESOLVED','ACCEPTED_IDENTITY_RESOLVED','VALIDATED'].includes(folded(record.taxonomic_state));
}

function baseLegalRecord(record) {
  return record.evidence_state === 'VALID_SOURCE_EVIDENCE' &&
    isTaxonResolved(record) &&
    record.source_authorized === true &&
    record.primary_source_verified === true &&
    record.legal_validity_verified === true &&
    record.currentness_resolution === 'CURRENT_VERIFIED' &&
    record.legal_applicability_verified === true &&
    APPLICABLE.has(record.applicability_resolution);
}

function mappingGuardsSatisfied(record) {
  if (!EFFECTIVE_MAPPING_STATES.has(record.mapping_state)) return false;
  if (!record.literal_guard_satisfied) return false;
  if (record.mapping_state === 'SOURCE_DEPENDENT_PRIMARY_VERIFICATION_REQUIRED' && record.category_equivalence_verified !== true) return false;
  if (record.mapping_state === 'ACTIVE_WHEN_PRIMARY_LAW_AND_TAXON_ANNEX_VERIFIED' && record.taxon_annex_membership_verified !== true) return false;
  if (record.mapping_state === 'ACTIVE_WHEN_PRIMARY_LAW_TAXON_AND_SITE_VERIFIED' && (record.taxon_annex_membership_verified !== true || record.site_applicability_verified !== true)) return false;
  return true;
}

function isEffectiveCandidate(record) {
  return baseLegalRecord(record) && mappingGuardsSatisfied(record) && typeof record.score_100_from_equivalence === 'number';
}

function potentiallyProtectiveButUnresolved(record) {
  if (!baseLegalRecord(record)) return false;
  if (NON_PROTECTIVE_MAPPING_STATES.has(record.mapping_state)) return false;
  if (record.mapping_state === 'NO_EQUIVALENCE_FOUND') return true;
  return !isEffectiveCandidate(record);
}

function materialConflict(records) {
  return records.some(r => r.conflict_unresolved === true && baseLegalRecord(r));
}

function shortReference(record) {
  return text(record.short_reference || [record.norm_short_title || record.norm_title, record.annex_or_list || record.article].filter(Boolean).join(' · '));
}

function displayableCurrent(record) {
  return baseLegalRecord(record);
}

function summarizeTerritory(records, applicability) {
  const values = records.filter(r => displayableCurrent(r) && r.applicability_resolution === applicability).map(r => text(r.original_category)).filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function searchIsComplete(search) {
  return !!search &&
    search.query_executed === true &&
    search.taxon_resolved === true &&
    search.authorized_source_set_verified === true &&
    search.all_authorized_sources_consulted === true &&
    search.primary_source_checks_complete === true &&
    search.source_not_acquired !== true;
}

function unresolvedState(records, search) {
  if (records.some(r => !isTaxonResolved(r)) || (search && search.taxon_resolved === false)) return 'TAXON_UNRESOLVED';
  if (search && search.source_not_acquired === true) return 'SOURCE_NOT_ACQUIRED';
  if (materialConflict(records)) return 'CONFLICT';
  if (records.some(potentiallyProtectiveButUnresolved)) return 'UNKNOWN';
  if (!searchIsComplete(search)) return 'NO_COMPROBADO';
  return 'UNKNOWN';
}

function applicabilityChecked(record) {
  if (record.applicability_resolution === 'EXTERNAL_AUTONOMOUS_REFERENCE') return true;
  return APPLICABLE.has(record.applicability_resolution) && record.legal_applicability_verified === true;
}

function reliabilitySkeleton(records, search) {
  const components = {
    QUERY_EXECUTED: !!search && search.query_executed === true,
    TAXON_RESOLVED: !!search && search.taxon_resolved === true,
    SOURCE_AUTHORIZED: records.length === 0 ? !!search && search.authorized_source_set_verified === true : records.every(r => r.source_authorized === true),
    NORM_IDENTIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => !!text(r.norm_title || r.official_identifier)),
    CURRENTNESS_VERIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => r.currentness_verified === true),
    LA_RIOJA_APPLICABILITY_VERIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(applicabilityChecked),
    PRIMARY_LEGAL_SOURCE_TRACEABLE: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => r.primary_source_verified === true)
  };
  const checked = Object.values(components).filter(Boolean).length;
  return {
    model_status: 'PENDIENTE_DE_DEFINICION',
    numeric_percent: null,
    display_category: null,
    checked_components: checked,
    total_components: Object.keys(components).length,
    components,
    reason: 'Exact component weights and display thresholds are not canonically defined in PROTECCION or AMENAZA.'
  };
}

function decisionForRecord(record, effectiveSet) {
  if (effectiveSet.has(record.evidence_id)) return 'SELECTED_EFFECTIVE_PROTECTION';
  if (record.evidence_state !== 'VALID_SOURCE_EVIDENCE') return 'EXCLUDED_INVALID_OR_NONASSERTIVE_EVIDENCE_STATE';
  if (!isTaxonResolved(record)) return 'EXCLUDED_TAXON_UNRESOLVED';
  if (record.source_authorized !== true) return 'EXCLUDED_SOURCE_NOT_AUTHORIZED';
  if (record.primary_source_verified !== true) return 'EXCLUDED_PRIMARY_SOURCE_NOT_VERIFIED';
  if (record.legal_validity_verified !== true) return 'EXCLUDED_LEGAL_VALIDITY_NOT_VERIFIED';
  if (record.currentness_resolution !== 'CURRENT_VERIFIED') return 'EXCLUDED_NOT_CURRENT_OR_CURRENTNESS_UNVERIFIED';
  if (record.applicability_resolution === 'EXTERNAL_AUTONOMOUS_REFERENCE') return 'EXCLUDED_OTHER_AUTONOMOUS_COMMUNITY';
  if (!APPLICABLE.has(record.applicability_resolution) || record.legal_applicability_verified !== true) return 'EXCLUDED_LA_RIOJA_APPLICABILITY_NOT_VERIFIED';
  if (NON_PROTECTIVE_MAPPING_STATES.has(record.mapping_state)) return 'EXCLUDED_CONTEXT_ONLY_NOT_EFFECTIVE_PROTECTION';
  if (!record.literal_guard_satisfied) return 'BLOCKED_LITERAL_CATEGORY_CONFLICT';
  if (!mappingGuardsSatisfied(record)) return 'BLOCKED_CATEGORY_MAPPING_OR_SCOPE_GUARD_UNRESOLVED';
  if (typeof record.score_100_from_equivalence !== 'number') return 'BLOCKED_NO_EFFECTIVE_SCORE_MAPPING';
  return 'NOT_SELECTED_LESS_RESTRICTIVE_THAN_EFFECTIVE_MAXIMUM';
}

function stateDisplayFallback(state) {
  const map = {
    SIN_PROTECCION: 'SIN PROTECCIÓN',
    NO_COMPROBADO: 'NO COMPROBADO',
    SOURCE_NOT_ACQUIRED: 'NO ADQUIRIDO',
    TAXON_UNRESOLVED: 'TAXÓN NO RESUELTO',
    UNKNOWN: 'DESCONOCIDO',
    CONFLICT: 'CONFLICTO'
  };
  return map[state] || '';
}

function selectProtection({ taxon, evidence = [], search = {}, downstreamRequiresNumber = false, updatedAt = null }) {
  if (!taxon || !taxon.taxon_id) throw new Error('PROTECCION_REQUIRES_TAXON_ID');
  if (evidence.some(r => Object.prototype.hasOwnProperty.call(r, 'manual_score'))) throw new Error('MANUAL_PROTECTION_SCORE_PROHIBITED');

  const normalized = evidence.map(normalizeRecord);
  const candidates = normalized.filter(isEffectiveCandidate).sort((a,b) => b.score_100_from_equivalence - a.score_100_from_equivalence || shortReference(a).localeCompare(shortReference(b)));
  const reliability = reliabilitySkeleton(normalized, search);
  const conflict = materialConflict(normalized);
  const blockedPotential = normalized.some(potentiallyProtectiveButUnresolved);

  let state;
  let score100 = null;
  let effective = [];
  let operationalScore = null;
  let operationalScoreStatus = null;

  if (conflict) {
    state = 'CONFLICT';
    if (downstreamRequiresNumber) { operationalScore = 0; operationalScoreStatus = 'PROVISIONAL'; }
  } else if (candidates.length) {
    score100 = candidates[0].score_100_from_equivalence;
    effective = candidates.filter(r => r.score_100_from_equivalence === score100);
    state = 'PROTECTED';
    operationalScore = score100;
    operationalScoreStatus = 'CURRENT';
  } else if (searchIsComplete(search) && !blockedPotential) {
    state = 'SIN_PROTECCION';
    score100 = 0;
    operationalScore = 0;
    operationalScoreStatus = 'CURRENT';
  } else {
    state = unresolvedState(normalized, search);
    if (downstreamRequiresNumber) { operationalScore = 0; operationalScoreStatus = 'PROVISIONAL'; }
  }

  const selected = effective[0] || null;
  const effectiveIds = new Set(effective.map(r => r.evidence_id));
  const auditTrace = normalized.map(r => ({
    evidence_id: r.evidence_id || null,
    short_reference: shortReference(r),
    original_category: r.original_category || null,
    category_class: r.category_class || null,
    applicability_resolution: r.applicability_resolution,
    currentness_resolution: r.currentness_resolution,
    mapping_state: r.mapping_state,
    source_model_score_100: r.score_native_05_category,
    effective_score_100: r.score_100_from_equivalence,
    decision: decisionForRecord(r, effectiveIds)
  }));

  let effectiveNorm = selected ? shortReference(selected) : null;
  if (effective.length > 1 && effectiveNorm) effectiveNorm += ` + ${effective.length - 1} co-efectiva(s)`;

  return {
    item_id: contract.item_id,
    method_version: contract.stimes_selection.method_version,
    equivalence_version: equivalence.table_id,
    subject: clone(taxon),
    state,
    score_100: score100,
    candidate_score_100_max: candidates.length ? candidates[0].score_100_from_equivalence : null,
    score_operativo: operationalScore,
    score_operativo_status: operationalScoreStatus,
    score_native_05: search.score_native_05 == null ? null : search.score_native_05,
    effective_norm: effectiveNorm,
    selected_effective_evidence: clone(effective),
    normalized_evidence: clone(normalized),
    original_evidence: clone(evidence),
    alternative_evidence: clone(normalized.filter(r => !effectiveIds.has(r.evidence_id))),
    territorial_display: {
      la_rioja: summarizeTerritory(normalized, 'APPLICABLE_LA_RIOJA'),
      espana: summarizeTerritory(normalized, 'APPLICABLE_NATIONAL'),
      europa_ue: summarizeTerritory(normalized, 'APPLICABLE_EU'),
      internacional: summarizeTerritory(normalized, 'APPLICABLE_INTERNATIONAL')
    },
    evidence_short_reference: selected ? shortReference(selected) : null,
    reliability,
    audit_trace: auditTrace,
    updated_at: updatedAt,
    provenance_required: true,
    history_required: true
  };
}

function materialChange(previous, current) {
  if (!previous) return true;
  const key = r => JSON.stringify({state:r.state, score_100:r.score_100, effective_norm:r.effective_norm, equivalence_version:r.equivalence_version});
  return key(previous) !== key(current);
}

function updateProtection({ previousRevision = null, nextInput }) {
  const current = selectProtection(nextInput);
  const changed = materialChange(previousRevision, current);
  return {
    previous_revision: previousRevision ? clone(previousRevision) : null,
    current_revision: current,
    changed,
    recalculation_requests: changed ? [
      {item_id:'URGENCIA_RECOLECCION', reason:'PROTECCION_CHANGED'},
      {item_id:'PRIORIDAD_TAXON', reason:'TRANSITIVE_PROTECCION_CHANGE'}
    ] : [],
    full_localizacion_y_seleccion_refresh_requested: true
  };
}

function annualRefreshDue(lastValidUpdate, asOf) {
  if (!asOf) throw new Error('AS_OF_REQUIRED');
  if (!lastValidUpdate) return {due:true, next_due_at:null, reason:'NO_PREVIOUS_VALID_UPDATE'};
  const last = new Date(`${lastValidUpdate}T00:00:00Z`);
  const now = new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(last.getTime()) || Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  const dueAt = new Date(last.getTime());
  dueAt.setUTCFullYear(dueAt.getUTCFullYear() + 1);
  const next = dueAt.toISOString().slice(0,10);
  return {due: now.getTime() >= dueAt.getTime(), next_due_at: next, reason: now.getTime() >= dueAt.getTime() ? 'ANNUAL_DUE' : 'NOT_YET_DUE'};
}

function auditProtection(result) {
  if (!result || result.item_id !== contract.item_id) throw new Error('INVALID_PROTECTION_RESULT');
  return {
    taxon_id: result.subject.taxon_id,
    state: result.state,
    score_100: result.score_100,
    score_native_05: result.score_native_05,
    method_version: result.method_version,
    equivalence_version: result.equivalence_version,
    effective_norm: result.effective_norm,
    evidence_short_reference: result.evidence_short_reference,
    selected_effective_evidence: clone(result.selected_effective_evidence),
    alternatives_and_reasons: clone(result.audit_trace.filter(x => x.decision !== 'SELECTED_EFFECTIVE_PROTECTION')),
    reliability: clone(result.reliability),
    updated_at: result.updated_at
  };
}

function toExcelRow(result, ordinal) {
  const fallback = stateDisplayFallback(result.state);
  const scope = value => value || (result.state === 'PROTECTED' ? '' : fallback);
  return [
    ordinal,
    result.subject.family || '',
    result.subject.taxon_name || '',
    scope(result.territorial_display.la_rioja),
    scope(result.territorial_display.espana),
    scope(result.territorial_display.europa_ue),
    scope(result.territorial_display.internacional),
    result.score_100 == null ? '' : result.score_100,
    result.effective_norm || '',
    result.updated_at || '',
    result.evidence_short_reference || '',
    result.reliability.display_category || ''
  ];
}

module.exports = {
  contract,
  equivalence,
  resolveApplicability,
  resolveCurrentness,
  normalizeRecord,
  isEffectiveCandidate,
  selectProtection,
  updateProtection,
  annualRefreshDue,
  auditProtection,
  toExcelRow
};
