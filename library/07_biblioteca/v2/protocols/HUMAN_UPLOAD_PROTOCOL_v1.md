# HUMAN_UPLOAD_PROTOCOL_v1

Version: 1.0.0

## Human workflow

**DOWNLOAD DOCUMENT → UPLOAD TO HUMAN INBOX → FIN**

Human inbox:
- Name: `00 · SUBIR AQUÍ · ARCHIVOS JOAQUÍN`
- Drive ID: `18oyxoat65ubmkrpre88F2ygqfe-VDy4h`
- Path: `07_BIBLIOTECA/00_ENTRADAS/00 · SUBIR AQUÍ · ARCHIVOS JOAQUÍN`

The user is not required to classify, rename, tag, choose a module, create JSON, or fill a manifest.

Every new item inherits:
- `ORIGIN_CHANNEL = HUMAN_USER_UPLOAD`
- `ORIGIN_ACTOR = USER`
- `HUMAN_REPOSITORY_ELIGIBLE = YES`
- `AI_LIBRARY_ELIGIBLE = YES`

07 performs identity, provenance, metadata, classification, dedup/version review, canonical placement, central-index update and human-view projection.

## Human output rule

Only files supported as user uploads are eligible by default for `03_BIBLIOTECA_HUMANA`.

Human navigation:
`LANGUAGE → PURPOSE / PROCESS / MODULE → SOURCE_INSTITUTION / ENTITY → DOCUMENT`

A single canonical binary may have multiple human shortcuts/pointers. Physical duplication is not the view mechanism.
