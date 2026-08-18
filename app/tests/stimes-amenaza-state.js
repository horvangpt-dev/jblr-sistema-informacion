#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  contract,
  validateProviderPayload,
  buildCanonicalRecord,
  projectExcelRow,
  refreshAmenazaTaxon,
  shouldRefresh
} = require('../src/stimes/items/amenaza-v1');

const TAXON = {
  resource_id: '00000000-0000-4000-8000-000000000001',
  universe_index: 999999,
  family: 'TESTACEAE',
  name: 'Taxon syntheticum TEST_ONLY'
};

function payload(score = 72.5) {
  return {
    evidence_version: 'AMENAZA_EVIDENCE_v2',
    scoring_version: 'AMENAZA_SCORING_MODEL_v1_2',
    scoring_model_status: 'WORKING_ANALYTICAL_MODEL',
    score_origin: 'PROVIDER_05',
    score_state: 'SCORED',
    amenaza_score: score,
    computed_at: '2026-08-18T00:00:00Z',
    provider_run_id: 'TEST-RUN-001',
    input_manifest_hash: 'synthetic-test-manifest',
    evidence_records: [
      {
        evidence_state: 'VALID_SOURCE_EVIDENCE',
        source_key: 'EIDOS',
        source: 'IEPNB / EIDOS',
        territory_class: 'SPAIN_NATIONAL',
        category_original: 'EN',
        normalized_category: 'EN',
        evaluation_year: 2021,
        source_identifier: 'TEST-SPAIN-001',
        raw_record_json: '{"category":"EN","fixture":"synthetic"}'
      },
      {
        evidence_state: 'VALID_SOURCE_EVIDENCE',
        source_key: 'EUROPE_CONTINENTAL_2011',
        source: 'European Red List of Vascular Plants',
        territory_class: 'EUROPE_CONTINENTAL_OR_EU27',
        category_original: 'VU',
        normalized_category: 'VU',
        evaluation_year: 2011,
        source_identifier: 'TEST-EU-001',
        raw_record_json: 'synthetic fixture'
      },
      {
        evidence_state: 'VALID_SOURCE_EVIDENCE',
        source_key: 'EIDOS',
        source: 'IEPNB / EIDOS',
        territory_class: 'GLOBAL',
        category_original: 'LC (Preocupación menor)',
        normalized_category: 'LC',
        evaluation_year: 2019,
        source_identifier: 'TEST-GLOBAL-001',
        raw_record_json: '{"category":"LC","fixture":"synthetic"}'
      }
    ],
    normalized_evidence: [
      {source_identifier: 'TEST-SPAIN-001', normalized_category: 'EN'},
      {source_identifier: 'TEST-EU-001', normalized_category: 'VU'},
      {source_identifier: 'TEST-GLOBAL-001', normalized_category: 'LC'}
    ],
    selected_assessments: [
      {
        evidence_state: 'VALID_SOURCE_EVIDENCE',
        source_key: 'EIDOS',
        source: 'IEPNB / EIDOS',
        territory_class: 'SPAIN_NATIONAL',
        category_original: 'EN',
        normalized_category: 'EN',
        evaluation_year_for_scoring: 2021,
        weighted_assessment_score: 72,
        source_identifier: 'TEST-SPAIN-001'
      },
      {
        evidence_state: 'VALID_SOURCE_EVIDENCE',
        source_key: 'EUROPE_CONTINENTAL_2011',
        source: 'European Red List of Vascular Plants',
        territory_class: 'EUROPE_CONTINENTAL_OR_EU27',
        category_original: 'VU',
        normalized_category: 'VU',
        evaluation_year_for_scoring: 2011,
        weighted_assessment_score: 37.8,
        source_identifier: 'TEST-EU-001'
      }
    ],
    alternative_evidence: [],
    conflicts: [],
    scope_states: {
      'La Rioja': 'UNKNOWN',
      'España': 'VALID_SOURCE_EVIDENCE',
      'Europa': 'VALID_SOURCE_EVIDENCE',
      'Mundial': 'VALID_SOURCE_EVIDENCE'
    },
    effective_scope: null,
    reliability: null,
    provenance: {
      fixture: 'TEST_ONLY_SYNTHETIC',
      raw_preserved: true,
      method: 'provider-mock'
    }
  };
}

assert.strictEqual(contract.item_id, 'STIMES.ITEM.AMENAZA');
assert.strictEqual(contract.subject_type, 'TAXON');
assert.strictEqual(contract.provider.evidence_version, 'AMENAZA_EVIDENCE_v2');
assert.strictEqual(contract.provider.scoring_version, 'AMENAZA_SCORING_MODEL_v1_2');
assert.strictEqual(contract.storage_mapping.schema_change_required, false);
assert.strictEqual(contract.storage_mapping.neon_changes_now, 'NONE');
assert.ok(contract.pending_definitions.includes('RELIABILITY_CATEGORY_THRESHOLDS'));
assert.ok(contract.pending_definitions.includes('SINGLE_EFFECTIVE_SCOPE_SEMANTIC_FOR_V1_2_MULTISCOPE_SCORING'));

assert.throws(() => validateProviderPayload({...payload(), score_origin: 'MANUAL'}), /Manual AMENAZA score is prohibited/);
assert.throws(() => validateProviderPayload({...payload(), score_state: 'UNKNOWN', amenaza_score: 0}), /must not carry a provisional numeric score/);
assert.doesNotThrow(() => validateProviderPayload({...payload(), score_state: 'UNKNOWN', amenaza_score: null}));

