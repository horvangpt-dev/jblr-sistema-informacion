#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {contract,equivalence,selectProtection,updateProtection,resolveApplicability,annualRefreshDue,auditProtection,toExcelRow} = require('../src/stimes/items/proteccion-v1');

const TAXON = {taxon_id:'TEST-TAXON-001', family:'TESTACEAE', taxon_name:'Taxon testensis'};
const NOW = '2026-08-18';
function ev(overrides={}) { return {
  evidence_id:'TEST-EVIDENCE', evidence_state:'VALID_SOURCE_EVIDENCE', queried_name:TAXON.taxon_name,
  literal_name_in_norm:TAXON.taxon_name, taxon_resolved:true, taxonomic_state:'RESOLVED',
  source_authorized:true, primary_source_verified:true, legal_validity_verified:true,
  currentness_verified:true, currentness_status:'CURRENT', legal_applicability_verified:true,
  jurisdiction_level:'Autonómico', jurisdiction_name:'La Rioja', territorial_scope:'Autonómico', sub_country:'La Rioja',
  norm_title:'Ley de prueba basada en marco jurídico real', norm_short_title:'Norma test', official_identifier:'TEST-OFFICIAL-ID',
  article:'art. test', annex_or_list:'anexo test', original_category:'En peligro de extinción', category_class:'ENDANGERED',
  category_equivalence_verified:true, taxon_annex_membership_verified:true, site_applicability_verified:true,
  short_reference:'Norma test · anexo test', ...overrides
}; }
function completeSearch(extra={}) { return {query_executed:true,taxon_resolved:true,authorized_source_set_verified:true,all_authorized_sources_consulted:true,primary_source_checks_complete:true,complete:true,...extra}; }

assert.strictEqual(contract.item_id,'STIMES.ITEM.PROTECCION');
assert.strictEqual(equivalence.table_id,'PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2');
assert.strictEqual(contract.dependencies.direct_downstream[0],'URGENCIA_RECOLECCION');
assert.strictEqual(contract.storage_mapping.neon_changes_now,'NONE');
assert.throws(() => selectProtection({taxon:TAXON,evidence:[ev({manual_score:99})],search:completeSearch()}),/MANUAL_PROTECTION_SCORE_PROHIBITED/);

