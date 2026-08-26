from __future__ import annotations

from typing import Any

from jblr.core.config import Settings
from jblr.core.database import connect_database
from jblr.integrations.drive_assets import GoogleDriveAssetAdapter


DATABASE_PROBE_SQL = """
SELECT
    current_setting('server_version') AS server_version,
    current_database() AS database_name,
    current_schema() AS schema_name,
    current_setting('transaction_read_only') AS transaction_read_only,
    current_user AS role_name,
    (SELECT count(*) FROM sqitch.changes) AS sqitch_change_count,
    (SELECT count(*) FROM sqitch.tags) AS sqitch_tag_count
""".strip()


def validate_database_read_runtime(settings: Settings) -> dict[str, Any]:
    """Execute a sanitized, read-only runtime probe through the real L0 DB path.

    The returned evidence never contains the database URL or password.
    """

    connection = connect_database(settings, write=False)
    result: dict[str, Any]
    try:
        with connection.cursor() as cursor:
            cursor.execute(DATABASE_PROBE_SQL)
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("database runtime probe returned no row")
        result = {
            "environment": settings.environment.value,
            "server_version": row[0],
            "database_name": row[1],
            "schema_name": row[2],
            "transaction_read_only": row[3],
            "role_name": row[4],
            "sqitch_change_count": int(row[5]),
            "sqitch_tag_count": int(row[6]),
        }
    finally:
        connection.close()

    result["connection_closed_after_probe"] = bool(connection.closed)
    return result


def validate_drive_asset_runtime(
    adapter: GoogleDriveAssetAdapter,
    *,
    file_id: str,
) -> dict[str, Any]:
    """Resolve one stable Drive file identity into structured metadata only."""

    metadata = adapter.locate(file_id)
    return metadata.as_structured_metadata()