const canonical = buildCanonicalRecord({taxon: TAXON, payload: payload(), updatedAt: '2026-08-18T00:01:00Z'});
assert.strictEqual(canonical.result.score, 72.5);
assert.strictEqual(canonical.audit.scoring_reimplemented_by_stimes, false);
assert.strictEqual(canonical.audit.unknown_coerced_to_zero, false);
assert.strictEqual(canonical.evidence.original[0].category_original, 'EN');
assert.strictEqual(canonical.evidence.normalized[0].normalized_category, 'EN');
assert.strictEqual(canonical.evidence.selected_for_scoring[0].weighted_assessment_score, 72);
assert.notStrictEqual(canonical.evidence.original, canonical.evidence.normalized);
assert.strictEqual(canonical.presentation.effective_scope_state, 'PENDIENTE_DE_DEFINICION');
assert.strictEqual(canonical.reliability.state, 'PENDIENTE_DE_DEFINICION');

const row = projectExcelRow(canonical);
assert.deepStrictEqual(Object.keys(row), contract.excel_view.headers);
assert.strictEqual(row['La Rioja'], 'DESCONOCIDO');
assert.strictEqual(row['España'], 'EN');
assert.strictEqual(row['Europa'], 'VU');
assert.strictEqual(row['Mundial'], 'LC (Preocupación menor)');
assert.strictEqual(row['Score amenaza'], 72.5);
assert.strictEqual(row['Ámbito efectivo'], '');
assert.strictEqual(row['Confiabilidad'], '');
assert.strictEqual(row['Evidencia'], 'EIDOS · 2021');

const conflictPayload = payload();
conflictPayload.evidence_records.push({
  evidence_state: 'VALID_SOURCE_EVIDENCE',
  source_key: 'TEST_SECOND_SOURCE',
  territory_class: 'SPAIN_NATIONAL',
  category_original: 'VU'
});
const conflictRow = projectExcelRow(buildCanonicalRecord({
  taxon: TAXON,
  payload: conflictPayload,
  updatedAt: '2026-08-18T00:02:00Z'
}));
assert.strictEqual(conflictRow['España'], 'EN / VU');
assert.ok(!conflictRow['España'].includes('CONFLICTO'));

class MemoryRepository {
  constructor() {
    this.history = [];
    this.current = null;
  }
  async getCurrent() { return this.current; }
  async appendRevision(record) {
    const saved = JSON.parse(JSON.stringify(record));
    saved.revision_id = `REV-${String(this.history.length + 1).padStart(3, '0')}`;
    this.history.push(saved);
    this.current = saved;
    return saved;
  }
}

class MemoryCascade {
  constructor() { this.requests = []; }
  async enqueue(request) { this.requests.push({...request}); }
}

(async () => {
  const repository = new MemoryRepository();
  const cascade = new MemoryCascade();
  let currentScore = 72.5;
  const provider = {
    async refreshAmenazaTaxon(request) {
      assert.strictEqual(request.evidence_version, 'AMENAZA_EVIDENCE_v2');
      assert.strictEqual(request.scoring_version, 'AMENAZA_SCORING_MODEL_v1_2');
      assert.strictEqual(request.request_full_group_refresh, true);
      return payload(currentScore);
    }
  };

  const first = await refreshAmenazaTaxon({
    taxon: TAXON,
    provider,
    repository,
    cascade,
    trigger: 'TAXON_QUERY',
    now: () => '2026-08-18T00:10:00Z'
  });
  assert.strictEqual(first.changed, true);
  assert.strictEqual(first.full_group_refresh_requested, true);
  assert.strictEqual(repository.history.length, 1);
  assert.strictEqual(first.cascade_requests.length, 2);
  assert.deepStrictEqual(first.cascade_requests.map(x => x.item_id), ['URGENCIA_RECOLECCION', 'PRIORIDAD_TAXON']);

  const originalFirstRaw = JSON.stringify(repository.history[0].evidence.original);
  currentScore = 74;
  const second = await refreshAmenazaTaxon({
    taxon: TAXON,
    provider,
    repository,
    cascade,
    trigger: 'TAXON_QUERY',
    now: () => '2026-08-18T00:20:00Z'
  });
  assert.strictEqual(second.changed, true);
  assert.strictEqual(repository.history.length, 2);
  assert.strictEqual(repository.history[1].previous_revision_id, 'REV-001');
  assert.strictEqual(JSON.stringify(repository.history[0].evidence.original), originalFirstRaw, 'Prior RAW evidence must remain immutable');
  assert.strictEqual(repository.history[0].result.score, 72.5);
  assert.strictEqual(repository.history[1].result.score, 74);
  assert.strictEqual(second.cascade_requests.length, 2);

  const third = await refreshAmenazaTaxon({
    taxon: TAXON,
    provider,
    repository,
    cascade,
    trigger: 'TAXON_QUERY',
    now: () => '2026-08-18T00:30:00Z'
  });
  assert.strictEqual(third.changed, false, 'Timestamp-only refresh must not be treated as an analytical change');
  assert.strictEqual(third.cascade_requests.length, 0);
  assert.strictEqual(repository.history.length, 3, 'Refresh history is preserved even when analytical value is unchanged');

  assert.strictEqual(shouldRefresh({lastUpdatedAt: '2026-08-17T00:00:00Z', trigger: 'TAXON_QUERY', now: new Date('2026-08-18T00:00:00Z')}), true);
  assert.strictEqual(shouldRefresh({lastUpdatedAt: '2025-08-17T00:00:00Z', trigger: 'ANNUAL', now: new Date('2026-08-18T00:00:00Z')}), true);
  assert.strictEqual(shouldRefresh({lastUpdatedAt: '2026-08-17T00:00:00Z', trigger: 'ANNUAL', now: new Date('2026-08-18T00:00:00Z')}), false);

  console.log('STIMES_AMENAZA_ITEM_V1_PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
