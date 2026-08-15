#!/usr/bin/env bash
set -uo pipefail
DB="${1:?usage: $0 DATABASE [LOG_DIR]}"
LOG_DIR="${2:-./logs}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/concurrency_${DB}.log"
exec > >(tee -a "$LOG") 2>&1

PSQL=(psql -X -v ON_ERROR_STOP=1 -d "$DB")
pass=0; fail=0
ok(){ echo "PASS $*"; pass=$((pass+1)); }
bad(){ echo "FAIL $*"; fail=$((fail+1)); }
wait_status(){ local pid="$1"; wait "$pid"; echo $?; }

now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
echo "[$(now)] JBLR 01.2 R2 concurrency harness database=$DB"

# 1) Global JBLR code issuance: simultaneous resources across different coded types.
echo "[C1] global JBLR code issuance"
base_before=$("${PSQL[@]}" -Atqc "select count(*) from core.resource where jblr_code is not null")
pids=()
for i in $(seq 1 16); do
  typ=AGT; [ $((i%2)) -eq 0 ] && typ=TXC
  "${PSQL[@]}" -Atqc "insert into core.resource(resource_id,resource_type_code) values(uuidv7(),'$typ') returning jblr_code" >>"$LOG_DIR/c1_codes.out" 2>>"$LOG_DIR/c1_codes.err" &
  pids+=("$!")
done
c1err=0
for p in "${pids[@]}"; do wait "$p" || c1err=$((c1err+1)); done
read total distinct_codes distinct_numbers < <("${PSQL[@]}" -AtF' ' -c "select count(*),count(distinct jblr_code),count(distinct split_part(jblr_code,'-',3)) from core.resource where jblr_code is not null")
added=$((total-base_before))
if [ "$c1err" -eq 0 ] && [ "$added" -eq 16 ] && [ "$total" -eq "$distinct_codes" ] && [ "$total" -eq "$distinct_numbers" ]; then ok "C1 global sequence concurrent uniqueness ($added added)"; else bad "C1 code concurrency errors=$c1err added=$added total=$total distinct=$distinct_codes global_numbers=$distinct_numbers"; fi

# 2) Concurrent second preferred Identification: unique partial index must choose one winner.
echo "[C2] concurrent preferred Identification"
target=$("${PSQL[@]}" -Atqc "select uuidv7()")
"${PSQL[@]}" -qc "insert into core.resource(resource_id,resource_type_code) values('$target','OBS'); insert into field.observation(resource_id,observed_at,verbatim_observation) values('$target',current_timestamp,'concurrency target');"
id1=$("${PSQL[@]}" -Atqc "select uuidv7()"); id2=$("${PSQL[@]}" -Atqc "select uuidv7()")
("${PSQL[@]}" -qc "begin; insert into core.resource(resource_id,resource_type_code) values('$id1','IDN'); insert into taxonomy.identification(resource_id,target_resource_id,verbatim_identification,is_preferred) values('$id1','$target','A',true); select pg_sleep(1); commit;") >"$LOG_DIR/c2_a.log" 2>&1 & p1=$!
("${PSQL[@]}" -qc "begin; insert into core.resource(resource_id,resource_type_code) values('$id2','IDN'); insert into taxonomy.identification(resource_id,target_resource_id,verbatim_identification,is_preferred) values('$id2','$target','B',true); commit;") >"$LOG_DIR/c2_b.log" 2>&1 & p2=$!
wait "$p1"; s1=$?; wait "$p2"; s2=$?
cnt=$("${PSQL[@]}" -Atqc "select count(*) from taxonomy.identification where target_resource_id='$target' and is_preferred")
if { [ "$s1" -eq 0 ] && [ "$s2" -ne 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -eq 0 ]; }; then [ "$cnt" -eq 1 ] && ok "C2 exactly one preferred Identification committed" || bad "C2 preferred count=$cnt"; else bad "C2 expected one winner one loser, statuses=$s1/$s2"; fi

