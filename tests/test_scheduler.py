"""Automatic scheduler tests: config wiring, passes, and status endpoint."""

from __future__ import annotations

import asyncio
import dataclasses

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Database
from app.main import create_app
from app.repository import create_endpoint, list_checks
from app.services.checker import CheckService
from app.services.scheduler import FIRST_RUN_DELAY_SECONDS, Scheduler

from .conftest import PUBLIC_URL, fake_resolver, mock_transport, register_endpoint


def test_scheduler_disabled_by_default(client) -> None:
    body = client.get("/api/v1/scheduler").json()
    assert body == {
        "enabled": False,
        "interval_seconds": 0,
        "last_run_at": None,
        "last_run_checked": 0,
        "next_run_at": None,
        "total_checks": 0,
    }
    assert client.app.state.scheduler.task is None


def test_lifespan_starts_and_stops_the_loop(make_app, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.scheduler.FIRST_RUN_DELAY_SECONDS", 3600.0)
    app = make_app(check_interval_seconds=3600)
    with TestClient(app):
        task = app.state.scheduler.task
        assert task is not None
        assert not task.done()
    assert task.cancelled()


async def test_run_once_visits_only_active_endpoints(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    create_endpoint(db, name="watched", url=PUBLIC_URL)
    create_endpoint(db, name="paused", url=PUBLIC_URL, is_active=False)

    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200)

    checker = CheckService(db, settings, resolver=fake_resolver, transport=mock_transport(handler))
    scheduler = Scheduler(db, settings, checker)

    assert await scheduler.run_once() == 1
    assert len(seen) == 1
    state = scheduler.state
    assert state.enabled is False
    assert state.last_run_checked == 1
    assert state.last_run_at is not None
    assert state.next_run_at is None
    assert state.total_checks == 1
    stored = list_checks(db, 1, limit=10, offset=0)
    assert len(stored) == 1


async def test_run_once_schedules_next_pass_when_enabled(settings) -> None:
    enabled = dataclasses.replace(settings, check_interval_seconds=60)
    db = Database(enabled.db_path)
    db.initialize()
    checker = CheckService(db, enabled, resolver=fake_resolver, transport=None)
    scheduler = Scheduler(db, enabled, checker)

    assert scheduler.enabled is True
    assert scheduler.state.next_run_at is not None
    await scheduler.run_once()
    assert scheduler.state.next_run_at is not None
    assert scheduler.state.last_run_at is not None


async def test_run_returns_immediately_when_disabled(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    scheduler = Scheduler(db, settings, None)  # type: ignore[arg-type]
    await asyncio.wait_for(scheduler.run(), timeout=1.0)


async def test_run_once_survives_checker_errors(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    create_endpoint(db, name="flaky", url=PUBLIC_URL)

    class BoomChecker:
        async def run_check(self, endpoint):
            raise RuntimeError("checker exploded")

    scheduler = Scheduler(db, settings, BoomChecker())  # type: ignore[arg-type]
    assert await scheduler.run_once() == 1
    assert scheduler.state.last_run_checked == 1
    assert scheduler.state.total_checks == 0


def test_status_endpoint_reflects_a_completed_pass(
    make_app, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.scheduler.FIRST_RUN_DELAY_SECONDS", 3600.0)
    app = make_app(
        transport=mock_transport(lambda request: httpx.Response(200)),
        check_interval_seconds=300,
    )
    with TestClient(app) as client:
        register_endpoint(client)
        asyncio.run(app.state.scheduler.run_once())
        body = client.get("/api/v1/scheduler").json()
    assert body["enabled"] is True
    assert body["interval_seconds"] == 300
    assert body["last_run_checked"] == 1
    assert body["total_checks"] == 1
    assert body["last_run_at"] is not None
    assert body["next_run_at"] is not None


def test_status_endpoint_requires_auth(tmp_path) -> None:
    settings = Settings(
        db_path=tmp_path / "sec.db",
        admin_password="s3cret",
        check_interval_seconds=0,
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/scheduler").status_code == 401


def test_first_pass_delay_is_short() -> None:
    assert FIRST_RUN_DELAY_SECONDS <= 5.0
