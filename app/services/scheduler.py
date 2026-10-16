"""Background loop that checks every active endpoint on a fixed interval.

A single pass runs sequentially (one endpoint at a time) so the scheduler
never overlaps itself. ``check_interval_seconds = 0`` disables the loop
entirely; ``run_once`` stays callable for tests and manual triggers.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.config import Settings
from app.database import Database
from app.repository import list_active_endpoints, utc_now_iso
from app.services.checker import CheckService

logger = logging.getLogger("pulsewatch.scheduler")

FIRST_RUN_DELAY_SECONDS = 2.0


@dataclass(slots=True)
class SchedulerState:
    """Mutable snapshot exposed through ``GET /api/v1/scheduler``."""

    enabled: bool
    interval_seconds: int
    last_run_at: str | None = None
    last_run_checked: int = 0
    next_run_at: str | None = None
    total_checks: int = 0


class Scheduler:
    """Periodic pass over every active endpoint."""

    def __init__(
        self,
        database: Database,
        settings: Settings,
        checker: CheckService,
    ) -> None:
        self._db = database
        self._settings = settings
        self._checker = checker
        self.task: asyncio.Task[None] | None = None
        self.state = SchedulerState(
            enabled=settings.check_interval_seconds > 0,
            interval_seconds=settings.check_interval_seconds,
        )
        if self.enabled:
            self.state.next_run_at = _plus_seconds(FIRST_RUN_DELAY_SECONDS)

    @property
    def enabled(self) -> bool:
        """True when the interval is strictly positive."""
        return self._settings.check_interval_seconds > 0

    async def run(self) -> None:
        """Loop forever: first pass after a short delay, then every interval."""
        if not self.enabled:
            return
        await asyncio.sleep(FIRST_RUN_DELAY_SECONDS)
        while True:
            await self.run_once()
            await asyncio.sleep(self._settings.check_interval_seconds)

    async def run_once(self) -> int:
        """Run one pass over active endpoints and refresh the state."""
        endpoints = list_active_endpoints(self._db)
        checked = 0
        for endpoint in endpoints:
            try:
                await self._checker.run_check(endpoint)
                checked += 1
            except Exception:
                logger.exception("scheduler: unexpected error checking endpoint %s", endpoint.id)
        finished_at = utc_now_iso()
        self.state.last_run_at = finished_at
        self.state.last_run_checked = len(endpoints)
        self.state.total_checks += checked
        if self.enabled:
            self.state.next_run_at = _plus_seconds(self._settings.check_interval_seconds)
        logger.info(
            "scheduler: pass complete, %d active endpoints (%d recorded)",
            len(endpoints),
            checked,
        )
        return len(endpoints)


def _plus_seconds(seconds: float) -> str:
    """Current UTC time plus ``seconds`` as an ISO-8601 string."""
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()
