# L0_NEON_RUNTIME_VALIDATION_v1

Date: 2026-08-26
Project: `jblr-01-6-staging-zero-cost-20260815`
Project ID: `crimson-hall-16978747`
Status: PARTIAL

## Environment revalidation

- PRODUCTION: `production` / `br-polished-pond-b24mvk11` / ready / non-sandbox.
- DEV: `l0-dev-20260826` / `br-fancy-snow-b2tlrwmb` / ready.
- STAGING: `l0-staging-20260826` / `br-shiny-bonus-b2ilao69` / ready.
- PostgreSQL: `18.6 (3484359)`.
- `written_data_bytes = 0` for production, DEV and STAGING in the revalidated Neon project state.

## Direct live reads

DEV and STAGING were queried separately with innocuous SELECT statements through the connected Neon control plane.

Both returned:

- database = `neondb`;
- schema = `public`;
- PostgreSQL = `18.6 (3484359)`;
- Sqitch changes = 3;
- Sqitch tags = 1.

The connector-level session reported `transaction_read_only=off`. This is not a failure of the L0 policy: the direct Neon control-plane query does not use `jblr.core.database.connect_database()`. The L0 Python client explicitly requests `-c default_transaction_read_only=on` for read connections, and unit tests lock that call contract.

## Python runtime path

Packet 02 adds `validate_database_read_runtime()` in `src/jblr/core/runtime_validation.py`. It:

1. calls the real L0 `connect_database(settings, write=False)` path;
2. executes a fixed read-only metadata/Sqitch probe;
3. returns sanitized evidence without the URL/password;
4. closes the connection and reports closure state.

Live integration tests exist for both DEV and STAGING under `tests/integration/test_neon_runtime.py` and require ephemeral runtime variables:

- `JBLR_TEST_NEON_DEV_DATABASE_URL`;
- `JBLR_TEST_NEON_STAGING_DATABASE_URL`.

The current execution container has no outbound TCP/DNS and lacks `psycopg`; the pinned package could not be installed because external network access is disabled. Therefore the exact Python socket path was not executed live in this session.

## Safety result

`PRODUCTION_WRITES = 0`

No data/schema modification was executed in any branch for connectivity testing.

`NEON_RUNTIME_INTEGRATION = PARTIAL`

Open item: execute the existing live integration tests in a credential-injected networked runtime and persist the sanitized results.
