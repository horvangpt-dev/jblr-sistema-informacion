# TAXON_BY_TAXON_v2 · JBLR

Estado: `04_DESIGN_MATERIALIZED_FOR_08_IMPLEMENTATION`

Autoridad de diseño: `04 · DISEÑO_STIMES`

Gobernanza vigente:
- 04 diseña el protocolo y sus contratos.
- 08 implementa técnicamente y ejecuta únicamente pruebas controladas/sintéticas/integración.
- 08 NO ejecuta el corpus taxonómico completo.
- 09 ejecuta el corpus completo tras PASS de implementación 08.
- el usuario audita obligatoriamente la salida humana.
- 04 decide cierre/repetición/modificación del STIME después de auditoría humana.

## Objeto

`TAXON_BY_TAXON_v2` es el contrato transversal de adquisición JBLR para ejecutar una consulta trazable sobre una unidad:

`ONE_TAXON × ONE_FIELD × ONE_SOURCE × ONE_QUERY_VALUE`

No define por sí mismo el significado científico de cada FIELD. Cada FIELD tiene un contrato de fuente e interpretación separado.

## Primer consumidor

`STIME_00 · REVISION_TAXONOMICA`

Corpus autorizado actual:
- release: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2`
- membership: `2210`
- manifest pointer: `14f5gaqfLo5doi86REqkN9STnXJJSX0nS`
- QA pointer: `1Nw_4iAe4HSkRmmHQXNKuSGkOunsf-E-n`
- manifest SHA256: `3336c3481754c77e23f8103b37e1d6b3ffc130dd8ed7cae2df253a06fc0b931a`

Los universos históricos `2742/V8/V10/B-v2` están prohibidos como input operativo.

## Principios obligatorios

- `REALITY_FIRST = ACTIVE`
- `NO_SILENT_INFERENCE = ACTIVE`
- `NO_INFORMATION_LOSS = ACTIVE`
- `RAW != NORMALIZED`
- `REFERENCE != ASSERTION`
- `ASSERTION != VALIDATED_FACT`
- `UNKNOWN != ZERO`
- `UNKNOWN != ABSENCE`
- `NOT_FOUND != ABSENCE`
- `UNRESOLVED != ABSENCE`
- `CONFLICT != ABSENCE`
- `SOURCE_UNAVAILABLE != NOT_FOUND`
- `PARENT_TAXON != TARGET_TAXON`
- `FUZZY_MATCH != TAXONOMIC_IDENTITY`
- `ONE_TAXON_RESULT_MUST_NOT_MUTATE_ANOTHER_TAXON`

## Archivos

- `TAXON_BY_TAXON_v2.md`: contrato transversal completo.
- `STIME_00_FIELD_PROTOCOLS_v1.md`: paso a paso del STIME y de cada FIELD.
- `FIELD_SOURCE_REGISTRY_v1.json`: mapa FIELD → fuente y autoridad.
- `schemas/query-unit.schema.json`: contrato mínimo de entrada.
- `schemas/query-result.schema.json`: contrato mínimo de salida.
- `ACCEPTANCE_TEST_MATRIX_v1.md`: pruebas que 08 debe superar antes de entregar a 09.
- `HANDOFF_TO_08.md`: instrucciones de implementación a 08.

## Regla de publicación

Esta rama materializa diseño 04. No debe fusionarse en `main` como implementación productiva hasta que 08 implemente, pruebe y reporte conforme a la gobernanza STIME vigente.
