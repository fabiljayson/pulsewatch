"""Automatic-check scheduler status."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_scheduler
from app.schemas import SchedulerStatusRead
from app.services.scheduler import Scheduler

router = APIRouter()


@router.get(
    "/api/v1/scheduler",
    response_model=SchedulerStatusRead,
    tags=["checks"],
    summary="Automatic check scheduler status",
    description=(
        "Whether background passes are running, how often, and when the next "
        "one is due. Disabled when PULSEWATCH_CHECK_INTERVAL_SECONDS is 0."
    ),
)
async def scheduler_status(
    scheduler: Annotated[Scheduler, Depends(get_scheduler)],
) -> SchedulerStatusRead:
    state = scheduler.state
    return SchedulerStatusRead(
        enabled=state.enabled,
        interval_seconds=state.interval_seconds,
        last_run_at=state.last_run_at,
        last_run_checked=state.last_run_checked,
        next_run_at=state.next_run_at,
        total_checks=state.total_checks,
    )
