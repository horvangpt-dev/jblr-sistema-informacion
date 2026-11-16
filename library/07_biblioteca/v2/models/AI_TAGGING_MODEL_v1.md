# AI_TAGGING_MODEL_v1

Version: 1.0.0

## Principle

The AI information layer is independent of Drive folder hierarchy.

Canonical machine retrieval uses:
`LIB_FILE_ID + METADATA + RELATIONS + INDEXES + POINTERS + CONTENT_EXTRACTION`

## Core facets

- LANGUAGE
- JBLR_AREA
- PROCESS
- SUBPROCESS
- DOCUMENT_TYPE
- INSTITUTION
- SOURCE_CLASS
- TOPICS
- QA_STATUS
- CONTENT_INDEX_STATUS
- FULLTEXT_STATUS
- OCR_STATUS
- PAGE_INDEX_STATUS
- authors
- country
- year
- technical level

Multi-value facets are preserved as arrays.

## Internal tag namespace

Examples:
- `jblr.language = en`
- `jblr.process = laboratory` (legacy-friendly conceptual example)
- `jblr.process = drying`
- `jblr.document_type = protocol`
- `jblr.institution = kew`

The canonical source of these values is the JBLR inventory. Drive labels/custom properties are adapters, not the sole authority.

## Adapter rule

Provider-specific tags may mirror a compact subset of canonical metadata for discoverability. Failure or absence of a provider adapter must not make the library unqueryable.
