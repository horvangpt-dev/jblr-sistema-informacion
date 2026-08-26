# ADR-0002 · Drive Asset Identity Mapping

Date: 2026-08-26
Status: ACCEPTED_FOR_L0

## Context

JBLR requires Google Drive for heavy/human assets and Neon for structured operational knowledge. Existing Neon table `evidence.digital_asset` already provides `asset_id`, `resource_id`, `storage_uri`, checksums, size, media type, original filename, timestamps, rights/terms, metadata and notes. It does not currently expose a dedicated `drive_file_id` column in the inspected schema.

## Decision

L0 will not create a competing asset table.

The programmatic Drive adapter uses `drive_file_id` as the external persistent identity. Its stable storage URI representation is:

`gdrive://<drive_file_id>`

The adapter also exposes `drive_file_id` explicitly in structured metadata.

Human Drive paths and filenames are descriptive metadata only and MUST NOT be used as persistent identity.

The adapter is metadata-only. Binary content remains in Google Drive and is not duplicated into PostgreSQL by this capability.

## Database consequence

No production schema mutation is authorized by this ADR. A future versioned Sqitch migration may add a dedicated `drive_file_id` field or equivalent normalized relation only after the existing migration definitions are recovered/reconciled and the change is tested in DEV/STAGING.

Until then, this ADR defines the application-side identity contract without silently asserting a schema change that has not happened.

## Recovery

The adapter is additive and isolated on the L0 branch. Removing it does not mutate Drive or Neon assets.
