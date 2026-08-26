# L0.1 · REPOSITORY REALITY MAP

Date: 2026-08-26
Status: VERIFIED

## Baseline inspected

Repository: `horvangpt-dev/jblr-sistema-informacion`

Cumulative predecessor used for L0 branching:
`0000-v17-successor-rioja-2262`

Verified predecessor HEAD before L0 creation:
`7626679fe65243b1448ff4ce687ffb7d76e2addf`

L0 branch:
`l0-software-foundation-20260826`

## Existing reality preserved

| Area | Reality | Classification |
|---|---|---|
| `.github/workflows/` | Many actor/task-specific GitHub Actions workflows | KEEP |
| `db/baseline/parts/` | Versioned SQL baseline fragments | KEEP |
| `execution/0000/` | Direction/successor analytical and evidence scripts | KEEP + WRAP |
| `execution/06/` | Existing execution scripts | KEEP + WRAP |
| `execution/08/` | Node.js control plane, package and tests | KEEP + WRAP |
| `execution/09/` | Python/R analytical and source tooling | KEEP + WRAP |
| generated historical evidence | Large accumulated execution evidence | KEEP; MIGRATE_LATER only by copy |
| JavaScript/Node.js | Valid operational code, Node >=22 in inspected package | KEEP + WRAP |
| Python | Extensive scientific/analytical code | KEEP + WRAP |
| R | Specialized analytical/diagnostic code | KEEP |
| SQL | Physical baseline and migration definitions | KEEP |

## L0 additive foundation

| Area | Purpose | Status |
|---|---|---|
| `docs/architecture/` | Reality, environment, security and foundation records | ADDED |
| `docs/decisions/` | Architecture decision records | ADDED |
| `docs/api/openapi.json` | Persisted API contract | ADDED |
| `src/jblr/` | New consolidated Python foundation | ADDED |
| `tests/unit/` | Unit safety and API tests | ADDED |
| `tests/regression/` | OpenAPI and migration recovery invariants | ADDED |
| `requirements/l0.lock` | Exact known-working L0 dependency set | ADDED |
| `pyproject.toml` | Python product metadata and test configuration | ADDED |
| `.github/workflows/l0-foundation-ci.yml` | Unified L0 foundation CI | ADDED |
| `db/sqitch/` | Exact recovery of certified historical Sqitch tree | RECOVERED_BY_COPY |

## Recovered migration package

Historical source tree:
`db/sqitch` tree SHA `cc14ca5da886fd1184d1aded53bd8755d058f8aa`

Recovered into L0 without rewriting its files.

Contents include:
- `sqitch.conf`
- `sqitch.plan`
- `deploy/`
- `revert/`
- `verify/`

The recovered plan defines:
- `core_physical_model_v1`
- `institutional_release_registry_v1`
- `migration_staging_v1`
- tag `@JBLR_DB_PREPROD_01_4_1.0.0-dev1`

These names and tag match the current Sqitch registry read directly from the Neon L0 DEV branch.

## Neon reality linked to repository

Project:
`jblr-01-6-staging-zero-cost-20260815`

Current PostgreSQL:
`18.6 (3484359)`

Primary/default branch:
`production` (`br-polished-pond-b24mvk11`)

L0 DEV:
`l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`)

Production writes by L0:
`0`

Schemas observed:
`analytics`, `core`, `evidence`, `field`, `governance`, `material`, `migration_staging`, `public`, `security`, `sqitch`, `taxonomy`.

Observed inventory:
- 98 base tables total
- 10 views total
- PostGIS present
- Sqitch registry present

## Known gaps after map

1. No canonical separate STAGING branch has yet been established.
2. Primary Neon branch is named `production` while project name contains `staging`; explicit environment configuration is therefore mandatory.
3. Existing historical execution code remains heterogeneous and will be wrapped progressively, not mass-rewritten.
4. Heavy generated historical artifacts remain in Git history for now; any later externalization must use COPY, never destructive movement.
5. Live Google Drive programmatic deployment credentials are not committed and must remain runtime-only.

## Governing conclusion

The repository is not empty and is not to be rebuilt. L0 is an additive consolidation layer over a substantial, historically accumulated polyglot system.
