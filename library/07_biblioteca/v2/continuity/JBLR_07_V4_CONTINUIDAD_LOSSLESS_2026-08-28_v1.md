# JBLR 07.V4 · CONTINUIDAD LOSSLESS

Fecha: 2026-08-28

## Identidad

- ACTOR_ID: `07`
- PREVIOUS_VERSION: `07.V3_FROZEN_BY_CONTINUITY`
- CURRENT_VERSION: `07.V4`
- PARENT_AUTHORITY: `00000.V2 · DIRECCIÓN GENERAL JBLR`
- CONTINUITY_MODE: `LOSSLESS`
- PROJECT_RESTART: `NO`
- SYSTEM_RESTART: `NO`
- HISTORY_REWRITE: `NO`
- DATA_LOSS: `NO`

## Checkpoint Drive

- `JBLR_07_V4_CONTINUIDAD_LOSSLESS_2026-08-28`
- Drive ID: `135-BYZA9xjwB2NiQov7htz8Jrc-6bHSRqguy1RJdjSQ`
- `ACTOR_07_STATE_v2`
- Drive ID: `1by_MYE1cHiFRQXfkNuq6agZ-_Dqsyydnf1iLC912M3I`

## Índice central verificado

- schema: `1.1.0`
- coverage: `PARTIAL_FINE_GRAINED_CONSOLIDATION`
- persisted record_count: `95`
- no afirmar un recuento superior sin reconciliación y persistencia verificadas.

## Módulos

- M01: `PAUSED_PARTIAL_REOPENABLE`
- M04/M05: `OPEN_AUTHORIZED_INCREMENTAL_ACTIVE`
- M02: `NOT_OPEN`
- M03: `NOT_OPEN`

## Biblioteca humana

- Copias físicas de distribución autorizadas.
- Una copia humana no crea nuevo `LIB_FILE_ID`.
- Prioridad lingüística: ES, EN, FR, PT, IT.
- `OTROS IDIOMAS`: una rama por idioma confirmado.
- Manuales/guías/metodologías amplias → carpeta `00`.
- Otros documentos → `GENERAL`.
- Dentro de `GENERAL`, conservar módulo de procedencia cuando se conozca (`M01`, `M04-M05`, etc.).
- Clasificación temática fina de `OTROS IDIOMAS` queda diferida.
- Vocabulario de idioma vigente: `1.0.4`, incluyendo `lv` y `ja`.

## Prioridad ejecutiva heredada

Evento superior:
`JBLR-EVT-00000-20260828-DIRECT-07-M04-M05-INVENTORY-SNAPSHOT-001`

07.V4 debe producir para 001 un snapshot autoritativo M04-M05 con:
`LIB_FILE_ID`, hash/contenido, DOI, URL canónica, URL fuente, firma bibliográfica, título actual, aliases, proyecciones modulares y estado de ingesta.

Reglas: filename no es identidad; separar canónicos de pendientes/copias humanas; no aumentar el master index sin reconciliación; 001 no asigna `LIB_FILE_ID`; dedupe solo con evidencia fuerte.

## Advertencia

No depender del artefacto vacío detectado por 00000:
`001_HANDOFF_07_ENRICHMENT_CLASSIFICATION_M04_M05_2026-08-28_v1`.

## Deuda de reconciliación

- lote M04-M05 vs índice maestro 95;
- merge `79→76`;
- merge `93→92`;
- ledger de deduplicación/eliminación.

## Orden de restauración

1. Verificar checkpoint Drive y eventos posteriores.
2. Confirmar `ACTOR_ID=07`, `CURRENT_VERSION=07.V4`.
3. Verificar el índice maestro real.
4. Ejecutar la directriz de inventario M04-M05 de 00000.
5. Continuar ingesta incremental.
6. Mantener regla `00` vs `GENERAL/módulo`.
7. Reconciliar índice antes de subir el contador.

`07.V3 = FROZEN_BY_CONTINUITY`
`07.V4 = ACTIVE_ON_NEXT_CHAT`
