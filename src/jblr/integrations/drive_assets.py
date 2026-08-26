from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


DRIVE_METADATA_FIELDS = ",".join(
    [
        "id",
        "name",
        "mimeType",
        "size",
        "md5Checksum",
        "sha1Checksum",
        "sha256Checksum",
        "createdTime",
        "modifiedTime",
        "trashed",
    ]
)


class DriveAccessError(RuntimeError):
    """Raised when a Drive file cannot be accessed or verified."""


@dataclass(frozen=True)
class DriveAssetMetadata:
    drive_file_id: str
    original_filename: str | None
    mime_type: str | None
    size: int | None
    md5: str | None
    sha1: str | None
    sha256: str | None
    created_at: str | None
    modified_at: str | None
    trashed: bool

    @property
    def storage_uri(self) -> str:
        return f"gdrive://{self.drive_file_id}"

    def as_structured_metadata(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["storage_uri"] = self.storage_uri
        payload["validation_state"] = "trashed" if self.trashed else "metadata_verified"
        return payload


class GoogleDriveAssetAdapter:
    """Metadata-only Drive adapter.

    The supplied service must implement the Google Drive v3 service shape:
    `service.files().get(...).execute()`.

    L0 deliberately exposes no binary-download method here. PostgreSQL receives
    structured metadata/identity only; the binary remains in Drive.
    """

    def __init__(self, service: Any):
        self._service = service

    def locate(self, file_id: str) -> DriveAssetMetadata:
        if not file_id or not file_id.strip():
            raise ValueError("Drive file_id must be non-empty")

        try:
            payload = (
                self._service.files()
                .get(
                    fileId=file_id,
                    fields=DRIVE_METADATA_FIELDS,
                    supportsAllDrives=True,
                )
                .execute()
            )
        except Exception as exc:  # boundary: normalize provider errors
            raise DriveAccessError(f"Drive file_id could not be accessed: {file_id}") from exc

        returned_id = payload.get("id")
        if returned_id != file_id:
            raise DriveAccessError(
                f"Drive identity mismatch: requested={file_id} returned={returned_id}"
            )

        raw_size = payload.get("size")
        size = int(raw_size) if raw_size is not None else None

        return DriveAssetMetadata(
            drive_file_id=returned_id,
            original_filename=payload.get("name"),
            mime_type=payload.get("mimeType"),
            size=size,
            md5=payload.get("md5Checksum"),
            sha1=payload.get("sha1Checksum"),
            sha256=payload.get("sha256Checksum"),
            created_at=payload.get("createdTime"),
            modified_at=payload.get("modifiedTime"),
            trashed=bool(payload.get("trashed", False)),
        )
