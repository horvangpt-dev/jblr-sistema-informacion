# L0 · DEV / STAGING / PRODUCTION POLICY

Date: 2026-08-26
Status: ACTIVE_FOR_L0

## Current reality

Neon project:
`jblr-01-6-staging-zero-cost-20260815`.

Current PostgreSQL:
`18.6 (3484359)`.

Primary/default branch:
`production` (`br-polished-pond-b24mvk11`).

L0 development branch:
`l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`).

L0 staging branch:
`l0-staging-20260826` (`br-shiny-bonus-b2ilao69`).

Both L0 branches are non-primary children of the primary branch. The project name and primary branch name remain semantically inconsistent, so environment is NEVER inferred from the project name.

## Policy

### DEV

`JBLR_ENV=dev`

Development, experiments and destructive validation are allowed only on an explicitly identified DEV resource. Current Neon DEV is `l0-dev-20260826`.

### STAGING

`JBLR_ENV=staging`

Promotion/integration validation may target only the explicit L0 STAGING resource. Current Neon STAGING is `l0-staging-20260826`.

Live read verification at creation showed:
- PostgreSQL 18.6
- 3 Sqitch changes
- 1 Sqitch tag
- 91 JBLR base tables across the application/migration schemas

STAGING is not production and is independently discardable.

### PRODUCTION

`JBLR_ENV=production`

The primary/default Neon branch named `production` is treated as production for safety regardless of the project title.

`PRODUCTION_WRITES_DURING_L0 = 0` unless 00000 explicitly authorizes otherwise.

## Gates

Application configuration MUST carry an explicit environment code. Unknown environment is not converted silently.

The L0 database library permits write connections only for explicit `dev` or `staging` and refuses writes for `production` or `unknown`.

Secrets must be supplied by runtime secret stores/environment configuration and never committed.

## Promotion direction

DEV → STAGING → PRODUCTION

Promotion means tested/versioned code and migrations move forward. It does not mean copying uncontrolled production data backward or treating the production branch as a test target.

## Recovery

L0 DEV and L0 STAGING are separate child branches and can be discarded independently without deleting or rewriting primary history.
