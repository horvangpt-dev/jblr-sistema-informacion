# Actor 08 · RC2 Ready STIMEs Execution Report · 2026-08-21

## Binding and QA

- ACTOR_ID: `08`
- TAXONOMIC_RELEASE: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2`
- RELEASE_VERSION: `v1-rc2`
- MANIFEST_SHA256: `3336c3481754c77e23f8103b37e1d6b3ffc130dd8ed7cae2df253a06fc0b931a`
- MEMBERSHIP_SHA256: `1a2727c410dd0a016973df88de19934cf656ad808b87357d6fe95aee47914265`
- MEMBERSHIP_ROWS: `2210/2210`
- LOCAL_CONTROL_PLANE_QA: `51/51 PASS`
- HISTORICAL_UNIVERSE_AS_EXECUTION_BINDING: `NO`
- NEON_WRITES: `0`

## STIME_AMENAZA

### Controlled real batch
- RUN_ID: `JBLR-RUN-08-44FFCCC6595645B87C3D`
- TAXA: 3 exact RC2 rows
- CACHE_HIT: 3/3
- UNRESOLVED: 0
- QA: PASS

### Full RC2 execution
- RUN_ID: `JBLR-RUN-08-648059F855B748961CFD`
- PROCESSED: `2210/2210`
- EXACT_VERSIONED_CACHE_MATCHES: `1892`
- CACHE_MISS: `318`
- SCORED: `1387`
- SCORED_WITH_CONFLICT: `7`
- UNKNOWN: `329`
- TAXON_UNRESOLVED: `169`
- SOURCE_NOT_ACQUIRED: `318`
- FALSE_ZERO_VIOLATIONS: `0`
- EXECUTION_QA: PASS
- DOWNSTREAM_READY: `NO`
- REASON: `REQUIRED_EVIDENCE_ACQUISITION_PENDING_FOR_ROWS_WITHOUT_EXACT_VERSIONED_CACHE`
- CACHE_EVIDENCE_POINTER: Drive `139PuKMDOUw-cJ2anWsJWuXEZHapLMYIS`

Historical `universe_index` values were not used as execution identity. RC2 `release_row_id` is the run identity.

## STIME_PROTECCION

- RUN_ID: `JBLR-RUN-08-36DEBC7C44523CA36F78`
- PROCESSED: `2210/2210`
- SOURCE_NOT_ACQUIRED: `318`
- NO_COMPROBADO: `1770`
- TAXON_UNRESOLVED: `122`
- PROTECTED_ASSERTIONS: `0`
- SEMANTIC_SIN_PROTECCION_LEGAL_ZERO: `0`
- FALSE_SIN_PROTECCION_VIOLATIONS: `0`
- OLD_PROVIDER_SCORES_PROMOTED_AS_CURRENT: `NO`
- EXECUTION_QA: PASS
- DOWNSTREAM_READY: `NO`
- REASON: `PRIMARY_OFFICIAL_SOURCE_CHECKS_INCOMPLETE_PER_TAXON; CACHED_PROVIDER_EVIDENCE_RETAINED_AS_CONTEXT_ONLY`
- CONTEXT_EVIDENCE_POINTER: Drive `1qqGd24qnLuZSya0BQUlKBEU46TDoiLaBAV9cVuQl0PQ`

No current legal protection or no-protection state was asserted from stale/context-only evidence. Missing verification remains explicit.

## STIME_INTERES_CIENTIFICO · N20 raw evidence

- RUN_ID: `JBLR-RUN-08-1B3EA060AC3DE75D5205`
- PHASE: `N20_STRATIFIED_RAW_EVIDENCE_ONLY`
- PILOT_SLOTS_PROCESSED: `20/20`
- COMPLETE_CASES: `0`
- PARTIAL_CASES: `20`
- BLOCKED_CASES: `0`
- SCORING: `OFF`
- WEIGHTS: `CALIBRATION_PENDING`
- SEARCH_SUFFICIENT_CASES: `0`
- MAJOR_GAP_COUNT: `0`
- QA_FINAL: `PASS_WITH_PARTIAL_RAW_EVIDENCE`
- DOWNSTREAM_SCORING_READY: `NO`
- N20_DRIVE_SHEET_ID: `1GrNeXgtgD5vQ8NZJUDLvCULM5xMTVAFlITg-OIqZK5E`

An initial lexical QA check falsely matched the word `amenazada` inside an Androsace bibliographic title. The initial failure is preserved as evidence. Corrected QA inspects prohibited semantic fields rather than incidental title text and reports zero threat/legal-protection semantic leakage.

## Blocked STIMEs not executed

- `STIME_REPRESENTACION_EX_SITU`: NOT EXECUTED; real-data and FINAL_P99 blockers remain.
- `COMPOSITE_STIME_URGENCIA_RECOLECCION`: NOT EXECUTED; upstream and N_REF blockers remain.
- `COMPOSITE_STIME_PRIORIDAD_TAXON`: NOT EXECUTED; design incomplete.

## Overall state

The three READY execution paths were executed against exact RC2 binding without semantic contradiction. AMENAZA and PROTECCION remain non-downstream-ready because required evidence acquisition/verification is incomplete. INTERES_CIENTIFICO N20 raw evidence is ready to return to actor 04 for distribution review and later calibration; this does not authorize scoring.
