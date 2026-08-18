#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const contract = require('./amenaza-v1.contract.json');

const DISPLAY_SCOPES = ['La Rioja', 'España', 'Europa', 'Mundial'];
const EFFECTIVE_SCOPE_VALUES = new Set(contract.excel_view.effective_scope_values);
const RELIABILITY_CATEGORIES = new Set(contract.reliability.display_categories);

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function territoryClass(record) {
  const explicit = clean(record.territory_class).toUpperCase();
  if (explicit) return explicit;
  const scope = [record.territorial_scope, record.country, record.sub_country]
    .map(clean)
    .join(' ')
    .toLocaleLowerCase('es');
  if (scope.includes('la rioja')) return 'LA_RIOJA';
  if (/(mundial|global|world)/.test(scope)) return 'GLOBAL';
  if (scope === 'europe' || scope === 'eu27' || scope.includes('continental europe')) return 'EUROPE_CONTINENTAL_OR_EU27';
  if (/(españa|spain|península|peninsula)/.test(scope)) return 'SPAIN_NATIONAL';
  return explicit || 'UNKNOWN_SCOPE';
}

function displayScopeFor(record) {
  switch (territoryClass(record)) {
    case 'LA_RIOJA': return 'La Rioja';
    case 'SPAIN_NATIONAL':
    case 'SPAIN_BIOGEOGRAPHIC_REGION':
    case 'SPAIN_OTHER_SUBNATIONAL': return 'España';
    case 'EUROPE_CONTINENTAL_OR_EU27': return 'Europa';
    case 'GLOBAL': return 'Mundial';
    default: return null;
  }
}

function originalCategory(record) {
  return clean(record.category_original || record.category || record.source_category);
}

function isValidEvidence(record) {
  return clean(record.evidence_state) === 'VALID_SOURCE_EVIDENCE';
}

function displayMissingState(state) {
  const normalized = clean(state).toUpperCase();
  return contract.excel_view.unknown_display[normalized] || 'DESCONOCIDO';
}

function territorialCell(payload, scopeName) {
  const categories = [];
  for (const evidence of payload.evidence_records || []) {
    if (!isValidEvidence(evidence)) continue;
    if (displayScopeFor(evidence) !== scopeName) continue;
    const value = originalCategory(evidence);
    if (value && !categories.includes(value)) categories.push(value);
  }
  if (categories.length) return categories.join(' / ');
  const state = payload.scope_states && payload.scope_states[scopeName];
  return displayMissingState(state || 'UNKNOWN');
}

function principalAssessment(payload) {
  const selected = (payload.selected_assessments || []).filter(x => isValidEvidence(x) || !clean(x.evidence_state));
  if (!selected.length) return null;
  return selected.slice().sort((a, b) => {
    const delta = Number(b.weighted_assessment_score || 0) - Number(a.weighted_assessment_score || 0);
    if (delta) return delta;
    return clean(a.source_key || a.source).localeCompare(clean(b.source_key || b.source));
  })[0];
}

function shortEvidenceReference(assessment) {
  if (!assessment) return '';
  const source = clean(assessment.source_short || assessment.source_key || assessment.source);
  const year = clean(assessment.evaluation_year_for_scoring || assessment.evaluation_year);
  const identifier = clean(assessment.source_identifier);
  if (source && year) return `${source} · ${year}`;
  if (source && identifier) return `${source} · ${identifier}`;
  return source;
}

function validateProviderPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new TypeError('AMENAZA provider payload is required');
  if (payload.evidence_version !== contract.provider.evidence_version) {
    throw new Error(`Unsupported AMENAZA evidence version: ${payload.evidence_version || '<missing>'}`);
  }
  if (payload.scoring_version !== contract.provider.scoring_version) {
    throw new Error(`Unsupported AMENAZA scoring version: ${payload.scoring_version || '<missing>'}`);
  }
  if (clean(payload.score_origin).toUpperCase() === 'MANUAL') {
    throw new Error('Manual AMENAZA score is prohibited');
  }
  if (!['SCORED', 'UNKNOWN'].includes(payload.score_state)) {
    throw new Error(`Unsupported AMENAZA score_state: ${payload.score_state || '<missing>'}`);
  }
  if (payload.score_state === 'SCORED') {
    if (typeof payload.amenaza_score !== 'number' || !Number.isFinite(payload.amenaza_score)) {
      throw new Error('SCORED AMENAZA result requires a finite numeric amenaza_score');
    }
    if (payload.amenaza_score < 0 || payload.amenaza_score > 100) {
      throw new Error('AMENAZA score must be within 0..100');
    }
  } else if (payload.amenaza_score !== null && payload.amenaza_score !== undefined && payload.amenaza_score !== '') {
    throw new Error('UNKNOWN AMENAZA must not carry a provisional numeric score');
  }
  if (payload.effective_scope != null && clean(payload.effective_scope) && !EFFECTIVE_SCOPE_VALUES.has(clean(payload.effective_scope))) {
    throw new Error(`Invalid effective_scope: ${payload.effective_scope}`);
  }
  if (payload.reliability && payload.reliability.category && !RELIABILITY_CATEGORIES.has(payload.reliability.category)) {
    throw new Error(`Invalid reliability category: ${payload.reliability.category}`);
  }
  return true;
}

