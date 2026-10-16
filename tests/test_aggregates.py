"""Aggregate route tests: global history, dashboard summary, chart trends.

Covers the derived health states (including ``unknown`` for never-checked
endpoints), window filtering, bucket gaps, and query-parameter bounds.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.database import Database
from app.repository import record_check

from .conftest import PUBLIC_URL, register_endpoint


def _ts(minutes_ago: float) -> str:
    """ISO timestamp ``minutes_ago`` minutes in the past (UTC, microsecond precision)."""
    return (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat(timespec="microseconds")


def _seed(
    db: Database,
    endpoint_id: int,
    *,
    minutes_ago: float,
    success: bool,
    latency_ms: float | None = None,
    status_code: int | None = None,
    error_type: str | None = None,
) -> None:
    record_check(
        db,
        endpoint_id=endpoint_id,
        checked_at=_ts(minutes_ago),
        status_code=status_code,
        latency_ms=latency_ms,
        success=success,
        error_type=error_type,
    )


# ── GET /api/v1/history ──────────────────────────────────────────────────────


def test_global_history_empty(client) -> None:
    response = client.get("/api/v1/history")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["limit"] == 20
    assert body["offset"] == 0


def test_global_history_joins_endpoint_identity(client, settings) -> None:
    created = register_endpoint(client, name="Payments", url="https://pay.example.com/health")
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=1, success=True, latency_ms=120.0, status_code=200)

    item = client.get("/api/v1/history").json()["items"][0]
    assert item["endpoint_id"] == created["id"]
    assert item["endpoint_name"] == "Payments"
    assert item["endpoint_url"] == "https://pay.example.com/health"
    assert item["success"] is True
    assert item["latency_ms"] == 120.0
    assert item["error_type"] is None


def test_global_history_newest_first_across_endpoints(client, settings) -> None:
    first = register_endpoint(client, name="A", url="https://a.example.com/")
    second = register_endpoint(client, name="B", url="https://b.example.com/")
    db = Database(settings.db_path)
    _seed(db, first["id"], minutes_ago=30, success=True, latency_ms=10.0, status_code=200)
    _seed(db, second["id"], minutes_ago=5, success=False, error_type="timeout")

    items = client.get("/api/v1/history").json()["items"]
    assert [i["endpoint_name"] for i in items] == ["B", "A"]


def test_global_history_filter_by_success(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=10, success=True, latency_ms=50.0, status_code=200)
    _seed(db, created["id"], minutes_ago=5, success=False, error_type="http_error")

    failures = client.get("/api/v1/history?success=false").json()
    assert failures["total"] == 1
    assert failures["items"][0]["success"] is False
    assert failures["items"][0]["error_type"] == "http_error"

    successes = client.get("/api/v1/history?success=true").json()
    assert successes["total"] == 1
    assert successes["items"][0]["success"] is True


def test_global_history_filter_by_endpoint(client, settings) -> None:
    keep = register_endpoint(client, name="Keep", url="https://keep.example.com/")
    drop = register_endpoint(client, name="Drop", url="https://drop.example.com/")
    db = Database(settings.db_path)
    _seed(db, keep["id"], minutes_ago=9, success=True, latency_ms=30.0, status_code=200)
    _seed(db, drop["id"], minutes_ago=3, success=True, latency_ms=40.0, status_code=200)

    body = client.get(f"/api/v1/history?endpoint_id={keep['id']}").json()
    assert body["total"] == 1
    assert body["items"][0]["endpoint_name"] == "Keep"


def test_global_history_unknown_endpoint_filter_404(client) -> None:
    assert client.get("/api/v1/history?endpoint_id=999999").status_code == 404


def test_global_history_hours_window_excludes_old_checks(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=60 * 50, success=True, latency_ms=10.0, status_code=200)
    _seed(db, created["id"], minutes_ago=30, success=True, latency_ms=20.0, status_code=200)

    day = client.get("/api/v1/history?hours=24").json()
    assert day["total"] == 1
    assert day["items"][0]["latency_ms"] == 20.0

    week = client.get("/api/v1/history?hours=168").json()
    assert week["total"] == 2


def test_global_history_bounds(client, settings) -> None:
    created = register_endpoint(client)
    base = f"/api/v1/history?endpoint_id={created['id']}"
    assert client.get(f"{base}&limit=0").status_code == 422
    assert client.get(f"{base}&offset=-1").status_code == 422
    assert client.get(f"{base}&hours=0").status_code == 422
    assert client.get(f"{base}&hours=8761").status_code == 422
    too_big = client.get(f"/api/v1/history?limit={settings.history_max_limit + 1}")
    assert too_big.status_code == 422


def test_global_history_pagination(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    for minutes in range(1, 6):
        _seed(db, created["id"], minutes_ago=minutes, success=True, latency_ms=1.0, status_code=200)

    page1 = client.get("/api/v1/history?limit=2&offset=0").json()
    page2 = client.get("/api/v1/history?limit=2&offset=2").json()
    page3 = client.get("/api/v1/history?limit=2&offset=4").json()
    assert page1["total"] == page2["total"] == page3["total"] == 5
    assert len(page1["items"]) == len(page2["items"]) == 2
    assert len(page3["items"]) == 1


# ── GET /api/v1/summary ──────────────────────────────────────────────────────


def test_summary_empty_database(client) -> None:
    body = client.get("/api/v1/summary").json()
    assert body["window"]["hours"] == 24
    assert body["endpoints"] == {
        "total": 0,
        "active": 0,
        "inactive": 0,
        "healthy": 0,
        "degraded": 0,
        "failing": 0,
        "unknown": 0,
    }
    assert body["total_checks"] == 0
    assert body["successful_checks"] == 0
    assert body["failed_checks"] == 0
    assert body["availability_percent"] == 0.0
    assert body["average_latency_ms"] is None
    assert body["last_check_at"] is None


def test_summary_never_checked_endpoint_is_unknown_not_healthy(client, settings) -> None:
    register_endpoint(client, name="Untested", url="https://fresh.example.com/")
    body = client.get("/api/v1/summary").json()
    assert body["endpoints"]["total"] == 1
    assert body["endpoints"]["unknown"] == 1
    assert body["endpoints"]["healthy"] == 0


def test_summary_classifies_states(client, settings) -> None:
    healthy = register_endpoint(client, name="ok", url="https://ok.example.com/")
    slow = register_endpoint(client, name="slow", url="https://slow.example.com/")
    broken = register_endpoint(client, name="broken", url="https://broken.example.com/")
    register_endpoint(client, name="fresh", url="https://fresh.example.com/")
    db = Database(settings.db_path)

    _seed(db, healthy["id"], minutes_ago=2, success=True, latency_ms=90.0, status_code=200)
    _seed(db, slow["id"], minutes_ago=2, success=True, latency_ms=2500.0, status_code=200)
    _seed(db, broken["id"], minutes_ago=2, success=False, error_type="connection_error")

    body = client.get("/api/v1/summary").json()
    counts = body["endpoints"]
    assert counts["total"] == 4
    assert counts["healthy"] == 1
    assert counts["degraded"] == 1
    assert counts["failing"] == 1
    assert counts["unknown"] == 1
    assert body["degraded_threshold_ms"] == 1000.0


def test_summary_availability_and_latency(client, settings) -> None:
    a = register_endpoint(client, name="A", url="https://a.example.com/")
    b = register_endpoint(client, name="B", url="https://b.example.com/")
    db = Database(settings.db_path)
    _seed(db, a["id"], minutes_ago=4, success=True, latency_ms=100.0, status_code=200)
    _seed(db, a["id"], minutes_ago=3, success=True, latency_ms=300.0, status_code=200)
    _seed(db, b["id"], minutes_ago=2, success=False, error_type="timeout")

    body = client.get("/api/v1/summary").json()
    assert body["total_checks"] == 3
    assert body["successful_checks"] == 2
    assert body["failed_checks"] == 1
    assert body["availability_percent"] == 66.67
    assert body["average_latency_ms"] == 200.0
    assert body["last_check_at"] is not None


def test_summary_hours_window_excludes_old_checks(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=60 * 40, success=True, latency_ms=10.0, status_code=200)
    _seed(db, created["id"], minutes_ago=15, success=True, latency_ms=20.0, status_code=200)

    day = client.get("/api/v1/summary?hours=24").json()
    assert day["total_checks"] == 1
    assert day["average_latency_ms"] == 20.0

    two_days = client.get("/api/v1/summary?hours=48").json()
    assert two_days["total_checks"] == 2
    assert two_days["average_latency_ms"] == 15.0


def test_summary_bounds(client) -> None:
    assert client.get("/api/v1/summary?hours=0").status_code == 422
    assert client.get("/api/v1/summary?hours=8761").status_code == 422


def test_summary_inactive_endpoints_counted(client, settings) -> None:
    created = register_endpoint(client)
    client.patch(f"/api/v1/endpoints/{created['id']}", json={"is_active": False})
    body = client.get("/api/v1/summary").json()
    assert body["endpoints"]["active"] == 0
    assert body["endpoints"]["inactive"] == 1


# ── GET /api/v1/trend ────────────────────────────────────────────────────────


def test_trend_empty_includes_buckets_with_gaps(client) -> None:
    body = client.get("/api/v1/trend").json()
    assert body["granularity"] == "hour"
    assert body["endpoint_id"] is None
    assert len(body["buckets"]) > 0
    assert all(bucket["total"] == 0 for bucket in body["buckets"])
    assert all(bucket["average_latency_ms"] is None for bucket in body["buckets"])


def test_trend_counts_within_bucket(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=5, success=True, latency_ms=120.0, status_code=200)
    _seed(db, created["id"], minutes_ago=4, success=True, latency_ms=180.0, status_code=200)
    _seed(db, created["id"], minutes_ago=3, success=False, error_type="http_error")

    buckets = client.get("/api/v1/trend").json()["buckets"]
    populated = [bucket for bucket in buckets if bucket["total"] > 0]
    assert len(populated) == 1
    bucket = populated[0]
    assert bucket["total"] == 3
    assert bucket["successful"] == 2
    assert bucket["failed"] == 1
    assert bucket["average_latency_ms"] == 150.0


def test_trend_excludes_checks_outside_window(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=60 * 30, success=True, latency_ms=10.0, status_code=200)
    _seed(db, created["id"], minutes_ago=10, success=True, latency_ms=20.0, status_code=200)

    day = client.get("/api/v1/trend?hours=24").json()
    assert sum(bucket["total"] for bucket in day["buckets"]) == 1
    week = client.get("/api/v1/trend?hours=168").json()
    assert sum(bucket["total"] for bucket in week["buckets"]) == 2


def test_trend_auto_granularity(client) -> None:
    assert client.get("/api/v1/trend?hours=24").json()["granularity"] == "hour"
    assert client.get("/api/v1/trend?hours=48").json()["granularity"] == "hour"
    assert client.get("/api/v1/trend?hours=720").json()["granularity"] == "day"


def test_trend_explicit_granularity(client) -> None:
    body = client.get("/api/v1/trend?hours=720&granularity=hour").json()
    assert body["granularity"] == "hour"


def test_trend_endpoint_filter(client, settings) -> None:
    keep = register_endpoint(client, name="Keep", url="https://keep.example.com/")
    drop = register_endpoint(client, name="Drop", url="https://drop.example.com/")
    db = Database(settings.db_path)
    _seed(db, keep["id"], minutes_ago=6, success=True, latency_ms=30.0, status_code=200)
    _seed(db, drop["id"], minutes_ago=5, success=True, latency_ms=40.0, status_code=200)

    body = client.get(f"/api/v1/trend?endpoint_id={keep['id']}").json()
    assert body["endpoint_id"] == keep["id"]
    assert sum(bucket["total"] for bucket in body["buckets"]) == 1


def test_trend_unknown_endpoint_404(client) -> None:
    assert client.get("/api/v1/trend?endpoint_id=424242").status_code == 404


def test_trend_bounds(client) -> None:
    assert client.get("/api/v1/trend?hours=0").status_code == 422
    assert client.get("/api/v1/trend?hours=8761").status_code == 422
    assert client.get("/api/v1/trend?granularity=week").status_code == 422


# ── ?include_status=true on endpoint routes ──────────────────────────────────


def test_include_status_unknown_for_never_checked_endpoint(client) -> None:
    created = register_endpoint(client)
    body = client.get(f"/api/v1/endpoints/{created['id']}?include_status=true").json()
    status = body["status"]
    assert status["state"] == "unknown"
    assert status["checked_at"] is None
    assert status["availability_percent"] is None
    assert status["total_checks"] == 0
    assert status["window_hours"] == 24


def test_include_status_absent_by_default(client) -> None:
    created = register_endpoint(client)
    body = client.get(f"/api/v1/endpoints/{created['id']}").json()
    assert body["status"] is None


def test_include_status_on_list_with_window(client, settings) -> None:
    ok = register_endpoint(client, name="ok", url="https://ok.example.com/")
    bad = register_endpoint(client, name="bad", url="https://bad.example.com/")
    db = Database(settings.db_path)
    _seed(db, ok["id"], minutes_ago=3, success=True, latency_ms=80.0, status_code=200)
    _seed(db, bad["id"], minutes_ago=3, success=False, error_type="dns_error")

    body = client.get("/api/v1/endpoints?include_status=true&hours=24").json()
    states = {item["name"]: item["status"]["state"] for item in body["items"]}
    assert states == {"ok": "healthy", "bad": "failing"}
    for item in body["items"]:
        assert item["status"]["window_hours"] == 24


def test_include_status_availability_over_window(client, settings) -> None:
    created = register_endpoint(client)
    db = Database(settings.db_path)
    _seed(db, created["id"], minutes_ago=120, success=True, latency_ms=10.0, status_code=200)
    _seed(db, created["id"], minutes_ago=10, success=False, error_type="http_error")

    recent = client.get(f"/api/v1/endpoints/{created['id']}?include_status=true&hours=1").json()
    assert recent["status"]["availability_percent"] == 0.0
    assert recent["status"]["total_checks"] == 1

    wide = client.get(f"/api/v1/endpoints/{created['id']}?include_status=true&hours=24").json()
    assert wide["status"]["availability_percent"] == 50.0
    assert wide["status"]["total_checks"] == 2
    assert wide["status"]["state"] == "failing"


def test_summary_carries_every_dashboard_field(client) -> None:
    """Smoke check that the summary payload carries the dashboard's fields."""
    register_endpoint(client)
    body = client.get("/api/v1/summary").json()
    expected = (
        "window",
        "endpoints",
        "total_checks",
        "successful_checks",
        "failed_checks",
        "availability_percent",
        "average_latency_ms",
        "degraded_threshold_ms",
        "last_check_at",
    )
    for key in expected:
        assert key in body
    assert PUBLIC_URL  # imported for parity with other suites
