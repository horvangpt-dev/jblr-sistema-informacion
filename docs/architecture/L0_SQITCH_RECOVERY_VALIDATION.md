# L0.7 · VERSIONED MIGRATION SYSTEM · RECOVERY VALIDATION

Date: 2026-08-26
Status: PASS

## Authority preserved

Migration authority remains Sqitch/versioned SQL. L0 did not introduce Alembic or a second migration registry.

## Historical source recovered

Drive checkpoint `JBLR_01_6_CHECKPOINT_F_NEW_TECHNICAL_FAILURE_2026-08-16` identified historical Git evidence for a certified `db/sqitch` package.

Direct Git inspection of commit `75b567d15d6b610939ccdc95009a8aa0d30dd8b6` confirmed that `db/sqitch` actually existed there.

Historical subtree SHA:
`cc14ca5da886fd1184d1aded53bd8755d058f8aa`

L0 copied that exact subtree into the L0 branch without rewriting its files.

Recovery commit:
`7cbff0759949d8eb9d8728842db8bd6732cd5107`

## Recovered plan

Project:
`jblr-db`

Changes:
1. `core_physical_model_v1`
2. `institutional_release_registry_v1`
3. `migration_staging_v1`

Tag:
`@JBLR_DB_PREPROD_01_4_1.0.0-dev1`

## Live Neon registry verification

Read directly from L0 DEV branch `br-fancy-snow-b2tlrwmb`:

| Change | Live Sqitch script_hash |
|---|---|
| core_physical_model_v1 | `6fb576c341ca444550af97647631d52ce4ea87f2` |
| institutional_release_registry_v1 | `d590a8eb054c557e72caa4674ff2e456df3e4be2` |
| migration_staging_v1 | `5415da0812f4ea23ae2a03b2f8dfa9cce4c869e9` |

Live tag:
`@JBLR_DB_PREPROD_01_4_1.0.0-dev1`

## Git-to-Neon identity test

Regression test:
`tests/regression/test_sqitch_recovered_package.py`

The test calculates SHA-1 over each recovered deploy script and requires exact equality with the live Sqitch `script_hash` values above. It also requires all deployed change names and the deployed tag to exist in the recovered plan.

GitHub Actions result:
- workflow job: `python-foundation`
- job ID: `98016844663`
- run ID: `32915030112`
- conclusion: `success`

Therefore the recovered deploy scripts are byte-identical, under Sqitch's script-hash semantics, to the scripts registered as deployed in Neon.

## Verify scripts against L0 DEV

The recovered verification contracts were executed/read-validated against L0 DEV:

### core_physical_model_v1
PASS.

Verified immutable physical baseline excluding the later governance registry table:
- base tables: 85
- views: 8

### institutional_release_registry_v1
PASS.

`governance.schema_release` exists with the expected queried contract.

### migration_staging_v1
PASS.

`migration_staging.source_map`, `migration_staging.raw_record` and `migration_staging.register_source_mapping` resolve under the recovered verify contract.

No productive data write was required for these checks.

## Production safety

Production deploy/revert was not executed.
Production writes by L0 remain 0.

## Conclusion

`L0.7 VERSIONED_MIGRATION_SYSTEM = PASS`

The versioned migration system was recovered from repository history and verified against the current Neon deployment rather than re-created from memory or inferred schema.
