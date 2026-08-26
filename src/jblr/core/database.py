from __future__ import annotations

import psycopg
from psycopg import Connection

from jblr.core.config import RuntimeEnvironment, Settings


class DatabaseWriteBlocked(RuntimeError):
    """Raised when JBLR safety policy blocks a database write connection."""


def connect_database(settings: Settings, *, write: bool = False) -> Connection:
    """Open a PostgreSQL connection under L0 safety rules.

    Read connections are server-enforced read-only through libpq options.
    Write connections are permitted only for explicit DEV or STAGING.
    PRODUCTION and UNKNOWN are blocked for writes during L0.
    """

    database_url = settings.require_database_url()

    if write and settings.environment not in {
        RuntimeEnvironment.DEV,
        RuntimeEnvironment.STAGING,
    }:
        raise DatabaseWriteBlocked(
            f"database writes are blocked for environment={settings.environment.value}"
        )

    if write:
        return psycopg.connect(database_url)

    return psycopg.connect(
        database_url,
        options="-c default_transaction_read_only=on",
    )
