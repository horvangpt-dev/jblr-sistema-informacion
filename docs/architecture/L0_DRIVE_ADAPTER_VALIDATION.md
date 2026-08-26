# L0.10 · GOOGLE DRIVE ASSET ADAPTER · VALIDATION

Date: 2026-08-26
Status: PARTIAL_LIVE_VALIDATION_PASS

## Contract under test

The L0 adapter must:
- locate an asset by stable Google Drive `file_id`;
- retrieve metadata;
- demonstrate access;
- expose structured metadata for later association;
- avoid binary duplication in PostgreSQL.

## Unit implementation

Application module:
`src/jblr/integrations/drive_assets.py`

The adapter accepts `file_id`, requests metadata, rejects identity mismatch, normalizes provider access errors, emits `gdrive://<file_id>` and contains no binary-download method.

Unit tests cover:
- stable ID lookup;
- metadata/checksum mapping;
- identity mismatch rejection;
- access failure normalization;
- absence of binary/content payload fields.

## Live Drive evidence

Reference asset used:
`00000 · JBLR · NORTH STAR Y ARQUITECTURA MAESTRA`

Drive file ID:
`1ueDylJoQK60icM7YTVHi_JhOYpAKR-58c8M3t21Cvso`

Live metadata lookup returned the same ID, Google Docs MIME type, filename/title, size and timestamps.

The same file was successfully read earlier during L0 direction restoration, demonstrating authenticated content access through the connected Drive interface.

Because this is a native Google Doc, checksum fields were not returned in the live metadata response. This is treated as unknown/not supplied, not as an empty or zero checksum.

## Database interaction

No binary was written to Neon.
No asset row was written to Neon during this validation.
Production writes remain 0.

The existing `evidence.digital_asset` model remains the structured asset model to wrap. No competing table was created.

## Remaining integration boundary

The pure-Python adapter has not yet been executed with a production-style Google API credential inside a deployed JBLR runtime. Current live validation used the authorized Drive connector while unit tests validate the adapter protocol shape.

Therefore:
- metadata contract: PASS
- stable identity contract: PASS
- live authenticated Drive access: PASS through connected interface
- deployed Python credential wiring: OPEN
- binary non-duplication invariant: PASS by implementation and zero database writes
