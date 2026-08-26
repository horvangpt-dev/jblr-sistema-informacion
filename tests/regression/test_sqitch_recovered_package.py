from __future__ import annotations

import hashlib
from pathlib import Path


DEPLOYED_SCRIPT_HASHES = {
    "core_physical_model_v1": "6fb576c341ca444550af97647631d52ce4ea87f2",
    "institutional_release_registry_v1": "d590a8eb054c557e72caa4674ff2e456df3e4be2",
    "migration_staging_v1": "5415da0812f4ea23ae2a03b2f8dfa9cce4c869e9",
}

DEPLOYED_TAG = "@JBLR_DB_PREPROD_01_4_1.0.0-dev1"


def test_recovered_deploy_scripts_match_live_sqitch_registry_hashes() -> None:
    for change, expected_sha1 in DEPLOYED_SCRIPT_HASHES.items():
        script = Path(f"db/sqitch/deploy/{change}.sql").read_bytes()
        assert hashlib.sha1(script).hexdigest() == expected_sha1


def test_recovered_plan_contains_deployed_changes_and_tag() -> None:
    plan = Path("db/sqitch/sqitch.plan").read_text(encoding="utf-8")
    for change in DEPLOYED_SCRIPT_HASHES:
        assert change in plan
    assert DEPLOYED_TAG in plan
