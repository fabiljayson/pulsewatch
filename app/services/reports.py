"""Reliability report computation.

Availability is ``successful / total * 100`` over an explicit time window.
Average latency covers only checks that produced a measured response time;
timeouts and connection failures are excluded, never counted as zero.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.database import Database
from app.repository import aggregate_checks
from app.schemas import ReportRead, ReportWindow


def build_report(
    db: Database,
    endpoint_id: int,
    *,
    hours: int,
    now: datetime | None = None,
) -> ReportRead:
    """Aggregate check statistics for ``endpoint_id`` over the last ``hours``."""
    end = now or datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    stats = aggregate_checks(
        db,
        endpoint_id,
        since=start.isoformat(timespec="microseconds"),
        until=end.isoformat(timespec="microseconds"),
    )
    total = stats["total"]
    successful = stats["successful"]
    failed = total - successful
    availability = round(successful / total * 100, 2) if total else 0.0
    avg = stats["average_latency_ms"]
    return ReportRead(
        endpoint_id=endpoint_id,
        total_checks=total,
        successful_checks=successful,
        failed_checks=failed,
        availability_percent=availability,
        average_latency_ms=round(avg, 2) if avg is not None else None,
        first_check_at=stats["first_check_at"],
        last_check_at=stats["last_check_at"],
        window=ReportWindow(
            hours=hours,
            **{"from": start.isoformat(timespec="microseconds")},
            to=end.isoformat(timespec="microseconds"),
        ),
    )
