# L0_SOFTWARE_PREFLIGHT_REPORT

Date: 2026-08-26
Actor: L0 · FUNDACIÓN SOFTWARE · SISTEMA JBLR
Authority: 00000 · DIRECCIÓN GENERAL JBLR
Status: PASS
Mode: REALITY_FIRST · NON_DESTRUCTIVE

## Restoration

Restored before application code:
- 00000 · JBLR · NORTH STAR Y ARQUITECTURA MAESTRA
- 00000 · JBLR · CONTROL TOWER
- 00000 · JBLR · PROTOCOLO DE RESTAURACIÓN Y ARRANQUE
- 00000 · JBLR · CONTROL DE RECURSOS Y HERRAMIENTAS
- HOJA DE RUTA TÉCNICA DE CONSTRUCCIÓN DEL SISTEMA JBLR vigente

`RESTORATION = PASS`

## Live baselines

### GitHub

Repository: `horvangpt-dev/jblr-sistema-informacion`

Default branch: `main`.

Cumulative predecessor inspected before L0 creation:
`0000-v17-successor-rioja-2262`

Verified predecessor HEAD:
`7626679fe65243b1448ff4ce687ffb7d76e2addf`

Message:
`decision(0000-v18): accept RC3 canonical successor after final QA`

L0 branch was created from exactly that HEAD:
`l0-software-foundation-20260826`.

### Neon

Project: `jblr-01-6-staging-zero-cost-20260815`
Project ID: `crimson-hall-16978747`

PostgreSQL verified by direct SQL:
`18.6 (3484359)`.

Primary/default branch:
`production` (`br-polished-pond-b24mvk11`).

Historical branches verified:
- `01.6-fix1-validation-20260815` (`br-royal-salad-b25qgcso`)
- `01.6-sqitch-cli-certified-20260815` (`br-quiet-pine-b2hj8lb2`)

L0 DEV created after preflight:
`l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`), parent = primary.

Production SQL by L0: read-only only.
Production writes by L0: `0`.

## Reality corrections preserved

Two earlier observations were superseded after direct revalidation:

1. PostgreSQL had initially been reported as 17.7. Direct `current_setting('server_version')` on primary and L0 DEV returned 18.6. Current truth = 18.6.

2. An early Sqitch read was summarized with incorrect `01_6_*` change labels. Direct query of `sqitch.changes` and `sqitch.tags` returned the actual registry shown below. Current truth is the directly verified registry.

Earlier states remain recoverable in Git history; corrections are not silent.

## 1. Repository structure

Pre-L0 mature material was concentrated under:
- `.github/workflows/`
- `db/baseline/parts/`
- `execution/0000/`
- `execution/06/`
- `execution/08/`
- `execution/09/`

No coherent top-level Python product foundation existed.

Classification: `KEEP + WRAP`; additive L0 structure required.

## 2. Languages

Observed:
- Python
- JavaScript/Node.js
- R
- SQL
- YAML

Classification:
- Python: `KEEP + WRAP`
- JavaScript/Node.js: `KEEP + WRAP`
- R: `KEEP`
- SQL: `KEEP`

## 3. Packages and dependencies

Inspected `execution/08/package.json`:
- `jblr-actor-08-execution-control-plane`
- CommonJS
- Node `>=22`
- tests: Node built-in test runner
- no external dependencies declared there

No canonical root Python dependency manifest existed before L0.

Classification: Node package `KEEP`; reproducible Python environment `L0_REQUIRED`.

## 4. Scripts

Many operational/scientific scripts exist for taxonomy, enrichment, reconciliation, Rioja spatial work, MITECO and execution control.

Classification: `KEEP`; mature capabilities later `WRAP`. No aesthetic rewrite.

## 5. Workflows

Many historical/task-specific GitHub Actions workflows exist. They encode useful execution evidence and patterns but did not provide a unified L0 CI layer.

Classification: historical workflows `KEEP`; unified L0 CI `L0_REQUIRED`.

## 6. Tests

Observed Node tests and Python test material, but no unified top-level Python test harness before L0.

Classification: existing tests `KEEP`; L0 unified tests `L0_REQUIRED`.

## 7. Python

Python is already a major implementation language. Confirmed for new backend/scientific foundation.

Classification: `KEEP + WRAP`.

## 8. JavaScript / Node.js

Valid operational control-plane code exists and must not be rewritten merely for uniformity.

Classification: `KEEP + WRAP`.

## 9. Other languages

R remains justified for specialized scientific/diagnostic workflows. SQL remains foundational. YAML remains automation configuration.

Classification: `KEEP`.

## 10. Neon schemas and tables

Schemas observed:
`analytics`, `core`, `evidence`, `field`, `governance`, `material`, `migration_staging`, `public`, `security`, `sqitch`, `taxonomy`.

Inventory at preflight:
- 98 base tables total
- 10 views total

Base tables / views:
- analytics: 5 / 0
- core: 8 / 0
- evidence: 11 / 2
- field: 14 / 1
- governance: 9 / 0
- material: 7 / 0
- migration_staging: 5 / 0
- public: 1 / 2
- security: 16 / 4
- sqitch: 6 / 0
- taxonomy: 16 / 1

PostGIS 3.5.2 and PostGIS topology are installed. Other observed extensions include vector, pg_trgm, fuzzystrmatch, btree_gin and btree_gist.

Classification: `KEEP`.

## 11. Baseline and migrations

GitHub contains baseline SQL fragments under `db/baseline/parts/`.

