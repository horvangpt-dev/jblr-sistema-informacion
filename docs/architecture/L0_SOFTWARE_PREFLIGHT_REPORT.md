# L0_SOFTWARE_PREFLIGHT_REPORT

Date: 2026-08-26
Actor: L0 · FUNDACIÓN SOFTWARE · SISTEMA JBLR
Authority: 00000 · DIRECCIÓN GENERAL JBLR
Status: PASS
Mode: REALITY_FIRST · READ_ONLY_PREFLIGHT

## Restored direction

Authoritative references restored before code:
- 00000 · JBLR · NORTH STAR Y ARQUITECTURA MAESTRA
- 00000 · JBLR · CONTROL TOWER
- 00000 · JBLR · PROTOCOLO DE RESTAURACIÓN Y ARRANQUE
- 00000 · JBLR · CONTROL DE RECURSOS Y HERRAMIENTAS
- HOJA DE RUTA TÉCNICA DE CONSTRUCCIÓN DEL SISTEMA JBLR vigente

No code or database mutation was performed before this preflight.

## Live source baselines

### GitHub
Repository: `horvangpt-dev/jblr-sistema-informacion`

Default branch: `main`.

Active cumulative successor inspected: `0000-v17-successor-rioja-2262`.

Inspected HEAD:
`7626679fe65243b1448ff4ce687ffb7d76e2addf`

HEAD message:
`decision(0000-v18): accept RC3 canonical successor after final QA`

Tree SHA:
`6e994fa8f22e1dde07f0afd861ecfc77df201046`

Important: no branch named `0000-v18-successor-rioja-2262` exists at preflight time. V18 execution evidence is contained in the cumulative successor branch above.

L0 work branch created from exactly that HEAD:
`l0-software-foundation-20260826`

### Neon
Project name: `jblr-01-6-staging-zero-cost-20260815`
Project ID: `crimson-hall-16978747`

Actual PostgreSQL server: PostgreSQL 17.7.

Primary/default branch name: `production`.
Primary branch ID: `br-polished-pond-b24mvk11`.

Other branches observed:
- `validation-01-6-final-20260815`
- `validation-01-6-20260815`

All database inspection during this preflight was read-only.

## 1. Repository structure

Observed mature material is concentrated under:
- `.github/workflows/`
- `db/baseline/parts/`
- `execution/0000/`
- `execution/06/`
- `execution/08/`
- `execution/09/`

The target foundation layout (`docs/`, `registry/`, `src/`, canonical `tests/`, `scripts/`) is not yet established as a coherent top-level software product.

Classification: `WRAP` existing reality; add foundation structure non-destructively.

## 2. Languages

Observed:
- Python: substantial scientific, taxonomy, enrichment, reconciliation and ETL scripts.
- JavaScript/Node.js: substantial execution/control-plane code and tests.
- R: specialized diagnostic/source tooling.
- SQL: baseline/schema material.
- YAML: GitHub Actions.

Classification:
- Python: `KEEP + WRAP`
- JavaScript/Node.js: `KEEP + WRAP`
- R: `KEEP`, usage-specific inspection later
- SQL: `KEEP`

## 3. Packages and dependencies

Node package inspected:
`execution/08/package.json`

Facts:
- package name: `jblr-actor-08-execution-control-plane`
- version: `1.0.0`
- CommonJS
- Node engine: `>=22`
- tests: `node --test test/*.test.js`
- no external dependencies declared in that package file

No canonical root Python dependency manifest (`pyproject.toml` or `requirements.txt`) was identified in the inspected cumulative tree.

Classification:
- Node package: `KEEP`
- Python environment management gap: `L0_REQUIRED`

## 4. Scripts

Many execution scripts exist under actors 0000, 06, 08 and 09. Examples include taxonomy/synonym processing, Rioja spatial indexing, MITECO-related processing and analytical enrichment.

These scripts contain accumulated operating knowledge and MUST NOT be rewritten merely for stylistic uniformity.

Classification: `KEEP`; selected mature capabilities later `WRAP` behind stable interfaces.

## 5. Workflows

