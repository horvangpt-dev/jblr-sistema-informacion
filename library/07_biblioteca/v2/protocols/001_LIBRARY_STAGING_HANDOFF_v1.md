# 001_LIBRARY_STAGING_HANDOFF_v1
Version: 1.0.0

001 puede reanudar M01.

## M01
- MODULE_ID: JBLR-MOD-0001
- MODULE_NAME: HERBARIOS · CITAS HISTÓRICAS · LOCALIDADES · GEORREFERENCIACIÓN
- MODULE_STATUS: ACTIVE
- STAGING_DRIVE_ID: 1TZA7e-csmdfU3dIxs7Z-VVWmKV0JCKfs
- STAGING_PATH: 07_BIBLIOTECA/00_STAGING/JBLR-MOD-0001_HERBARIOS_LOCALIDADES_GEOREFERENCIACION
- UPLOAD_ALLOWED: YES
- UPLOAD_PROTOCOL: library/07_biblioteca/v2/protocols/MODULE_UPLOAD_PROTOCOL_v1.md
- UPLOAD_MANIFEST_LOCATION: library/07_biblioteca/v2/staging/M01_UPLOAD_MANIFEST_TEMPLATE_v1.json
- UPLOAD_MANIFEST_SCHEMA: library/07_biblioteca/v2/schemas/UPLOAD_BATCH_SCHEMA_v1.schema.json
- DISCOVERY_TAG: DISCOVERY_MODULE:JBLR-MOD-0001
- MINIMUM_METADATA: UPLOAD_BATCH_ID, MODULE_ID, ORIGIN_ACTOR, SOURCE_URL, SOURCE_INSTITUTION, ORIGINAL_FILENAME, LANGUAGE, DISCOVERED_AT, DOWNLOADED_AT, SEARCH_CONTEXT, NOTES
- ALLOWED_FILE_TYPES: PDF, DOCX, XLSX, CSV, ZIP, documentary images, audiovisual when relevant, recovered source files, temporary acquisition documents.
- SPECIAL_RULES: upload original; preserve source URL; do not reclasify; do not modify after upload; no filename-based deletion; URL-only references remain registered.

## Human quick table

| MÓDULO | ESTADO | DÓNDE SUBIR | QUÉ SUBIR | REGLAS |
|---|---|---|---|---|
| M01 · Herbarios/citas/localidades/georreferenciación | ACTIVE | Drive ID `1TZA7e-csmdfU3dIxs7Z-VVWmKV0JCKfs` | Todo NUEVO archivo descargado durante M01 | Original sin modificar; registrar URL y metadatos mínimos; continuar búsqueda |
| M02–M20 | PLANNED_NOT_OPEN | NO STAGING | Nada todavía | UPLOAD_ALLOWED=NO hasta nueva apertura de 00000 |

## Explicit instruction to 001
A partir de ahora, para cada búsqueda de M01:
1. busca normalmente;
2. descarga el documento;
3. no lo reclasifiques;
4. sube el original al staging M01;
5. registra la URL;
6. completa solo los metadatos mínimos;
7. continúa con la búsqueda;
8. 07 realizará posteriormente la ingestión bibliotecaria.

Do not use the legacy `Georreferciacion` folder, pre-07 M01 folders, technical legacy library or human mirror as destinations for new downloads. They remain preserved as preexisting corpus.

## Continuity
GLOBAL_SCOPE=WORLDWIDE
MULTILINGUAL=YES
WESTERN_ONLY=NO
ENGLISH_ONLY=NO
CURRENT_STRUCTURED_OBJECTS=108
FINAL_UNION_DEDUPE=NOT_DONE
PRACTICAL_EXHAUSTION=NO
