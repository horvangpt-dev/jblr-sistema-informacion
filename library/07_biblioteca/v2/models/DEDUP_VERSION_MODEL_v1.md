# DEDUP_VERSION_MODEL_v1

Version: 1.0.0

## Distinctions

`DUPLICATE != VERSION`
`VERSION != SUPERSEDED`
`SUPERSEDED != DELETED`

## Exact duplicate detection

Primary evidence:
1. SHA-256
2. file size
3. binary identity confirmation

An exact hash match is treated as the same managed binary unless an explicit preservation exception is recorded.

## Probable duplicate detection

Use, in order:
- normalized title
- authors/institution
- year
- source identifier / publication
- page count or extent
- content similarity

Probable duplicates are never merged silently.

## Version relations

A distinct edition/revision/language manifestation receives its own `SOURCE_ID`.
Relations may include:
- `version_of`
- `supersedes`
- `superseded_by`
- `translation_of`
- `supplement_to`
- `annex_to`

## Derivatives

A repacked, OCR, normalized or extracted artifact is not the raw source.
`raw != normalized`
Derivatives must preserve parent pointer and derivation description. They must not overwrite source provenance.

## Deletion

Deduplication never implies deletion. Any later deletion requires a separate authorized lifecycle rule outside 07.0–07.4.
