# PROTOCOLO MAESTRO DE RESTAURACIÓN Y CONTINUIDAD SIN PÉRDIDAS

## 07.V4 · BIBLIOTECA CIENTÍFICA · DOCUMENTAL · CORPUS JBLR

ACTOR_ID = `07`  
PREVIOUS_VERSION = `07.V3_FROZEN_BY_CONTINUITY`  
CURRENT_VERSION = `07.V4`  
PARENT_AUTHORITY = `00000.V2 · DIRECCIÓN GENERAL JBLR`  
CONTINUITY_MODE = `LOSSLESS`  
PROJECT_RESTART = `NO`  
SYSTEM_RESTART = `NO`  
HISTORY_REWRITE = `NO`  
DATA_LOSS = `NO`

## Restore package

Drive package folder: `1n5kepOmAO6OtRhUgvSoVccdcwK3Z801O`

Read in this order:
1. `00_RESTORE_PROMPT_07_V4_MASTER` — `1m-jDmQdMpl4db6M8t5JjzpFv_wiqghc9u5Ikw8W2YXY`
2. V4 checkpoint — `135-BYZA9xjwB2NiQov7htz8Jrc-6bHSRqguy1RJdjSQ`
3. Frozen V4 checkpoint — `1cc_S3qS50Oh7I2fZM39q5TFDFyrBmcCJYswL9G3aScM`
4. `ACTOR_07_STATE_v2` — `1by_MYE1cHiFRQXfkNuq6agZ-_Dqsyydnf1iLC912M3I`
5. Frozen state v2 — `1dOnqELEUVAgwBYXLRjY5t-wohPEsanaTGPyCdaiAChc`
6. V3 checkpoint — `1FF4vtkbHG2inOh2c9ZvI9Hjhit3ANSujO3IPfuE3low`
7. Frozen V3 checkpoint — `1Ob7ZFzJYq7f7RAfXDAqYDJnJOR45Blh4Ir2hCBzInRI`
8. `ACTOR_07_STATE_v1` — `1v54G4D4v9r5H_dTVX_EE08jyEbvO9H-qTS_CoXkBOfs`
9. Frozen state v1 — `10jBR0dCR3BogZUlQnQsrXGYYEveaAgj5MSek6OjoYo0`
10. Persistence master — `1f-2_9nLkDNPRknN6e7FX8DDbKSazVkDPQQUxXI6EPiY`
11. Frozen persistence master — `1qKt-x8BnHlitCfXLOZdSuUuRbwgKguvF0c-hBlmsW7g`
12. Event Bus frozen snapshot — `10D62JOUnzpHsKYc0JQn8sz6rdKtWf8w1pBCDexelsCA`
13. Canonical State frozen snapshot — `19I9_AgloLIU6Q3h8-crpEyvperQaG5tFHSoRE46jXJg`

Then query live Shared Event Bus `1ooGUwDYQ5Q_nR6ctvrMx1kS1ESaJVmNDsyizLeXRMNs` and live Canonical State `1UhIkAmCNLVJibUUhbAogyU8EtzUsNOsIqdkEdfS_KMo` for anything later than `2026-08-28T01:26:14+02:00`.

Transition event: `JBLR-EVT-07-20260828-CONTINUITY-V3-TO-V4-001` (Event Bus row 533).  
Continuity state: `ACTOR_07_CONTINUITY_STATE` (latest known closure row 651).

## Central index guard

Repository: `horvangpt-dev/jblr-sistema-informacion`  
Branch: `07-biblioteca-index`  
Path: `library/07_biblioteca/v2/index/JBLR_CENTRAL_LIBRARY_INDEX_v1.json`

At closure:
- schema `1.1.0`
- coverage `PARTIAL_FINE_GRAINED_CONSOLIDATION`
- persisted record count `95`

Do not claim a higher total without exact reconciliation, persisted write, and verification.

## Invariants

`archivo_en_biblioteca != hecho_validado`  
`reference != assertion`  
`assertion != validated_fact`  
`evidence != conclusion`  
`unknown != zero`  
`unknown != absence`  
`not_found != absence`

One central technical library. One canonical documentary identity. Human distribution copies do not create a new `LIB_FILE_ID`.

## Module state

- M01 = `PAUSED_PARTIAL_REOPENABLE`
- M04/M05 = `OPEN_AUTHORIZED_INCREMENTAL_ACTIVE`
- M02 = `NOT_OPEN`
- M03 = `NOT_OPEN`

Multitag M01–M20 is allowed where content warrants; do not silently open adjacent modules.

## Human library

Priority languages: ES, EN, FR, PT, IT.

For `OTROS IDIOMAS`:
- one branch per confirmed language;
- manuals/guides/broad methodologies → `00`;
- everything else → `GENERAL`;
- inside `GENERAL`, retain source-module provenance when known (`M01`, `M04-M05`, etc.);
- fine thematic classification is deferred.

Controlled language vocabulary at closure: `1.0.4`, including `lv` and `ja`.

## PRIORITY_0

Execute superior directive:
`JBLR-EVT-00000-20260828-DIRECT-07-M04-M05-INVENTORY-SNAPSHOT-001`

Produce an authoritative M04-M05 snapshot for 001 using, where evidence exists:
`LIB_FILE_ID`, `SHA256_OR_CONTENT_HASH`, `DOI`, `CANONICAL_URL`, `SOURCE_URL`, bibliographic signature, current title, aliases, module projections, and ingestion state.

Separate canonical identities, pending/reconciliation items, human distribution copies, and duplicate candidates. Filename alone is not identity. 001 cannot assign final `LIB_FILE_ID`. Do not increase master index count without real reconciliation.

Known defect: `001_HANDOFF_07_ENRICHMENT_CLASSIFICATION_M04_M05_2026-08-28_v1` was empty/unusable when reviewed by 00000. Do not rely on it unless later evidence proves repair or supersession.

## Outstanding reconciliation

- M04-M05 later work vs master index 95
- `JBLR-LIB-00000079 → JBLR-LIB-00000076`
- `JBLR-LIB-00000093 → JBLR-LIB-00000092`
- deletion/dedup ledger

Strong identity evidence required; hashless dedupe prohibited.

## Start order

1. Restore V4 from Drive package.
2. Verify newer live shared events.
3. Verify GitHub continuity and real master index.
4. Execute PRIORITY_0 M04-M05 snapshot.
5. Continue incremental M04/M05 ingestion.
6. Preserve `00` vs `GENERAL/source-module` rule.
7. Reconcile index before increasing count.

`07.V3 = FROZEN_BY_CONTINUITY`  
`07.V4 = CURRENT_ACTIVE`
