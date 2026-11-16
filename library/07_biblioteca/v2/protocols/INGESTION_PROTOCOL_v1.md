# INGESTION_PROTOCOL_v1

Version: 1.0.0
Status: DESIGN_ONLY — no mass ingestion authorized.

## Preconditions

1. Receive `CORPUS_SOURCE_LOCATION_MANIFEST` or an explicitly authorized source location.
2. Do not move source files.
3. Copy external-project corpus only when authorization requires copying into the library; otherwise inventory in place.
4. Preserve original location and provenance.
5. No automatic deletion or silent deduplication.

## Workflow

### 1. DISCOVERY
Enumerate candidate files and provenance pointers without changing them.

### 2. FIXITY OBSERVATION
Capture filename, MIME/format, file size and SHA-256 when available.

### 3. IDENTITY RESOLUTION
Resolve or allocate:
`SOURCE_FAMILY_ID → SOURCE_ID → LIB_FILE_ID`

Check historical V1 IDs and preserve them as `legacy_ids`.

### 4. EXACT DUPLICATE CHECK
Compare SHA-256 + size.
Exact match: reuse managed binary identity and add provenance occurrence; do not silently store another copy.

### 5. VERSION / FAMILY CHECK
Determine whether the candidate is a distinct edition, revision, translation, annex, supplement or other relation. Do not treat this as duplicate by default.

### 6. METADATA CAPTURE
Populate machine-readable metadata. Use controlled vocabulary values where applicable.
Never invent unknown metadata.

### 7. EPISTEMIC STATE
Where a relevant field lacks a known value, record its state explicitly:
`UNKNOWN`, `NOT_ASSESSED`, `NOT_APPLICABLE`, or `NOT_FOUND`.
Do not use ambiguous null as a substitute when epistemic state matters.

### 8. CANONICAL LOCATION
Record Drive/file pointer and all origin URLs or locations. Identity must survive rename/move.

### 9. CLASSIFICATION
Assign multi-value JBLR_AREA, PROCESS, SUBPROCESS and TOPICS plus document type/source class.

### 10. CONTENT CAPABILITY ASSESSMENT
Determine native-text availability. Prefer native text; queue OCR only when needed.

### 11. INDEX STATE
Record file, metadata, full-text, page and extraction states separately.

### 12. HUMAN VIEW MAPPING
Generate planned human pointers from:
`LANGUAGE → PURPOSE / PROCESS → ENTITY → DOCUMENT`
Do not create mass shortcuts during this phase.

### 13. QA
Validate schema, vocabulary consistency, referential integrity and provenance completeness.

### 14. COMMIT / AUDIT
Persist structured inventory change separately from raw source acquisition where practical.

## Prohibitions

- no source file moves without authorization
- no deletions
- no silent duplicate merges
- no silent historical-ID reinterpretation
- no replacing original-language source with translation
- no scientific fact canonicalization by 07
