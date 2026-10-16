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
