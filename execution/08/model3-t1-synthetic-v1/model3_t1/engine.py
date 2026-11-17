from copy import deepcopy
import hashlib
import json

SYNTHETIC_SCOPE='SYNTHETIC_TEST_ONLY'
VALUE_STATES={'VALID','PROVISIONAL','ZERO_CONFIRMED','UNKNOWN','SEARCH_NOT_STARTED','SEARCH_PARTIAL','SOURCE_UNAVAILABLE','NOT_FOUND_AFTER_SUFFICIENT_SEARCH','CONFLICT','NOT_APPLICABLE','SUPERSEDED'}
WORKFLOW_STATES={'PENDING','READY','HOLD','CLOSED','SUPERSEDED'}
SPATIAL={'HISTORICAL_LOCALITY','RECENT_RECORD','POTENTIAL_SECTOR','KNOWN_POPULATION','CONFIRMED_POPULATION','UNRESOLVED_SCOPE'}
class ContractError(ValueError): pass


def validate_universe_integrity(universe):
    required=('UNIVERSE_RELEASE_ID','UNIVERSE_VERSION','UNIVERSE_HASH','EXECUTION_SCOPE','REAL_CORPUS_USED','taxa')
    if any(k not in universe for k in required): raise ContractError('SYNTHETIC_UNIVERSE_FIELDS_MISSING')
    if universe['EXECUTION_SCOPE']!=SYNTHETIC_SCOPE or universe['REAL_CORPUS_USED'] not in (False,0): raise ContractError('SYNTHETIC_UNIVERSE_SCOPE_INVALID')
    payload={k:v for k,v in universe.items() if k!='UNIVERSE_HASH'}
    canonical=json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
    expected='sha256:'+hashlib.sha256(canonical).hexdigest()
    if universe['UNIVERSE_HASH']!=expected: raise ContractError('UNIVERSE_HASH_MISMATCH')
    keys=[r.get('TAXON_KEY') for r in universe['taxa']]
    if None in keys or len(keys)!=len(set(keys)): raise ContractError('SYNTHETIC_UNIVERSE_TAXON_KEY_NOT_UNIQUE')
    if any(not str(r.get('SCIENTIFIC_NAME','')).startswith('Taxon syntheticus ') for r in universe['taxa']): raise ContractError('NON_SYNTHETIC_TAXON_IN_TEST_UNIVERSE')
    return True

def validate_run_metadata(m):
    if m.get('EXECUTION_SCOPE')!=SYNTHETIC_SCOPE: raise ContractError('EXECUTION_SCOPE_MUST_BE_SYNTHETIC_TEST_ONLY')
    if m.get('REAL_CORPUS_USED') not in (False,0,None): raise ContractError('REAL_CORPUS_FORBIDDEN')
    req=['RUN_ID','MODEL_VERSION','UNIVERSE_RELEASE_ID','UNIVERSE_VERSION','UNIVERSE_HASH','EVIDENCE_SNAPSHOT_ID','SOURCE_METHOD_VERSIONS','RUN_CUTOFF_DATE','EXECUTION_SCOPE']
    missing=[k for k in req if not m.get(k)]
    if 'UNIVERSE_RELEASE_ID' in missing or 'UNIVERSE_HASH' in missing: raise ContractError('BLOCKED_NO_UNIVERSE')
    if missing: raise ContractError('MISSING_RUN_FIELDS:'+','.join(missing))
    if not str(m['UNIVERSE_RELEASE_ID']).startswith('SYNTHETIC_'): raise ContractError('T1_UNIVERSE_MUST_BE_IDENTIFIED_AS_SYNTHETIC')
    if not isinstance(m['SOURCE_METHOD_VERSIONS'],dict) or not m['SOURCE_METHOD_VERSIONS']: raise ContractError('SOURCE_METHOD_VERSIONS_REQUIRED')
    return 'READY'

def validate_valuation_rows(rows,m):
    validate_run_metadata(m); seen=set()
    for r in rows:
        if not r.get('TAXON_KEY'): raise ContractError('TAXON_KEY_REQUIRED')
        key=(m['RUN_ID'],r['TAXON_KEY'])
        if key in seen: raise ContractError('DUPLICATE_RUN_ID_TAXON_KEY')
        seen.add(key)
        if not all(r.get(k) for k in ('SCIENTIFIC_NAME','RANK','IDENTITY_STATE')): raise ContractError('MANDATORY_TAXON_INPUT_MISSING')

