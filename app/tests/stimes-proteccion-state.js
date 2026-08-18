#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  contract,
  equivalence,
  selectProtection,
  updateProtection,
  resolveApplicability,
  toExcelRow
} = require('../src/stimes/items/proteccion-v1');

const TAXON = {taxon_id:'TEST-TAXON-001', family:'TESTACEAE', taxon_name:'Taxon testensis'};
const NOW = '2026-08-18';

function ev(overrides = {}) {
  return {
    evidence_id:'TEST-EVIDENCE',
    evidence_state:'VALID_SOURCE_EVIDENCE',
    queried_name:TAXON.taxon_name,
    literal_name_in_norm:TAXON.taxon_name,
    taxon_resolved:true,
    taxonomic_state:'RESOLVED',
    source_authorized:true,
    primary_source_verified:true,
    legal_validity_verified:true,
    currentness_verified:true,
    currentness_status:'CURRENT',
    legal_applicability_verified:true,
    jurisdiction_level:'Autonómico',
    jurisdiction_name:'La Rioja',
    territorial_scope:'Autonómico',
    sub_country:'La Rioja',
    norm_title:'Ley de prueba basada en marco jurídico real',
    norm_short_title:'Norma test',
    official_identifier:'TEST-OFFICIAL-ID',
    article:'art. test',
    annex_or_list:'anexo test',
    original_category:'En peligro de extinción',
    category_class:'ENDANGERED',
    category_equivalence_verified:true,
    taxon_annex_membership_verified:true,
    short_reference:'Norma test · anexo test',
    ...overrides
  };
}

function completeSearch(extra = {}) {
  return {
    query_executed:true,
    taxon_resolved:true,
    authorized_source_set_verified:true,
    all_authorized_sources_consulted:true,
    primary_source_checks_complete:true,
    complete:true,
    ...extra
  };
}

assert.strictEqual(contract.item_id, 'STIMES.ITEM.PROTECCION');
assert.strictEqual(contract.FIELD_ID, 'STIMES.ITEM.PROTECCION');
assert.strictEqual(equivalence.table_id, 'PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v1');
assert.strictEqual(contract.dependencies.direct_downstream[0], 'URGENCIA_RECOLECCION');
assert.strictEqual(contract.storage_mapping.neon_changes_now, 'NONE');
assert.throws(() => selectProtection({taxon:TAXON, evidence:[ev({manual_score:99})], search:completeSearch()}), /MANUAL_PROTECTION_SCORE_PROHIBITED/);

// CASE A — current La Rioja protection.
const a = selectProtection({
  taxon:TAXON,
  evidence:[ev({norm_title:'Ley 2/2025 / marco Ley 2/2023 La Rioja', norm_short_title:'Ley 2/2025', original_category:'En peligro de extinción', category_class:'ENDANGERED'})],
  search:completeSearch(), updatedAt:NOW
});
assert.strictEqual(a.state, 'PROTECTED');
assert.strictEqual(a.score_100, 100);
assert.strictEqual(a.territorial_display.la_rioja, 'En peligro de extinción');

// CASE B — current applicable Spanish national protection; no jurisdiction discount in STIMES effective score.
const b = selectProtection({
  taxon:TAXON,
  evidence:[ev({jurisdiction_level:'Nacional', jurisdiction_name:'España', territorial_scope:'Nacional', sub_country:'', norm_title:'Ley 42/2007 / RD 139/2011', norm_short_title:'CEEA', original_category:'Vulnerable', category_class:'VULNERABLE'})],
  search:completeSearch({score_native_05:76.5}), updatedAt:NOW
});
assert.strictEqual(b.state, 'PROTECTED');
assert.strictEqual(b.score_100, 85);
assert.strictEqual(b.score_native_05, 76.5);
assert.strictEqual(b.territorial_display.espana, 'Vulnerable');

// CASE C — multiple applicable rules; the most restrictive mapped category wins.
const c = selectProtection({
  taxon:TAXON,
  evidence:[
    ev({evidence_id:'C-RIOJA', norm_short_title:'RRPE Rioja', original_category:'En Régimen de Protección Especial', category_class:'SPECIAL_PROTECTION_REGIME'}),
    ev({evidence_id:'C-STATE', jurisdiction_level:'Nacional', jurisdiction_name:'España', territorial_scope:'Nacional', sub_country:'', norm_short_title:'CEEA', original_category:'Vulnerable', category_class:'VULNERABLE'})
  ],
  search:completeSearch(), updatedAt:NOW
});
assert.strictEqual(c.score_100, 85);
assert.strictEqual(c.selected_effective_evidence[0].category_class, 'VULNERABLE');

