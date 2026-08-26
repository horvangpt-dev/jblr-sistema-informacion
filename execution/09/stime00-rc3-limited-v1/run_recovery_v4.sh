#!/usr/bin/env bash
set -euo pipefail

ROOT="execution/09/stime00-rc3-limited-v1"
REQ="$ROOT/RUN_REQUEST.json"
SRC="$ROOT/recovery_inputs"
OUT_INPUTS="$ROOT/inputs"
RUN_OUT="$ROOT/runs/STIME00_RC3_LIMITED_RECOVERY_20260826_002"
EIDOS="$RUNNER_TEMP/eidos.ttl"
B64="$RUNNER_TEMP/stime00_recovery_inputs.b64"
TAR="$RUNNER_TEMP/stime00_recovery_inputs.tar.gz"

python - <<'PY'
import json
p=json.load(open('execution/09/stime00-rc3-limited-v1/RUN_REQUEST.json'))
assert p['enabled'] is True
assert p['direction']=='00000.V19'
assert p['currentAction']=='ACT.000'
assert p['continuityEvent']=='JBLR-EVT-00000-20260826-CONTINUITY-V18-TO-V19-001'
assert p['releaseEvent']=='JBLR-EVT-00000-20260826-ACCEPT-08-STIME00-RC3-QA-AND-RELEASE-09-001'
assert p['recoveryEvent']=='JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001'
assert p['scopeNewTemp']==261 and p['scopeNewOfficialReuse']==562
assert p['historicalReviewQueue']==14 and p['inheritedEvidence']==1405
assert p['doNotRerunAll3033'] is True
assert p['hardGateAPolicy']=='2210_OF_2210_NATIONAL_IDS_UNCHANGED'
assert p['extensionGateB']=='823_OF_823_AUDITABLE_TERMINAL_IDENTITY_STATE'
assert p['boundedInputTarSha256']=='3813af25163ef34c970bdca192393237086f915793cc5a9d026407b407aabb57'
assert p['noFuzzy'] is True and p['noParentIdInheritance'] is True
assert p['noRankCollapse'] is True and p['noHybridCollapse'] is True
assert p['sourceFailureNotFound'] is False
assert p['neonWrites']==0 and p['databaseWrites']==0 and p['mutateRC2'] is False
assert p['finalClose'] is False and p['dispatchAttempt']==4
PY

rm -rf "$OUT_INPUTS" "$RUN_OUT"
mkdir -p "$OUT_INPUTS" "$RUN_OUT"
cat \
  "$SRC/inputs.tar.gz.part00.b64" \
  "$SRC/inputs.tar.gz.part01.b64" \
  "$SRC/inputs.tar.gz.part02.b64" \
  "$SRC/inputs.tar.gz.part03.b64" > "$B64"
base64 -d "$B64" > "$TAR"
echo "3813af25163ef34c970bdca192393237086f915793cc5a9d026407b407aabb57  $TAR" | sha256sum -c -
test "$(stat -c %s "$TAR")" = "129424"
tar -xzf "$TAR" -C "$OUT_INPUTS"

python - <<'PY'
import hashlib,json
from pathlib import Path
root=Path('execution/09/stime00-rc3-limited-v1')
m=json.load(open(root/'recovery_inputs/RECOVERY_INPUTS_MANIFEST.json'))
assert m['recoveryEvent']=='JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001'
assert m['canonicalRc3']['sha256']=='d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71'
h=m['historicalStime00']
assert h['rows']==2210 and h['uniqueTaxonWorkKeys']==2210
assert h['twkIntersectionWithRc3Inherited']==2210 and h['missingTaxonWorkKeys']==0
assert h['riojaOrderMismatches']==0 and h['identityHubKeyMismatches']==0 and h['integrationIdChanges']==0
for name,spec in m['boundedInputs'].items():
    p=root/'inputs'/name
    assert p.exists(), name
    data=p.read_bytes()
    assert len(data)==spec['bytes'], (name,len(data),spec['bytes'])
    assert hashlib.sha256(data).hexdigest()==spec['sha256'], name
    with p.open(encoding='utf-8') as f:
        rows=sum(1 for line in f if line.strip())
    assert rows==spec['rows'], (name,rows,spec['rows'])
assert m['boundedInputs']['NEW_TEMP_261.jsonl']['rows']==261
assert m['boundedInputs']['NEW_OFFICIAL_562.jsonl']['rows']==562
assert m['boundedInputs']['INHERITED_ID_EVIDENCE_1405_WITH_TWK.jsonl']['rows']==1405
assert m['boundedInputs']['HISTORICAL_REVIEW_ROWS_14.jsonl']['rows']==14
PY

curl --fail --location --retry 4 --retry-all-errors --connect-timeout 30 --max-time 1800 \
  -o "$EIDOS" https://datos.iepnb.es/datasets/eidos.ttl
