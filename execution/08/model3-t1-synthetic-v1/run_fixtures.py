#!/usr/bin/env python3
import json, os, sys
from model3_t1.engine import evaluate_fixture
ROOT=os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT,'fixtures','F01_F17.json'),encoding='utf-8') as f: fixtures=json.load(f)
with open(os.path.join(ROOT,'fixtures','expected_F01_F17.json'),encoding='utf-8') as f: expected=json.load(f)
results=[]
passed=0
for fx in fixtures:
    actual=evaluate_fixture(fx)
    exp=expected[fx['id']]
    ok=actual==exp
    results.append({'id':fx['id'],'pass':ok,'actual':actual,'expected':exp})
    passed += int(ok)
summary={
    'execution_scope':'SYNTHETIC_TEST_ONLY',
    'fixture_count':len(fixtures),'passed':passed,'failed':len(fixtures)-passed,
    'technical_pass':passed==len(fixtures),
    'scientific_validation':False,
    'corpus_execution':0,
    'calibration_execution':0,
    'results':results,
}
os.makedirs(os.path.join(ROOT,'output'),exist_ok=True)
with open(os.path.join(ROOT,'output','FIXTURE_RESULTS.json'),'w',encoding='utf-8') as f: json.dump(summary,f,ensure_ascii=False,indent=2,sort_keys=True)
print(json.dumps({k:v for k,v in summary.items() if k!='results'},ensure_ascii=False,indent=2))
sys.exit(0 if summary['technical_pass'] else 1)
