# L1_PACKET_02 · Normalization, external-ID mapping and history

Authority: `00000.V1 · DIRECCIÓN GENERAL JBLR`
Action: `ACT.012 · MATERIALIZAR L1`
Scope: `L1.05 + L1.06 + L1.07`
Source: byte-exact accepted `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3`

## Boundary

This packet is dry-run only. It performs no DEV data persistence, no STAGING write, no Neon data write, no production write and no migration. L1.08 remains closed.

## L1.05

The importer validates the RC3 byte hash, reads hub/source/evidence rows, preserves `taxon_identity_hub_key` exactly as `taxon_concept_id`, keeps source records separate, and builds deterministic prepared-load entities. Record IDs for names, mappings and history are derived only from stable accepted identifiers/source pointers, never from taxonomic names.

Idempotency is proved with a fail-closed in-memory upsert simulation: identical stable-key payloads are unchanged on replay; a stable key with a different canonical payload raises a conflict and is never overwritten.

## L1.06

Only accepted RC3 fields/evidence are mapped. No web/external harvest occurs. Mapping evidence includes RC3 `ID_TAXON_GOBIERNO`, explicit source `rioja_id`, resolved Actor 06 selected official IDs and inherited-ID evidence. Repeated evidence for one semantic mapping is preserved. A scheme/value that points to more than one concept is a failure. Missing IDs remain UNKNOWN; Actor 06 CONFLICT rows remain explicit conflicts.

## L1.07

Every RC3 concept receives a history record. `predecessor_release_row_id` is preserved as release lineage, not converted to supersession. Historical-ID aliases are created only from explicit `PREVIOUS_ID_TAXON_JBLR` values; RC3 currently contains none. Supersession remains empty because RC3 contains no explicit accepted supersession relation. The validator rejects broken relation endpoints, missing provenance/reasons and directed cycles.

`ZERO_RELATION_ROWS != EXTERNAL_ABSENCE`.
