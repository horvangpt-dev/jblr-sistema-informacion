from __future__ import annotations

import json
from io import StringIO
from uuid import UUID

from jblr.core.logging import JsonFormatter, configure_logging, new_run_id


def test_new_run_id_is_uuid() -> None:
    run_id = new_run_id()
    assert str(UUID(run_id)) == run_id


def test_structured_log_contains_run_id() -> None:
    run_id = new_run_id()
    logger = configure_logging(run_id=run_id)
    stream = StringIO()
    logger.logger.handlers[0].stream = stream

    logger.info("foundation-check")

    payload = json.loads(stream.getvalue())
    assert payload["message"] == "foundation-check"
    assert payload["run_id"] == run_id
    assert payload["level"] == "INFO"