// CASE A — La Rioja current protection.
const a = selectProtection({taxon:TAXON,evidence:[ev({norm_short_title:'Ley 2/2025',category_class:'ENDANGERED'})],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(a.state,'PROTECTED'); assert.strictEqual(a.score_100,100);

// CASE B — applicable national protection, without jurisdiction score discount.
const b = selectProtection({taxon:TAXON,evidence:[ev({jurisdiction_level:'Nacional',jurisdiction_name:'España',territorial_scope:'Nacional',sub_country:'',norm_short_title:'CEEA',original_category:'Vulnerable',category_class:'VULNERABLE'})],search:completeSearch({score_native_05:76.5}),updatedAt:NOW});
assert.strictEqual(b.state,'PROTECTED'); assert.strictEqual(b.score_100,85); assert.strictEqual(b.score_native_05,76.5);

// CASE C — most restrictive current applicable category wins.
const c = selectProtection({taxon:TAXON,evidence:[ev({evidence_id:'C-RIOJA',original_category:'En Régimen de Protección Especial',category_class:'SPECIAL_PROTECTION_REGIME'}),ev({evidence_id:'C-STATE',jurisdiction_level:'Nacional',jurisdiction_name:'España',territorial_scope:'Nacional',sub_country:'',original_category:'Vulnerable',category_class:'VULNERABLE'})],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(c.score_100,85); assert.strictEqual(c.selected_effective_evidence[0].category_class,'VULNERABLE');

// CASE D — another autonomous community is excluded even when upstream scope is national.
const badExternal = ev({evidence_id:'D-MADRID',jurisdiction_level:'Nacional',territorial_scope:'Nacional',jurisdiction_name:'Comunidad de Madrid',sub_country:'Comunidad de Madrid',upstream_applicability:'APPLICABLE_NATIONAL',category_class:'ENDANGERED'});
assert.strictEqual(resolveApplicability(badExternal),'EXTERNAL_AUTONOMOUS_REFERENCE');
const d = selectProtection({taxon:TAXON,evidence:[badExternal],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(d.state,'SIN_PROTECCION'); assert.strictEqual(d.score_100,0);

// EU and international scopes are not mistaken for autonomous communities.
const eu = ev({evidence_id:'EU',jurisdiction_level:'EU',jurisdiction_name:'Unión Europea',territorial_scope:'EU',sub_country:'',original_category:'Annex IV(b)',category_class:'HABITATS_STRICT_PROTECTION'});
assert.strictEqual(resolveApplicability(eu),'APPLICABLE_EU');
const euResult = selectProtection({taxon:TAXON,evidence:[eu],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(euResult.state,'PROTECTED'); assert.strictEqual(euResult.score_100,80);

// CASE E — repealed evidence stays in history but cannot score current.
const oldEvidence = ev({evidence_id:'E-OLD',norm_short_title:'Decreto 59/1998',category_class:'ENDANGERED',currentness_status:'NOT_CURRENT'});
const newEvidence = ev({evidence_id:'E-NEW',norm_short_title:'Ley vigente',category_class:'VULNERABLE',original_category:'Vulnerable'});
const before = JSON.stringify([oldEvidence,newEvidence]);
const e = selectProtection({taxon:TAXON,evidence:[oldEvidence,newEvidence],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(e.score_100,85); assert.strictEqual(e.selected_effective_evidence[0].evidence_id,'E-NEW'); assert.strictEqual(JSON.stringify([oldEvidence,newEvidence]),before);

// CASE F — complete valid search with no protection => SIN PROTECCION 0.
const f = selectProtection({taxon:TAXON,evidence:[],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(f.state,'SIN_PROTECCION'); assert.strictEqual(f.score_100,0); assert.strictEqual(toExcelRow(f,1)[3],'SIN PROTECCIÓN');

// Context-only legal references do not create protection and do not block a complete negative conclusion.
const context = selectProtection({taxon:TAXON,evidence:[ev({evidence_id:'CTX',jurisdiction_level:'Nacional',jurisdiction_name:'España',territorial_scope:'Nacional',sub_country:'',category_class:'MATERIAL_BASE',original_category:'ANEXO material de base'})],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(context.state,'SIN_PROTECCION'); assert.strictEqual(context.score_100,0);
assert.strictEqual(context.audit_trace[0].decision,'EXCLUDED_CONTEXT_ONLY_NOT_EFFECTIVE_PROTECTION');

// CASE G — source missing retains semantic state; provisional zero is downstream-only.
const g = selectProtection({taxon:TAXON,evidence:[],search:{query_executed:true,taxon_resolved:true,authorized_source_set_verified:true,all_authorized_sources_consulted:false,primary_source_checks_complete:false,source_not_acquired:true},downstreamRequiresNumber:true,updatedAt:NOW});
assert.strictEqual(g.state,'SOURCE_NOT_ACQUIRED'); assert.strictEqual(g.score_100,null); assert.strictEqual(g.score_operativo,0); assert.strictEqual(g.score_operativo_status,'PROVISIONAL');

// A current potentially protective record with unresolved mapping blocks SIN PROTECCION.
const blocked = selectProtection({taxon:TAXON,evidence:[ev({evidence_id:'BLOCK',category_class:'CITES_A_OR_APPENDIX_I',original_category:'Apéndice II'})],search:completeSearch(),updatedAt:NOW});
assert.strictEqual(blocked.state,'UNKNOWN'); assert.strictEqual(blocked.score_100,null); assert.strictEqual(blocked.audit_trace[0].decision,'BLOCKED_LITERAL_CATEGORY_CONFLICT');

// Unresolved material conflict cannot silently become a score.
const conflict = selectProtection({taxon:TAXON,evidence:[ev({evidence_id:'CONFLICT',conflict_unresolved:true,category_class:'ENDANGERED'})],search:completeSearch(),downstreamRequiresNumber:true,updatedAt:NOW});
assert.strictEqual(conflict.state,'CONFLICT'); assert.strictEqual(conflict.score_100,null); assert.strictEqual(conflict.score_operativo,0); assert.strictEqual(conflict.score_operativo_status,'PROVISIONAL');

// CASE H — legislative change emits descendant recalculation requests.
const h1 = selectProtection({taxon:TAXON,evidence:[ev({evidence_id:'H1',category_class:'SPECIAL_PROTECTION_REGIME',original_category:'En Régimen de Protección Especial'})],search:completeSearch(),updatedAt:'2026-01-01'});
const h2 = updateProtection({previousRevision:h1,nextInput:{taxon:TAXON,evidence:[ev({evidence_id:'H2',category_class:'VULNERABLE',original_category:'Vulnerable'})],search:completeSearch(),updatedAt:NOW}});
assert.strictEqual(h2.changed,true); assert.strictEqual(h2.current_revision.score_100,85); assert.deepStrictEqual(h2.recalculation_requests.map(x=>x.item_id),['URGENCIA_RECOLECCION','PRIORIDAD_TAXON']);

// Annual due rule is deterministic without inventing a clock time.
assert.deepStrictEqual(annualRefreshDue('2025-08-18','2026-08-18'),{due:true,next_due_at:'2026-08-18',reason:'ANNUAL_DUE'});
assert.strictEqual(annualRefreshDue('2026-01-01','2026-08-18').due,false);
assert.strictEqual(annualRefreshDue(null,'2026-08-18').due,true);

// Audit reconstruction is runtime data, not conversation memory.
const audit = auditProtection(c);
assert.strictEqual(audit.score_100,85); assert.strictEqual(audit.equivalence_version,'PROTECCION_LEGAL_CATEGORY_EQUIVALENCE_v2');
assert.ok(audit.alternatives_and_reasons.some(x => x.decision === 'NOT_SELECTED_LESS_RESTRICTIVE_THAN_EFFECTIVE_MAXIMUM'));

// Human Excel projection structure.
assert.deepStrictEqual(contract.excel_view.headers,['N.º','Familia','Taxón','La Rioja','España','Europa/UE','Internacional','Score protección','Norma efectiva','Última actualización','Evidencia','Confiabilidad']);
assert.strictEqual(toExcelRow(a,1).length,12);

console.log('STIMES_PROTECCION_CASES_A_H_AND_QA_PASS');
