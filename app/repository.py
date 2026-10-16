"""SQL data access for PulseWatch.

All statements are parameterized. Connections come from
:meth:`app.database.Database.connection`, which enables foreign keys.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from app.database import Database
from app.models import CheckResult, MonitoredEndpoint


def utc_now_iso() -> str:
    """Current UTC time as a sortable ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _row_to_endpoint(row: sqlite3.Row) -> MonitoredEndpoint:
    return MonitoredEndpoint(
        id=row["id"],
        name=row["name"],
        url=row["url"],
        is_active=bool(row["is_active"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_check(row: sqlite3.Row) -> CheckResult:
    return CheckResult(
        id=row["id"],
        endpoint_id=row["endpoint_id"],
        checked_at=row["checked_at"],
        status_code=row["status_code"],
        latency_ms=row["latency_ms"],
        success=bool(row["success"]),
        error_type=row["error_type"],
    )


def create_endpoint(
    db: Database, *, name: str, url: str, is_active: bool = True
) -> MonitoredEndpoint:
    """Insert a monitored endpoint and return the stored row."""
    now = utc_now_iso()
    with db.connection() as conn:
        cursor = conn.execute(
            "INSERT INTO monitored_endpoints (name, url, is_active, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (name, url, int(is_active), now, now),
        )
        endpoint_id = cursor.lastrowid
        row = conn.execute(
            "SELECT * FROM monitored_endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    assert row is not None
    return _row_to_endpoint(row)


def get_endpoint(db: Database, endpoint_id: int) -> MonitoredEndpoint | None:
    """Fetch one endpoint by id, or None."""
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM monitored_endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    return _row_to_endpoint(row) if row else None


def list_endpoints(db: Database, *, limit: int, offset: int) -> tuple[list[MonitoredEndpoint], int]:
    """Return a page of endpoints (newest first) and the total count."""
    with db.connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM monitored_endpoints").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM monitored_endpoints ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [_row_to_endpoint(row) for row in rows], int(total)


def update_endpoint(
    db: Database,
    endpoint_id: int,
    *,
    name: str | None = None,
    is_active: bool | None = None,
) -> MonitoredEndpoint | None:
    """Update the given fields; returns the updated row or None if missing."""
    sets: list[str] = []
    params: list[object] = []
    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if is_active is not None:
        sets.append("is_active = ?")
        params.append(int(is_active))
    if not sets:
        return get_endpoint(db, endpoint_id)
    sets.append("updated_at = ?")
    params.append(utc_now_iso())
    params.append(endpoint_id)
    with db.connection() as conn:
        cursor = conn.execute(
            f"UPDATE monitored_endpoints SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM monitored_endpoints WHERE id = ?", (endpoint_id,)
        ).fetchone()
    assert row is not None
    return _row_to_endpoint(row)


def delete_endpoint(db: Database, endpoint_id: int) -> bool:
    """Delete an endpoint; associated check history is cascade-deleted."""
    with db.connection() as conn:
        cursor = conn.execute(
            "DELETE FROM monitored_endpoints WHERE id = ?", (endpoint_id,)
        )
        return cursor.rowcount > 0


def record_check(
    db: Database,
    *,
    endpoint_id: int,
    checked_at: str,
    status_code: int | None,
    latency_ms: float | None,
    success: bool,
    error_type: str | None,
) -> CheckResult:
    """Persist one check result and return it."""
    with db.connection() as conn:
        cursor = conn.execute(
            "INSERT INTO check_results"
            " (endpoint_id, checked_at, status_code, latency_ms, success, error_type)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (endpoint_id, checked_at, status_code, latency_ms, int(success), error_type),
        )
        result_id = cursor.lastrowid
        row = conn.execute(
            "SELECT * FROM check_results WHERE id = ?", (result_id,)
        ).fetchone()
    assert row is not None
    return _row_to_check(row)


def count_checks(db: Database, endpoint_id: int) -> int:
    """Total stored checks for an endpoint."""
    with db.connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM check_results WHERE endpoint_id = ?", (endpoint_id,)
        ).fetchone()
    return int(row[0])


def list_checks(
    db: Database, endpoint_id: int, *, limit: int, offset: int
) -> list[CheckResult]:
    """Most recent checks for an endpoint, newest first."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM check_results"
            " WHERE endpoint_id = ?"
            " ORDER BY checked_at DESC, id DESC"
            " LIMIT ? OFFSET ?",
            (endpoint_id, limit, offset),
        ).fetchall()
    return [_row_to_check(row) for row in rows]


def aggregate_checks(
    db: Database, endpoint_id: int, *, since: str, until: str
) -> dict[str, int | float | None]:
    """Aggregate check statistics for an endpoint within a time window.

    Returns keys: total, successful, average_latency_ms (mean over checks with a
    measured latency, None otherwise), first_check_at, last_check_at.
    """
    with db.connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS total,"
            "       COALESCE(SUM(success), 0) AS successful,"
            "       AVG(latency_ms) AS average_latency_ms,"
            "       MIN(checked_at) AS first_check_at,"
            "       MAX(checked_at) AS last_check_at"
            " FROM check_results"
            " WHERE endpoint_id = ? AND checked_at >= ? AND checked_at <= ?",
            (endpoint_id, since, until),
        ).fetchone()
    avg = row["average_latency_ms"]
    return {
        "total": int(row["total"]),
        "successful": int(row["successful"]),
        "average_latency_ms": float(avg) if avg is not None else None,
        "first_check_at": row["first_check_at"],
        "last_check_at": row["last_check_at"],
    }