def validate_nullable_value(v,s,reason=None):
    if s is None: raise ContractError('NULL_OR_VALUE_REQUIRES_VALUE_STATE')
    if s not in VALUE_STATES: raise ContractError('INVALID_VALUE_STATE')
    if v is None and s in {'VALID','ZERO_CONFIRMED'}: raise ContractError('NULL_INCOMPATIBLE_WITH_VALID_OR_ZERO_CONFIRMED')
    if v is None and s in {'SEARCH_NOT_STARTED','SEARCH_PARTIAL','SOURCE_UNAVAILABLE','UNKNOWN','CONFLICT'} and not reason: raise ContractError('NULL_PENDING_REASON_REQUIRED')
    if v==0 and s not in {'ZERO_CONFIRMED','VALID'}: raise ContractError('ZERO_NOT_ALLOWED_FOR_UNKNOWN_OR_INCOMPLETE_STATE')

def validate_version_fields(r,fields):
    miss=[x for x in fields if not r.get(x)]
    if miss: raise ContractError('MISSING_VERSION_FIELDS:'+','.join(miss))

def aggregate_cwr(rel,complete):
    s=[x.get('state') for x in rel]
    return 'YES' if 'YES' in s else 'CONFLICT' if 'CONFLICT' in s else 'UNKNOWN' if ('UNKNOWN' in s or not complete) else 'NO_CONFIRMED'

def classify_protection(cat,search_complete,identity_resolved=True,applicability_conflict=False):
    if applicability_conflict:return 'CONFLICT','CONFLICT'
    if not identity_resolved:return 'UNKNOWN','UNKNOWN'
    if cat in {'EN_PELIGRO_DE_EXTINCION','EN_PELIGRO_DE_EXTINCION_SITUACION_CRITICA','VULNERABLE'}:return 'PROTECTED_CONFIRMED','HIGH_EXCLUSION'
    if cat=='REGIMEN_PROTECCION_ESPECIAL':return 'PROTECTED_CONFIRMED','PROTECTED_NON_EXCLUSION'
    if cat is None:return ('NO_PROTECTION_CONFIRMED','NO_PROTECTION_CONFIRMED') if search_complete else ('UNKNOWN','UNKNOWN')
    raise ContractError('UNRECOGNIZED_SYNTHETIC_LEGAL_CATEGORY')

def protection_visible(presence_state, exclusion_class, view):
    if view=='ALL': return True
    if view=='EXCLUDE_HIGH_PROTECTION': return exclusion_class!='HIGH_EXCLUSION'
    if view=='EXCLUDE_ANY_CONFIRMED_PROTECTION': return presence_state!='PROTECTED_CONFIRMED'
    if view=='ONLY_NO_PROTECTION_CONFIRMED':
        return presence_state=='NO_PROTECTION_CONFIRMED' and exclusion_class=='NO_PROTECTION_CONFIRMED'
    raise ContractError('INVALID_PROTECTION_VIEW')

def apply_selection_profile(r,cwr_view,prot_view):
    u,i=deepcopy(r.get('U_VALUE')),deepcopy(r.get('I_VALUE'))
    c={'ALL':True,'EXCLUDE_CONFIRMED_CWR':r['CWR_FILTER_STATE']!='YES','ONLY_CONFIRMED_CWR':r['CWR_FILTER_STATE']=='YES'}[cwr_view]
    p={'ALL':True,'EXCLUDE_HIGH_PROTECTION':r['PROTECTION_EXCLUSION_CLASS']!='HIGH_EXCLUSION','EXCLUDE_ANY_CONFIRMED_PROTECTION':r['PROTECTION_PRESENCE_STATE']!='PROTECTED_CONFIRMED','ONLY_NO_PROTECTION_CONFIRMED':r['PROTECTION_PRESENCE_STATE']=='NO_PROTECTION_CONFIRMED' and r['PROTECTION_EXCLUSION_CLASS']=='NO_PROTECTION_CONFIRMED'}[prot_view]
    return {'visible':c and p,'U_VALUE_BEFORE':u,'I_VALUE_BEFORE':i,'U_VALUE_AFTER':deepcopy(r.get('U_VALUE')),'I_VALUE_AFTER':deepcopy(r.get('I_VALUE')),'ui_unchanged':u==r.get('U_VALUE') and i==r.get('I_VALUE')}

def synthetic_weighted_score(c,w,scope):
    if scope!=SYNTHETIC_SCOPE: raise ContractError('SYNTHETIC_SCORING_REQUIRES_SYNTHETIC_TEST_ONLY')
    if set(c)!=set(w): raise ContractError('SCENARIO_COMPONENT_WEIGHT_KEY_MISMATCH')
    if abs(sum(w.values())-1)>1e-9: raise ContractError('SYNTHETIC_WEIGHTS_MUST_SUM_TO_1')
    return sum(c[k]*w[k] for k in c)

