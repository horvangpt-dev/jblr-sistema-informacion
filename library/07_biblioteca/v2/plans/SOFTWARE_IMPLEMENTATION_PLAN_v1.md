# SOFTWARE_IMPLEMENTATION_PLAN_v1

Version: 1.0.0
Status: PLAN_ONLY
Gate: 07.5–07.10 NOT_STARTED

## Intended sequence after authorization

1. Freeze V2 schema/vocabulary version and add automated validators.
2. Implement V1→V2 transition reader without rewriting V1.
3. Implement identity registry and allocator for SOURCE_FAMILY_ID / SOURCE_ID / LIB_FILE_ID.
4. Implement inventory read/write layer with JSON and CSV export.
5. Implement fixity, exact-duplicate and version-relation services.
6. Implement Drive metadata adapter and capability checks.
7. Implement human-view mapping planner; shortcut writes remain separately gated.
8. Implement native-text extraction pipeline.
9. Implement OCR fallback interface.
10. Implement file/full-text/page/section index writers.
11. Implement `LIBRARY_QUERY` adapter.
12. Add controlled pilot fixtures and QA.
13. Only after a separate gate, ingest a small controlled corpus.

## Suggested repository layout

`library/07_biblioteca/v2/`
- architecture/
- schemas/
- vocabularies/
- protocols/
- models/
- queries/
- plans/
- manifests/
- validators/ (future)
- indexes/ (future generated outputs)

## Non-goals of this persistence commit

- no functional ingestion code
- no corpus acquisition
- no source file moves
- no Drive shortcut creation
- no schema migration of V1 data
