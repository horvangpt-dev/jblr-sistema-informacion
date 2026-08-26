# L0_CANONICAL_STEP_CROSSWALK_v1

Date: 2026-08-26
Authority source: 00000.V1 executive Packet 02 directive
Status: EXECUTED_DRAFT_PENDING_PACKET02_CI
Rule: historical local L0 labels are preserved; equivalence is by objective/deliverable, never by number alone.

| CANONICAL_STEP_ID | CANONICAL_OBJECTIVE | EXPECTED_DELIVERABLE | REAL_IMPLEMENTATION | EVIDENCE | STATUS | GAPS | BLOCKS_L1 | REQUIRED_FOR_L0_FULL_CLOSE |
|---|---|---|---|---|---|---|---|---|
| L0.00 | Restore real technical state | REPOSITORY_REALITY_MAP | Existing reality map + Packet 01 direct verification | docs/architecture/L0_REPOSITORY_REALITY_MAP.md; GitHub/Neon/Drive readback | PASS | none material | NO | YES |
| L0.01 | Inventory repository and debt | REPOSITORY_REALITY_MAP | Existing map/preflight inventories polyglot code, workflows, DB and debt | L0_SOFTWARE_PREFLIGHT_REPORT.md; L0_REPOSITORY_REALITY_MAP.md | PASS | per-capability historical classification remains ongoing | NO | YES |
| L0.02 | Technology ADR | TECHNOLOGY_DECISION_ADR | ADR-0001 accepted for L0 | docs/decisions/ADR-0001-L0-FOUNDATION-TECHNOLOGY.md | PASS | none blocking | NO | YES |
| L0.03 | Reproducible environment | REPRODUCIBLE_ENVIRONMENT | Python 3.13 + pyproject + pinned lock | pyproject.toml; requirements/l0.lock; CI | PASS | external live runtime credentials are separate from package reproducibility | NO | YES |
| L0.04 | Package structure | REPO_STRUCTURE | src/jblr, tests, docs, requirements, db/sqitch | repository tree | PASS | historical execution remains intentionally outside consolidated package | NO | YES |
| L0.05 | Configuration and secrets | SECRETS_POLICY | Settings/SecretStr + documented policy | src/jblr/core/config.py; L0_SECRETS_AND_CONFIGURATION_POLICY.md | PASS | long-lived Drive refresh authorization mechanism not selected | YES via L0.10 | YES |
| L0.06 | Safe database connection | SAFE_DATABASE_CONNECTION | psycopg connector with read-only libpq option and write gates; Packet 02 sanitized probe added | src/jblr/core/database.py; src/jblr/core/runtime_validation.py; unit tests | PARTIAL | live execution through pinned Python psycopg path not completed in current credential-capable runtime | YES | YES |
| L0.07 | Baseline and migrations | VERSIONED_MIGRATIONS | Certified Sqitch tree recovered by copy; live registry revalidated | db/sqitch; tests/regression/test_sqitch_recovered_package.py; Neon sqitch registry | PASS | none detected | NO | YES |
| L0.08 | Core error/state model | CORE_STATE_MODEL | Explicit SemanticState, ExecutionState, ValidationState, provenance and structured errors | src/jblr/core/state.py; tests/unit/test_core_state.py | PASS_PENDING_CI | same-HEAD CI pending at artifact creation time | YES until CI | YES |
| L0.09 | Minimal API | MINIMAL_JBLR_API | FastAPI /health, /version and generated /openapi.json | src/jblr/api/app.py; docs/api/openapi.json; API/regression tests | PASS | no L1 endpoints intentionally added | NO | YES |
| L0.10 | Google Drive adapter | GOOGLE_DRIVE_ASSET_ADAPTER | Stable file_id metadata adapter + Packet 02 runtime OAuth bearer service and live-test gate | src/jblr/integrations/drive_assets.py; drive_runtime_auth.py; runtime tests | PARTIAL | ChatGPT Drive OAuth credential cannot be exported to Python runtime; live adapter E2E therefore not executed | YES | YES |
| L0.11 | Logging and run IDs | LOGGING_AND_RUN_IDS | JSON logging + UUID run_id + explicit environment/git_sha | src/jblr/core/logging.py; tests/unit/test_logging.py | PASS_PENDING_CI | same-HEAD CI pending | NO after CI | YES |
| L0.12 | Base tests | AUTOMATED_TESTS | unit, regression and integration-gate tests | tests/unit; tests/regression; tests/integration | PASS_PENDING_CI | live integration tests require runtime credentials | YES through L0.06/L0.10 | YES |
| L0.13 | GitHub Actions CI | GITHUB_ACTIONS_CI | l0-foundation-ci.yml | .github/workflows/l0-foundation-ci.yml | PARTIAL | final Packet 02 same-HEAD CI pending | YES | YES |
| L0.14 | DEV/STAGING/PRODUCTION policy | ENVIRONMENT_POLICY | explicit dev/staging/production/unknown policy; production write block | config/database code; L0_DEV_STAGING_PRODUCTION_POLICY.md | PASS | production branch itself remains unprotected in Neon control plane | NO for L1; risk remains | YES |
| L0.15 | Operational README/restore | README_OPERATIVO | root README + architecture/ADR/config pointers | README.md and docs | PASS | Packet 02 artifacts must be included in future restore references | NO | YES |
| L0.16 | QA and close L0 | L0_FOUNDATION_REPORT | Packet 01 foundation report + Packet 02 sufficiency/receipt | L0_FOUNDATION_REPORT.md; Packet 02 reports | OPEN | runtime E2E gaps and executive close gate remain | NO: full close is independent from L1 sufficiency decision | YES |

## Alignment conclusion

`ID_ALIGNMENT_DEBT` is resolved for the current L0 deliverables by this crosswalk. Historical labels in `L0_FOUNDATION_REPORT.md` are not renamed or rewritten.
