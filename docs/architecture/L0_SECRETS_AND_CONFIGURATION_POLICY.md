# L0 · Secrets and Configuration Policy

Date: 2026-08-26
Status: ACTIVE_FOR_L0

## Rules

`NO_HARDCODED_SECRETS = ABSOLUTE`

Secret values must never be committed to GitHub, written into evidence reports, logged, returned by `/version`, embedded in OpenAPI, or copied into source-controlled fixtures.

## Canonical runtime variables introduced by L0

- `JBLR_ENV`: explicit runtime environment. Allowed values: `dev`, `staging`, `production`. Unset means `unknown`; no silent inference.
- `JBLR_DATABASE_URL`: PostgreSQL connection URL. Secret.
- `JBLR_GIT_SHA`: deployed Git commit identifier. Non-secret; defaults to `unknown` if absent.

Google Drive authorization is provider/runtime configuration. L0 does not commit a credential value or invent a canonical secret name until the deployment mechanism is selected.

## Database safety

- Read connections are opened with server-side default transaction read-only mode.
- Write connections are accepted only for explicit `dev` or `staging`.
- `production` writes are blocked in L0 code.
- `unknown` writes are blocked.

## Logging

Secrets must not be logged. L0 structured logs contain timestamp, level, logger, message and run_id. Additional fields require review before they can include external payloads.

## CI

Foundation unit tests must run without live production credentials. Live integration tests, when added, must target explicitly identified non-production resources and receive secrets only from the CI secret store.

## Rotation / recovery

Credential rotation must not require source changes. If a secret is ever exposed, treat it as compromised: revoke/rotate it and record the incident without preserving the secret value itself.