The repository contains many task-specific GitHub Actions workflows. The inspected workflow `0000-v17-successor-rioja-preflight.yml`:
- runs on Ubuntu;
- validates an authorization JSON;
- runs Python scripts;
- commits generated evidence;
- uses scoped GitHub `contents: write` permission.

Current workflows are execution/history oriented, not yet a unified L0 CI pipeline.

Classification: existing workflows `KEEP`; foundation CI `L0_REQUIRED`.

## 6. Tests

Observed:
- Node tests under `execution/08/test/`, executed with Node's built-in test runner.
- at least one Python test in the execution tree.
- no canonical top-level unified Python test environment/configuration identified.

Classification:
- existing tests: `KEEP`
- unified foundation test system: `L0_REQUIRED`

## 7. Python code

Python is already a major implementation language in current JBLR reality.

No evidence supports replacing valid JS with Python.

Decision implication: Python is confirmed for the new backend/scientific foundation, while existing valid JS remains operational.

Classification: `KEEP + WRAP`.

## 8. JavaScript / Node.js code

Operational control-plane and analytical code exists and has tests. Node >=22 is explicitly declared in the inspected package.

Classification: `KEEP + WRAP`; no mass rewrite.

## 9. Other languages

R exists for specialized diagnostics/source work. SQL is already foundational for the database baseline. YAML defines automation.

Classification: `KEEP`; consolidate interfaces rather than languages.

## 10. Neon schemas and tables

Schemas observed:
- `analytics`
- `core`
- `evidence`
- `field`
- `governance`
- `material`
- `migration_staging`
- `public`
- `security`
- `sqitch`
- `taxonomy`

Observed counts:
- 98 base tables total
- 10 views total

By schema, base tables / views:
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

Neon contains an active Sqitch registry with three deployed changes:
1. `01_6_preflight_environment`
2. `01_6_release_candidate`
3. `01_6_release_candidate_extras`

Observed Sqitch tag:
`01.6-preproduction-rc3`

`governance.schema_release` exists but contained zero rows at preflight time.

No Sqitch project/configuration path was identifiable in the inspected cumulative Git tree.

Classification:
- SQL baseline: `KEEP`
- Sqitch as deployed migration authority: `KEEP + WRAP`
- Git/DB migration-definition mismatch: `L0_REQUIRED`
- introduction of Alembic as a second authority: `DEPRECATE_WITH_EVIDENCE` as an L0 default proposal; do not introduce unless later evidence justifies it.

## 12. Neon branches

Observed exactly three branches: primary `production` plus two historical validation branches.

Classification: `KEEP`; add isolated L0 development branch only under explicit environment policy.

## 13. DEV / STAGING / PRODUCTION

Current environment separation is not clean:
- project name contains `staging`;
- primary/default branch is named `production`;
- no branch explicitly named DEV or STAGING was observed;
- primary branch is not protected at preflight time.

Classification: `L0_REQUIRED`.

This is a governance/configuration risk, not evidence of data corruption.

## 14. Configuration mechanisms

Observed configuration is distributed across:
- GitHub Actions workflow definitions;
- actor/package-local files;
- JSON execution authorization/state files;
- Neon branch/project state.

No single canonical L0 application configuration layer was identified.

Classification: `WRAP + L0_REQUIRED`.

## 15. Secrets / credentials required

Required capability classes, without values:
- GitHub repository/action credential context;
- Neon/PostgreSQL connection credential;
- Google Drive API authorization credential for future asset adapter.

Exact canonical environment-variable names and secret-store mapping are not yet established by L0.

No secret value is recorded in this report.

Classification: `UNKNOWN_REQUIRES_INSPECTION` for existing canonical naming; secrets policy `L0_REQUIRED`.

## 16. Current Google Drive integration

Google Drive is an authoritative live repository for JBLR direction and human/heavy assets. L0 successfully restored governance documents through the connected Drive interface.

No dedicated Drive adapter implementation was identifiable by repository path/name inspection in the cumulative Git tree.