Live Neon Sqitch registry, directly revalidated:
1. `core_physical_model_v1`
2. `institutional_release_registry_v1`
3. `migration_staging_v1`

Live tag:
`@JBLR_DB_PREPROD_01_4_1.0.0-dev1`.

Historical Git inspection found the exact certified package under `db/sqitch` at commit `75b567d15d6b610939ccdc95009a8aa0d30dd8b6`, subtree SHA `cc14ca5da886fd1184d1aded53bd8755d058f8aa`.

L0 recovered that exact subtree by copy. Regression CI verified all three recovered deploy-script SHA-1 values against the live Neon `sqitch.changes.script_hash` values and verified the deployed tag.

Classification:
- baseline SQL: `KEEP`
- Sqitch/versioned SQL: `KEEP + WRAP`
- recovered versioned migration package: `KEEP`
- Alembic as parallel authority: `DEPRECATE_WITH_EVIDENCE` as default proposal; do not introduce without new evidence.

## 12. Neon branches

Primary plus historical validation/certification branches exist; L0 now also has isolated DEV.

Classification: `KEEP`.

## 13. DEV / STAGING / PRODUCTION

Current naming is ambiguous:
- project name contains `staging`;
- primary/default branch is named `production`;
- primary branch is not protected;
- no separate canonical branch explicitly named `staging` was verified;
- L0 DEV exists explicitly.

Classification: environment policy `L0_REQUIRED`.

Production remains non-sandbox.

## 14. Configuration mechanisms

Configuration is distributed across workflows, actor/package files, execution JSON and Neon state. No single foundation configuration layer existed before L0.

Classification: `WRAP + L0_REQUIRED`.

## 15. Secrets / credentials required

Capability classes, values excluded:
- GitHub repository/action authorization context;
- PostgreSQL/Neon application connection authorization;
- Google Drive API authorization for the runtime adapter.

Historical 01.6 evidence also shows a passwordless Neon bootstrap approach that generated temporary credentials at runtime rather than storing a database password in Git.

Classification: no secret values persisted; L0 policy required.

## 16. Google Drive integration

Drive is already authoritative for human/heavy assets and was used to restore L0 direction.

Existing Neon table `evidence.digital_asset` already contains structured asset identity/metadata including `asset_id`, `resource_id`, `storage_uri`, `sha256`, `bytes`, `media_type`, `original_filename`, timestamps, rights/terms, metadata and notes.

No competing asset table is justified.

Classification: database asset model `KEEP + WRAP`; programmatic Drive adapter `L0_REQUIRED`.

## 17. Reusable code

High reuse value:
- existing Python scientific/analytical scripts;
- Node control-plane/tests;
- spatial code;
- baseline SQL;
- recovered Sqitch package;
- GitHub Actions patterns;
- existing Neon schemas/evidence model.

Classification: `KEEP + WRAP`.

## 18. Experimental code

`execution/` contains batch-specific, pilot, diagnostic and evidence-generation material. Experimental status cannot be inferred for every file solely from names.

Classification: `UNKNOWN_REQUIRES_INSPECTION` per capability. Preserve history.

## 19. Technical debt

Verified gaps at preflight:
- sparse root product structure;
- minimal root README;
- fragmented Python environment;
- no unified application/API foundation;
- no unified foundation CI;
- current branch had lost the historical `db/sqitch` package despite live deployment metadata;
- environment naming ambiguity;
- extensive generated evidence in source history.

Classification: non-destructive L0 remediation.

## 20. Duplications

Potential duplication exists among successive actor/batch implementations and generated outputs. Semantic duplication is not asserted without file-level comparison.

Classification: `UNKNOWN_REQUIRES_INSPECTION`.

Rule: history is not deleted.

## 21. Migration risks

Primary risks:
- treating primary `production` as sandbox;
- introducing a second migration authority;
- rewriting valid polyglot code;
- using Drive paths as persistent identity;
- deleting/moving historical evidence;
- binding new APIs directly to undocumented tables;
- trusting stale infrastructure observations without live revalidation.

Mitigation: isolated branches, additive changes, tests, ADRs, versioned contracts and zero production writes.

## 22. L0 gaps identified

Required foundation capabilities:
- repository reality map;
- technology ADR;
- reproducible Python environment;
- minimal FastAPI API;
- persisted OpenAPI;
- safe DB connection layer;
- versioned migration recovery/reconciliation;
- automated tests and CI;
- Drive asset adapter;
- structured logging/run_id;
- secrets/config policy;
- environment policy;
- operational README.

## Technology conclusion

- Python: confirmed for new backend/scientific foundation.
- FastAPI + Pydantic: confirmed for L0 API.
- Existing JS/Node: preserve.
- R: preserve where justified.
- PostgreSQL: current live version 18.6 on Neon.
- PostGIS: retain.
- Migrations: Sqitch/versioned SQL, recovered and validated.
- CI: GitHub Actions.

## Stop-condition review

- DATA_LOSS_RISK: NO
- PRODUCTION_MUTATION_RISK: controlled; production writes = 0
- SOURCE_CORRUPTION: NOT OBSERVED
- IDENTITY_COLLISION: NOT OBSERVED
- UNRECOVERABLE_SCHEMA_CONFLICT: NOT OBSERVED
- SECRET_EXPOSURE: NOT OBSERVED
- BROKEN_PROVENANCE: NOT OBSERVED
- HISTORY_DESTRUCTION_RISK: avoided
- UNRESOLVED_ARCHITECTURE_CONTRADICTION: NO
- NEED_FOR_NON_DERIVABLE_HUMAN_DECISION: NO

`PREFLIGHT = PASS`