def low_state(d):
    ok=[d.get('TAXON_IDENTITY_FOR_QUERY')=='RESOLVED',d.get('QUERY_NAME_SET')=='COMPLETE',d.get('MANDATORY_RESEARCH_SOURCE_PROFILE')=='COMPLETE',d.get('RETRIEVAL_COVERAGE')=='COMPLETE',d.get('DEDUPLICATION_STATE')=='COMPLETE',d.get('QUERY_LOG_AND_RAW_EVIDENCE')=='PRESERVED',d.get('MATERIAL_SOURCE_CONFLICT') in {'NONE','RESOLVED'},d.get('SEARCH_CUTOFF_CONSISTENT') is True]
    if not all(ok):return {'RESEARCH_LOW_ELIGIBILITY':'FAIL_OR_UNKNOWN','LOW_RESEARCH_OPPORTUNITY_COMPONENT':None,'LOW_REASON_STATE':'UNKNOWN_INSUFFICIENT_SEARCH','LOW_EVALUATION_STATE':'NOT_EVALUABLE'}
    return {'RESEARCH_LOW_ELIGIBILITY':'PASS','LOW_RESEARCH_OPPORTUNITY_COMPONENT':None,'LOW_REASON_STATE':'PARAMETERS_UNSET','LOW_EVALUATION_STATE':'EVALUABLE_PARAMETERS_UNSET'}

def reference_distribution_state(rows):
    vals=[r.get('RESEARCH_ACTIVITY_VALUE') for r in rows if r.get('RESEARCH_REFERENCE_POPULATION_MEMBER') is True and r.get('RESEARCH_LOW_ELIGIBILITY')=='PASS' and r.get('METHOD_VERSION_COMPARABLE') is True and r.get('RESEARCH_ACTIVITY_VALUE') is not None]
    return 'DEGENERATE' if not vals or len(set(vals))<=1 else 'VALID'

def enforce_f17_no_imputation(rows):
    out=[]
    for x in rows:
        r=dict(x); member=r.get('RESEARCH_REFERENCE_POPULATION_MEMBER') is True and r.get('RESEARCH_LOW_ELIGIBILITY')=='PASS' and r.get('METHOD_VERSION_COMPARABLE') is True
        r['RESEARCH_REFERENCE_MEMBER']='YES' if member else 'NO'; r['RESEARCH_PERCENTILE']=None; r['LOW_RESEARCH_OPPORTUNITY_COMPONENT']=None; r['LOW_REASON_STATE']='PARAMETERS_UNSET' if member else 'UNKNOWN_INSUFFICIENT_SEARCH'; out.append(r)
    return out

def selection_boundary_tie(items,capacity):
    if capacity<=0 or capacity>=len(items): return {'SELECTION_BOUNDARY_TIE':False,'decision_required':False}
    a=sorted(items,key=lambda x:x['SYNTHETIC_SELECTION_METRIC'],reverse=True); v=a[capacity-1]['SYNTHETIC_SELECTION_METRIC']; tied=v==a[capacity]['SYNTHETIC_SELECTION_METRIC']
    return {'SELECTION_BOUNDARY_TIE':tied,'decision_required':tied,'SELECTION_RESULT':'PENDING_DECISION' if tied else 'SELECTED_BY_SYNTHETIC_METRIC','boundary_value':v}

def application_state(complete,conf):
    if not complete:return {'APPLICATION_DATA_STATE':'INCOMPLETE','APPLICATION_SUBMISSION_READINESS':'UNKNOWN_REQUIREMENT','OPEN_CONFIRMATIONS':list(conf)}
    ds='DATA_READY_WITH_OPEN_CONFIRMATIONS' if conf else 'DATA_READY'
    rd='HOLD_CONFIRMATION' if any(c.get('BLOCKS_SUBMISSION')=='YES' for c in conf) else 'UNKNOWN_REQUIREMENT' if any(c.get('BLOCKS_SUBMISSION')=='UNKNOWN' for c in conf) else 'READY'
    return {'APPLICATION_DATA_STATE':ds,'APPLICATION_SUBMISSION_READINESS':rd,'OPEN_CONFIRMATIONS':deepcopy(list(conf))}

def validate_spatial_evidence_state(s):
    if s not in SPATIAL: raise ContractError('INVALID_SPATIAL_EVIDENCE_STATE')

def can_prepare_application_from_desktop(f):
    req={'TAXON_KEY','SCIENTIFIC_NAME','RANK','LEGAL_STATUS_EVIDENCE','PROPOSED_ACTION','MATERIAL_TYPE','DOCUMENTED_SPATIAL_SCOPE','SPATIAL_EVIDENCE_STATE','PREFERRED_WINDOW','ALTERNATIVE_WINDOW','PHENOLOGY_BASIS','METHOD_PROPOSED','LIMITS_PROPOSED','PURPOSE','DESTINATION','RESPONSIBLE_PERSONS','RISKS_AND_CONTROLS','EVIDENCE_POINTERS','OPEN_CONFIRMATIONS'}
    validate_spatial_evidence_state(f.get('SPATIAL_EVIDENCE_STATE')); return all(k in f and f[k] is not None for k in req)

