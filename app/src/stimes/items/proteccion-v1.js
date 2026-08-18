'use strict';

const contract = require('./proteccion-v1.contract.json');
const equivalence = require('./proteccion-category-equivalence-v1.json');

const MAP = new Map(equivalence.entries.map(e => [e.category_class, e]));
const ELIGIBLE_MAPPING_STATES = new Set([
  'ACTIVE_WHEN_PRIMARY_LAW_VERIFIED',
  'ACTIVE_WHEN_PRIMARY_LAW_AND_TAXON_ANNEX_VERIFIED',
  'SOURCE_DEPENDENT_PRIMARY_VERIFICATION_REQUIRED'
]);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function folded(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveApplicability(record) {
  const sub = folded(record.sub_country || record.autonomous_community || record.jurisdiction_name);
  const scope = folded(record.jurisdiction_level || record.territorial_scope || record.scope_normalized);

  // A concrete non-Rioja autonomous jurisdiction always wins over an upstream generic/national label.
  if (sub && !sub.includes('LA RIOJA') && !sub.includes('SPAIN') && !sub.includes('ESPANA')) {
    return 'EXTERNAL_AUTONOMOUS_REFERENCE';
  }
  if (sub.includes('LA RIOJA') || scope.includes('LA RIOJA')) return 'APPLICABLE_LA_RIOJA';
  if (scope.includes('AUTONOM')) return sub ? 'APPLICABLE_LA_RIOJA' : 'UNKNOWN_JURISDICTION';
  if (scope.includes('NACIONAL') || scope.includes('SPAIN') || scope.includes('ESPANA') || scope.includes('STATE')) {
    return 'APPLICABLE_NATIONAL';
  }
  if (scope.includes('EUROPE') || scope === 'EU' || scope.includes('UNION EUROPEA')) {
    return record.legal_applicability_verified === true ? 'APPLICABLE_EU' : 'UNKNOWN_JURISDICTION';
  }
  if (scope.includes('INTERNACIONAL') || scope.includes('INTERNATIONAL') || scope.includes('GLOBAL')) {
    return record.legal_applicability_verified === true ? 'APPLICABLE_INTERNATIONAL' : 'UNKNOWN_JURISDICTION';
  }
  return 'UNKNOWN_JURISDICTION';
}

function resolveCurrentness(record) {
  if (record.currentness_verified !== true) return 'CURRENTNESS_NOT_VERIFIED';
  const status = folded(record.currentness_status || record.source_currentness);
  if (['CURRENT', 'SOURCE_MARKED_CURRENT', 'VIGENTE'].includes(status)) return 'CURRENT_VERIFIED';
  if (['NOT_CURRENT', 'SOURCE_MARKED_NOT_CURRENT', 'DEROGADA', 'DEROGADO', 'SUPERSEDED', 'REPEALED'].includes(status)) return 'NOT_CURRENT_VERIFIED';
  return 'CURRENTNESS_UNKNOWN';
}

function normalizeRecord(record) {
  const z = clone(record);
  z.applicability_resolution = resolveApplicability(record);
  z.currentness_resolution = resolveCurrentness(record);
  const mapping = MAP.get(record.category_class);
  z.equivalence_version = equivalence.table_id;
  z.mapping_state = mapping ? mapping.stimes_effective_eligibility : 'NO_EQUIVALENCE_FOUND';
  z.score_100_from_equivalence = mapping && typeof mapping.score_100 === 'number' ? mapping.score_100 : null;
  return z;
}

function isTaxonResolved(record) {
  return record.taxon_resolved === true || ['RESOLVED', 'ACCEPTED_IDENTITY_RESOLVED', 'VALIDATED'].includes(folded(record.taxonomic_state));
}

function isEffectiveCandidate(record) {
  if (record.evidence_state !== 'VALID_SOURCE_EVIDENCE') return false;
  if (!isTaxonResolved(record)) return false;
  if (record.source_authorized !== true) return false;
  if (record.primary_source_verified !== true) return false;
  if (record.legal_validity_verified !== true) return false;
  if (record.currentness_resolution !== 'CURRENT_VERIFIED') return false;
  if (!['APPLICABLE_LA_RIOJA', 'APPLICABLE_NATIONAL', 'APPLICABLE_EU', 'APPLICABLE_INTERNATIONAL'].includes(record.applicability_resolution)) return false;
  if (!ELIGIBLE_MAPPING_STATES.has(record.mapping_state)) return false;
  if (record.mapping_state === 'SOURCE_DEPENDENT_PRIMARY_VERIFICATION_REQUIRED' && record.category_equivalence_verified !== true) return false;
  if (record.mapping_state === 'ACTIVE_WHEN_PRIMARY_LAW_AND_TAXON_ANNEX_VERIFIED' && record.taxon_annex_membership_verified !== true) return false;
  return typeof record.score_100_from_equivalence === 'number';
}

function shortReference(record) {
  return text(record.short_reference || [record.norm_short_title || record.norm_title, record.annex_or_list || record.article].filter(Boolean).join(' · '));
}

function summarizeTerritory(records, applicability) {
  const values = records
    .filter(r => r.currentness_resolution === 'CURRENT_VERIFIED' && r.applicability_resolution === applicability && r.legal_validity_verified === true)
    .map(r => text(r.original_category))
    .filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function searchIsComplete(search) {
  return !!search && search.all_authorized_sources_consulted === true && search.primary_source_checks_complete === true && search.taxon_resolved === true;
}

function unresolvedState(records, search) {
  if (records.some(r => !isTaxonResolved(r)) || (search && search.taxon_resolved === false)) return 'TAXON_UNRESOLVED';
  if (search && search.source_not_acquired === true) return 'SOURCE_NOT_ACQUIRED';
  if (records.some(r => r.conflict_unresolved === true)) return 'CONFLICT';
  if (!search || search.complete === false || !searchIsComplete(search)) return 'NO_COMPROBADO';
  return 'UNKNOWN';
}

function reliabilitySkeleton(records, search) {
  const components = {
    QUERY_EXECUTED: !!search && search.query_executed === true,
    TAXON_RESOLVED: !!search && search.taxon_resolved === true,
    SOURCE_AUTHORIZED: records.length === 0 ? !!search && search.authorized_source_set_verified === true : records.every(r => r.source_authorized === true),
    NORM_IDENTIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => !!text(r.norm_title || r.official_identifier)),
    CURRENTNESS_VERIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => r.currentness_verified === true),
    LA_RIOJA_APPLICABILITY_VERIFIED: records.length === 0 ? !!search && search.primary_source_checks_complete === true : records.every(r => r.applicability_resolution !== 'UNKNOWN_JURISDICTION'),
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
    reason: 'Exact component weights and display thresholds are not yet versioned.'
  };
}

