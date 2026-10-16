"""Endpoint CRUD, validation, persistence, and deletion tests."""

from __future__ import annotations

from app.database import Database
from app.repository import record_check

from .conftest import PUBLIC_URL, register_endpoint


def test_create_endpoint_returns_201(client) -> None:
    payload = register_endpoint(client)
    assert payload["name"] == "Example API"
    assert payload["url"] == PUBLIC_URL
    assert payload["is_active"] is True
    assert payload["id"] >= 1
    assert payload["created_at"] == payload["updated_at"]


def test_create_endpoint_inactive(client) -> None:
    response = client.post(
        "/api/v1/endpoints",
        json={"name": "Paused", "url": PUBLIC_URL, "is_active": False},
    )
    assert response.status_code == 201
    assert response.json()["is_active"] is False


def test_create_endpoint_trims_name(client) -> None:
    payload = register_endpoint(client, name="  spaced name  ")
    assert payload["name"] == "spaced name"


def test_create_blank_name_rejected(client) -> None:
    response = client.post("/api/v1/endpoints", json={"name": "   ", "url": PUBLIC_URL})
    assert response.status_code == 422


def test_create_name_too_long_rejected(client) -> None:
    response = client.post("/api/v1/endpoints", json={"name": "x" * 101, "url": PUBLIC_URL})
    assert response.status_code == 422


def test_create_url_too_long_rejected(client) -> None:
    response = client.post(
        "/api/v1/endpoints",
        json={"name": "long", "url": "https://example.com/" + "a" * 2048},
    )
    assert response.status_code == 422


def test_create_missing_fields_rejected(client) -> None:
    assert client.post("/api/v1/endpoints", json={}).status_code == 422
    assert client.post("/api/v1/endpoints", json={"name": "only name"}).status_code == 422


def test_create_unsupported_scheme_rejected(client) -> None:
    response = client.post("/api/v1/endpoints", json={"name": "ftp", "url": "ftp://example.com/x"})
    assert response.status_code == 422


def test_create_credentials_in_url_rejected(client) -> None:
    response = client.post(
        "/api/v1/endpoints",
        json={"name": "creds", "url": "https://user:pass@example.com/health"},
    )
    assert response.status_code == 422


def test_create_loopback_url_rejected(client) -> None:
    for url in (
        "http://127.0.0.1/health",
        "http://10.0.0.8/x",
        "http://192.168.1.1/x",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/x",
        "http://[::ffff:127.0.0.1]/x",
        "http://localhost/x",
        "http://foo.localhost/x",
        "http://metadata.google.internal/computeMetadata/v1/",
    ):
        response = client.post("/api/v1/endpoints", json={"name": "bad", "url": url})
        assert response.status_code == 422, url


def test_create_malformed_url_rejected(client) -> None:
    for url in ("not-a-url", "https://", "example.com/x", "http://exa mple.com/"):
        response = client.post("/api/v1/endpoints", json={"name": "bad", "url": url})
        assert response.status_code == 422, url


def test_list_endpoints_empty(client) -> None:
    response = client.get("/api/v1/endpoints")
    assert response.status_code == 200
    body = response.json()
    assert body == {"total": 0, "limit": 100, "offset": 0, "items": []}


def test_list_endpoints_ordering_and_pagination(client) -> None:
    ids = [register_endpoint(client, name=f"ep-{i}")["id"] for i in range(5)]
    response = client.get("/api/v1/endpoints?limit=2")
    body = response.json()
    assert body["total"] == 5
    assert [item["id"] for item in body["items"]] == list(reversed(ids))[:2]

    response = client.get("/api/v1/endpoints?limit=2&offset=2")
    body = response.json()
    assert [item["id"] for item in body["items"]] == list(reversed(ids))[2:4]


def test_list_endpoints_limit_bounds(client) -> None:
    assert client.get("/api/v1/endpoints?limit=0").status_code == 422
    assert client.get("/api/v1/endpoints?limit=501").status_code == 422
    assert client.get("/api/v1/endpoints?offset=-1").status_code == 422


def test_get_endpoint(client) -> None:
    created = register_endpoint(client)
    response = client.get(f"/api/v1/endpoints/{created['id']}")
    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_endpoint_404(client) -> None:
    assert client.get("/api/v1/endpoints/999999").status_code == 404


def test_get_non_integer_id_422(client) -> None:
    assert client.get("/api/v1/endpoints/not-a-number").status_code == 422
    assert client.get("/api/v1/endpoints/0").status_code == 422


def test_patch_name(client) -> None:
    created = register_endpoint(client)
    response = client.patch(f"/api/v1/endpoints/{created['id']}", json={"name": "Renamed"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["is_active"] is True
    assert body["updated_at"] >= created["updated_at"]


def test_patch_is_active(client) -> None:
    created = register_endpoint(client)
    response = client.patch(f"/api/v1/endpoints/{created['id']}", json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_patch_both_fields(client) -> None:
    created = register_endpoint(client)
    response = client.patch(
        f"/api/v1/endpoints/{created['id']}",
        json={"name": "Both", "is_active": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Both" and body["is_active"] is False


def test_patch_empty_body_422(client) -> None:
    created = register_endpoint(client)
    assert client.patch(f"/api/v1/endpoints/{created['id']}", json={}).status_code == 422


def test_patch_unknown_404(client) -> None:
    response = client.patch("/api/v1/endpoints/424242", json={"name": "x"})
    assert response.status_code == 404


def test_patch_blank_name_422(client) -> None:
    created = register_endpoint(client)
    response = client.patch(f"/api/v1/endpoints/{created['id']}", json={"name": "  "})
    assert response.status_code == 422


def test_delete_endpoint(client) -> None:
    created = register_endpoint(client)
    response = client.delete(f"/api/v1/endpoints/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/v1/endpoints/{created['id']}").status_code == 404


def test_delete_unknown_404(client) -> None:
    assert client.delete("/api/v1/endpoints/777").status_code == 404


def test_delete_cascades_check_history(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    record_check(
        db,
        endpoint_id=created["id"],
        checked_at="2026-01-01T00:00:00.000000+00:00",
        status_code=200,
        latency_ms=12.0,
        success=True,
        error_type=None,
    )
    assert client.get(f"/api/v1/endpoints/{created['id']}/history").json()["total"] == 1

    assert client.delete(f"/api/v1/endpoints/{created['id']}").status_code == 204

    with db.connection() as conn:
        remaining = conn.execute("SELECT COUNT(*) FROM check_results").fetchone()[0]
    assert remaining == 0


def test_database_persists_across_app_instances(make_app, settings) -> None:
    from fastapi.testclient import TestClient

    with TestClient(make_app()) as client_a:
        created = register_endpoint(client_a)
    with TestClient(make_app()) as client_b:
        response = client_b.get(f"/api/v1/endpoints/{created['id']}")
        assert response.status_code == 200
        assert response.json()["name"] == "Example API"


def test_sql_injection_payload_stored_as_data(client, settings) -> None:
    evil_name = "'; DROP TABLE check_results; --"
    evil_url = "https://example.com/q?x=1'%20OR%20'1'='1"
    response = client.post("/api/v1/endpoints", json={"name": evil_name, "url": evil_url})
    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == evil_name

    fetched = client.get(f"/api/v1/endpoints/{payload['id']}").json()
    assert fetched["name"] == evil_name
    assert fetched["url"] == evil_url

    db = Database(settings.db_path)
    with db.connection() as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    assert "check_results" in tables
    assert "monitored_endpoints" in tables
