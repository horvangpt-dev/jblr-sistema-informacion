# L0 · DEV / STAGING / PRODUCTION POLICY

Date: 2026-08-26
Status: ACTIVE_FOR_L0

## Current reality

Neon project: `jblr-01-6-staging-zero-cost-20260815`.

Primary/default branch: `production` (`br-polished-pond-b24mvk11`).

L0 development branch: `l0-dev-20260826` (`br-fancy-snow-b2tlrwmb`).

The project name and primary branch name are semantically inconsistent. L0 will not infer environment from the project name alone.

## Policy

### DEV

L0 development and destructive/experimental validation must occur only on an explicitly identified non-primary branch. Current L0 DEV is `l0-dev-20260826`.

### STAGING

No canonical separate STAGING branch is asserted at this milestone. Until one is deliberately established, `STAGING=UNRESOLVED` in application configuration. The project name containing `staging` is not sufficient evidence.

### PRODUCTION

The primary/default Neon branch named `production` is treated as production for safety regardless of project naming ambiguity.

`PRODUCTION_WRITES_DURING_L0 = 0` unless 00000 explicitly authorizes otherwise.

## Gates

Application configuration MUST carry an explicit environment code. Unknown environment is not converted to DEV/STAGING/PRODUCTION silently.

Any database write capability must refuse production by default during L0.

Secrets must be provided by runtime secret stores/environment configuration and never committed.

## Recovery

L0 DEV is a child branch and can be discarded without deleting or rewriting primary history. Production remains the source from which L0 DEV was branched at creation time.
