# L0_SOFTWARE_PREFLIGHT_REPORT

Date: 2026-08-26
Actor: L0 · FUNDACIÓN SOFTWARE · SISTEMA JBLR
Authority: 00000 · DIRECCIÓN GENERAL JBLR
Status: PASS
Mode: REALITY_FIRST · NON_DESTRUCTIVE

## Restoration

The following superior references were restored before code:
- 00000 · JBLR · NORTH STAR Y ARQUITECTURA MAESTRA
- 00000 · JBLR · CONTROL TOWER
- 00000 · JBLR · PROTOCOLO DE RESTAURACIÓN Y ARRANQUE
- 00000 · JBLR · CONTROL DE RECURSOS Y HERRAMIENTAS
- HOJA DE RUTA TÉCNICA DE CONSTRUCCIÓN DEL SISTEMA JBLR vigente

No application code or database mutation was performed before the preflight.

## Live baselines

### GitHub
Repository: `horvangpt-dev/jblr-sistema-informacion`

Default branch: `main`.

Cumulative successor inspected: `0000-v17-successor-rioja-2262`.

Verified HEAD before L0 write:
`7626679fe65243b1448ff4ce687ffb7d76e2addf`

HEAD message:
`decision(0000-v18): accept RC3 canonical successor after final QA`

Tree SHA:
`6e994fa8f22e1dde07f0afd861ecfc77df201046`

No branch named `0000-v18-successor-rioja-2262` existed at verification time. V18 evidence is present inside the cumulative successor branch.

L0 branch created non-destructively from that exact HEAD:
`l0-software-foundation-20260826`.

### Neon
Project: `jblr-01-6-staging-zero-cost-20260815`
Project ID: `crimson-hall-16978747`

Current PostgreSQL server verified by direct SQL on both primary and L0 DEV:
`18.6 (3484359)`.

Primary/default branch:
- name: `production`
- id: `br-polished-pond-b24mvk11`
- protected: false at verification time

Historical validation/certification branches observed:
- `01.6-fix1-validation-20260815` (`br-royal-salad-b25qgcso`)
- `01.6-sqitch-cli-certified-20260815` (`br-quiet-pine-b2hj8lb2`)

L0 DEV branch created after preflight:
- `l0-dev-20260826`
- id: `br-fancy-snow-b2tlrwmb`
- parent: `br-polished-pond-b24mvk11`
- initial written_data_bytes reported by Neon: 0

Production SQL performed by L0: read-only only.
Production writes: 0.

### Reality correction preserved

An earlier preflight read had reported PostgreSQL 17.7 and different historical branch labels. Immediate revalidation by direct `current_setting('server_version')` on both primary and L0 DEV plus a fresh project description returned PostgreSQL 18.6 and the branch names above. Under REALITY_FIRST, the later direct verification supersedes the earlier observation. The erroneous first report remains recoverable in Git history; it is not silently erased.

## 1. Repository structure

Observed mature material is concentrated under:
- `.github/workflows/`
- `db/baseline/parts/`
- `execution/0000/`
- `execution/06/`
- `execution/08/`
- `execution/09/`

A coherent top-level foundation product (`docs`, `registry`, `src`, canonical `tests`, `scripts`) was not present before L0.

Classification: existing structure `KEEP + WRAP`; additive foundation structure `L0_REQUIRED`.

## 2. Languages

Observed:
- Python: substantial scientific, taxonomy, enrichment, reconciliation and ETL code.
- JavaScript/Node.js: execution/control-plane code and tests.
- R: specialized diagnostics/source tooling.
- SQL: database baseline/schema definitions.
- YAML: GitHub Actions.

Classification:
- Python: `KEEP + WRAP`
- JavaScript/Node.js: `KEEP + WRAP`
- R: `KEEP`
- SQL: `KEEP`

## 3. Packages and dependencies

Inspected `execution/08/package.json`:
- package: `jblr-actor-08-execution-control-plane`
- version: `1.0.0`
- CommonJS
- Node: `>=22`
- tests: `node --test test/*.test.js`
- no external dependencies declared there

No canonical root Python dependency manifest (`pyproject.toml` or `requirements.txt`) was identified in the inspected cumulative tree.

Classification: Node package `KEEP`; Python environment `L0_REQUIRED`.

## 4. Scripts

Many scripts exist under actors 0000, 06, 08 and 09, including taxonomy/synonym processing, Rioja spatial indexing, MITECO-related processing and analytical enrichment.

Classification: `KEEP`; mature capabilities later `WRAP`. No aesthetic rewrite.

## 5. Workflows

Many task-specific GitHub Actions workflows exist. The inspected `0000-v17-successor-rioja-preflight.yml` validates authorization JSON, runs Python, writes evidence and uses scoped `contents: write` permission.

Classification: historical/current workflows `KEEP`; unified foundation CI `L0_REQUIRED`.

## 6. Tests

Observed:
- Node tests under `execution/08/test/` using Node's built-in test runner.
- Python test material in the execution tree.
- no canonical unified top-level Python test harness identified.

Classification: existing tests `KEEP`; foundation test system `L0_REQUIRED`.

## 7. Python

Python is already a major JBLR implementation language. This confirms Python for the new backend/scientific foundation.

Classification: `KEEP + WRAP`.

## 8. JavaScript / Node.js

Operational JS/Node code and tests are already real and valid enough to preserve. No evidence supports a forced Python rewrite.

Classification: `KEEP + WRAP`.

