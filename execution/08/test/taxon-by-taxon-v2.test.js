'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
RC2, SOURCE_CONFIG, stableTaxonWorkKey, validateReleaseBinding,
FixtureAdapter, TaxonByTaxonEngine,
} = require('../src/taxon-by-taxon-v2');
const binding = () => ({
corpus_release_id: RC2.release_id,
corpus_release_version: RC2.release_version,
corpus_manifest_pointer: RC2.manifest_pointer,
corpus_manifest_sha256: RC2.manifest_sha256,
corpus_qa_state: 'PASS',
});
const candidate = (name, extra={}) => ({ returned_name: name, same_taxon: true, candidate_state: 'CANDIDATE', ...extra });
function engine(source, fixtures, options={}) {
const a = new FixtureAdapter(source, fixtures);
return new TaxonByTaxonEngine({ binding: binding(), adapters: { [source]: a }, ...options });
}
function unit(e, source, field, name, extra={}) { return e.makeUnit({ field_target: field, source_target: source, query_value_verbatim: name, ...extra }); }
// A. Binding y aislamiento
test('01 VALID_RC2_BINDING -> PASS', () => assert.equal(validateReleaseBinding(binding()).state, 'VALID_RC2_BINDING'));
test('02 manifest/hash incorrecto -> BLOCKED_INVALID_CORPUS_BINDING', () => {
const b=binding(); b.corpus_manifest_sha256='0'.repeat(64); assert.equal(validateReleaseBinding(b).state,'BLOCKED_INVALID_CORPUS_BINDING');
});
test('03 intento universo 2742 -> SYSTEMIC_STOP', () => {
const b=binding(); b.corpus_release_id='HISTORICAL_2742'; assert.equal(validateReleaseBinding(b).state,'SYSTEMIC_STOP');
});
test('04 query taxón A intenta escribir taxón B -> SYSTEMIC_STOP', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{external_id:'WFO:A',output_taxon_work_key:'TWK-OTHER'})]}});
assert.throws(()=>e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')),/CROSS_TAXON_MUTATION_ATTEMPT/);
});
test('05 misma query repetida no duplica assertion', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}});
const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); e.execute(u); assert.equal(e.assertions.size,1); assert.equal(e.resultsByQueryKey.size,1);
});
// B. Identidad taxonómica
test('06 especie exacta -> FOUND_VALIDATED', () => {
const e=engine('WORLD_FLORA_ONLINE', {'Poa annua':{status:200,scope_complete:true,candidates:[candidate('Poa annua',{rank:'species'})]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','Poa annua')).core_state,'FOUND_VALIDATED');
});
test('07 subespecie exacta solo con mismo rango', () => {
const n='Poa pratensis subsp. pratensis'; const e=engine('WORLD_FLORA_ONLINE',{[n]:{status:200,scope_complete:true,candidates:[candidate(n,{rank:'subspecies'})]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',n)).core_state,'FOUND_VALIDATED');
});
test('08 subespecie consultada y especie padre -> FOUND_PARENT_ONLY', () => {
const q='Poa pratensis subsp. pratensis'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Poa pratensis',{rank:'species',parent_of_query:true,external_id:'WFO:PARENT'})]}});
const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)); assert.equal(r.core_state,'FOUND_PARENT_ONLY'); assert.equal(r.parent_reference_id,'WFO:PARENT');
});
test('09 variedad vs subespecie no equivalencia automática', () => {
const q='Taxon a var. b'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Taxon a subsp. b',{rank:'subspecies'})]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)).core_state,'FOUND_RELATED_ONLY');
});
test('10 híbrido × vs no híbrido no equivalencia', () => {
const q='Salix × hybrida'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Salix hybrida')]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)).core_state,'FOUND_RELATED_ONLY');
});
test('11 grupo vs especie no equivalencia', () => {
const q='Rubus gr. fruticosus'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Rubus fruticosus',{rank:'species'})]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)).core_state,'FOUND_RELATED_ONLY');
});
test('12 genus sp. no assertion a especie', () => {
const q='Carex sp.'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Carex nigra',{rank:'species'})]}});
assert.notEqual(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)).core_state,'FOUND_VALIDATED');
});
test('13 variante ortográfica similar es candidato no identidad', () => {
const q='Androsace riojana'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('Androsace rioxana',{fuzzy_only:true})]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q)).core_state,'FOUND_RELATED_ONLY');
});
test('14 múltiples candidatos -> FOUND_MULTIPLE_CANDIDATES', () => {
const e=engine('WORLD_FLORA_ONLINE', {'X':{status:200,scope_complete:true,candidates:[candidate('X1'),candidate('X2')]}});
assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','X')).core_state,'FOUND_MULTIPLE_CANDIDATES');
});
// C. Estados técnicos
test('15 0 resultados tras consulta válida completa -> NOT_FOUND', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[]}}); assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')).core_state,'NOT_FOUND');
});
test('16 timeout -> SOURCE_UNAVAILABLE nunca NOT_FOUND', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{sequence:[{timeout:true},{timeout:true},{timeout:true}]}}); const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(r.core_state,'SOURCE_UNAVAILABLE');
});
test('17 429 retries registrados y agotado -> SOURCE_UNAVAILABLE', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{sequence:[{status:429},{status:429},{status:429}]}}); const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(r.core_state,'SOURCE_UNAVAILABLE'); assert.equal(r.retry_count,2);
});
test('18 5xx retries registrados y agotado -> SOURCE_UNAVAILABLE', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{sequence:[{status:503},{status:503},{status:503}]}}); assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')).core_state,'SOURCE_UNAVAILABLE');
});
test('19 parser roto sistemático -> SYSTEMIC_STOP', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,parser_error:true,systemic:true,candidates:[]}}); assert.throws(()=>e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')),/PARSER_SYSTEMICALLY_BROKEN/);
});
test('20 raw payload no preservable -> no assertion positiva', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}}); e._captureRaw=()=>({pointer:null,hash:null}); const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(r.core_state,'BLOCKED'); assert.equal(e.assertions.size,0);
});
// D. Fuentes/fields
test('21 EIDOS exact TaxonID -> ID_TAXON_GOBIERNO', () => {
const e=engine('EIDOS_LIVE_MITECO_IEPNB', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{external_id:'EIDOS:123'})]}}); const r=e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO','A')); assert.equal(r.field_value,'EIDOS:123');
});
test('22 static MITECO candidate sin EIDOS live confirm -> no ID write', () => {
const e=engine('EIDOS_LIVE_MITECO_IEPNB', {'A':{status:200,scope_complete:true,candidates:[]}}); const r=e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO','A')); assert.equal(r.field_value,null); assert.equal(e.assertions.size,0);
});
test('23 EIDOS query synonym -> TAX_EIDOS treatment y relación preservable', () => {
const e=engine('EIDOS_LIVE_MITECO_IEPNB', {'Old A':{status:200,scope_complete:true,candidates:[candidate('Old A',{accepted_name:'Accepted A',synonyms:['Old A']})]}}); const r=e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','TAX_EIDOS','Old A')); assert.equal(r.field_value,'Accepted A');
});
test('24 ANTHOS exact -> TAX_ANTHOS', () => {
const e=engine('ANTHOS_RJB_CSIC', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'Anthos A'})]}}); assert.equal(e.execute(unit(e,'ANTHOS_RJB_CSIC','TAX_ANTHOS','A')).field_value,'Anthos A');
});
test('25 POWO/WCVP accepted -> TAX_POWO_WCVP', () => {
const e=engine('KEW_POWO_WCVP', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'Kew A'})]}}); assert.equal(e.execute(unit(e,'KEW_POWO_WCVP','TAX_POWO_WCVP','A')).field_value,'Kew A');
});
test('26 POWO/WCVP synonym -> accepted Kew treatment', () => {
const e=engine('KEW_POWO_WCVP', {'Old A':{status:200,scope_complete:true,candidates:[candidate('Old A',{accepted_name:'Kew A',synonyms:['Old A']})]}}); assert.equal(e.execute(unit(e,'KEW_POWO_WCVP','TAX_POWO_WCVP','Old A')).field_value,'Kew A');
});
test('27 WFO Accepted -> TAX_WFO + ID preservable', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{external_id:'wfo-1',taxonomic_status:'Accepted'})]}}); const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(r.field_value,'A'); assert.equal(r.candidates[0].external_id,'wfo-1');
});
test('28 WFO Synonym -> accepted WFO treatment', () => {
const e=engine('WORLD_FLORA_ONLINE', {'Old A':{status:200,scope_complete:true,candidates:[candidate('Old A',{accepted_name:'WFO A',taxonomic_status:'Synonym',synonyms:['Old A']})]}}); assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','Old A')).field_value,'WFO A');
});
test('29 WFO ambiguous/unchecked -> no equivalencia automática', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{ambiguous:true})]}}); assert.equal(e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')).core_state,'AMBIGUOUS');
});
test('30 current Euro+Med disponible -> TAX_EUROMED', () => {
const e=engine('EUROPLUSMED_PLANTBASE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'EuroMed A'})]}}); assert.equal(e.execute(unit(e,'EUROPLUSMED_PLANTBASE','TAX_EUROMED','A')).field_value,'EuroMed A');
});
test('31 only legacy Euro+Med -> current TAX_EUROMED unresolved', () => {
const e=engine('EUROPLUSMED_PLANTBASE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{legacy_only:true})]}}); const r=e.execute(unit(e,'EUROPLUSMED_PLANTBASE','TAX_EUROMED','A')); assert.equal(r.field_value,null); assert.equal(r.core_state,'SOURCE_UNAVAILABLE');
});
// E. Expansión cruzada
test('32 nombre B descubierto por POWO permite ANTHOS(B) aunque ANTHOS(A)=NOT_FOUND', () => {
const adapters={
KEW_POWO_WCVP:new FixtureAdapter('KEW_POWO_WCVP', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'B'})]}}),
ANTHOS_RJB_CSIC:new FixtureAdapter('ANTHOS_RJB_CSIC', {'A':{status:200,scope_complete:true,candidates:[]},'B':{status:200,scope_complete:true,candidates:[candidate('B',{accepted_name:'Anthos B'})]}}),
};
const e=new TaxonByTaxonEngine({binding:binding(),adapters});
e.execute(unit(e,'KEW_POWO_WCVP','TAX_POWO_WCVP','A')); e.execute(unit(e,'ANTHOS_RJB_CSIC','TAX_ANTHOS','A')); const r=e.execute(unit(e,'ANTHOS_RJB_CSIC','TAX_ANTHOS','B',{query_value_origin:'TAX_POWO_WCVP',query_reason:'CROSS_SOURCE_REQUERY'})); assert.equal(r.field_value,'Anthos B');
});
test('33 WFO descubre C y C queda en matriz para fuentes pendientes', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'C'})]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); const p=e.pendingPairs(u.taxon_work_key,['WORLD_FLORA_ONLINE','EIDOS_LIVE_MITECO_IEPNB']); assert.ok(p.some(x=>x[0]==='C'&&x[1]==='EIDOS_LIVE_MITECO_IEPNB'));
});
test('34 nombre ya consultado no genera query duplicada', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); e.execute(u); assert.equal(e.resultsByQueryKey.size,1);
});
test('35 nuevo nombre genera solo parejas fuente pendientes', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'C'})]},'C':{status:200,scope_complete:true,candidates:[candidate('C')]}}); const ua=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(ua); e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','C',{query_value_origin:'TAX_WFO',query_reason:'CROSS_SOURCE_REQUERY'})); const p=e.pendingPairs(ua.taxon_work_key,['WORLD_FLORA_ONLINE','EIDOS_LIVE_MITECO_IEPNB']); assert.ok(!p.some(x=>x[0]==='C'&&x[1]==='WORLD_FLORA_ONLINE')); assert.ok(p.some(x=>x[0]==='C'&&x[1]==='EIDOS_LIVE_MITECO_IEPNB'));
});
test('36 fixpoint no se declara con nombre validado y fuente pendiente', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'C'})]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); assert.equal(e.fixpointReached(u.taxon_work_key,['WORLD_FLORA_ONLINE','EIDOS_LIVE_MITECO_IEPNB']),false);
});
test('37 fixpoint cuando no nuevos nombres y todas parejas terminales', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); assert.equal(e.fixpointReached(u.taxon_work_key,['WORLD_FLORA_ONLINE']),true);
});
// F. ID oficial iterativo
test('38 EIDOS(TAX_RIOJA)=NOT_FOUND; POWO descubre B; EIDOS(B)=TaxonID', () => {
const adapters={
EIDOS_LIVE_MITECO_IEPNB:new FixtureAdapter('EIDOS_LIVE_MITECO_IEPNB', {'A':{status:200,scope_complete:true,candidates:[]},'B':{status:200,scope_complete:true,candidates:[candidate('B',{external_id:'EIDOS:B'})]}}),
KEW_POWO_WCVP:new FixtureAdapter('KEW_POWO_WCVP', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'B'})]}}),
};
const e=new TaxonByTaxonEngine({binding:binding(),adapters}); e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO','A')); e.execute(unit(e,'KEW_POWO_WCVP','TAX_POWO_WCVP','A')); const r=e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO','B',{query_value_origin:'TAX_POWO_WCVP',query_reason:'GOVERNMENT_ID_REQUERY'})); assert.equal(r.field_value,'EIDOS:B');
});
test('39 temporal previo superseded por government ID en test-only gate', () => {
const e=new TaxonByTaxonEngine({binding:binding(),idMappingGate:'OPEN_CANONICAL_TEST_ONLY'}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); const r=e.deriveJblrId(twk,'EIDOS:1','JBLR-TEMP-OLD'); assert.equal(r.id_taxon_jblr,'EIDOS:1'); assert.deepEqual(r.previous_ids,['JBLR-TEMP-OLD']);
});
test('40 parent species ID nunca supersede temporal hijo', () => {
const q='Poa pratensis subsp. pratensis'; const e=engine('EIDOS_LIVE_MITECO_IEPNB',{[q]:{status:200,scope_complete:true,candidates:[candidate('Poa pratensis',{rank:'species',parent_of_query:true,external_id:'EIDOS:PARENT'})]}},{idMappingGate:'OPEN_CANONICAL_TEST_ONLY'}); const u=unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO',q); const rr=e.execute(u); const id=e.deriveJblrId(u.taxon_work_key,rr.field_value,'JBLR-TEMP-CHILD'); assert.equal(rr.core_state,'FOUND_PARENT_ONLY'); assert.equal(id.id_taxon_jblr,'JBLR-TEMP-CHILD');
});
// G. Históricos
test('41 nombre histórico con relación explícita -> TAX_HISTORICO_1', () => {
const e=new TaxonByTaxonEngine({binding:binding()}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); const r=e.addValidatedHistoricalName(twk,'Old A','evidence://1'); assert.equal(r.field,'TAX_HISTORICO_1');
});
test('42 segundo histórico -> TAX_HISTORICO_2 sin concatenación', () => {
const e=new TaxonByTaxonEngine({binding:binding()}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); e.addValidatedHistoricalName(twk,'Old A','e://1'); const r=e.addValidatedHistoricalName(twk,'Older A','e://2'); assert.equal(r.field,'TAX_HISTORICO_2'); assert.equal(e.humanView(twk,'A').TAX_HISTORICO_1,'Old A'); assert.equal(e.humanView(twk,'A').TAX_HISTORICO_2,'Older A');
});
test('43 mención sin evidencia equivalencia -> candidate only', () => {
const e=new TaxonByTaxonEngine({binding:binding()}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); assert.equal(e.addValidatedHistoricalName(twk,'Old A',null).promoted,false);
});
test('44 histórico validado entra en cola y fuentes requeridas pendientes', () => {
const e=new TaxonByTaxonEngine({binding:binding()}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); e.addValidatedHistoricalName(twk,'Old A','e://1'); const p=e.pendingPairs(twk,['WORLD_FLORA_ONLINE','EIDOS_LIVE_MITECO_IEPNB']); assert.equal(p.length,2);
});
test('45 histórico permite encontrar ID EIDOS', () => {
const e=engine('EIDOS_LIVE_MITECO_IEPNB', {'Old A':{status:200,scope_complete:true,candidates:[candidate('Old A',{external_id:'EIDOS:HIST'})]}}); const r=e.execute(unit(e,'EIDOS_LIVE_MITECO_IEPNB','ID_TAXON_GOBIERNO','Old A',{query_value_origin:'TAX_HISTORICO_1',query_reason:'HISTORICAL_REQUERY'})); assert.equal(r.field_value,'EIDOS:HIST');
});
// H. Human view / QA
test('46 una fila humana por taxón con fields principales', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'WFO A'})]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); e.execute(u); const v=e.humanView(u.taxon_work_key,'A'); assert.equal(v.TAXON_WORK_KEY,u.taxon_work_key); assert.ok(Object.hasOwn(v,'TAX_EIDOS')&&Object.hasOwn(v,'TAX_WFO'));
});
test('47 históricos expandidos a columnas separadas', () => {
const e=new TaxonByTaxonEngine({binding:binding()}); const twk=stableTaxonWorkKey(RC2.release_id,'ROW:1'); e.addValidatedHistoricalName(twk,'H1','e://1'); e.addValidatedHistoricalName(twk,'H2','e://2'); const v=e.humanView(twk,'A'); assert.equal(v.TAX_HISTORICO_1,'H1'); assert.equal(v.TAX_HISTORICO_2,'H2');
});
test('48 REVIEW_REQUIRED incluye parent-only/source-unavailable/etc', () => {
const q='A subsp. b'; const e=engine('WORLD_FLORA_ONLINE',{[q]:{status:200,scope_complete:true,candidates:[candidate('A',{rank:'species',parent_of_query:true})]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO',q); e.execute(u); assert.equal(e.reviewRequired(u.taxon_work_key).length,1);
});
test('49 machine result y human view mismo field value', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'WFO A'})]}}); const u=unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A'); const r=e.execute(u); assert.equal(e.humanView(u.taxon_work_key,'A').TAX_WFO,r.field_value);
});
test('50 assertions without evidence = 0', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}}); e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(e.qaRun().assertions_without_evidence,0);
});
test('51 false NOT_FOUND from technical failures = 0', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{sequence:[{status:503},{status:503},{status:503}]}}); const r=e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.notEqual(r.core_state,'NOT_FOUND'); assert.equal(e.qaRun().false_not_found_from_source_error,0);
});
test('52 cross-taxon mutations = 0 en run válido', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A')]}}); e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(e.qaRun().cross_taxon_mutations,0);
});
test('53 untracked query names = 0', () => {
const e=engine('WORLD_FLORA_ONLINE', {'A':{status:200,scope_complete:true,candidates:[candidate('A',{accepted_name:'B'})]}}); e.execute(unit(e,'WORLD_FLORA_ONLINE','TAX_WFO','A')); assert.equal(e.qaRun().untracked_query_names,0);
});