test -s "$EIDOS"
sha256sum "$EIDOS"

python "$ROOT/src/productive_stime00_rc3.py" \
  --inputs "$OUT_INPUTS" \
  --final309 "execution/06/v17/synonym-system-309/runs/FINAL_CONSOLIDATED_309_V17/CONSOLIDATED_309.jsonl" \
  --eidos "$EIDOS" \
  --out "$RUN_OUT" \
  --release-event "JBLR-EVT-00000-20260826-ACCEPT-08-STIME00-RC3-QA-AND-RELEASE-09-001"

python - <<'PY'
import json,os
from pathlib import Path
root=Path('execution/09/stime00-rc3-limited-v1')
out=root/'runs/STIME00_RC3_LIMITED_RECOVERY_20260826_002'
m=json.load(open(root/'recovery_inputs/RECOVERY_INPUTS_MANIFEST.json'))
q=json.load(open(out/'QA_FINAL.json'))
r=json.load(open(out/'RUN_RECEIPT.json'))
counts=json.load(open(out/'FINAL_COUNTS.json'))
checks={
 'input_archive_sha_verified': True,
 'input_new_temp_261': m['boundedInputs']['NEW_TEMP_261.jsonl']['rows']==261,
 'input_new_official_562': m['boundedInputs']['NEW_OFFICIAL_562.jsonl']['rows']==562,
 'input_inherited_evidence_1405': m['boundedInputs']['INHERITED_ID_EVIDENCE_1405_WITH_TWK.jsonl']['rows']==1405,
 'input_historical_review_14': m['boundedInputs']['HISTORICAL_REVIEW_ROWS_14.jsonl']['rows']==14,
 'hard_gate_rows_2210': m['historicalStime00']['rows']==2210,
 'hard_gate_unique_twk_2210': m['historicalStime00']['uniqueTaxonWorkKeys']==2210,
 'hard_gate_intersection_2210': m['historicalStime00']['twkIntersectionWithRc3Inherited']==2210,
 'hard_gate_missing_0': m['historicalStime00']['missingTaxonWorkKeys']==0,
 'hard_gate_order_mismatch_0': m['historicalStime00']['riojaOrderMismatches']==0,
 'hard_gate_identity_hub_mismatch_0': m['historicalStime00']['identityHubKeyMismatches']==0,
 'hard_gate_integration_id_changes_0': m['historicalStime00']['integrationIdChanges']==0,
 'engine_qa_pass': q['pass'] is True,
 'new_temp_processed': q['newTempProcessed'] is True,
 'new_official_audited': q['newOfficialAudited'] is True,
 'extension_823_accounted': q['extension823Accounted'] is True and sum(r['counts']['extension823'].values())==823,
 'historical_14_accounted': q['historical14Accounted'] is True and sum(r['counts']['historical14'].values())==14,
 'inherited_1405_accounted': q['inheritedEvidence1405Accounted'] is True and sum(r['counts']['inheritedEvidence1405'].values())==1405,
 'all_extension_states_allowed': q['allExtensionStatesTerminalAllowed'] is True,
 'do_not_rerun_3033': q['doNotRerunAll3033'] is True and r['guards']['doNotRerunAll3033'] is True,
 'no_fuzzy': r['guards']['noFuzzy'] is True,
 'no_parent_id_inheritance': r['guards']['noParentIdInheritance'] is True,
 'no_rank_collapse': r['guards']['noRankCollapse'] is True,
 'no_hybrid_collapse': r['guards']['noHybridCollapse'] is True,
 'source_failure_not_not_found': r['guards']['sourceFailureNotFound'] is False,
 'neon_writes_0': q['neonWrites']==0 and r['guards']['neonWrites']==0,
 'database_writes_0': q['databaseWrites']==0 and r['guards']['databaseWrites']==0,
 'rc2_mutation_0': q['rc2Mutation']==0 and r['guards']['mutateRC2'] is False,
 'stime00_final_close_false': q['stime00FinalClose'] is False and r['guards']['stime00FinalClose'] is False,
}
failed=[k for k,v in checks.items() if not v]
report={
 'schema':'JBLR_09_ACT000_TERMINAL_QA_v1',
 'direction':'00000.V19','currentAction':'ACT.000',
 'continuityEvent':'JBLR-EVT-00000-20260826-CONTINUITY-V18-TO-V19-001',
 'recoveryEvent':'JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001',
 'testsExecuted':len(checks),'testsPassed':len(checks)-len(failed),'testsFailed':len(failed),
 'failedChecks':failed,'checks':checks,
 'status':'PASS' if not failed else 'FAIL',
 'hardGateA':'2210_OF_2210_PASS_PRESERVED' if not any(k.startswith('hard_gate_') for k in failed) else 'FAIL',
 'extensionGateB':'823_OF_823_PASS' if checks['extension_823_accounted'] else 'FAIL',
 'neonWrites':0,'databaseWrites':0,'rc2Mutation':0,'stime00FinalClose':False
}
(out/'TERMINAL_QA_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
gate={
 'hardGateA':{
   'state':report['hardGateA'],'required':'2210_OF_2210_NATIONAL_IDS_UNCHANGED',
   'historicalRows':2210,'uniqueTaxonWorkKeys':2210,'twkIntersectionWithRc3Inherited':2210,
   'missingTaxonWorkKeys':0,'riojaOrderMismatches':0,'identityHubKeyMismatches':0,'integrationIdChanges':0,
   'productiveHistoricalRerun':False,'historicalMutationBy09':0,
   'evidenceSource':'JBLR-EVT-08-20260826-STIME00-RC3-QA-001 + RECOVERY_INPUTS_MANIFEST.json'
 },
 'extensionGateB':{'state':report['extensionGateB'],'required':'823_OF_823_AUDITABLE_TERMINAL_IDENTITY_STATE','accounted':sum(r['counts']['extension823'].values())},
 'boundedScope':{'newTemp':261,'newOfficialReuse':562,'inheritedEvidence':1405,'historicalReview':14},
 'doNotRerunAll3033':True,'neonWrites':0,'databaseWrites':0,'rc2Mutation':0,'stime00FinalClose':False
}
(out/'GATE_VERIFICATION.json').write_text(json.dumps(gate,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
q.update({'direction':'00000.V19','currentAction':'ACT.000','continuityEvent':'JBLR-EVT-00000-20260826-CONTINUITY-V18-TO-V19-001','recoveryEvent':'JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001','hardGateA2210of2210Verified':report['hardGateA'].startswith('2210_'),'extensionGateB823of823Verified':report['extensionGateB'].startswith('823_'),'boundedRecoveryInputsVerified':True,'terminalRecoveryQA':report['status'],'testsExecuted':report['testsExecuted'],'testsPassed':report['testsPassed'],'testsFailed':report['testsFailed']})
r.update({'direction':'00000.V19','currentAction':'ACT.000','continuityEvent':'JBLR-EVT-00000-20260826-CONTINUITY-V18-TO-V19-001','recoveryEvent':'JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001','githubRunId':os.environ.get('GITHUB_RUN_ID'),'boundedInputArchiveSha256':'3813af25163ef34c970bdca192393237086f915793cc5a9d026407b407aabb57','hardGateA2210of2210':report['hardGateA'],'extensionGateB823of823':report['extensionGateB'],'testsExecuted':report['testsExecuted'],'testsPassed':report['testsPassed'],'testsFailed':report['testsFailed'],'canonicalResultState':'EVIDENCE_PERSISTED_PENDING_EVENT_BUS_AND_00000_ACCEPTANCE'})
(out/'QA_FINAL.json').write_text(json.dumps(q,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
(out/'RUN_RECEIPT.json').write_text(json.dumps(r,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
if failed:
    raise SystemExit('TERMINAL_QA_FAIL:'+','.join(failed))
PY

python - <<'PY'
import json,os
from pathlib import Path
root=Path('execution/09/stime00-rc3-limited-v1')
out=root/'runs/STIME00_RC3_LIMITED_RECOVERY_20260826_002'
counts=json.load(open(out/'FINAL_COUNTS.json'))
qa=json.load(open(out/'TERMINAL_QA_REPORT.json'))
state={
 'state':'PRODUCTIVELY_COMPLETE_EVIDENCE_PERSISTED_PENDING_EVENT_BUS_READBACK_AND_00000_ACCEPTANCE',
 'direction':'00000.V19','currentAction':'ACT.000','githubRunId':os.environ.get('GITHUB_RUN_ID'),
 'releaseEvent':'JBLR-EVT-00000-20260826-ACCEPT-08-STIME00-RC3-QA-AND-RELEASE-09-001',
 'recoveryEvent':'JBLR-EVT-00000-20260826-ACCEPT-09-INCOMPLETE-MATERIALIZATION-RECOVERY-001',
 'hardGateA':'2210_OF_2210_PASS_PRESERVED','extensionGateB':'823_OF_823_PASS','counts':counts,
 'testsExecuted':qa['testsExecuted'],'testsPassed':qa['testsPassed'],'testsFailed':qa['testsFailed'],
 'stime00FinalClose':False,'neonWrites':0,'databaseWrites':0,'rc2Mutation':0
}
(root/'TERMINAL_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
PY

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git pull --rebase origin 09-stime00-rc3-limited-productive-v1
git add "$RUN_OUT" "$ROOT/TERMINAL_STATE.json"
git commit -m "evidence(09): ACT.000 STIME00 RC3 limited recovery ${GITHUB_RUN_ID}"
git push origin HEAD:09-stime00-rc3-limited-productive-v1
