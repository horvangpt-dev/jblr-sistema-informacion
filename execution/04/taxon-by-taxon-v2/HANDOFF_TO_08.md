# HANDOFF 04 -> 08 · TAXON_BY_TAXON_v2 + STIME_00

## Estado

`DESIGN_COMPLETE_FOR_08_IMPLEMENTATION`

Este paquete es diseño 04. 08 no debe redefinir semántica.

## Binding de diseño

08 debe implementar exactamente:
- `TAXON_BY_TAXON_v2.md`
- `FIELD_SOURCE_REGISTRY_v1.json`
- `STIME_00_FIELD_PROTOCOLS_v1.md`
- `schemas/query-unit.schema.json`
- `schemas/query-result.schema.json`
- `ACCEPTANCE_TEST_MATRIX_v1.md`

## Corpus permitido para pruebas de integración

El STIME real completo no lo ejecuta 08.

Para fixtures/integración, 08 debe bindear el contrato al release actual autorizado:
- `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2`
- membership count 2210 como dato de manifest, nunca hard-coded como lógica
- manifest pointer `14f5gaqfLo5doi86REqkN9STnXJJSX0nS`
- QA pointer `1Nw_4iAe4HSkRmmHQXNKuSGkOunsf-E-n`
- manifest SHA256 `3336c3481754c77e23f8103b37e1d6b3ffc130dd8ed7cae2df253a06fc0b931a`

Prohibido usar 2742/V8/V10/B-v2 como input operativo.

## Implementación requerida

08 debe construir, como mínimo:

1. executor de `QUERY_UNIT`;
2. release-binding validator;
3. `TAXON_WORK_KEY` stable-key mechanism;
4. query dedupe/idempotence;
5. per-source adapters;
6. raw-evidence capture before parse;
7. candidate extraction;
8. identity guards;
9. query-name queue;
10. cross-source query matrix;
11. per-query state machine;
12. assertion writer separated from raw observations;
13. retry layer preserving semantics;
14. taxon-level checkpoints/resume;
15. systemic-stop mechanism;
16. QA query/taxon/run;
17. machine output;
18. human-view generator;
19. REVIEW_REQUIRED generator;
20. run manifest/provenance.

## Adaptadores de fuente obligatorios

### EIDOS

Source identity: `EIDOS_LIVE_MITECO_IEPNB`

Debe soportar dos FIELDs:
- `ID_TAXON_GOBIERNO`
- `TAX_EIDOS`

Autoridad del ID: EIDOS vivo.

Static MITECO = discovery/support only; nunca escribe ID oficial actual sin confirmación EIDOS live.

### ANTHOS

Source identity: `ANTHOS_RJB_CSIC`

FIELD:
- `TAX_ANTHOS`

Transportes admitidos:
- interfaz/servicio oficial;
- archive Darwin Core oficial RJB-CSIC/infraestructura oficial asociada, versionado+hash.

### POWO/WCVP

Source identity: `KEW_POWO_WCVP`

FIELD:
- `TAX_POWO_WCVP`

Transportes:
- POWO actual;
- WCVP download distribuido por POWO, versionado+hash.

POWO/WCVP = una sola familia fuente para este FIELD.

### WFO

Source identity: `WORLD_FLORA_ONLINE`

FIELD:
- `TAX_WFO`

Transportes:
- current portal/API;
- official versioned backbone.

Preservar WFO-ID y taxonomicStatus.

### EURO+MED

Source identity: `EUROPLUSMED_PLANTBASE`

FIELD:
- `TAX_EUROMED`

Current Euro+Med portal = autoridad actual del FIELD.

Legacy `ww2.bgbm.org/EuroPlusMed` = evidence/history only; la propia fuente indica que ya no se actualiza. No puede rellenar silenciosamente el FIELD actual.

### HISTORICOS

Source identity: `HISTORICAL_SOURCE_REGISTRY`

FIELD compuesto:
- `TAX_HISTORICO_1..N`

Discovery sources:
- synonym/historical relations from the five repositories;
- actor 07 documentary query;
- authorized Rioja/Iberian botanical literature.

Cada histórico necesita evidencia individual de relación con el mismo taxón antes de promoción.

## Guards no negociables

- no parent ID as child exact identity;
- no fuzzy identity assertion;
- no rank collapse;
- preserve hybrid/group/rank tokens;
- source failure != not found;
- no source writes another source's FIELD;
- no cross-taxon mutation;
- no assertion without evidence;
- no silent overwrite;
- no concatenated multiple names in human FIELD cells.

## Pruebas

Implementar y ejecutar la totalidad de `ACCEPTANCE_TEST_MATRIX_v1`.

08 puede usar fixtures/synthetic/controlled real samples suficientes para demostrar mecanismo.

08 NO puede ejecutar los 2210 como full corpus STIME.

## Entrega requerida de 08

Reportar:
- implementation branch + commit SHA;
- files/code created;
- exact source endpoints/dataset versions bound by each adapter;
- test matrix results 1..53;
- QA report;
- known technical limitations;
- evidence pointers;
- human-view sample;
- `READY_FOR_09 = YES|NO`.

Si surge contradicción semántica, detener y reportar a 04.

Si el defecto es puramente técnico, 08 lo corrige sin rediseñar el contrato.
