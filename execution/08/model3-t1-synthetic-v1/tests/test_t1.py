import copy
import json
import os
import unittest

from model3_t1.engine import (
    SYNTHETIC_SCOPE, ContractError, aggregate_cwr, application_state,
    apply_selection_profile, can_prepare_application_from_desktop,
    classify_protection, collection_go_from_authorization, evaluate_fixture,
    phenology_overlay, protection_visible, reference_distribution_state,
    summarize_exsitu, synthetic_weighted_score, validate_nullable_value,
    validate_run_metadata, validate_spatial_evidence_state, validate_universe_integrity, validate_valuation_rows,
    validate_version_fields,
)

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT,'fixtures','F01_F17.json'),encoding='utf-8') as f: FIXTURES={x['id']:x for x in json.load(f)}
with open(os.path.join(ROOT,'fixtures','expected_F01_F17.json'),encoding='utf-8') as f: EXPECTED=json.load(f)
with open(os.path.join(ROOT,'fixtures','synthetic_universe.json'),encoding='utf-8') as f: UNIVERSE=json.load(f)


def _fixture_test(fid):
    def test(self):
        self.assertEqual(evaluate_fixture(FIXTURES[fid]), EXPECTED[fid])
    test.__name__='test_'+fid
    return test

class FixtureTests(unittest.TestCase):
    pass
for _fid in sorted(FIXTURES):
    setattr(FixtureTests,'test_'+_fid,_fixture_test(_fid))

