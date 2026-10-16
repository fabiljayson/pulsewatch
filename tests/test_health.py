"""Application health endpoint tests."""

from __future__ import annotations

from app import __version__


def test_health_returns_ok(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "pulsewatch"
    assert body["version"] == __version__


def test_health_is_listed_in_openapi(client) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/health" in response.json()["paths"]
