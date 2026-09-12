# MODULE_UPLOAD_PROTOCOL_v1
Version: 1.0.0
Actor origin: 001
Library owner: 07.V2

## Search-first rule
001 searches normally. Library complexity remains with 07.

## M01 upload procedure
For every NEW document found in JBLR-MOD-0001:
1. Download the original file without modification.
2. Upload that original to the authorized M01 staging folder.
3. Preserve SOURCE_URL.
4. Enter LANGUAGE if known, otherwise UNKNOWN.
5. Enter SOURCE_INSTITUTION if known, otherwise UNKNOWN.
6. Enter SEARCH_CONTEXT when useful.
7. Continue searching; do not perform full library cataloguing.

Do not use the legacy Georreferciacion folder, legacy M01 tree, technical library or human mirror as destinations for new downloads.

## URL-only sources
If an item cannot yet be downloaded, record it as SOURCE_REFERENCE with DOWNLOAD_STATUS=NOT_DOWNLOADED. NOT_DOWNLOADED != NOT_USEFUL.

## Integrity
After upload, 001 must not modify the file. 07 later performs identity, deduplication and ingestion.

## Allowed file classes
PDF, DOCX, XLSX, CSV, ZIP, documentary images, audiovisual material where relevant, recovered source files, temporary acquisition documents.

## Missing metadata
SOURCE_URL, LANGUAGE or SOURCE_INSTITUTION may be UNKNOWN. Secondary metadata gaps do not block upload.

## Cleanup
No staging file may be deleted until INGESTED_VERIFIED=YES and LIB_FILE_ID, CANONICAL_POINTER, PROVENANCE_PRESERVED, SOURCE_URL_PRESERVED and MODULE_RELATION_PRESERVED all exist.
