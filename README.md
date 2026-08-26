# JBLR · Sistema de Información

This repository preserves the historical JBLR execution/evidence layers and is being extended non-destructively with the L0 software foundation.

## L0 status

L0 branch: `l0-software-foundation-20260826`

L0 establishes a permanent software layer without replacing existing valid Python, JavaScript/Node.js, R, SQL, STIMES, taxonomy, analytical engines or historical evidence.

## Python runtime

Supported L0 baseline: Python 3.13.

Install the pinned foundation environment:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements/l0.lock
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`.

Run tests:

```bash
python -m pytest
```

Run the minimal API:

```bash
PYTHONPATH=src uvicorn jblr.api.app:app --host 127.0.0.1 --port 8000
```

System endpoints:
- `GET /health`
- `GET /version`
- `GET /openapi.json`

Persisted OpenAPI baseline: `docs/api/openapi.json`.

## Runtime configuration

- `JBLR_ENV`: `dev`, `staging`, `production`; unset = `unknown`.
- `JBLR_DATABASE_URL`: secret PostgreSQL URL; never commit it.
- `JBLR_GIT_SHA`: deployed Git SHA; defaults to `unknown`.

Database writes are blocked in L0 for `production` and `unknown`. Read connections request server-enforced read-only transactions.

## Neon

Current project: `jblr-01-6-staging-zero-cost-20260815`.

Primary/default branch is named `production` and is not an L0 sandbox.

L0 DEV branch:
`l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`).

Production writes during L0: **0 unless 00000 explicitly authorizes otherwise**.

## Database migrations

Existing deployed migration authority is Sqitch/versioned SQL. L0 does not introduce Alembic as a second authority. Recovery/reconciliation of the deployed Sqitch definitions with Git is required before new schema migrations are authored.

## Google Drive assets

Heavy/human assets remain in Google Drive. `GoogleDriveAssetAdapter` resolves them by stable Drive `file_id`, retrieves metadata/checksums and produces structured metadata without downloading or duplicating binary content into PostgreSQL.

## Logging

`jblr.core.logging` creates UUID run IDs and structured JSON log records. Unknown values remain explicit rather than being silently converted to zero or absence.

## Architecture evidence

- `docs/architecture/L0_SOFTWARE_PREFLIGHT_REPORT.md`
- `docs/architecture/L0_DEV_STAGING_PRODUCTION_POLICY.md`
- `docs/architecture/L0_SECRETS_AND_CONFIGURATION_POLICY.md`
- `docs/decisions/ADR-0001-L0-FOUNDATION-TECHNOLOGY.md`
- `docs/decisions/ADR-0002-DRIVE-ASSET-IDENTITY.md`

## Historical material

Existing `execution/`, baseline and workflow history is preserved. `SUPERSEDED != DELETED` and `COPY_NEVER_MOVE` remain active principles.
