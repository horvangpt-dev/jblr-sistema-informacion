from __future__ import annotations

import json
from io import StringIO
from uuid import UUID

from jblr.core.logging import JsonFormatter, configure_logging, new_run_id


def test_new_run_id_is_uuid() -> None:
    run_id = new_run_id()
    assert str(UUID(run_id)) == run_id


def test_structured_log_contains_run_id_environment_and_git_sha() -> None:
    run_id = new_run_id()
    logger = configure_logging(
        run_id=run_id,
        environment="staging",
        git_sha="abc123",
    )
    stream = StringIO()
    logger.logger.handlers[0].stream = stream

    logger.info("foundation-check")

    payload = json.loads(stream.getvalue())
    assert payload["message"] == "foundation-check"
    assert payload["run_id"] == run_id
    assert payload["environment"] == "staging"
    assert payload["git_sha"] == "abc123"
    assert payload["level"] == "INFO"


def test_logging_preserves_unknown_metadata_explicitly() -> None:
    logger = configure_logging()
    stream = StringIO()
    logger.logger.handlers[0].stream = stream

    logger.info("unknown-metadata-check")

    payload = json.loads(stream.getvalue())
    assert payload["environment"] == "unknown"
    assert payload["git_sha"] == "unknown"