# 3) Complementary Sample graph edges. Advisory lock + cycle check => one winner, one rollback.
echo "[C3] concurrent complementary Sample graph edges"
sx=$("${PSQL[@]}" -Atqc "select uuidv7()"); sy=$("${PSQL[@]}" -Atqc "select uuidv7()"); px=$("${PSQL[@]}" -Atqc "select uuidv7()"); py=$("${PSQL[@]}" -Atqc "select uuidv7()")
"${PSQL[@]}" -qc "insert into core.resource(resource_id,resource_type_code) values('$sx','SMP'),('$sy','SMP'),('$px','PRC'),('$py','PRC'); insert into material.sample(resource_id,sample_kind) values('$sx','synthetic'),('$sy','synthetic'); insert into material.processing_event(resource_id,process_type) values('$px','edge_xy'),('$py','edge_yx');"
ix=$("${PSQL[@]}" -Atqc "select uuidv7()"); ox=$("${PSQL[@]}" -Atqc "select uuidv7()"); iy=$("${PSQL[@]}" -Atqc "select uuidv7()"); oy=$("${PSQL[@]}" -Atqc "select uuidv7()")
("${PSQL[@]}" -qc "begin; insert into material.process_input(process_input_id,processing_event_id,sample_id) values('$ix','$px','$sx'); select pg_sleep(1); insert into material.process_output(process_output_id,processing_event_id,sample_id) values('$ox','$px','$sy'); commit;") >"$LOG_DIR/c3_xy.log" 2>&1 & p1=$!
("${PSQL[@]}" -qc "begin; insert into material.process_input(process_input_id,processing_event_id,sample_id) values('$iy','$py','$sy'); insert into material.process_output(process_output_id,processing_event_id,sample_id) values('$oy','$py','$sx'); commit;") >"$LOG_DIR/c3_yx.log" 2>&1 & p2=$!
wait "$p1"; s1=$?; wait "$p2"; s2=$?
cycle=$("${PSQL[@]}" -Atqc "with recursive e(a,b) as (select pi.sample_id,po.sample_id from material.process_input pi join material.process_output po using(processing_event_id)), r(root,x) as (select a,b from e union select r.root,e.b from r join e on e.a=r.x) select count(*) from r where root=x")
if { [ "$s1" -eq 0 ] && [ "$s2" -ne 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -eq 0 ]; }; then [ "$cycle" -eq 0 ] && ok "C3 concurrent cycle prevented" || bad "C3 cycle count=$cycle"; else bad "C3 expected one winner one loser, statuses=$s1/$s2"; fi

# 4) ExternalRecord atomic get-or-create: all callers return one logical identity.
echo "[C4] concurrent ExternalRecord get-or-create"
source_id='018f0000-0000-7000-8000-00000000007c'
: >"$LOG_DIR/c4_ids.out"; : >"$LOG_DIR/c4.err"
pids=()
for i in $(seq 1 12); do
  rid=$("${PSQL[@]}" -Atqc "select uuidv7()")
  "${PSQL[@]}" -AtF'|' -c "select external_record_resource_id,created from evidence.r2_get_or_create_external_record('$rid','$source_id','R2-CONCURRENT-001','synthetic')" >>"$LOG_DIR/c4_ids.out" 2>>"$LOG_DIR/c4.err" & pids+=("$!")
done
c4err=0; for p in "${pids[@]}"; do wait "$p" || c4err=$((c4err+1)); done
logic=$("${PSQL[@]}" -Atqc "select count(*) from evidence.external_record where external_source_id='$source_id' and external_id='R2-CONCURRENT-001'")
ids=$(cut -d'|' -f1 "$LOG_DIR/c4_ids.out" | grep -E '^[0-9a-f-]{36}$' | sort -u | wc -l)
created=$(grep -c '|t$' "$LOG_DIR/c4_ids.out" || true)
if [ "$c4err" -eq 0 ] && [ "$logic" -eq 1 ] && [ "$ids" -eq 1 ] && [ "$created" -eq 1 ]; then ok "C4 one ExternalRecord identity, one creator, all callers converged"; else bad "C4 errors=$c4err logical=$logic returned_ids=$ids creators=$created"; fi

# 5) Validation concurrent optimistic transitions. Both expect unreviewed: one must win.
echo "[C5] concurrent ValidationStatus transitions"
vt=$("${PSQL[@]}" -Atqc "select uuidv7()")
"${PSQL[@]}" -qc "insert into core.resource(resource_id,resource_type_code) values('$vt','POP'); insert into field.population(resource_id,population_label) values('$vt','Validation concurrency population');"
ve1=$("${PSQL[@]}" -Atqc "select uuidv7()"); ve2=$("${PSQL[@]}" -Atqc "select uuidv7()")
("${PSQL[@]}" -qc "begin; select governance.r2_transition_validation_status('$ve1','$vt','validated',NULL,NULL,'c5-a','unreviewed',current_timestamp); select pg_sleep(1); commit;") >"$LOG_DIR/c5_a.log" 2>&1 & p1=$!
("${PSQL[@]}" -qc "begin; select governance.r2_transition_validation_status('$ve2','$vt','disputed',NULL,NULL,'c5-b','unreviewed',current_timestamp); commit;") >"$LOG_DIR/c5_b.log" 2>&1 & p2=$!
wait "$p1"; s1=$?; wait "$p2"; s2=$?
read current events matching < <("${PSQL[@]}" -AtF' ' -c "select r.validation_status,(select count(*) from governance.validation_event ve where ve.target_resource_id=r.resource_id),(select count(*) from governance.validation_event ve where ve.target_resource_id=r.resource_id and ve.to_validation_status=r.validation_status) from core.resource r where r.resource_id='$vt'")
if { [ "$s1" -eq 0 ] && [ "$s2" -ne 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -eq 0 ]; }; then [ "$events" -eq 1 ] && [ "$matching" -eq 1 ] && ok "C5 one optimistic transition committed; current/history consistent ($current)" || bad "C5 current=$current events=$events matching=$matching"; else bad "C5 expected one winner one stale loser, statuses=$s1/$s2"; fi

echo "CONCURRENCY_SUMMARY pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
