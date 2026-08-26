from __future__ import annotations

import os
from enum import StrEnum

from pydantic import BaseModel, SecretStr


class RuntimeEnvironment(StrEnum):
    UNKNOWN = "unknown"
    DEV = "dev"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseModel):
    environment: RuntimeEnvironment = RuntimeEnvironment.UNKNOWN
    database_url: SecretStr | None = None
    git_sha: str = "unknown"

    @classmethod
    def from_env(cls) -> "Settings":
        raw_environment = os.getenv("JBLR_ENV")
        if raw_environment is None:
            environment = RuntimeEnvironment.UNKNOWN
        else:
            try:
                environment = RuntimeEnvironment(raw_environment.strip().lower())
            except ValueError as exc:
                raise ValueError(
                    "JBLR_ENV must be one of: dev, staging, production. "
                    "Unset means unknown; no environment is inferred silently."
                ) from exc

        database_url = os.getenv("JBLR_DATABASE_URL")
        return cls(
            environment=environment,
            database_url=SecretStr(database_url) if database_url else None,
            git_sha=os.getenv("JBLR_GIT_SHA", "unknown"),
        )

    def require_database_url(self) -> str:
        if self.database_url is None:
            raise RuntimeError("JBLR_DATABASE_URL is required for database access")
        return self.database_url.get_secret_value()
