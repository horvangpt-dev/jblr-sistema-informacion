# FULLTEXT_INDEX_DESIGN_v1

Version: 1.0.0

## Index levels

1. `FILE_LEVEL_INDEX`
2. `DOCUMENT_METADATA_INDEX`
3. `FULL_TEXT_INDEX`
4. `PAGE_LEVEL_INDEX`
5. `SECTION_LEVEL_INDEX`

The first two are mandatory foundations. Later levels are format-dependent.

## Extraction policy

- Prefer native embedded text.
- `USE_NATIVE_TEXT_FIRST = ACTIVE`
- OCR is fallback for image-only or materially unusable native text.
- `SOURCE_TEXT != OCR_DERIVATIVE`

## Storage model

For each extraction artifact persist:
- `LIB_FILE_ID`
- extractor and version
- extraction timestamp
- source hash
- text mode (`native`, `ocr`, `hybrid`)
- page boundaries when available
- extraction QA state
- derivative pointer

## Search fields

Index normalized searchable text while preserving exact source-derived text separately.
Do not convert extracted statements into validated scientific facts.

## Failure semantics

Extraction failure is `FAILED`, not `ABSENCE`.
No text found is not equivalent to a scientific fact not being present in the source unless the search scope and extraction completeness support that conclusion.
