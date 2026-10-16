"""FastAPI application factory and ASGI entrypoint.

Run locally with::

    uv run uvicorn app.main:app --reload
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Any

import httpx
from fastapi import Depends, FastAPI

from app import __version__
from app.api.aggregates import router as aggregates_router
from app.api.auth import router as auth_router
from app.api.endpoints import router
from app.api.scheduler import router as scheduler_router
from app.auth import require_auth
from app.config import Settings
from app.database import Database
from app.services.checker import CheckService
from app.services.scheduler import Scheduler
from app.services.url_validation import Resolver, resolve_host

logger = logging.getLogger("pulsewatch")

OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness of the PulseWatch service itself."},
    {"name": "endpoints", "description": "Register and manage monitored endpoints."},
    {
        "name": "checks",
        "description": "Execute health checks on demand or inspect the automatic scheduler.",
    },
    {"name": "history", "description": "Persisted check results, newest first."},
    {"name": "reports", "description": "Reliability metrics over an explicit time window."},
    {"name": "auth", "description": "Single-admin login (enabled when a password is configured)."},
]

APP_DESCRIPTION = """
PulseWatch is a lightweight API health & reliability observatory.

Every request tells a story. Every failure leaves a trace.

It monitors HTTP/HTTPS endpoints, measures response latency with a monotonic
clock, records success and failure events in SQLite, and generates reliability
reports. Outbound requests are governed by an SSRF-aware URL policy: only
public http/https destinations are allowed, credentials in URLs are rejected,
and redirects are disabled by default.
"""


def create_app(
    settings: Settings | None = None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    resolver: Resolver | None = None,
    client_factory: Any = None,
) -> FastAPI:
    """Build an application instance; injectable for tests."""
    resolved_settings = settings or Settings.from_env()
    database = Database(resolved_settings.db_path)
    checker = CheckService(
        database,
        resolved_settings,
        resolver=resolver or resolve_host,
        transport=transport,
        client_factory=client_factory,
    )
    scheduler = Scheduler(database, resolved_settings, checker)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        database.initialize()
        task: asyncio.Task[None] | None = None
        if scheduler.enabled:
            task = asyncio.create_task(scheduler.run())
            scheduler.task = task
            logger.info(
                "automatic checks enabled: every %ss",
                resolved_settings.check_interval_seconds,
            )
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
                scheduler.task = None

    app = FastAPI(
        title="PulseWatch",
        summary="API Health & Reliability Observatory",
        description=APP_DESCRIPTION,
        version=__version__,
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.database = database
    app.state.checker = checker
    app.state.scheduler = scheduler
    app.include_router(auth_router)
    app.include_router(aggregates_router, dependencies=[Depends(require_auth)])
    app.include_router(router, dependencies=[Depends(require_auth)])
    app.include_router(scheduler_router, dependencies=[Depends(require_auth)])

    @app.get(
        "/health",
        tags=["health"],
        summary="Application health",
        description="Liveness probe for the PulseWatch service.",
    )
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "pulsewatch", "version": __version__}

    return app


app = create_app()