The existing database already has `evidence.digital_asset` with:
- `asset_id`
- `resource_id`
- `storage_uri`
- `sha256`
- `bytes`
- `media_type`
- `original_filename`
- timestamps, rights/terms, metadata and notes

Therefore L0 must integrate with the existing asset model rather than create a competing identity system.

Classification: repository adapter `L0_REQUIRED`; database asset model `KEEP + WRAP`.

## 17. Reusable code

High reuse value:
- existing Python analytical/scientific scripts;
- Node control-plane and tests;
- spatial indexing code;
- existing baseline SQL;
- existing GitHub Actions patterns;
- existing Neon schema and evidence model.

Classification: `KEEP + WRAP`.

## 18. Experimental code

The `execution/` tree contains many batch-specific, pilot, diagnostic, preflight and evidence-generation artifacts. Experimental status cannot be inferred solely from filenames for every file.

Classification: `UNKNOWN_REQUIRES_INSPECTION` per capability. Preserve history.

## 19. Technical debt

Verified debt/gaps:
- sparse root product structure;
- minimal root README;
- fragmented Python environment;
- no unified application/API foundation;
- many task-specific workflows but no unified CI foundation;
- migration history exists in Neon but migration definitions are not clearly co-located in inspected Git reality;
- environment naming ambiguity;
- historical/generated evidence occupies the source repository extensively.

Classification: `L0_REQUIRED` remediation, non-destructive.

## 20. Duplications

Potential duplication exists among successive actor/batch implementations and generated evidence artifacts. Exact semantic duplication requires file-level comparison and is not asserted from names alone.

Classification: `UNKNOWN_REQUIRES_INSPECTION`.

Rule: do not delete history; future canonical wrappers may supersede duplicated implementations while retaining originals.

## 21. Migration risks

Primary risks:
- treating the branch called `production` as a sandbox;
- introducing a second migration authority beside Sqitch;
- rewriting valid JS/Python/R code for aesthetic uniformity;
- conflating Drive path names with persistent asset identity;
- assuming PostgreSQL 18 when live infrastructure is 17.7;
- moving/deleting historical execution evidence;
- binding new APIs directly to undocumented internal tables before stable contracts exist.

Mitigation: isolated branches, additive changes, tests, explicit ADRs, versioned contracts, no production writes.

## 22. Gaps required for L0

Required next capabilities:
- canonical additive foundation directory structure;
- technology ADR;
- reproducible Python environment;
- minimal FastAPI `/health` and `/version` API;
- OpenAPI contract;
- safe environment-aware DB connection layer;
- reconciliation of Git versioned migration definitions with deployed Sqitch state;
- unified tests and GitHub Actions CI;
- Google Drive asset adapter using stable file identity;
- logging and run_id;
- secrets/configuration policy;
- DEV/STAGING/PRODUCTION policy;
- operational README.

## Technology conclusion from preflight

Python is confirmed for new backend/scientific foundation work because Python already has substantial JBLR reality and fits the required API/scientific stack.

JavaScript/Node remains a first-class preserved implementation language where existing code is valid.

R remains allowed for specialized workflows.

Database migration authority for L0 defaults to existing Sqitch/versioned SQL, not a new Alembic authority.

PostgreSQL 18 is NOT current reality. Current reality is PostgreSQL 17.7. Upgrade assessment is `MIGRATE_LATER`, not part of the first L0 foundation packet.

## Stop-condition review

- DATA_LOSS_RISK: NO current mutation
- PRODUCTION_MUTATION_RISK: CONTROLLED; zero production writes performed
- SOURCE_CORRUPTION: NOT OBSERVED
- IDENTITY_COLLISION: NOT OBSERVED
- UNRECOVERABLE_SCHEMA_CONFLICT: NOT OBSERVED
- SECRET_EXPOSURE: NOT OBSERVED
- BROKEN_PROVENANCE: NOT OBSERVED
- HISTORY_DESTRUCTION_RISK: avoided by additive branch
- UNRESOLVED_ARCHITECTURE_CONTRADICTION: NO
- NEED_FOR_NON_DERIVABLE_HUMAN_DECISION: NO at this stage

PRE-FLIGHT RESULT = PASS
