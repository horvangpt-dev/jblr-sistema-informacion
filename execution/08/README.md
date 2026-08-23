# 08 · STIME Execution Control Plane

Actor: `08 · STIME_EXECUTION`  
Authority: `0000 / 00E`  
Design authority: `04`  
Taxonomic release authority: `09`

This directory is the isolated execution control plane for JBLR STIMEs. It contains **no real botanical run** and **no Neon write path**.

## Mandatory real-run release binding

Every real run is refused unless all four fields are present and verified:

- `TAXONOMIC_UNIVERSE_RELEASE_ID`
- `TAXONOMIC_UNIVERSE_VERSION`
- `TAXONOMIC_UNIVERSE_MANIFEST`
- `MANIFEST_HASH`

A real run additionally requires an explicit canonical authorization object with `DOWNSTREAM_08_REAL_RUN_AUTHORIZED=true` and an `AUTHORITY_EVENT_ID`. A release candidate with `publication_ready=false`, `final_release=false`, or `publication_state=RELEASE_CANDIDATE` is rejected for real execution.

## Historical-input guard

Operational metadata referencing `2742`, `V8`, `V10`, or `B-v2` is rejected. Historical Git existence is not itself an error; historical material simply cannot become an active execution input.

## NO_SILENT_INFERENCE

The common plane does not invent country, wild origin, absence, or numeric zero. `UNKNOWN`, `NOT_FOUND`, `SOURCE_NOT_ACQUIRED`, `TAXON_UNRESOLVED`, `NOT_EVALUABLE`, and `UNRESOLVED` remain explicit semantic states. Numeric zero for such states is rejected unless the result explicitly declares `numeric_projection_rule=EXPLICIT_CONTRACT_PLACEHOLDER`.

Adapters must expose exactly the contract metadata supplied by actor 04:

- `STIME_ID`
- `STIME_VERSION`
- `INPUT_CONTRACT`
- `OUTPUT_CONTRACT`
- `UNKNOWN_SEMANTICS`
- `SOURCE_REQUIREMENTS`
- `QA_RULES`

No production adapter is included until `04_STIME_EXECUTION_HANDOFF_PACKET_v1` is ready. `src/synthetic-adapter.js` exists only for QA and is marked `SYNTHETIC_ONLY`.

## Control-plane capabilities

`LOAD_RELEASE`, `VERIFY_MANIFEST`, `VERIFY_HASH`, `SELECT_STIME`, `VERIFY_STIME_VERSION`, `VERIFY_DEPENDENCIES`, `CHECK_CACHE`, `CREATE_RUN_ID`, `RUN_PREFLIGHT`, `EXECUTE_BATCH`, `CHECKPOINT`, `RETRY_SAFE_FAILURES`, `PRESERVE_UNRESOLVED`, `WRITE_OUTPUT_ARTIFACTS`, `GENERATE_RUN_MANIFEST`, `GENERATE_QA`, and `EMIT_EVENT` are implemented in `src/control-plane.js`.

Selections supported: one taxon, subset, genus, batch, and full release.

## QA

Run:

```bash
npm test
```

All fixtures are synthetic and must remain `SYNTHETIC_ONLY / NOT_REAL_BOTANICAL_RUN`.
