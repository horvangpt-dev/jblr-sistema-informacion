# L1 Opening Directive v1

Authority: `00000.V1 · DIRECCIÓN GENERAL JBLR`
Date: 2026-08-26
Action: `ACT.012 · Materializar L1`
Layer: `L1 · BACKBONE TAXONÓMICO`
Status: `OPEN / IN_PROGRESS`

## 1. Executive gate

`L0_DEPENDENCY_SUFFICIENT_FOR_L1 = YES`

L0 remains in overall completion work (`ACT.011 = IN_PROGRESS`) because non-blocking closure gaps remain. This does not imply full L0 closure. The L1 dependency gate is nevertheless satisfied by explicit executive acceptance.

No merge, promotion, or production write is authorized by this directive.

## 2. Exact source release

L1 MUST consume only the accepted taxonomy source pointer:

- Release: `JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3`
- Drive file ID: `1g1ark3uunwMwhNJoIdeAqUQg-ZXJIGME`
- SHA-256: `d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71`
- Hubs: `3033`
- RC2 inherited hubs: `2210`
- New hubs: `823`
- Rioja source rows: `2262`
- Source attribute loss: `0`

Do not rebuild RC3. Do not substitute a draft. Do not rerun the superseded EIDOS path.

## 3. Permanent invariants

- `ONE_JBLR_SYSTEM = ACTIVE`
- `ONE_TAXONOMY = ACTIVE`
- `NAME != IDENTITY`
- `SOURCE_RECORD != TAXON_IDENTITY`
- `raw != normalized != validated`
- `unknown != zero`
- `unknown != absence`
- `not_found != absence`
- `COPY_NEVER_MOVE = ACTIVE`
- history and provenance MUST be preserved.

L1 materializes accepted taxonomy; it does not redefine botanical semantics by technical convenience.

## 4. Canonical L1 sequence

Execute in roadmap order:

- `L1.00` Select and bind the accepted source release.
- `L1.01` Build the reproducible taxonomy release package.
- `L1.02` Define identity schemas.
- `L1.03` Define ID and alias/substitution rules.
- `L1.04` Build the release validator.
- `L1.05` Build the idempotent normalizer/importer.
- `L1.06` Map external IDs with provenance.
- `L1.07` Preserve taxonomy history and supersession.
- `L1.08` Load to STAGING only after an explicit write gate; production remains prohibited.
- `L1.09` Build the deterministic taxonomy service.
- `L1.10` Build the taxonomy API and OpenAPI contract.
- `L1.11` Build regression tests.
- `L1.12` Run source→import→DB→service→API end-to-end QA.
- `L1.13` Return the candidate L1 release to `00000` for acceptance and handoff.

## 5. First execution packet

`CURRENT_EXECUTION_PACKET = L1_PACKET_01`

Authorized implementation scope:

`L1.00 → L1.04`

The first packet must establish the exact source binding, reproducible package contract, identity schemas, ID rules, and release validator before any database loading.

Database writes are not authorized in this packet.

## 6. Environment and safety

- Development and CI work must occur on branch `l1-taxonomy-backbone-20260826`.
- Starting parent is the live-runtime validated L0 HEAD `6354ebdee4cea90c207061f625b25ff0b1d0fbec`.
- Reuse the L0 foundation; do not create a second framework, second database, or second migration authority.
- Sqitch remains the versioned SQL migration authority.
- Production writes: `0`.
- STAGING writes: `0` until the later explicit `L1.08` write gate.
- Secrets must remain ephemeral and outside repository artifacts/logs.

## 7. Parallel work

`ACT.002` and `ACT.003` continue in parallel.

`ACT.006` remains blocked until both are sufficient. Opening L1 does not infer their closure and does not open L2.

## 8. Required return to 00000 after L1_PACKET_01

Report at minimum:

- restore status and divergence status;
- exact branch HEAD and compare to L0 parent;
- exact RC3 source identity and hash verification status;
- L1.00–L1.04 status individually;
- files/artifacts created or modified;
- tests and CI run/job IDs;
- invariant results and row/count preservation checks;
- production writes and staging writes (both must remain zero in Packet 01);
- blockers and non-blocking gaps;
- recommendation for the next L1 packet;
- `AWAITING_EXECUTIVE_GATE = YES`.

No L2 opening, merge, promotion, or production write may be inferred from a PASS.