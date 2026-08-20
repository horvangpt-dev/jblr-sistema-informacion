# Actor 08 · Execution Control Plane · Local QA

Date: 2026-08-20

State: `PASS`

Command:

```text
node --test test/control-plane.test.js
```

Result:

```text
TESTS=24
PASS=24
FAIL=0
REAL_BOTANICAL_RUNS=0
NEON_WRITES=0
```

Coverage includes: RC1 manifest canonical-hash compatibility; mandatory release binding; missing release; wrong hash; historical-input refusal; real-run authorization gate; release-candidate real-run refusal; synthetic-adapter real-run refusal; STIME version mismatch; NO_SILENT_INFERENCE adapter guard; preservation of UNKNOWN / NOT_FOUND / SOURCE_NOT_ACQUIRED; false-zero guard; explicit technical placeholder exception; taxon-not-found; taxon/subset/genus/batch/full selection; retry; checkpoint/resume; duplicate-run idempotency; CACHE_MISS/HIT/STALE/INVALID; dependency readiness; run artifacts and event materialization.

All fixtures are `SYNTHETIC_ONLY / NOT_REAL_BOTANICAL_RUN`.
