"""History listing tests: ordering, pagination, bounds, and 404s."""

from __future__ import annotations

from app.database import Database
from app.repository import record_check

from .conftest import PUBLIC_URL, register_endpoint


def _seed_checks(db: Database, endpoint_id: int, timestamps: list[str]) -> None:
    for index, ts in enumerate(timestamps):
        record_check(
            db,
            endpoint_id=endpoint_id,
            checked_at=ts,
            status_code=200 if index % 2 == 0 else None,
            latency_ms=float(index) if index % 2 == 0 else None,
            success=index % 2 == 0,
            error_type=None if index % 2 == 0 else "timeout",
        )


def test_empty_history(client) -> None:
    created = register_endpoint(client)
    response = client.get(f"/api/v1/endpoints/{created['id']}/history")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["limit"] == 20
    assert body["offset"] == 0


def test_history_descending_order(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    timestamps = [
        "2026-01-01T00:00:00.000000+00:00",
        "2026-01-02T00:00:00.000000+00:00",
        "2026-01-03T00:00:00.000000+00:00",
    ]
    _seed_checks(db, created["id"], timestamps)

    response = client.get(f"/api/v1/endpoints/{created['id']}/history")
    body = response.json()
    assert body["total"] == 3
    returned = [item["checked_at"] for item in body["items"]]
    assert returned == sorted(timestamps, reverse=True)


def test_history_pagination(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    timestamps = [f"2026-02-{day:02d}T00:00:00.000000+00:00" for day in range(1, 6)]
    _seed_checks(db, created["id"], timestamps)

    page1 = client.get(f"/api/v1/endpoints/{created['id']}/history?limit=2&offset=0").json()
    page2 = client.get(f"/api/v1/endpoints/{created['id']}/history?limit=2&offset=2").json()
    page3 = client.get(f"/api/v1/endpoints/{created['id']}/history?limit=2&offset=4").json()

    assert [i["checked_at"] for i in page1["items"]] == timestamps[4:2:-1]
    assert [i["checked_at"] for i in page2["items"]] == timestamps[2:0:-1]
    assert [i["checked_at"] for i in page3["items"]] == [timestamps[0]]
    assert page1["total"] == page2["total"] == page3["total"] == 5


def test_history_limit_bounds(client) -> None:
    created = register_endpoint(client)
    base = f"/api/v1/endpoints/{created['id']}/history"
    assert client.get(f"{base}?limit=0").status_code == 422
    assert client.get(f"{base}?limit=-5").status_code == 422
    assert client.get(f"{base}?offset=-1").status_code == 422


def test_history_limit_above_configured_max_rejected(client, settings) -> None:
    created = register_endpoint(client)
    response = client.get(
        f"/api/v1/endpoints/{created['id']}/history?limit={settings.history_max_limit + 1}"
    )
    assert response.status_code == 422


def test_history_unknown_endpoint_404(client) -> None:
    assert client.get("/api/v1/endpoints/888888/history").status_code == 404


def test_history_fields_serialized(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    record_check(
        db,
        endpoint_id=created["id"],
        checked_at="2026-03-01T12:00:00.000000+00:00",
        status_code=None,
        latency_ms=None,
        success=False,
        error_type="connection_error",
    )
    item = client.get(f"/api/v1/endpoints/{created['id']}/history").json()["items"][0]
    assert item["status_code"] is None
    assert item["latency_ms"] is None
    assert item["success"] is False
    assert item["error_type"] == "connection_error"
    assert item["endpoint_id"] == created["id"]
    assert PUBLIC_URL  # imported for parity with other suites
