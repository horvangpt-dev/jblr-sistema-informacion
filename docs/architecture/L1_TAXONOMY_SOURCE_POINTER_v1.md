# L1 Taxonomy Source Pointer v1

Authority: `00000.V1 · DIRECCIÓN GENERAL JBLR`
Action: `ACT.012`
Step: `L1.00 · Seleccionar release fuente`
Status: `PASS / SOURCE_BOUND`
Date: 2026-08-26

## Accepted source

- Release ID: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3`
- Drive file ID: `1g1ark3uunwMwhNJoIdeAqUQg-ZXJIGME`
- Drive filename: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3_CANDIDATE_QA_PASS.zip`
- Expected SHA-256: `d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71`
- Observed SHA-256 from downloaded Drive bytes: `d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71`
- Hash verification: `PASS`

## Manifest identity observed

The ZIP contains `MANIFEST.json`, `QA_FINAL.json`, `SUCCESSOR_SUMMARY.json`, hub JSONL parts, source-routing JSONL parts and inherited-ID-evidence JSONL parts.

Observed manifest identity/counts:

- `releaseId = JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3`
- hubs = `3033`
- RC2 inherited hubs = `2210`
- new official hubs = `562`
- new temporary hubs = `261`
- source rows = `2262`
- source-to-RC2 = `1435`
- source-to-new-official = `566`
- source-to-new-temporary = `261`
- inherited official evidence deferred = `1405`

Observed manifest guards:

- RC2 mutation = `0`
- database writes = `0`
- Neon writes = `0`
- parent ID inheritance = `0`
- rank collapse = `0`
- hybrid collapse = `0`
- silent name replacement = `0`

## QA observed

`QA_FINAL.json` reports:

- RC2 values changed = `0`
- RC2 rows lost = `0`
- Rioja source rows expected/preserved = `2262/2262`
- source attribute loss = `0`
- final 309 rows accounted = `309`
- taxon work key duplicates = `0`
- active ID duplicates = `0`
- temp ID reuse = `0`
- parent ID inheritance = `0`
- rank collapse = `0`
- hybrid collapse = `0`
- silent name replacement = `0`
- unresolved excluded = `0`
- conflict excluded = `0`
- `QA_FINAL = PASS`

## Binding rule

L1 MUST use this exact Drive object and exact byte hash as its source release. A same-name file, draft, rebuilt package or later replacement is not equivalent unless a later canonical event explicitly supersedes this pointer.

This step does not reinterpret the historical manifest field `releaseState = CANDIDATE_QA_PASS_PENDING_0000_ACCEPTANCE`; the later canonical acceptance event is the authority that promoted this exact byte-identical package to the accepted L1 source.

`NAME != IDENTITY`
`SOURCE_RECORD != TAXON_IDENTITY`
`COPY_NEVER_MOVE = ACTIVE`

No database write, staging load, merge, promotion or production write is authorized by this source-binding artifact.

## L1.00 gate

`SOURCE_POINTER_UNAMBIGUOUS = YES`
`SOURCE_BYTES_HASH_VERIFIED = YES`
`SOURCE_RELEASE_ACCEPTED_CANONICALLY = YES`
`L1.00 = PASS`

Next roadmap step: `L1.01 · Materializar paquete reproducible`.