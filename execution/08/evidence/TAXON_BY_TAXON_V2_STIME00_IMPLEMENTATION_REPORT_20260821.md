# 08 · TAXON_BY_TAXON_v2 / STIME_00 · IMPLEMENTATION REPORT

Date: 2026-08-21
Actor: 08 · TECHNICAL_IMPLEMENTATION_AND_CONTROLLED_TEST
Design authority: 04
Canonical governance: STIME_GOVERNANCE_v1

## Binding

- Design PR: #11
- Design head: `77765c570ccf5e953658d4179d7e8b8c7097b5e8`
- Protocol: `TAXON_BY_TAXON_v2`
- Field registry: `FIELD_SOURCE_REGISTRY_v1`
- STIME protocol: `STIME_00_FIELD_PROTOCOLS_v1`
- Corpus binding for controlled integration only: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2`
- Manifest pointer: `14f5gaqfLo5doi86REqkN9STnXJJSX0nS`
- Manifest SHA256: `3336c3481754c77e23f8103b37e1d6b3ffc130dd8ed7cae2df253a06fc0b931a`
- Full corpus execution by 08: `0`

## Implemented mechanisms

1. QUERY_UNIT executor.
2. Exact RC2 release-binding validator.
3. Stable TAXON_WORK_KEY.
4. Query dedupe/idempotence.
5. Source-field authorization registry.
6. Raw-evidence capture before interpretation.
7. Candidate preservation.
8. Rank/hybrid/group/parent/fuzzy identity guards.
9. Query-name queue.
10. Cross-source pending-pair matrix.
11. Universal query state machine.
12. Assertion separation from raw evidence.
13. Retry layer for timeout/429/5xx.
14. Explicit local/systemic stop behavior.
15. Query/taxon/run QA primitives.
16. Human-view generator.
17. REVIEW_REQUIRED generator.
18. Historical-name 1..N expansion with individual evidence requirement.
19. Productive ID_TAXON_JBLR mapping gate.

## Acceptance matrix

`TESTS = 53`
`PASS = 53`
`FAIL = 0`

The tests cover exactly matrix items 1..53 in `ACCEPTANCE_TEST_MATRIX_v1`.

Systemic QA on valid runs:
- CROSS_TAXON_MUTATIONS = 0
- ASSERTIONS_WITHOUT_EVIDENCE = 0
- FALSE_NOT_FOUND_FROM_SOURCE_ERROR = 0
- UNTRACKED_QUERY_NAMES = 0

## Canonical ID mapping gate

04 reported a canonical tension between existing JBLR internal stable identity semantics and the design rule `ID_TAXON_JBLR = ID_TAXON_GOBIERNO` when EIDOS exact ID exists.

Implementation state:
- mechanism implemented;
- controlled test-only behavior exercised;
- productive activation = `HOLD_PENDING_0000_ID_MAPPING_RESOLUTION`;
- TAXON_WORK_KEY remains immutable technical anchor.

No productive JBLR ID mutation was performed.

## External source bindings

See `source-bindings-v1.json`.

No endpoint or dataset version was invented. Current status:
- EIDOS live: endpoint/version UNVERIFIED.
- ANTHOS: endpoint/archive version UNVERIFIED.
- POWO: official portal identity bound; WCVP dataset version UNVERIFIED.
- WFO: official portal identity bound; backbone/API version UNVERIFIED.
- current Euro+Med: endpoint/version UNVERIFIED; legacy transport remains support/history only.
- historical registry: internal registry identity bound.

Therefore the implementation is mechanism-complete for controlled/synthetic tests but the external acquisition bindings are not yet sufficient for an authorized full-corpus 09 run.

## Human-view sample

`human-view-sample.json` is synthetic only and contains no real taxonomic assertion.

## Gate 08 -> 09

- IMPLEMENTATION_COMPLETE = YES
- CONTROLLED_TEST_MATRIX = PASS_53_OF_53
- SYSTEMIC_QA = PASS
- PROTOCOL_VERSION_BOUND = TAXON_BY_TAXON_v2
- FIELD_SOURCE_REGISTRY_BOUND = FIELD_SOURCE_REGISTRY_v1
- FULL_CORPUS_EXECUTION_BY_08 = 0
- ID_MAPPING_PRODUCTIVE_GATE = HOLD_PENDING_0000
- LIVE_SOURCE_BINDINGS_COMPLETE = NO

`READY_FOR_09 = NO`

Reasons:
1. 0000 has not yet resolved productive ID_TAXON_JBLR mapping compatibility.
2. Exact live endpoint/dataset-version bindings are not yet verified for every required external source adapter.

No semantic contradiction was introduced by 08. No STIME redesign was performed.
