from __future__ import annotations

from pydantic import SecretStr

from jblr.core.config import RuntimeEnvironment, Settings
from jblr.core.runtime_validation import (
    DATABASE_PROBE_SQL,
    validate_database_read_runtime,
    validate_drive_asset_runtime,
)
from jblr.integrations.drive_assets import DriveAssetMetadata


class FakeCursor:
    def __init__(self):
        self.executed = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql):
        self.executed = sql

    def fetchone(self):
        return (
            "18.6 (test)",
            "neondb",
            "public",
            "on",
            "runtime_reader",
            3,
            1,
        )


class FakeConnection:
    def __init__(self):
        self.closed = False
        self.cursor_instance = FakeCursor()

    def cursor(self):
        return self.cursor_instance

    def close(self):
        self.closed = True


class FakeDriveAdapter:
    def locate(self, file_id):
        return DriveAssetMetadata(
            drive_file_id=file_id,
            original_filename="controlled.txt",
            mime_type="text/plain",
            size=12,
            md5=None,
            sha1=None,
            sha256=None,
            created_at="2026-08-26T00:00:00Z",
            modified_at="2026-08-26T00:00:00Z",
            trashed=False,
        )


def test_database_probe_is_read_only_sanitized_and_closes(monkeypatch) -> None:
    connection = FakeConnection()
    monkeypatch.setattr(
        "jblr.core.runtime_validation.connect_database",
        lambda settings, write=False: connection,
    )
    settings = Settings(
        environment=RuntimeEnvironment.DEV,
        database_url=SecretStr("postgresql://user:secret@example.invalid/neondb"),
    )

    result = validate_database_read_runtime(settings)

    assert connection.cursor_instance.executed == DATABASE_PROBE_SQL
    assert result["transaction_read_only"] == "on"
    assert result["connection_closed_after_probe"] is True
    assert "secret" not in repr(result)
    assert "database_url" not in result


def test_drive_probe_returns_stable_identity_without_binary() -> None:
    result = validate_drive_asset_runtime(FakeDriveAdapter(), file_id="drive-file-123")

    assert result["drive_file_id"] == "drive-file-123"
    assert result["storage_uri"] == "gdrive://drive-file-123"
    assert result["sha256"] is None
    assert "binary" not in result
