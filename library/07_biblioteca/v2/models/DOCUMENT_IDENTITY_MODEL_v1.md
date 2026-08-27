# DOCUMENT_IDENTITY_MODEL_v1

Version: 1.0.0

## Identity separation

`SOURCE_FAMILY_ID != SOURCE_ID != LIB_FILE_ID`

### SOURCE_FAMILY_ID
Identity of an intellectual work, documentary family, series, manual-plus-annex set, or other logically related source family.

Format for new V2 identities:
`JBLR-SFAM-000001`

### SOURCE_ID
Identity of a concrete documentary manifestation: edition, revision, publication instance, language manifestation, or formally distinct issued version.

Format:
`JBLR-SRC-000001`

### LIB_FILE_ID
Identity of an exact file/binary managed by JBLR.

Format:
`JBLR-LIB-000001`

`LIB_FILE_ID` never depends on filename, folder, language, title or institution.

## Provenance multiplicity

One `SOURCE_ID` may have multiple physical provenance occurrences. Each occurrence is recorded by pointer and does not automatically create another managed binary.

## Hash rule

If an incoming file has an identical verified SHA-256 to an existing managed binary:
- do not create a silent duplicate;
- attach the new provenance occurrence to the existing `LIB_FILE_ID`;
- preserve the discovery record;
- require an explicit exceptional reason before storing a second physical copy.

## Historical IDs

V1 identifiers such as `JBLR-LIB-FI-*`, `JBLR-LIB-RIOJA-*`, `JBLR-LIB-SER-*` are preserved in `legacy_ids`. They are not silently rewritten into V2 identities.