## 9. Other languages

R remains justified for specialized workflows; SQL remains foundational; YAML remains automation configuration.

Classification: `KEEP`.

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

Counts at preflight:
- 98 base tables
- 10 views

Base tables / views by schema:
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

Neon Sqitch registry contains three deployed changes:
1. `01_6_preflight_environment`
2. `01_6_release_candidate`
3. `01_6_release_candidate_extras`

Observed tag:
`01.6-preproduction-rc3`.

`governance.schema_release` exists but had 0 rows on direct verification.

No Sqitch project/configuration path was identifiable in the inspected cumulative Git tree.

Classification:
- baseline SQL: `KEEP`
- deployed Sqitch authority: `KEEP + WRAP`
- Git/DB migration-definition reconciliation: `L0_REQUIRED`
- adding Alembic as a parallel authority: `DEPRECATE_WITH_EVIDENCE` as the default proposal; only reconsider with new evidence.

## 12. Neon branches

Before L0 DEV creation, the primary branch plus two historical validation/certification branches existed. L0 has now added one isolated child branch for development.

Classification: existing branches `KEEP`; L0 DEV `KEEP` while L0 is active.

## 13. DEV / STAGING / PRODUCTION

Current naming remains ambiguous:
- project name contains `staging`;
- primary/default branch is named `production`;
- primary branch is not protected;
- no separate branch explicitly named `staging` exists;
- L0 DEV now exists as `l0-dev-20260826`.

Classification: `L0_REQUIRED` for a formal environment policy. Production remains non-sandbox.

## 14. Configuration mechanisms

Observed configuration is distributed across GitHub Actions, actor/package-local files, JSON execution authorization/state and Neon project/branch state.

No single canonical foundation configuration layer was identified.

Classification: `WRAP + L0_REQUIRED`.

## 15. Secrets / credentials required

Credential classes required, values excluded:
- GitHub repository/action credential context;
- Neon/PostgreSQL application connection credential;
- Google Drive API authorization credential for the asset adapter.

Canonical environment-variable names and secret-store mapping are not yet established.

Classification: existing naming `UNKNOWN_REQUIRES_INSPECTION`; policy `L0_REQUIRED`.

## 16. Current Google Drive integration

Drive is already an authoritative human/heavy-asset repository and was used to restore L0 direction.

No dedicated Drive adapter implementation was identifiable by repository path/name inspection.

Existing `evidence.digital_asset` already provides asset identity and metadata fields including `asset_id`, `resource_id`, `storage_uri`, `sha256`, `bytes`, `media_type`, `original_filename`, timestamps, rights/terms, metadata and notes.

Classification: database asset model `KEEP + WRAP`; programmatic Drive adapter `L0_REQUIRED`. L0 must not create a competing asset identity model.

## 17. Reusable code

High reuse value:
- Python analytical/scientific scripts;
- Node control-plane and tests;
- spatial indexing code;
- baseline SQL;
- GitHub Actions patterns;
- existing Neon schema/evidence model.

Classification: `KEEP + WRAP`.

## 18. Experimental code

The `execution/` tree contains batch-specific, pilot, diagnostic, preflight and evidence-generation material. Experimental status cannot be inferred for every file solely from names.

Classification: `UNKNOWN_REQUIRES_INSPECTION` per capability. Preserve history.

## 19. Technical debt

Verified gaps:
- sparse root product structure;
- minimal root README;
- fragmented Python environment;
- no unified application/API foundation;
- many task-specific workflows but no unified foundation CI;
- deployed Sqitch history not clearly paired with its versioned definitions in inspected Git reality;
- environment naming ambiguity;
- generated evidence/data extensively stored in source-control history.

Classification: non-destructive `L0_REQUIRED` remediation.

## 20. Duplications

Potential duplication exists among successive actor/batch implementations and generated outputs. Semantic duplication has not been asserted without file-level comparison.

Classification: `UNKNOWN_REQUIRES_INSPECTION`.

Rule: never delete history; canonical wrappers may supersede implementations while originals remain preserved.

## 21. Migration risks

Primary risks:
- using primary `production` as a sandbox;
- introducing a second migration authority beside Sqitch;
- rewriting valid polyglot code for uniformity;
- using Drive human paths as persistent asset identity;
- deleting/moving historical evidence;
- binding a new API directly to undocumented internal tables before stable contracts;
- relying on stale infrastructure observations instead of live verification.

Mitigation: isolated branches, additive changes, tests, ADRs, stable contracts, explicit environment gates, no production writes.

## 22. Gaps required for L0

Required:
- additive foundation directory structure;
- technology ADR;
- reproducible Python environment;
- FastAPI `/health` and `/version`;
- OpenAPI contract;
- safe environment-aware DB connection layer;
- Sqitch/Git reconciliation;
- unified tests and GitHub Actions CI;
- Drive asset adapter using stable file identity;
- logging/run_id;
- secrets/config policy;
- DEV/STAGING/PRODUCTION policy;
- operational README.

## Technology conclusion

- New backend/scientific foundation: Python, confirmed.
- API: FastAPI, confirmed for L0 minimal API.
- Validation: Pydantic.
- Existing JS/Node: preserve.
- R: preserve where specialized.
- Database: current PostgreSQL 18.6 on Neon.
- Spatial: existing PostGIS retained.
- Migration authority: existing Sqitch/versioned SQL; do not create Alembic as a parallel authority without new evidence.
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

PRE-FLIGHT RESULT = PASS
