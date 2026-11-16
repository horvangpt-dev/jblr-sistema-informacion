# PAGE_EVIDENCE_INDEX_DESIGN_v1

Version: 1.0.0

## Objective

A retrieval result should be able to return:
- `LIB_FILE_ID`
- TITLE
- PAGE
- SECTION
- EXTRACT
- DRIVE_POINTER
- SOURCE_URL
- PROVENANCE

## Page record

Each page-level record should include:
- `LIB_FILE_ID`
- source hash
- page number in managed file
- printed page label when detectable
- extraction method
- text offset or fragment boundaries
- section heading when detectable
- evidence extract pointer
- page QA state

## Stability rule

Page evidence is bound to the exact managed file/hash. If a derivative has different pagination, it requires its own page map and explicit relation to the source.

## Section layer

Section indexing is additive and may point to one or more pages. Section boundaries must not be fabricated where the source does not expose them reliably.

## OCR

OCR page records are derivative evidence and retain extraction provenance.
