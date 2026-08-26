from fastapi.testclient import TestClient

from jblr.api.app import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "jblr"}


def test_version_preserves_unknown_when_git_sha_is_not_supplied(monkeypatch) -> None:
    monkeypatch.delenv("JBLR_GIT_SHA", raising=False)
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "jblr"
    assert body["version"] == "0.1.0a0"
    assert body["git_sha"] == "unknown"


def test_openapi_exposes_required_system_endpoints() -> None:
    schema = client.get("/openapi.json").json()
    assert "/health" in schema["paths"]
    assert "/version" in schema["paths"]
