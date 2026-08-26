from __future__ import annotations

import os

import pytest
from pydantic import SecretStr

from jblr.core.config import RuntimeEnvironment, Settings
from jblr.core.runtime_validation import validate_database_read_runtime


@pytest.mark.parametrize(
    ("environment", "variable"),
    [
        (RuntimeEnvironment.DEV, "JBLR_TEST_NEON_DEV_DATABASE_URL"),
        (RuntimeEnvironment.STAGING, "JBLR_TEST_NEON_STAGING_DATABASE_URL"),
    ],
)
def test_live_neon_runtime_read_only(environment, variable) -> None:
    database_url = os.getenv(variable)
    if not database_url:
        pytest.skip(f"{variable} is not configured in this runtime")

    result = validate_database_read_runtime(
        Settings(environment=environment, database_url=SecretStr(database_url))
    )

    assert result["environment"] == environment.value
    assert result["database_name"] == "neondb"
    assert result["transaction_read_only"] == "on"
    assert result["sqitch_change_count"] == 3
    assert result["sqitch_tag_count"] == 1
    assert result["connection_closed_after_probe"] is True
