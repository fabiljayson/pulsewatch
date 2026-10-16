"""Domain models.

Plain dataclasses that mirror the database rows. Request/response validation
lives in :mod:`app.schemas`; SQL lives in :mod:`app.repository`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MonitoredEndpoint:
    """A registered HTTP endpoint under observation."""

    id: int
    name: str
    url: str
    is_active: bool
    created_at: str
    updated_at: str


@dataclass(frozen=True, slots=True)
class CheckResult:
    """One executed health check, persisted for history and reports."""

    id: int
    endpoint_id: int
    checked_at: str
    status_code: int | None
    latency_ms: float | None
    success: bool
    error_type: str | None


@dataclass(frozen=True, slots=True)
class CheckWithEndpoint:
    """A check result joined with its endpoint for global history listings."""

    id: int
    endpoint_id: int
    endpoint_name: str
    endpoint_url: str
    checked_at: str
    status_code: int | None
    latency_ms: float | None
    success: bool
    error_type: str | None


@dataclass(frozen=True, slots=True)
class EndpointStatusRow:
    """Latest check plus in-window totals for one endpoint."""

    endpoint_id: int
    is_active: bool
    checked_at: str | None
    status_code: int | None
    latency_ms: float | None
    success: bool | None
    window_total: int
    window_successful: int