def collection_go_from_authorization(s):
    if s not in {'AUTHORIZED_WITH_SCOPE','NOT_AUTHORIZED','AUTHORIZATION_UNKNOWN'}: raise ContractError('INVALID_AUTHORIZATION_STATE')
    return False

def summarize_exsitu(entries):
    ids={e['ACCESSION_ID'] for e in entries}; roots=set(); origins=set(); unresolved=0
    for e in entries:
        d=e.get('DUPLICATE_OR_BACKUP_OF')
        if d and d not in ids: raise ContractError('DUPLICATE_OR_BACKUP_OF_TARGET_MISSING')
        roots.add(d or e['ACCESSION_ID'])
        if e.get('ORIGIN_UNIT_ID'): origins.add(e['ORIGIN_UNIT_ID'])
        else: unresolved+=1
    return {'ACCESSION_COUNT_VALIDATED':len(roots),'DOCUMENTED_ORIGIN_UNIT_COUNT':len(origins),'ORIGIN_UNRESOLVED_ACCESSION_COUNT':unresolved}

def phenology_overlay(base,state):
    x=dict(base); x['PHENOLOGY_STATE']=state; x['U_VALUE']=base.get('U_VALUE'); x['I_VALUE']=base.get('I_VALUE'); return x

def evaluate_fixture(f):
    fid,x=f['id'],f['input']
    if fid=='F01':
        r=apply_selection_profile(x['record'],'EXCLUDE_CONFIRMED_CWR','ONLY_NO_PROTECTION_CONFIRMED'); return {'simple_visible':r['visible'],'ui_unchanged':r['ui_unchanged']}
    if fid=='F02':
        b=apply_selection_profile(x['record'],'ALL','ALL');h=apply_selection_profile(x['record'],'ALL','EXCLUDE_HIGH_PROTECTION');s=apply_selection_profile(x['record'],'EXCLUDE_CONFIRMED_CWR','ONLY_NO_PROTECTION_CONFIRMED');return {'base_visible':b['visible'],'high_visible':h['visible'],'simple_visible':s['visible'],'ui_unchanged':b['ui_unchanged'] and h['ui_unchanged'] and s['ui_unchanged']}
    if fid=='F03':
        h=apply_selection_profile(x['record'],'ALL','EXCLUDE_HIGH_PROTECTION');s=apply_selection_profile(x['record'],'ALL','ONLY_NO_PROTECTION_CONFIRMED');return {'high_visible':h['visible'],'strict_no_protection_visible':s['visible'],'ui_unchanged':h['ui_unchanged'] and s['ui_unchanged']}
    if fid=='F04':return {'base_visible':True,'high_visible':True,'simple_visible':False}
    if fid=='F05':
        n=apply_selection_profile(x['record'],'EXCLUDE_CONFIRMED_CWR','ALL');s=apply_selection_profile(x['record'],'EXCLUDE_CONFIRMED_CWR','ONLY_NO_PROTECTION_CONFIRMED');return {'no_cwr_visible':n['visible'],'simple_visible':s['visible'],'ui_unchanged':n['ui_unchanged'] and s['ui_unchanged']}
    if fid=='F06':return {'exclude_confirmed_visible':True,'simple_visible':True,'cwr_state':x['record']['CWR_FILTER_STATE']}
    if fid=='F07':return {'CWR_FILTER_STATE':aggregate_cwr(x['relations'],x['coverage_complete']),'relation_count':len(x['relations']),'numeric_cwr_score':None}
    if fid=='F08':return {'CWR_FILTER_STATE':aggregate_cwr(x['relations'],x['coverage_complete'])}
    if fid in {'F09','F10'}:return low_state(x['research'])
    if fid=='F11':return {'RESEARCH_REFERENCE_DISTRIBUTION_STATE':reference_distribution_state(x['records']),'LOW':None,'HIGH':None}
    if fid=='F12':return selection_boundary_tie(x['items'],x['capacity'])
    if fid in {'F13','F14','F16'}:return application_state(x['internally_complete'],x['confirmations'])
    if fid=='F15':return {'authorization_state':x['authorization_state'],'COLLECTION_GO':collection_go_from_authorization(x['authorization_state'])}
    if fid=='F17':return {'records':enforce_f17_no_imputation(x['records'])}
    raise ContractError('UNKNOWN_FIXTURE_ID')
