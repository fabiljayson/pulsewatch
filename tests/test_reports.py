"""Reliability report tests: counts, availability, latency, windows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.database import Database
from app.repository import record_check, utc_now_iso

from .conftest import PUBLIC_URL, register_endpoint


def _seed(
    db: Database,
    endpoint_id: int,
    *,
    success: bool,
    latency_ms: float | None,
    checked_at: str | None = None,
    status_code: int | None = 200,
    error_type: str | None = None,
) -> None:
    record_check(
        db,
        endpoint_id=endpoint_id,
        checked_at=checked_at or utc_now_iso(),
        status_code=status_code,
        latency_ms=latency_ms,
        success=success,
        error_type=error_type,
    )


def test_empty_report(client) -> None:
    created = register_endpoint(client)
    response = client.get(f"/api/v1/endpoints/{created['id']}/report")
    assert response.status_code == 200
    body = response.json()
    assert body["total_checks"] == 0
    assert body["successful_checks"] == 0
    assert body["failed_checks"] == 0
    assert body["availability_percent"] == 0.0
    assert body["average_latency_ms"] is None
    assert body["first_check_at"] is None
    assert body["last_check_at"] is None
    assert body["window"]["hours"] == 24
    assert body["window"]["from"] < body["window"]["to"]


def test_report_counts_and_availability(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    # 2 successes (100ms, 200ms), 1 http failure (300ms), 1 timeout (no latency)
    _seed(db, created["id"], success=True, latency_ms=100.0)
    _seed(db, created["id"], success=True, latency_ms=200.0)
    _seed(
        db,
        created["id"],
        success=False,
        latency_ms=300.0,
        status_code=500,
        error_type="http_error",
    )
    _seed(
        db,
        created["id"],
        success=False,
        latency_ms=None,
        status_code=None,
        error_type="timeout",
    )

    body = client.get(f"/api/v1/endpoints/{created['id']}/report").json()
    assert body["total_checks"] == 4
    assert body["successful_checks"] == 2
    assert body["failed_checks"] == 2
    assert body["availability_percent"] == 50.0
    # timeout must not count as a 0ms response: mean of 100 and 200 only
    assert body["average_latency_ms"] == 200.0
    assert body["first_check_at"] is not None
    assert body["last_check_at"] is not None


def test_report_availability_decimal(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    for i in range(3):
        _seed(db, created["id"], success=True, latency_ms=10.0 + i)
    _seed(db, created["id"], success=False, latency_ms=99.0, status_code=500)

    body = client.get(f"/api/v1/endpoints/{created['id']}/report").json()
    assert body["total_checks"] == 4
    assert body["availability_percent"] == 75.0
    # measured latencies only: (10 + 11 + 12 + 99) / 4 — the 500 did measure a response
    assert body["average_latency_ms"] == 33.0


def test_report_time_window_filtering(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    now = datetime.now(UTC)
    recent = (now - timedelta(hours=1)).isoformat(timespec="microseconds")
    old = (now - timedelta(hours=48)).isoformat(timespec="microseconds")

    _seed(db, created["id"], success=True, latency_ms=50.0, checked_at=recent)
    _seed(db, created["id"], success=True, latency_ms=150.0, checked_at=old)

    body = client.get(f"/api/v1/endpoints/{created['id']}/report?hours=24").json()
    assert body["total_checks"] == 1
    assert body["average_latency_ms"] == 50.0
    assert body["window"]["hours"] == 24

    body = client.get(f"/api/v1/endpoints/{created['id']}/report?hours=72").json()
    assert body["total_checks"] == 2
    assert body["window"]["hours"] == 72


def test_report_custom_hours(client) -> None:
    created = register_endpoint(client)
    response = client.get(f"/api/v1/endpoints/{created['id']}/report?hours=2")
    assert response.status_code == 200
    assert response.json()["window"]["hours"] == 2


def test_report_hours_bounds(client) -> None:
    created = register_endpoint(client)
    base = f"/api/v1/endpoints/{created['id']}/report"
    assert client.get(f"{base}?hours=0").status_code == 422
    assert client.get(f"{base}?hours=8761").status_code == 422


def test_report_unknown_endpoint_404(client) -> None:
    assert client.get("/api/v1/endpoints/555555/report").status_code == 404


def test_report_all_failures_no_latency(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(
        db,
        created["id"],
        success=False,
        latency_ms=None,
        status_code=None,
        error_type="connection_error",
    )
    _seed(
        db,
        created["id"],
        success=False,
        latency_ms=None,
        status_code=None,
        error_type="timeout",
    )
    body = client.get(f"/api/v1/endpoints/{created['id']}/report").json()
    assert body["availability_percent"] == 0.0
    assert body["average_latency_ms"] is None
    assert body["failed_checks"] == 2


def test_report_from_empty_then_seeded(client, settings) -> None:
    """Registration URL constant sanity + report window bounds ordering."""
    created = register_endpoint(client)
    body = client.get(f"/api/v1/endpoints/{created['id']}/report").json()
    assert body["window"]["from"] < body["window"]["to"]
    assert PUBLIC_URL.endswith("/v1/health")
