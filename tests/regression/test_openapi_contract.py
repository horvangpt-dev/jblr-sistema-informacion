from __future__ import annotations

import json
from pathlib import Path

from jblr.api.app import app


def test_persisted_openapi_contract_matches_application() -> None:
    expected = json.loads(Path("docs/api/openapi.json").read_text(encoding="utf-8"))
    assert app.openapi() == expected