function makeFingerprint(record) {
  const stable = {
    item_id: record.item_id,
    taxon_resource_id: record.taxon.resource_id,
    evidence_version: record.provider.evidence_version,
    scoring_version: record.provider.scoring_version,
    score_state: record.result.score_state,
    score: record.result.score,
    evidence_records: record.evidence.original,
    selected_assessments: record.evidence.selected_for_scoring,
    conflicts: record.evidence.conflicts,
    scope_states: record.scope_states,
    effective_scope: record.presentation.effective_scope,
    reliability: record.reliability
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function buildCanonicalRecord({taxon, payload, updatedAt}) {
  validateProviderPayload(payload);
  if (!taxon || !clean(taxon.resource_id)) throw new Error('AMENAZA requires a taxon resource_id');
  const principal = principalAssessment(payload);
  const record = {
    item_id: contract.item_id,
    item_version: contract.item_version,
    subject_type: 'TAXON',
    taxon: clone(taxon),
    provider: {
      module: contract.provider.module,
      evidence_version: payload.evidence_version,
      scoring_version: payload.scoring_version,
      scoring_model_status: payload.scoring_model_status || contract.provider.scoring_model_status,
      provider_run_id: payload.provider_run_id || null,
      input_manifest_hash: payload.input_manifest_hash || null
    },
    evidence: {
      original: clone(payload.evidence_records || []),
      normalized: clone(payload.normalized_evidence || []),
      selected_for_scoring: clone(payload.selected_assessments || []),
      alternative: clone(payload.alternative_evidence || []),
      conflicts: clone(payload.conflicts || [])
    },
    scope_states: clone(payload.scope_states || {}),
    result: {
      score_state: payload.score_state,
      score: payload.score_state === 'SCORED' ? payload.amenaza_score : null,
      computed_at: payload.computed_at || updatedAt,
      score_origin: 'PROVIDER_05'
    },
    reliability: payload.reliability ? clone(payload.reliability) : {
      state: 'PENDIENTE_DE_DEFINICION',
      numeric_value: null,
      category: null,
      method_version: null
    },
    presentation: {
      effective_scope: clean(payload.effective_scope) || null,
      effective_scope_state: clean(payload.effective_scope) ? 'PRESENT' : 'PENDIENTE_DE_DEFINICION',
      principal_evidence_short_ref: shortEvidenceReference(principal)
    },
    updated_at: updatedAt,
    provenance: clone(payload.provenance || {}),
    audit: {
      original_evidence_preserved: true,
      normalized_evidence_separate: true,
      selected_evidence_separate: true,
      scoring_reimplemented_by_stimes: false,
      unknown_coerced_to_zero: false
    }
  };
  record.revision_fingerprint = makeFingerprint(record);
  return record;
}

function projectExcelRow(record) {
  if (!record || record.item_id !== contract.item_id) throw new Error('Not an AMENAZA canonical record');
  const payloadView = {
    evidence_records: record.evidence.original,
    scope_states: record.scope_states
  };
  const score = record.result.score_state === 'SCORED' ? Number(record.result.score.toFixed(2)) : '';
  const updateDate = clean(record.updated_at).slice(0, 10);
  const reliability = record.reliability && RELIABILITY_CATEGORIES.has(record.reliability.category)
    ? record.reliability.category
    : '';
  return {
    'N.º': record.taxon.universe_index == null ? '' : record.taxon.universe_index,
    'Familia': clean(record.taxon.family),
    'Taxón': clean(record.taxon.name || record.taxon.input_taxon),
    'La Rioja': territorialCell(payloadView, 'La Rioja'),
    'España': territorialCell(payloadView, 'España'),
    'Europa': territorialCell(payloadView, 'Europa'),
    'Mundial': territorialCell(payloadView, 'Mundial'),
    'Score amenaza': score,
    'Ámbito efectivo': record.presentation.effective_scope || '',
    'Última actualización': updateDate,
    'Evidencia': record.presentation.principal_evidence_short_ref || '',
    'Confiabilidad': reliability
  };
}

function changedForDependents(previous, next) {
  if (!previous) return true;
  return previous.revision_fingerprint !== next.revision_fingerprint;
}

async function refreshAmenazaTaxon({taxon, provider, repository, cascade, trigger = 'TAXON_QUERY', now = () => new Date().toISOString()}) {
  if (!provider || typeof provider.refreshAmenazaTaxon !== 'function') throw new TypeError('provider.refreshAmenazaTaxon is required');
  if (!repository || typeof repository.getCurrent !== 'function' || typeof repository.appendRevision !== 'function') {
    throw new TypeError('repository.getCurrent and repository.appendRevision are required');
  }
  const current = await repository.getCurrent(taxon.resource_id, contract.item_id);
  const payload = await provider.refreshAmenazaTaxon({
    taxon,
    item_id: contract.item_id,
    evidence_version: contract.provider.evidence_version,
    scoring_version: contract.provider.scoring_version,
    trigger,
    request_full_group_refresh: trigger === 'TAXON_QUERY'
  });
  const record = buildCanonicalRecord({taxon, payload, updatedAt: now()});
  record.previous_revision_id = current ? current.revision_id || null : null;
  const saved = await repository.appendRevision(record);
  const changed = changedForDependents(current, saved || record);
  const cascadeRequests = [];
  if (changed && cascade && typeof cascade.enqueue === 'function') {
    for (const item_id of [...contract.dependencies.direct_downstream, ...contract.dependencies.transitive_downstream]) {
      const request = {taxon_resource_id: taxon.resource_id, item_id, cause: contract.item_id};
      await cascade.enqueue(request);
      cascadeRequests.push(request);
    }
  }
  return {
    current: saved || record,
    changed,
    cascade_requests: cascadeRequests,
    full_group_refresh_requested: trigger === 'TAXON_QUERY'
  };
}

function shouldRefresh({lastUpdatedAt, trigger, now = new Date()}) {
  if (trigger === 'TAXON_QUERY') return true;
  if (trigger !== 'ANNUAL') return false;
  if (!lastUpdatedAt) return true;
  const last = new Date(lastUpdatedAt);
  if (Number.isNaN(last.getTime())) return true;
  return (now.getTime() - last.getTime()) >= 365 * 24 * 60 * 60 * 1000;
}

module.exports = {
  contract,
  DISPLAY_SCOPES,
  validateProviderPayload,
  buildCanonicalRecord,
  projectExcelRow,
  refreshAmenazaTaxon,
  shouldRefresh,
  territorialCell,
  displayScopeFor
};
