"""Shared test fixtures.

All tests run fully offline: outbound HTTP is mocked with ``httpx.MockTransport``
and DNS resolution is replaced by a fake resolver returning a public address.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PUBLIC_IP = "93.184.216.34"
PRIVATE_IP = "127.0.0.1"
PUBLIC_URL = "https://api.example.com/v1/health"


def fake_resolver(hostname: str, port: int) -> list[str]:
    """Offline resolver: always maps to a public example address."""
    del hostname, port
    return [PUBLIC_IP]


def private_resolver(hostname: str, port: int) -> list[str]:
    """Offline resolver simulating a loopback answer (SSRF rebind scenario)."""
    del hostname, port
    return [PRIVATE_IP]


def failing_resolver(hostname: str, port: int) -> list[str]:
    """Offline resolver simulating DNS failure."""
    del hostname, port
    import socket

    raise socket.gaierror("name or service not known")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings backed by a per-test temporary SQLite file."""
    return Settings(db_path=tmp_path / "test.db", check_interval_seconds=0)


@pytest.fixture
def make_app(settings: Settings) -> Callable[..., Any]:
    """Factory building isolated apps with optional transport/resolver overrides."""

    def _make(
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Callable[[str, int], list[str]] | None = None,
        **overrides: Any,
    ) -> Any:
        effective = dataclasses.replace(settings, **overrides) if overrides else settings
        return create_app(
            effective,
            transport=transport,
            resolver=resolver or fake_resolver,
        )

    return _make


@pytest.fixture
def app(make_app: Callable[..., Any]) -> Any:
    """Default application instance (mocked DNS, no outbound HTTP)."""
    return make_app()


@pytest.fixture
def client(app: Any) -> Any:
    """Test client with application lifespan (DB initialization) active."""
    with TestClient(app) as test_client:
        yield test_client


def mock_transport(
    handler: Callable[[httpx.Request], httpx.Response],
) -> httpx.MockTransport:
    """Build a MockTransport from a handler function."""
    return httpx.MockTransport(handler)


def constant_transport(
    status_code: int, headers: dict[str, str] | None = None
) -> httpx.MockTransport:
    """Transport answering every request with a fixed status code."""

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(status_code, headers=headers or {})

    return httpx.MockTransport(handler)


def register_endpoint(
    client: TestClient, *, name: str = "Example API", url: str = PUBLIC_URL
) -> dict[str, Any]:
    """Register an endpoint through the API and return its payload."""
    response = client.post("/api/v1/endpoints", json={"name": name, "url": url})
    assert response.status_code == 201, response.text
    return response.json()
