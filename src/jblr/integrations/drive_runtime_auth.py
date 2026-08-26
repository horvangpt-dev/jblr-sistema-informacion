from __future__ import annotations

import json
import os
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class DriveRuntimeAuthorizationError(RuntimeError):
    """Raised when runtime Drive authorization is unavailable or invalid."""


class _DriveGetRequest:
    def __init__(self, *, access_token: str, file_id: str, fields: str, supports_all_drives: bool):
        self._access_token = access_token
        self._file_id = file_id
        self._fields = fields
        self._supports_all_drives = supports_all_drives

    def execute(self) -> dict:
        query = urlencode(
            {
                "fields": self._fields,
                "supportsAllDrives": "true" if self._supports_all_drives else "false",
            }
        )
        url = f"https://www.googleapis.com/drive/v3/files/{quote(self._file_id, safe='')}?{query}"
        request = Request(
            url,
            headers={"Authorization": f"Bearer {self._access_token}"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=30) as response:  # nosec B310: fixed HTTPS endpoint
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise DriveRuntimeAuthorizationError("Google Drive runtime request failed") from exc


class _DriveFilesResource:
    def __init__(self, access_token: str):
        self._access_token = access_token

    def get(self, *, fileId: str, fields: str, supportsAllDrives: bool = True) -> _DriveGetRequest:
        return _DriveGetRequest(
            access_token=self._access_token,
            file_id=fileId,
            fields=fields,
            supports_all_drives=supportsAllDrives,
        )


class GoogleDriveV3RestService:
    """Minimal Drive v3 metadata service compatible with GoogleDriveAssetAdapter.

    Authorization is injected at runtime only. The token is never returned,
    persisted or included in raised error messages.
    """

    def __init__(self, access_token: str):
        if not access_token:
            raise DriveRuntimeAuthorizationError("Google Drive access token is required")
        self._access_token = access_token

    def files(self) -> _DriveFilesResource:
        return _DriveFilesResource(self._access_token)


def build_drive_service_from_env() -> GoogleDriveV3RestService:
    token = os.getenv("JBLR_GOOGLE_DRIVE_ACCESS_TOKEN")
    if not token:
        raise DriveRuntimeAuthorizationError(
            "JBLR_GOOGLE_DRIVE_ACCESS_TOKEN is required at runtime; no credential is inferred"
        )
    return GoogleDriveV3RestService(token)
