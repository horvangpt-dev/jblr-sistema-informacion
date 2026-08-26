# L1.08 PREWRITE · Physical mapping and collision policy

Status: `PREWRITE_ONLY / NO DATABASE WRITES`

## Invariants

- `NAME != IDENTITY`.
- Existing STAGING UUIDs and JBLR codes are never reused because names overlap.
- `TWK-*` and `ID_TAXON_JBLR_*` remain source identifiers. They are never physical `core.resource.resource_id` or `core.resource.jblr_code` values.
- A future resource insert must generate a fresh PostgreSQL `uuidv7()` and pass `jblr_code = NULL`; the deployed `core.resource` trigger is the only code issuer.
- All 25,927 Packet02 prepared rows first cross the traceable `migration_staging.raw_record` boundary.
- No second staging schema is introduced.

## Live STAGING collision state

The read-only snapshot accounts for 23 pre-existing taxonomy rows: 2 terms, 6 concepts, 6 names, 4 name usages, 3 identifications, 1 external taxon reference, and 1 regional taxon assertion.

The accepted prewrite gate identifies nominal overlap candidates for Plantago major, Papaver rhoeas and Artemisia herba-alba. The ledger therefore quarantines the three live concepts, the three live names, and six dependent live objects. This is a review classification only; no identity merge is asserted.

## Physical materialization boundary

After a later explicit DML gate, clear taxon concepts may create `core.resource(TXC)` + `taxonomy.taxon_concept`, and clear names may create `core.resource(NAM)` + `taxonomy.taxonomic_name`. The three candidate concepts and six Packet02 name rows linked to those concepts remain quarantined until an explicit identity decision exists.

All name↔concept relation materialization is deferred: `taxonomy.name_usage` requires a non-null `treatment_resource_id` and a physical `usage_role`. The only treatment-like resource currently linked by the four demo usages is `JBLR-DOC-00000001`, explicitly titled as a STAGING demonstration treatment and explicitly documented as not constituting a taxonomic source or scientific validation. It is therefore not reused as an RC3 treatment. Packet02 roles `DISPLAY` and `VERBATIM_SOURCE` are also not silently translated into physical usage-role semantics. An ImportBatch is not silently treated as a taxonomic treatment.

Identifications and external taxon references are likewise deferred where their required physical target/source resources do not yet have an accepted semantic mapping.

Rank, authorship, genus and epithet fields are not inferred by the prewrite adapter. Where a future clear TXC/NAM insert is authorized, unsupported physical columns remain NULL or preserve verbatim text according to the accepted source; this phase does not add botanical interpretation.

---

# L1.08 PREWRITE · Future transaction and rollback plan

This document is a plan only. `L1.08_PREWRITE` does not execute DML, DDL, migrations, merge or promotion.

A later executive DML gate should use one fail-closed transaction. Before `BEGIN`, reverify the exact Git HEAD, Packet02 SHA-256, embedded RC3 SHA-256, live collision snapshot fingerprint, `migration_staging` state and the explicit 00000 authorization.

Inside the future transaction: register the exact accepted input, create the traceable import run, stage all prepared entities with deterministic source keys/fingerprints, quarantine all known or newly detected collisions, materialize only semantically clear TXC/NAM resources using fresh `uuidv7()` plus `jblr_code=NULL`, and register source mappings only after the physical target exists. `migration_staging.register_source_mapping` remains the remap guard.

Rollback is mandatory on any hash drift, live-object drift, new collision, duplicate source identity, remap attempt, provenance loss, count mismatch, incorrect resource type, direct assignment of `TWK-*`/`ID_TAXON_JBLR_*` as a JBLR code, unexpected code issuance, or any semantic requirement not supported by accepted evidence. No partial load may be committed.

A second execution against an unchanged source must reconcile to the same source keys/fingerprints and physical mappings. It must create no duplicate source identity and no second physical resource for an already mapped source identity.

`COMMIT` is not authorized by this plan. It requires a new 00000 gate after review of this prewrite package.
