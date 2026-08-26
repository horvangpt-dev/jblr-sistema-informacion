from __future__ import annotations

import os

import pytest

from jblr.core.runtime_validation import validate_drive_asset_runtime
from jblr.integrations.drive_assets import GoogleDriveAssetAdapter
from jblr.integrations.drive_runtime_auth import build_drive_service_from_env


def test_live_drive_runtime_metadata_only() -> None:
    file_id = os.getenv("JBLR_DRIVE_TEST_FILE_ID")
    if not os.getenv("JBLR_GOOGLE_DRIVE_ACCESS_TOKEN") or not file_id:
        pytest.skip(
            "JBLR_GOOGLE_DRIVE_ACCESS_TOKEN and JBLR_DRIVE_TEST_FILE_ID are required for live Drive runtime validation"
        )

    adapter = GoogleDriveAssetAdapter(build_drive_service_from_env())
    result = validate_drive_asset_runtime(adapter, file_id=file_id)

    assert result["drive_file_id"] == file_id
    assert result["storage_uri"] == f"gdrive://{file_id}"
    assert result["validation_state"] == "metadata_verified"
    assert "binary" not in result
