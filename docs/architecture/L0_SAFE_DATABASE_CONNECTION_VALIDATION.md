# L0.6 · SAFE DATABASE CONNECTION · VALIDATION

Date: 2026-08-26
Status: FOUNDATION_PASS · RUNTIME_SECRET_WIRING_OPEN

## Environment resources

Neon project:
`jblr-01-6-staging-zero-cost-20260815`

Production:
`production` (`br-polished-pond-b24mvk11`)

DEV:
`l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`)

STAGING:
`l0-staging-20260826` (`br-shiny-bonus-b2ilao69`)

DEV and STAGING are separate non-primary child branches. Production has not been used as a sandbox.

## Application safety gate

`src/jblr/core/database.py` implements:
- read connections with `default_transaction_read_only=on`;
- write connections only for explicit `JBLR_ENV=dev` or `JBLR_ENV=staging`;
- hard refusal of writes for `production`;
- hard refusal of writes for `unknown`.

`src/jblr/core/config.py` does not infer an environment silently. Database URLs are represented as `SecretStr` and are not exposed by settings representation.

## Automated verification

Unit tests verify:
- server-enforced read-only option is requested for reads;
- production writes are rejected;
- unknown-environment writes are rejected;
- DEV/STAGING write connections are the only allowed write modes;
- database URL is masked in configuration representation.

These tests run in GitHub Actions without live database credentials.

## Live resource verification

Connected Neon reads verified both L0 branches without mutating production.

STAGING creation/read verification returned:
- PostgreSQL 18.6
- 3 Sqitch changes
- 1 Sqitch tag
- 91 JBLR application/migration base tables

DEV was used to execute the recovered migration verification contracts successfully.

## Production status

`PRODUCTION_WRITES = 0`

## Open runtime boundary

A JBLR deployment runtime has not yet been provisioned with `JBLR_DATABASE_URL`, so the Python `psycopg` connection function has not yet been exercised end-to-end against the live Neon DEV/STAGING endpoints.

This is configuration/deployment wiring, not a schema or architecture blocker. No secret value is committed to solve it.

Therefore:
- environment separation: PASS
- application write-safety gate: PASS
- unit/CI validation: PASS
- live Neon resources: PASS
- end-to-end Python runtime credential wiring: OPEN
