"""Check engine tests: success, failures, redirects, latency, persistence."""

from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.database import Database
from app.repository import create_endpoint, list_checks
from app.services.checker import CheckService

from .conftest import (
    PUBLIC_IP,
    PUBLIC_URL,
    failing_resolver,
    fake_resolver,
    mock_transport,
    private_resolver,
    register_endpoint,
)


def _service(
    settings: Settings,
    db: Database,
    handler=None,
    resolver=fake_resolver,
) -> CheckService:
    transport = mock_transport(handler) if handler else None
    return CheckService(db, settings, resolver=resolver, transport=transport)


async def test_http_200_success(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="ok", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True})

    service = _service(settings, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is True
    assert result.status_code == 200
    assert result.error_type is None
    assert result.latency_ms is not None
    assert result.latency_ms >= 0
    assert result.endpoint_id == endpoint.id
    stored = list_checks(db, endpoint.id, limit=10, offset=0)
    assert len(stored) == 1
    assert stored[0].status_code == 200


async def test_http_404_failure(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="missing", url=PUBLIC_URL)
    service = _service(settings, db, lambda request: httpx.Response(404))
    result = await service.run_check(endpoint)
    assert result.success is False
    assert result.status_code == 404
    assert result.error_type == "http_error"
    assert result.latency_ms is not None


async def test_http_503_failure(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="down", url=PUBLIC_URL)
    service = _service(settings, db, lambda request: httpx.Response(503))
    result = await service.run_check(endpoint)
    assert result.success is False
    assert result.status_code == 503
    assert result.error_type == "http_error"


async def test_http_302_recorded_without_following(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="redirect", url=PUBLIC_URL)
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(302, headers={"location": "https://evil.example.net/next"})

    service = _service(settings, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is True  # 3xx counts as success per policy
    assert result.status_code == 302
    assert len(calls) == 1  # redirects disabled by default: no follow


async def test_timeout_recorded(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="slow", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    service = _service(settings, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.status_code is None
    assert result.latency_ms is None  # no meaningful response time
    assert result.error_type == "timeout"


async def test_connection_error_recorded(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="refused", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    service = _service(settings, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.status_code is None
    assert result.latency_ms is None
    assert result.error_type == "connection_error"


async def test_invalid_response_recorded(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="broken", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.RemoteProtocolError("server disconnected", request=request)

    service = _service(settings, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.error_type == "invalid_response"
    assert result.latency_ms is None


async def test_dns_failure_recorded(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="nodns", url=PUBLIC_URL)
    service = _service(settings, db, resolver=failing_resolver)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.status_code is None
    assert result.error_type == "dns_error"
    assert result.latency_ms is None


async def test_blocked_destination_never_requested(settings) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="rebind", url=PUBLIC_URL)
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200)

    service = _service(settings, db, handler, resolver=private_resolver)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.error_type == "blocked_destination"
    assert calls == []  # request must never leave the process


async def test_redirect_followed_when_enabled(settings) -> None:
    import dataclasses

    enabled = dataclasses.replace(settings, allow_redirects=True, max_redirects=3)
    db = Database(enabled.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="hop", url=PUBLIC_URL)
    visited: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        if request.url.path == "/v1/health":
            return httpx.Response(302, headers={"location": "/v1/final"})
        return httpx.Response(200)

    service = _service(enabled, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is True
    assert result.status_code == 200
    assert len(visited) == 2
    assert visited[1].endswith("/v1/final")


async def test_redirect_to_private_destination_blocked(settings) -> None:
    import dataclasses

    enabled = dataclasses.replace(settings, allow_redirects=True, max_redirects=3)
    db = Database(enabled.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="evil-hop", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    service = _service(enabled, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.error_type == "blocked_destination"
    assert result.status_code == 302


async def test_too_many_redirects(settings) -> None:
    import dataclasses

    enabled = dataclasses.replace(settings, allow_redirects=True, max_redirects=2)
    db = Database(enabled.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name="loop", url=PUBLIC_URL)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "/again"})

    service = _service(enabled, db, handler)
    result = await service.run_check(endpoint)

    assert result.success is False
    assert result.error_type == "too_many_redirects"
    assert result.status_code == 302


def test_api_check_endpoint_persists_and_returns(make_app) -> None:
    """Full API path: POST /check with injected transport stores one history row."""
    from fastapi.testclient import TestClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200)

    with TestClient(make_app(transport=mock_transport(handler))) as client:
        created = register_endpoint(client)
        response = client.post(f"/api/v1/endpoints/{created['id']}/check")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["status_code"] == 200
        assert body["error_type"] is None
        assert body["latency_ms"] is not None

        history = client.get(f"/api/v1/endpoints/{created['id']}/history").json()
        assert history["total"] == 1
        assert history["items"][0]["id"] == body["id"]


def test_api_check_unknown_endpoint_404(client) -> None:
    response = client.post("/api/v1/endpoints/123456/check")
    assert response.status_code == 404


def test_api_check_inactive_endpoint_409(client) -> None:
    created = register_endpoint(client)
    client.patch(f"/api/v1/endpoints/{created['id']}", json={"is_active": False})
    response = client.post(f"/api/v1/endpoints/{created['id']}/check")
    assert response.status_code == 409


def test_api_check_with_mock_transport(make_app) -> None:
    """Full API path: POST check with injected transport persists a result."""
    from fastapi.testclient import TestClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with TestClient(make_app(transport=mock_transport(handler))) as client:
        created = register_endpoint(client)
        response = client.post(f"/api/v1/endpoints/{created['id']}/check")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is False
        assert body["status_code"] == 503
        assert body["error_type"] == "http_error"
        assert body["latency_ms"] is not None

        history = client.get(f"/api/v1/endpoints/{created['id']}/history").json()
        assert history["total"] == 1
        assert history["items"][0]["id"] == body["id"]


def test_resolved_addresses_use_public_ip_constant() -> None:
    assert PUBLIC_IP == "93.184.216.34"


@pytest.mark.parametrize("status_code", [200, 201, 204, 301, 399])
async def test_success_range_2xx_3xx(settings, status_code: int) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name=f"code-{status_code}", url=PUBLIC_URL)
    service = _service(settings, db, lambda request: httpx.Response(status_code))
    result = await service.run_check(endpoint)
    assert result.success is True
    assert result.status_code == status_code


@pytest.mark.parametrize("status_code", [400, 401, 404, 429, 500, 503])
async def test_failure_range_4xx_5xx(settings, status_code: int) -> None:
    db = Database(settings.db_path)
    db.initialize()
    endpoint = create_endpoint(db, name=f"code-{status_code}", url=PUBLIC_URL)
    service = _service(settings, db, lambda request: httpx.Response(status_code))
    result = await service.run_check(endpoint)
    assert result.success is False
    assert result.status_code == status_code
    assert result.error_type == "http_error"
