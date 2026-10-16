"""Health-check execution engine.

Issues outbound HTTP requests with SSRF-aware destination validation, measures
latency with a monotonic clock, classifies failures into safe error categories,
and persists every result via :mod:`app.repository`. No automatic retries and
no storage of response bodies or headers.
"""

from __future__ import annotations

import asyncio
import ipaddress
import time
from collections.abc import Callable
from urllib.parse import urljoin, urlsplit

import httpx

from app.config import Settings
from app.database import Database
from app.models import CheckResult, MonitoredEndpoint
from app.repository import record_check, utc_now_iso
from app.services.url_validation import (
    BlockedDestinationError,
    DnsResolutionError,
    Resolver,
    UrlValidationError,
    hostname_is_blocked,
    resolve_host,
    validate_ip_address,
    validate_resolved_addresses,
    validate_url_syntax,
)

REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

ClientFactory = Callable[[], httpx.AsyncClient]


def default_client_factory(settings: Settings) -> ClientFactory:
    """Build a factory producing hardened AsyncClients for outbound checks."""

    def factory() -> httpx.AsyncClient:
        timeout = httpx.Timeout(
            settings.http_timeout_seconds,
            connect=settings.http_connect_timeout_seconds,
        )
        return httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
        )

    return factory


class CheckService:
    """Executes health checks for monitored endpoints."""

    def __init__(
        self,
        db: Database,
        settings: Settings,
        *,
        resolver: Resolver | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._db = db
        self._settings = settings
        self._resolver: Resolver = resolver or resolve_host
        if client_factory is not None:
            self._client_factory = client_factory
        elif transport is not None:

            def factory() -> httpx.AsyncClient:
                timeout = httpx.Timeout(
                    settings.http_timeout_seconds,
                    connect=settings.http_connect_timeout_seconds,
                )
                return httpx.AsyncClient(
                    transport=transport,
                    timeout=timeout,
                    follow_redirects=False,
                    trust_env=False,
                )

            self._client_factory = factory
        else:
            self._client_factory = default_client_factory(settings)

    async def _resolve(self, hostname: str, port: int) -> list[str]:
        """Run the resolver off the event loop; map failures to DnsResolutionError."""
        try:
            return await asyncio.to_thread(self._resolver, hostname, port)
        except DnsResolutionError:
            raise
        except OSError as exc:
            raise DnsResolutionError("DNS resolution failed") from exc

    async def _validate_destination(self, url: str) -> None:
        """Stage A + async Stage B validation for a URL about to be requested."""
        validate_url_syntax(url, max_length=self._settings.max_url_length)
        parts = urlsplit(url)
        hostname = parts.hostname
        assert hostname is not None
        if hostname_is_blocked(hostname):
            raise BlockedDestinationError("URL hostname is not allowed")
        try:
            literal = ipaddress.ip_address(hostname)
        except ValueError:
            literal = None
        if literal is not None:
            # IP-literal destination: the address itself must be public.
            validate_ip_address(literal)
            return
        port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
        addresses = await self._resolve(hostname, port)
        validate_resolved_addresses(addresses)

    async def run_check(self, endpoint: MonitoredEndpoint) -> CheckResult:
        """Run one health check for ``endpoint`` and persist the outcome."""
        checked_at = utc_now_iso()
        current_url = endpoint.url

        try:
            await self._validate_destination(current_url)
        except DnsResolutionError:
            return self._persist_failure(endpoint.id, checked_at, error_type="dns_error")
        except UrlValidationError:
            return self._persist_failure(endpoint.id, checked_at, error_type="blocked_destination")

        max_hops = self._settings.max_redirects if self._settings.allow_redirects else 0
        async with self._client_factory() as client:
            for hop in range(max_hops + 1):
                start = time.perf_counter()
                try:
                    response = await client.get(current_url)
                except httpx.TimeoutException:
                    return self._persist_failure(endpoint.id, checked_at, error_type="timeout")
                except httpx.ConnectError:
                    return self._persist_failure(
                        endpoint.id, checked_at, error_type="connection_error"
                    )
                except (httpx.RemoteProtocolError, httpx.DecodingError):
                    return self._persist_failure(
                        endpoint.id, checked_at, error_type="invalid_response"
                    )
                except httpx.HTTPError:
                    return self._persist_failure(
                        endpoint.id, checked_at, error_type="transport_error"
                    )
                latency_ms = (time.perf_counter() - start) * 1000.0
                status = response.status_code
                location = response.headers.get("location")

                if self._settings.allow_redirects and status in REDIRECT_STATUSES and location:
                    if hop >= max_hops:
                        return record_check(
                            self._db,
                            endpoint_id=endpoint.id,
                            checked_at=checked_at,
                            status_code=status,
                            latency_ms=latency_ms,
                            success=False,
                            error_type="too_many_redirects",
                        )
                    next_url = urljoin(current_url, location.strip())
                    try:
                        await self._validate_destination(next_url)
                    except UrlValidationError:
                        return record_check(
                            self._db,
                            endpoint_id=endpoint.id,
                            checked_at=checked_at,
                            status_code=status,
                            latency_ms=latency_ms,
                            success=False,
                            error_type="blocked_destination",
                        )
                    current_url = next_url
                    continue

                return self._finish_with_status(endpoint.id, checked_at, status, latency_ms)

        raise RuntimeError("check loop exhausted without a result")

    def _finish_with_status(
        self,
        endpoint_id: int,
        checked_at: str,
        status_code: int,
        latency_ms: float,
    ) -> CheckResult:
        success = 200 <= status_code < 400
        return record_check(
            self._db,
            endpoint_id=endpoint_id,
            checked_at=checked_at,
            status_code=status_code,
            latency_ms=latency_ms,
            success=success,
            error_type=None if success else "http_error",
        )

    def _persist_failure(
        self, endpoint_id: int, checked_at: str, *, error_type: str
    ) -> CheckResult:
        return record_check(
            self._db,
            endpoint_id=endpoint_id,
            checked_at=checked_at,
            status_code=None,
            latency_ms=None,
            success=False,
            error_type=error_type,
        )
