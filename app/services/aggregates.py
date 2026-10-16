"""Aggregate views: status classification, dashboard summary, chart trends.

States are derived, never guessed: an endpoint with no recorded check is
``unknown``, and ``degraded`` only applies to a successful latest check whose
latency exceeded the configured threshold.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from app.config import Settings
from app.database import Database
from app.models import EndpointStatusRow
from app.repository import aggregate_all_checks, endpoint_statuses, trend_buckets
from app.schemas import (
    EndpointStatus,
    ReportWindow,
    SummaryEndpointCounts,
    SummaryRead,
    TrendBucket,
    TrendRead,
)

Granularity = Literal["hour", "day"]
RequestedGranularity = Literal["auto", "hour", "day"]


def classify_state(
    row: EndpointStatusRow, *, degraded_threshold_ms: float
) -> Literal["healthy", "degraded", "failing", "unknown"]:
    """Map one endpoint's latest check to healthy/degraded/failing/unknown."""
    if row.success is None:
        return "unknown"
    if not row.success:
        return "failing"
    if row.latency_ms is not None and row.latency_ms > degraded_threshold_ms:
        return "degraded"
    return "healthy"


def build_endpoint_status(
    row: EndpointStatusRow, *, hours: int, degraded_threshold_ms: float
) -> EndpointStatus:
    """Render the derived status block shown by list and detail routes."""
    total = row.window_total
    availability = round(row.window_successful / total * 100, 2) if total else None
    return EndpointStatus(
        state=classify_state(row, degraded_threshold_ms=degraded_threshold_ms),
        checked_at=row.checked_at,
        status_code=row.status_code,
        latency_ms=round(row.latency_ms, 2) if row.latency_ms is not None else None,
        availability_percent=availability,
        total_checks=total,
        window_hours=hours,
        degraded_threshold_ms=degraded_threshold_ms,
    )


def statuses_for(
    db: Database,
    *,
    hours: int,
    settings: Settings,
    endpoint_ids: list[int] | None = None,
    now: datetime | None = None,
) -> dict[int, EndpointStatus]:
    """Derived status for a subset (or all) of endpoints over the window."""
    end = now or datetime.now(UTC)
    start = end - timedelta(hours=hours)
    rows = endpoint_statuses(
        db,
        since=start.isoformat(timespec="microseconds"),
        until=end.isoformat(timespec="microseconds"),
        endpoint_ids=endpoint_ids,
    )
    return {
        endpoint_id: build_endpoint_status(
            row, hours=hours, degraded_threshold_ms=settings.degraded_latency_ms
        )
        for endpoint_id, row in rows.items()
    }


def build_summary(
    db: Database,
    *,
    hours: int,
    settings: Settings,
    now: datetime | None = None,
) -> SummaryRead:
    """Aggregate endpoint states and check statistics over the window."""
    end = now or datetime.now(UTC)
    start = end - timedelta(hours=hours)
    since = start.isoformat(timespec="microseconds")
    until = end.isoformat(timespec="microseconds")

    rows = endpoint_statuses(db, since=since, until=until)
    threshold = settings.degraded_latency_ms
    states = [classify_state(row, degraded_threshold_ms=threshold) for row in rows.values()]
    last_check_at = max((row.checked_at for row in rows.values() if row.checked_at), default=None)

    stats = aggregate_all_checks(db, since=since, until=until)
    total = stats["total"]
    successful = stats["successful"]
    avg = stats["average_latency_ms"]

    return SummaryRead(
        window=ReportWindow(
            hours=hours,
            **{"from": since},
            to=until,
        ),
        endpoints=SummaryEndpointCounts(
            total=len(rows),
            active=sum(1 for row in rows.values() if row.is_active),
            inactive=sum(1 for row in rows.values() if not row.is_active),
            healthy=states.count("healthy"),
            degraded=states.count("degraded"),
            failing=states.count("failing"),
            unknown=states.count("unknown"),
        ),
        total_checks=total,
        successful_checks=successful,
        failed_checks=total - successful,
        availability_percent=round(successful / total * 100, 2) if total else 0.0,
        average_latency_ms=round(avg, 2) if avg is not None else None,
        degraded_threshold_ms=threshold,
        last_check_at=last_check_at,
    )


def resolve_granularity(hours: int, requested: RequestedGranularity) -> Granularity:
    """Pick the bucket width; hourly detail is kept for short windows."""
    if requested == "auto":
        return "hour" if hours <= 48 else "day"
    return requested


def _floor(value: datetime, granularity: Granularity) -> datetime:
    if granularity == "hour":
        return value.replace(minute=0, second=0, microsecond=0)
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _label(key: str, granularity: Granularity) -> str:
    if granularity == "hour":
        return f"{key}:00:00+00:00"
    return f"{key}T00:00:00+00:00"


def build_trend(
    db: Database,
    *,
    hours: int,
    granularity: RequestedGranularity,
    settings: Settings,
    endpoint_id: int | None = None,
    now: datetime | None = None,
) -> TrendRead:
    """Bucketed series with empty buckets filled in so gaps stay visible."""
    del settings  # reserved for future window defaults; keeps call sites uniform
    end = now or datetime.now(UTC)
    start = end - timedelta(hours=hours)
    resolved = resolve_granularity(hours, granularity)
    since = start.isoformat(timespec="microseconds")
    until = end.isoformat(timespec="microseconds")

    raw = {
        str(row["bucket"]): row
        for row in trend_buckets(
            db, since=since, until=until, precision=resolved, endpoint_id=endpoint_id
        )
    }

    step = timedelta(hours=1) if resolved == "hour" else timedelta(days=1)
    keys: list[str] = []
    cursor = _floor(start, resolved)
    while cursor <= _floor(end, resolved):
        keys.append(
            cursor.strftime("%Y-%m-%dT%H") if resolved == "hour" else cursor.strftime("%Y-%m-%d")
        )
        cursor += step

    buckets: list[TrendBucket] = []
    for key in keys:
        row = raw.get(key)
        if row is None:
            buckets.append(
                TrendBucket(bucket_start=_label(key, resolved), total=0, successful=0, failed=0)
            )
            continue
        total = int(row["total"])
        successful = int(row["successful"])
        avg = row["average_latency_ms"]
        buckets.append(
            TrendBucket(
                bucket_start=_label(key, resolved),
                total=total,
                successful=successful,
                failed=total - successful,
                average_latency_ms=round(avg, 2) if avg is not None else None,
            )
        )

    return TrendRead(
        window=ReportWindow(hours=hours, **{"from": since}, to=until),
        granularity=resolved,
        endpoint_id=endpoint_id,
        buckets=buckets,
    )
