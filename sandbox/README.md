# JBLR Sandbox Lab

This branch is a non-canonical experimental execution layer for JBLR.

## Purpose

Use it to test external components, algorithms, adapters, migrations, searches, data transforms, database changes, and integration ideas before any canonical promotion.

## Mandatory invariants

- `EXECUTION_TARGET = SANDBOX`
- `CANONICAL_EFFECT = NO`
- `CANONICAL_AUTHORITY = NO`
- `PRODUCTION_WRITE = NO`
- `STAGING_CANONICAL_WRITE = NO`
- `PRODUCTION_SECRETS_ALLOWED = NO`
- `EXTERNAL_SIDE_EFFECTS_DEFAULT = DENY`
- Sandbox results are evidence only until explicit review and acceptance.
- Sandbox must not create a second canonical JBLR, a second taxonomy, or a parallel authoritative library.

## Branch model

`sandbox/jblr-lab-v1` is the permanent laboratory control branch.

For a real module experiment, create a disposable `sandbox/...` branch from the **current verified head of the relevant source branch**, not necessarily from this branch. This avoids testing old code when L0, L1, 07 or another layer has moved independently.

## Promotion model

`SOURCE BRANCH -> SANDBOX EXPERIMENT -> TESTS/QA -> REVIEW -> ACCEPT/REJECT -> CONTROLLED PROMOTION`

A PASS in sandbox never changes canonical JBLR by itself.

## First certification

The first workflow intentionally uses only:

- a standard public GitHub-hosted runner;
- read-only repository permissions;
- an ephemeral PostgreSQL service inside the runner;
- synthetic test data;
- no production/staging credentials;
- no external writes.

The database is destroyed with the runner after the job finishes.
