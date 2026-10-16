"""Aggregate routes: global history log, dashboard summary, chart trends."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app import repository
from app.api.deps import get_database, get_settings
from app.config import Settings
from app.database import Database
from app.schemas import CheckItemRead, GlobalHistoryPage, SummaryRead, TrendRead
from app.services.aggregates import build_summary, build_trend

router = APIRouter()

SettingsDep = Annotated[Settings, Depends(get_settings)]
DatabaseDep = Annotated[Database, Depends(get_database)]
HTTP_422 = status.HTTP_422_UNPROCESSABLE_CONTENT
MAX_HOURS = 8760


def _require_endpoint(db: Database, endpoint_id: int) -> None:
    if repository.get_endpoint(db, endpoint_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )


@router.get(
    "/api/v1/history",
    response_model=GlobalHistoryPage,
    tags=["history"],
    summary="Global check log across all endpoints",
    responses={404: {"description": "Unknown endpoint id filter."}},
)
def global_history(
    db: DatabaseDep,
    settings: SettingsDep,
    limit: Annotated[
        int | None,
        Query(ge=1, description="Page size; defaults to 20, capped by configuration."),
    ] = None,
    offset: Annotated[int, Query(ge=0, description="Rows to skip.")] = 0,
    endpoint_id: Annotated[
        int | None, Query(ge=1, description="Restrict the log to one endpoint.")
    ] = None,
    success: Annotated[
        bool | None, Query(description="true for successful checks, false for failures.")
    ] = None,
    hours: Annotated[
        int | None,
        Query(ge=1, le=MAX_HOURS, description="Only checks from the last N hours."),
    ] = None,
) -> GlobalHistoryPage:
    """Return stored checks from every endpoint, newest first."""
    if endpoint_id is not None:
        _require_endpoint(db, endpoint_id)
    effective_limit = limit if limit is not None else settings.history_default_limit
    if effective_limit > settings.history_max_limit:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"limit must be at most {settings.history_max_limit}",
        )
    since = None
    if hours is not None:
        since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat(timespec="microseconds")
    items, total = repository.list_all_checks(
        db,
        limit=effective_limit,
        offset=offset,
        endpoint_id=endpoint_id,
        success=success,
        since=since,
    )
    return GlobalHistoryPage(
        total=total,
        limit=effective_limit,
        offset=offset,
        items=[
            CheckItemRead(
                id=item.id,
                endpoint_id=item.endpoint_id,
                endpoint_name=item.endpoint_name,
                endpoint_url=item.endpoint_url,
                checked_at=item.checked_at,
                status_code=item.status_code,
                latency_ms=item.latency_ms,
                success=item.success,
                error_type=item.error_type,
            )
            for item in items
        ],
    )


@router.get(
    "/api/v1/summary",
    response_model=SummaryRead,
    tags=["reports"],
    summary="Dashboard summary over a time window",
)
def summary(
    db: DatabaseDep,
    settings: SettingsDep,
    hours: Annotated[
        int | None,
        Query(ge=1, le=MAX_HOURS, description="Window size in hours; defaults to 24."),
    ] = None,
) -> SummaryRead:
    """Aggregate endpoint health states and check statistics for the dashboard."""
    effective_hours = hours if hours is not None else settings.report_default_hours
    return build_summary(db, hours=effective_hours, settings=settings)


@router.get(
    "/api/v1/trend",
    response_model=TrendRead,
    tags=["reports"],
    summary="Bucketed availability and latency series for charts",
    responses={404: {"description": "Unknown endpoint id filter."}},
)
def trend(
    db: DatabaseDep,
    settings: SettingsDep,
    hours: Annotated[
        int | None,
        Query(ge=1, le=MAX_HOURS, description="Window size in hours; defaults to 24."),
    ] = None,
    endpoint_id: Annotated[
        int | None, Query(ge=1, description="Series for one endpoint instead of all.")
    ] = None,
    granularity: Annotated[
        Literal["auto", "hour", "day"],
        Query(description="Bucket width; auto picks hourly for windows up to 48h."),
    ] = "auto",
) -> TrendRead:
    """Return time buckets with empty periods included, so gaps stay visible."""
    if endpoint_id is not None:
        _require_endpoint(db, endpoint_id)
    effective_hours = hours if hours is not None else settings.report_default_hours
    return build_trend(
        db,
        hours=effective_hours,
        granularity=granularity,
        settings=settings,
        endpoint_id=endpoint_id,
    )
