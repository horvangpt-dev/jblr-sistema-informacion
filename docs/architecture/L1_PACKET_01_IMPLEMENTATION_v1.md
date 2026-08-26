# L1_PACKET_01 · Reproducible taxonomy backbone

Authority: `00000.V1 · DIRECCIÓN GENERAL JBLR`  
Actor: `L1`  
Scope: `L1.01`–`L1.04`  
Source: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3`

## L1.01 — reproducible release package

Reproduction starts from the exact Drive object bound by L1.00. The builder rejects the input before extraction unless its SHA-256 matches the frozen source pointer, then creates a deterministic ZIP using lexicographic entry order, fixed ZIP timestamps, fixed compression and canonical JSON. The resulting package embeds the exact RC3 bytes plus the L1 contracts. The package is persisted in Drive, while GitHub persists the contracts, validator, tests and build evidence. A same-name or rebuilt source file is not equivalent without the exact source hash.

Pipeline:

`INPUT RC3 -> BYTE HASH -> INTERNAL VALIDATION -> L1 PACKAGE -> L1 MANIFEST -> OUTPUT SHA-256`

No botanical reinterpretation occurs during packaging.

## L1.02 — identity schemas

`contracts/taxonomy/identity_schema_v1.json` separates:

- `TAXON_CONCEPT`
- `TAXONOMIC_NAME`
- `SOURCE_RECORD`
- `IDENTIFICATION`
- `EXTERNAL_IDENTIFIER`
- `ALIAS`
- `SUPERSESSION / REPLACEMENT RELATION`

For RC3 materialization, `taxon_identity_hub_key` is the concept identity key. Display names and source names remain names/records, not identities.

## L1.03 — ID, alias and supersession rules

The rules contract is machine-readable. It forbids name-derived identity, silent merges, historical deletion, alias-created collapse and unprovenanced supersession. It also rejects supersession cycles. RC3 contains no L1 alias or supersession assertions in this packet, so both relation files begin with zero rows. Zero means “not asserted by this packet”, not external absence.

## L1.04 — release validator

The validator fails closed on:

- top-level source hash mismatch;
- internal file set/hash/size mismatch;
- row-count mismatch;
- field-set/attribute mismatch;
- duplicate identity/identifier keys;
- `taxon_work_key != taxon_identity_hub_key`;
- broken or mismatched source-to-concept references;
- missing mandatory source provenance;
- manifest count/hash inconsistency;
- failed RC3 QA invariants;
- invalid aliases;
- broken/cyclic supersession relations.

The validator returns only `PASS` or `FAIL` with structured evidence.

## Write boundary

`STAGING_WRITES = 0`  
`PRODUCTION_WRITES = 0`  
`MIGRATIONS = 0`
