from __future__ import annotations

from unittest.mock import Mock

import pytest

from jblr.integrations.drive_assets import DriveAccessError, GoogleDriveAssetAdapter


def _service(payload=None, error=None):
    request = Mock()
    if error is None:
        request.execute.return_value = payload
    else:
        request.execute.side_effect = error

    files = Mock()
    files.get.return_value = request

    service = Mock()
    service.files.return_value = files
    return service, files


def test_locates_asset_by_stable_file_id_and_returns_metadata_only() -> None:
    service, files = _service(
        {
            "id": "drive-123",
            "name": "source.pdf",
            "mimeType": "application/pdf",
            "size": "2048",
            "sha256Checksum": "abc123",
            "trashed": False,
        }
    )

    metadata = GoogleDriveAssetAdapter(service).locate("drive-123")
    structured = metadata.as_structured_metadata()

    assert metadata.drive_file_id == "drive-123"
    assert metadata.storage_uri == "gdrive://drive-123"
    assert metadata.size == 2048
    assert structured["sha256"] == "abc123"
    assert structured["validation_state"] == "metadata_verified"
    assert "content" not in structured
    assert "binary" not in structured

    kwargs = files.get.call_args.kwargs
    assert kwargs["fileId"] == "drive-123"
    assert kwargs["supportsAllDrives"] is True


def test_access_failure_is_normalized() -> None:
    service, _ = _service(error=PermissionError("denied"))

    with pytest.raises(DriveAccessError):
        GoogleDriveAssetAdapter(service).locate("drive-123")


def test_identity_mismatch_is_rejected() -> None:
    service, _ = _service({"id": "other-id", "name": "wrong.pdf"})

    with pytest.raises(DriveAccessError):
        GoogleDriveAssetAdapter(service).locate("drive-123")
