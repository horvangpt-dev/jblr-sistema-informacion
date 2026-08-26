from __future__ import annotations

from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from jblr.core.config import RuntimeEnvironment, Settings
from jblr.core.database import DatabaseWriteBlocked, connect_database


def _settings(environment: RuntimeEnvironment) -> Settings:
    return Settings(
        environment=environment,
        database_url=SecretStr("postgresql://example.invalid/neondb"),
    )


def test_read_connection_is_server_enforced_read_only(monkeypatch) -> None:
    connect = Mock(return_value=object())
    monkeypatch.setattr("jblr.core.database.psycopg.connect", connect)

    connect_database(_settings(RuntimeEnvironment.DEV), write=False)

    connect.assert_called_once_with(
        "postgresql://example.invalid/neondb",
        options="-c default_transaction_read_only=on",
    )


@pytest.mark.parametrize(
    "environment",
    [RuntimeEnvironment.PRODUCTION, RuntimeEnvironment.UNKNOWN],
)
def test_writes_are_blocked_in_production_and_unknown(environment) -> None:
    with pytest.raises(DatabaseWriteBlocked):
        connect_database(_settings(environment), write=True)


@pytest.mark.parametrize(
    "environment",
    [RuntimeEnvironment.DEV, RuntimeEnvironment.STAGING],
)
def test_writes_require_explicit_nonproduction_environment(monkeypatch, environment) -> None:
    connect = Mock(return_value=object())
    monkeypatch.setattr("jblr.core.database.psycopg.connect", connect)

    connect_database(_settings(environment), write=True)

    connect.assert_called_once_with("postgresql://example.invalid/neondb")


def test_database_url_is_not_exposed_by_settings_repr() -> None:
    settings = _settings(RuntimeEnvironment.DEV)
    assert "example.invalid" not in repr(settings)
    assert "**********" in repr(settings)
