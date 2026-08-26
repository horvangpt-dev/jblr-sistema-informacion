from __future__ import annotations

import pytest

from jblr.integrations.drive_runtime_auth import (
    DriveRuntimeAuthorizationError,
    GoogleDriveV3RestService,
    build_drive_service_from_env,
)


def test_drive_runtime_auth_requires_explicit_token(monkeypatch) -> None:
    monkeypatch.delenv("JBLR_GOOGLE_DRIVE_ACCESS_TOKEN", raising=False)
    with pytest.raises(DriveRuntimeAuthorizationError, match="required at runtime"):
        build_drive_service_from_env()


def test_drive_service_repr_does_not_expose_token() -> None:
    service = GoogleDriveV3RestService("top-secret-token")
    assert "top-secret-token" not in repr(service)