// CASE D — another autonomous community is excluded even if upstream says Nacional/APPLICABLE_NATIONAL.
const badExternal = ev({
  evidence_id:'D-MADRID', jurisdiction_level:'Nacional', territorial_scope:'Nacional', jurisdiction_name:'Comunidad de Madrid', sub_country:'Comunidad de Madrid', upstream_applicability:'APPLICABLE_NATIONAL', category_class:'ENDANGERED', original_category:'En peligro de extinción'
});
assert.strictEqual(resolveApplicability(badExternal), 'EXTERNAL_AUTONOMOUS_REFERENCE');
const d = selectProtection({taxon:TAXON, evidence:[badExternal], search:completeSearch(), updatedAt:NOW});
assert.strictEqual(d.state, 'SIN_PROTECCION');
assert.strictEqual(d.score_100, 0);
assert.strictEqual(d.alternative_evidence[0].applicability_resolution, 'EXTERNAL_AUTONOMOUS_REFERENCE');

// CASE E — repealed/old rule remains history but cannot beat a current rule.
const oldEvidence = ev({
  evidence_id:'E-OLD', norm_title:'Decreto 59/1998 La Rioja', norm_short_title:'Decreto 59/1998', category_class:'ENDANGERED', original_category:'En peligro de extinción', currentness_status:'NOT_CURRENT'
});
const newEvidence = ev({
  evidence_id:'E-NEW', norm_title:'Ley 2/2025 / Ley 2/2023 La Rioja', norm_short_title:'Ley 2/2025', category_class:'VULNERABLE', original_category:'Vulnerable'
});
const before = JSON.stringify([oldEvidence,newEvidence]);
const e = selectProtection({taxon:TAXON, evidence:[oldEvidence,newEvidence], search:completeSearch(), updatedAt:NOW});
assert.strictEqual(e.score_100, 85);
assert.strictEqual(e.selected_effective_evidence[0].evidence_id, 'E-NEW');
assert.ok(e.alternative_evidence.some(r => r.evidence_id === 'E-OLD' && r.currentness_resolution === 'NOT_CURRENT_VERIFIED'));
assert.strictEqual(JSON.stringify([oldEvidence,newEvidence]), before, 'original source evidence must remain immutable');

// CASE F — complete, valid search with no applicable protection proves SIN PROTECCION = 0.
const f = selectProtection({taxon:TAXON, evidence:[], search:completeSearch(), updatedAt:NOW});
assert.strictEqual(f.state, 'SIN_PROTECCION');
assert.strictEqual(f.score_100, 0);
assert.strictEqual(f.score_operativo_status, 'CURRENT');

// CASE G — inaccessible/incomplete source preserves semantics; provisional zero is downstream-only.
const g = selectProtection({
  taxon:TAXON,
  evidence:[],
  search:{query_executed:true,taxon_resolved:true,authorized_source_set_verified:true,all_authorized_sources_consulted:false,primary_source_checks_complete:false,complete:false,source_not_acquired:true},
  downstreamRequiresNumber:true,
  updatedAt:NOW
});
assert.strictEqual(g.state, 'SOURCE_NOT_ACQUIRED');
assert.strictEqual(g.score_100, null);
assert.strictEqual(g.score_operativo, 0);
assert.strictEqual(g.score_operativo_status, 'PROVISIONAL');
assert.ok(g.reliability.checked_components < g.reliability.total_components);
assert.strictEqual(g.reliability.model_status, 'PENDIENTE_DE_DEFINICION');

// CASE H — legislative change updates protection and emits downstream recalculation without implementing downstream formulas.
const h1 = selectProtection({
  taxon:TAXON,
  evidence:[ev({evidence_id:'H1', norm_short_title:'RRPE', category_class:'SPECIAL_PROTECTION_REGIME', original_category:'En Régimen de Protección Especial'})],
  search:completeSearch(), updatedAt:'2026-01-01'
});
const h2 = updateProtection({
  previousRevision:h1,
  nextInput:{taxon:TAXON,evidence:[ev({evidence_id:'H2', norm_short_title:'Nueva norma', category_class:'VULNERABLE', original_category:'Vulnerable'})],search:completeSearch(),updatedAt:NOW}
});
assert.strictEqual(h2.changed, true);
assert.strictEqual(h2.current_revision.score_100, 85);
assert.deepStrictEqual(h2.recalculation_requests.map(x => x.item_id), ['URGENCIA_RECOLECCION','PRIORIDAD_TAXON']);
assert.strictEqual(h2.previous_revision.score_100, 70);
assert.strictEqual(h2.full_localizacion_y_seleccion_refresh_requested, true);

// A same-result refresh keeps history but does not emit redundant dependency requests.
const stable = updateProtection({previousRevision:h2.current_revision,nextInput:{taxon:TAXON,evidence:[ev({evidence_id:'H3', norm_short_title:'Nueva norma', category_class:'VULNERABLE', original_category:'Vulnerable'})],search:completeSearch(),updatedAt:'2026-08-19'}});
assert.strictEqual(stable.changed, false);
assert.deepStrictEqual(stable.recalculation_requests, []);

// Human Excel projection structure.
const row = toExcelRow(a, 1);
assert.strictEqual(row.length, 12);
assert.deepStrictEqual(contract.excel_view.headers, ['N.º','Familia','Taxón','La Rioja','España','Europa/UE','Internacional','Score protección','Norma efectiva','Última actualización','Evidencia','Confiabilidad']);
assert.strictEqual(row[7], 100);

console.log('STIMES_PROTECCION_CASES_A_H_PASS');