class ContractTests(unittest.TestCase):
    def setUp(self):
        self.meta={
            'RUN_ID':'SYN-RUN-T1-001','MODEL_VERSION':'MODEL3_T1_PROTOTYPE_v1',
            'UNIVERSE_RELEASE_ID':UNIVERSE['UNIVERSE_RELEASE_ID'],
            'UNIVERSE_VERSION':UNIVERSE['UNIVERSE_VERSION'],'UNIVERSE_HASH':UNIVERSE['UNIVERSE_HASH'],
            'EVIDENCE_SNAPSHOT_ID':'SYN-EVIDENCE-001','SOURCE_METHOD_VERSIONS':{'synthetic':'v1'},
            'RUN_CUTOFF_DATE':'2026-11-17','EXECUTION_SCOPE':SYNTHETIC_SCOPE,'REAL_CORPUS_USED':False,
        }

    def test_synthetic_universe_hash_integrity(self):
        self.assertTrue(validate_universe_integrity(UNIVERSE))
        broken=copy.deepcopy(UNIVERSE); broken['taxa'][0]['SCIENTIFIC_NAME']='Taxon syntheticus CORRUPTED'
        with self.assertRaisesRegex(ContractError,'UNIVERSE_HASH_MISMATCH'):
            validate_universe_integrity(broken)

    def test_missing_universe_blocks_run(self):
        m=dict(self.meta); m['UNIVERSE_HASH']=''
        with self.assertRaisesRegex(ContractError,'BLOCKED_NO_UNIVERSE'):
            validate_run_metadata(m)

    def test_real_corpus_scope_rejected(self):
        m=dict(self.meta); m['EXECUTION_SCOPE']='PRODUCTION'
        with self.assertRaises(ContractError): validate_run_metadata(m)

    def test_unique_run_taxon_key_enforced(self):
        rows=[{'TAXON_KEY':'SYN-TAX-001','SCIENTIFIC_NAME':'Taxon syntheticus 001','RANK':'Species','IDENTITY_STATE':'SYNTHETIC_RESOLVED'}]*2
        with self.assertRaisesRegex(ContractError,'DUPLICATE_RUN_ID_TAXON_KEY'):
            validate_valuation_rows(rows,self.meta)

    def test_null_requires_state(self):
        with self.assertRaisesRegex(ContractError,'VALUE_STATE'):
            validate_nullable_value(None,None)

    def test_partial_null_requires_reason(self):
        with self.assertRaisesRegex(ContractError,'NULL_PENDING_REASON_REQUIRED'):
            validate_nullable_value(None,'SEARCH_PARTIAL')

    def test_unknown_cannot_be_zero(self):
        with self.assertRaisesRegex(ContractError,'ZERO_NOT_ALLOWED'):
            validate_nullable_value(0,'UNKNOWN','SYN-UNKNOWN')

    def test_version_fields_required(self):
        with self.assertRaisesRegex(ContractError,'MISSING_VERSION_FIELDS'):
            validate_version_fields({'MODEL_VERSION':'v1'},['MODEL_VERSION','UNIVERSE_VERSION'])

    def test_synthetic_scenario_scoring_only(self):
        score=synthetic_weighted_score({'a':10,'b':20},{'a':0.5,'b':0.5},SYNTHETIC_SCOPE)
        self.assertEqual(score,15)
        with self.assertRaises(ContractError):
            synthetic_weighted_score({'a':10,'b':20},{'a':0.5,'b':0.5},'PRODUCTION')

    def test_protection_mapping_endangered(self):
        self.assertEqual(classify_protection('EN_PELIGRO_DE_EXTINCION',search_complete=True),('PROTECTED_CONFIRMED','HIGH_EXCLUSION'))

    def test_protection_mapping_special_regime(self):
        self.assertEqual(classify_protection('REGIMEN_PROTECCION_ESPECIAL',search_complete=True),('PROTECTED_CONFIRMED','PROTECTED_NON_EXCLUSION'))

    def test_no_protection_requires_complete_search(self):
        self.assertEqual(classify_protection(None,search_complete=False),('UNKNOWN','UNKNOWN'))
        self.assertEqual(classify_protection(None,search_complete=True),('NO_PROTECTION_CONFIRMED','NO_PROTECTION_CONFIRMED'))

    def test_filters_do_not_mutate_ui(self):
        r={'CWR_FILTER_STATE':'YES','PROTECTION_PRESENCE_STATE':'PROTECTED_CONFIRMED','PROTECTION_EXCLUSION_CLASS':'HIGH_EXCLUSION','U_VALUE':27.5,'I_VALUE':63.5}
        before=copy.deepcopy(r)
        out=apply_selection_profile(r,'EXCLUDE_CONFIRMED_CWR','EXCLUDE_HIGH_PROTECTION')
        self.assertFalse(out['visible']); self.assertTrue(out['ui_unchanged']); self.assertEqual(r,before)

    def test_exsitu_backup_not_second_biological_accession(self):
        s=summarize_exsitu([
            {'ACCESSION_ID':'A1','DUPLICATE_OR_BACKUP_OF':None,'ORIGIN_UNIT_ID':'O1'},
            {'ACCESSION_ID':'A1-BACKUP','DUPLICATE_OR_BACKUP_OF':'A1','ORIGIN_UNIT_ID':'O1'},
        ])
        self.assertEqual(s['ACCESSION_COUNT_VALIDATED'],1)
        self.assertEqual(s['DOCUMENTED_ORIGIN_UNIT_COUNT'],1)

    def test_two_accessions_one_origin_remain_two_accessions(self):
        s=summarize_exsitu([
            {'ACCESSION_ID':'A1','DUPLICATE_OR_BACKUP_OF':None,'ORIGIN_UNIT_ID':'O1'},
            {'ACCESSION_ID':'A2','DUPLICATE_OR_BACKUP_OF':None,'ORIGIN_UNIT_ID':'O1'},
        ])
        self.assertEqual(s['ACCESSION_COUNT_VALIDATED'],2)
        self.assertEqual(s['DOCUMENTED_ORIGIN_UNIT_COUNT'],1)

    def test_ambiguous_origin_not_grouped_by_default(self):
        s=summarize_exsitu([
            {'ACCESSION_ID':'A1','DUPLICATE_OR_BACKUP_OF':None,'ORIGIN_UNIT_ID':None},
            {'ACCESSION_ID':'A2','DUPLICATE_OR_BACKUP_OF':None,'ORIGIN_UNIT_ID':None},
        ])
        self.assertEqual(s['DOCUMENTED_ORIGIN_UNIT_COUNT'],0)
        self.assertEqual(s['ORIGIN_UNRESOLVED_ACCESSION_COUNT'],2)

    def test_missing_phenology_does_not_change_ui(self):
        base={'U_VALUE':44,'I_VALUE':51}
        out=phenology_overlay(base,'UNKNOWN')
        self.assertEqual((out['U_VALUE'],out['I_VALUE']),(44,51))

    def test_historical_locality_valid_for_desktop_application(self):
        fields={
            'TAXON_KEY':'SYN-TAX-020','SCIENTIFIC_NAME':'Taxon syntheticus 020','RANK':'Species',
            'LEGAL_STATUS_EVIDENCE':['SYN-LEGAL'], 'PROPOSED_ACTION':'SYN-COLLECT', 'MATERIAL_TYPE':'SEED',
            'DOCUMENTED_SPATIAL_SCOPE':'SYN-LOCALITY-HIST-01','SPATIAL_EVIDENCE_STATE':'HISTORICAL_LOCALITY',
            'PREFERRED_WINDOW':'SYN-W1','ALTERNATIVE_WINDOW':'SYN-W2','PHENOLOGY_BASIS':'SYNTHETIC_UNKNOWN_ALLOWED',
            'METHOD_PROPOSED':'SYN-METHOD','LIMITS_PROPOSED':'SYN-LIMIT','PURPOSE':'SYNTHETIC_TEST',
            'DESTINATION':'SYN-BANK','RESPONSIBLE_PERSONS':['SYN-PERSON'],'RISKS_AND_CONTROLS':['SYN-RISK'],
            'EVIDENCE_POINTERS':['SYN-EVID'],'OPEN_CONFIRMATIONS':[],
        }
        self.assertTrue(can_prepare_application_from_desktop(fields))

    def test_application_does_not_require_confirmed_population_or_p03_p04_p05(self):
        fields={
            'TAXON_KEY':'SYN-TAX-021','SCIENTIFIC_NAME':'Taxon syntheticus 021','RANK':'Species',
            'LEGAL_STATUS_EVIDENCE':['SYN-LEGAL'],'PROPOSED_ACTION':'SYN-COLLECT','MATERIAL_TYPE':'SEED',
            'DOCUMENTED_SPATIAL_SCOPE':'SYN-SECTOR-01','SPATIAL_EVIDENCE_STATE':'POTENTIAL_SECTOR',
            'PREFERRED_WINDOW':'SYN-W1','ALTERNATIVE_WINDOW':'SYN-W2','PHENOLOGY_BASIS':'SYN-EVID',
            'METHOD_PROPOSED':'SYN-METHOD','LIMITS_PROPOSED':'SYN-LIMIT','PURPOSE':'SYNTHETIC_TEST',
            'DESTINATION':'SYN-BANK','RESPONSIBLE_PERSONS':['SYN-PERSON'],'RISKS_AND_CONTROLS':[],
            'EVIDENCE_POINTERS':['SYN-EVID'],'OPEN_CONFIRMATIONS':[],
        }
        self.assertTrue(can_prepare_application_from_desktop(fields))

    def test_yes_unknown_precedence_and_preservation(self):
        c=[{'BLOCKS_SUBMISSION':'UNKNOWN','id':'U'},{'BLOCKS_SUBMISSION':'YES','id':'Y'}]
        out=application_state(True,c)
        self.assertEqual(out['APPLICATION_SUBMISSION_READINESS'],'HOLD_CONFIRMATION')
        self.assertEqual(out['OPEN_CONFIRMATIONS'],c)

    def test_authorization_never_auto_collection_go(self):
        self.assertFalse(collection_go_from_authorization('AUTHORIZED_WITH_SCOPE'))

    def test_reference_degenerate_only_eligible_members(self):
        rows=[
            {'RESEARCH_ACTIVITY_VALUE':2,'RESEARCH_REFERENCE_POPULATION_MEMBER':True,'RESEARCH_LOW_ELIGIBILITY':'PASS','METHOD_VERSION_COMPARABLE':True},
            {'RESEARCH_ACTIVITY_VALUE':100,'RESEARCH_REFERENCE_POPULATION_MEMBER':True,'RESEARCH_LOW_ELIGIBILITY':'SEARCH_PARTIAL','METHOD_VERSION_COMPARABLE':True},
        ]
        self.assertEqual(reference_distribution_state(rows),'DEGENERATE')

if __name__=='__main__': unittest.main(verbosity=2)
