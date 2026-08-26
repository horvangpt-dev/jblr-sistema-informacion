from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "run_id": getattr(record, "run_id", "unknown"),
        }
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def new_run_id() -> str:
    return str(uuid4())


def validate_run_id(run_id: str) -> str:
    return str(UUID(run_id))


def configure_logging(*, run_id: str | None = None, level: int = logging.INFO) -> logging.LoggerAdapter:
    resolved_run_id = validate_run_id(run_id) if run_id is not None else new_run_id()

    logger = logging.getLogger("jblr")
    logger.setLevel(level)
    logger.handlers.clear()
    logger.propagate = False

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)

    return logging.LoggerAdapter(logger, {"run_id": resolved_run_id})