function selectProtection({ taxon, evidence = [], search = {}, downstreamRequiresNumber = false, updatedAt = null }) {
  if (!taxon || !taxon.taxon_id) throw new Error('PROTECCION_REQUIRES_TAXON_ID');
  if (evidence.some(r => Object.prototype.hasOwnProperty.call(r, 'manual_score'))) throw new Error('MANUAL_PROTECTION_SCORE_PROHIBITED');

  const normalized = evidence.map(normalizeRecord);
  const candidates = normalized.filter(isEffectiveCandidate);
  candidates.sort((a, b) => b.score_100_from_equivalence - a.score_100_from_equivalence || shortReference(a).localeCompare(shortReference(b)));
  const reliability = reliabilitySkeleton(normalized, search);

  let state;
  let score100 = null;
  let effective = [];
  let operationalScore = null;
  let operationalScoreStatus = null;

  if (candidates.length) {
    score100 = candidates[0].score_100_from_equivalence;
    effective = candidates.filter(r => r.score_100_from_equivalence === score100);
    state = effective.some(r => r.conflict_unresolved === true) ? 'CONFLICT' : 'PROTECTED';
    operationalScore = score100;
    operationalScoreStatus = 'CURRENT';
  } else if (searchIsComplete(search)) {
    state = 'SIN_PROTECCION';
    score100 = 0;
    operationalScore = 0;
    operationalScoreStatus = 'CURRENT';
  } else {
    state = unresolvedState(normalized, search);
    if (downstreamRequiresNumber) {
      operationalScore = 0;
      operationalScoreStatus = 'PROVISIONAL';
    }
  }

  const selected = effective[0] || null;
  return {
    item_id: contract.item_id,
    method_version: contract.stimes_selection.method_version,
    equivalence_version: equivalence.table_id,
    subject: clone(taxon),
    state,
    score_100: score100,
    score_operativo: operationalScore,
    score_operativo_status: operationalScoreStatus,
    score_native_05: search.score_native_05 == null ? null : search.score_native_05,
    effective_norm: selected ? shortReference(selected) : null,
    selected_effective_evidence: clone(effective),
    normalized_evidence: clone(normalized),
    original_evidence: clone(evidence),
    alternative_evidence: clone(normalized.filter(r => !effective.includes(r))),
    territorial_display: {
      la_rioja: summarizeTerritory(normalized, 'APPLICABLE_LA_RIOJA'),
      espana: summarizeTerritory(normalized, 'APPLICABLE_NATIONAL'),
      europa_ue: summarizeTerritory(normalized, 'APPLICABLE_EU'),
      internacional: summarizeTerritory(normalized, 'APPLICABLE_INTERNATIONAL')
    },
    evidence_short_reference: selected ? shortReference(selected) : null,
    reliability,
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

function toExcelRow(result, ordinal) {
  return [
    ordinal,
    result.subject.family || '',
    result.subject.taxon_name || '',
    result.territorial_display.la_rioja || '',
    result.territorial_display.espana || '',
    result.territorial_display.europa_ue || '',
    result.territorial_display.internacional || '',
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
  toExcelRow
};
