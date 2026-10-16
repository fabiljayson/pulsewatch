"""Pydantic request/response schemas for the PulseWatch API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.url_validation import validate_url_for_registration


class EndpointCreate(BaseModel):
    """Payload to register a new monitored endpoint."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Example health",
                    "url": "https://example.com/health",
                    "is_active": True,
                }
            ]
        }
    )

    name: str = Field(
        min_length=1,
        max_length=100,
        description="Human-readable label for the endpoint.",
        examples=["Example health"],
    )
    url: str = Field(
        max_length=2048,
        description="Absolute http(s) URL to monitor.",
        examples=["https://example.com/health"],
    )
    is_active: bool = Field(
        default=True,
        description="Whether the endpoint is eligible for checks.",
    )

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped

    @field_validator("url")
    @classmethod
    def _url_allowed(cls, value: str) -> str:
        validate_url_for_registration(value)
        return value


class EndpointUpdate(BaseModel):
    """Partial update for an endpoint: name and/or active flag."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Renamed", "is_active": False}]}
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="New name; leave unset to keep the current one.",
    )
    is_active: bool | None = Field(
        default=None,
        description="New active flag; leave unset to keep the current one.",
    )

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class EndpointStatus(BaseModel):
    """Derived health state for one endpoint over an explicit window.

    ``state`` is ``unknown`` when the endpoint has never been checked — never
    reported as healthy. ``degraded`` means the latest check succeeded but its
    latency exceeded ``degraded_threshold_ms``.
    """

    state: Literal["healthy", "degraded", "failing", "unknown"]
    checked_at: str | None = Field(default=None, description="Timestamp of the latest check.")
    status_code: int | None = None
    latency_ms: float | None = None
    availability_percent: float | None = Field(
        default=None,
        description="successful / total * 100 in the window; null when no checks ran.",
    )
    total_checks: int = Field(description="Checks recorded in the window.")
    window_hours: int
    degraded_threshold_ms: float = Field(
        description="Latency above this value marks a successful check as degraded."
    )


class EndpointRead(BaseModel):
    """Representation of a monitored endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique endpoint identifier.")
    name: str
    url: str
    is_active: bool
    created_at: str = Field(description="UTC ISO-8601 creation timestamp.")
    updated_at: str = Field(description="UTC ISO-8601 last-update timestamp.")
    status: EndpointStatus | None = Field(
        default=None,
        description="Derived health state; populated when include_status=true.",
    )


class EndpointList(BaseModel):
    """Paginated list of endpoints."""

    total: int = Field(description="Total number of matching endpoints.")
    limit: int
    offset: int
    items: list[EndpointRead]


class CheckResultRead(BaseModel):
    """A single recorded health check."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    endpoint_id: int
    checked_at: str = Field(description="UTC ISO-8601 timestamp when the check began.")
    status_code: int | None = Field(
        default=None,
        description="HTTP status code, or null when no response was received.",
    )
    latency_ms: float | None = Field(
        default=None,
        description="Measured latency in milliseconds; null when no response arrived.",
    )
    success: bool = Field(description="True for HTTP 200-399 responses.")
    error_type: str | None = Field(
        default=None,
        description=(
            "Safe error category (timeout, connection_error, invalid_response, "
            "dns_error, blocked_destination, too_many_redirects, transport_error, "
            "http_error) or null."
        ),
    )


class HistoryPage(BaseModel):
    """Paginated check history for one endpoint, newest first."""

    endpoint_id: int
    total: int = Field(description="Total checks stored for the endpoint.")
    limit: int
    offset: int
    items: list[CheckResultRead]


class ReportWindow(BaseModel):
    """Explicit time window covered by a reliability report."""

    hours: int
    from_: str = Field(alias="from", description="UTC ISO-8601 window start.")
    to: str = Field(description="UTC ISO-8601 window end (report generation time).")


class ReportRead(BaseModel):
    """Reliability report for one endpoint over a time window."""

    endpoint_id: int
    total_checks: int
    successful_checks: int
    failed_checks: int
    availability_percent: float = Field(
        description="successful_checks / total_checks * 100; 0.0 when no checks."
    )
    average_latency_ms: float | None = Field(
        default=None,
        description=(
            "Mean latency over checks with a measured response time; null when none were measured."
        ),
    )
    first_check_at: str | None = None
    last_check_at: str | None = None
    window: ReportWindow


class HealthRead(BaseModel):
    """Application health payload."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"status": "ok", "service": "pulsewatch", "version": "0.1.0"}]
        }
    )

    status: str = Field(description="Service status.")
    service: str
    version: str


class CheckItemRead(BaseModel):
    """One check in the global history log, joined with its endpoint."""

    id: int
    endpoint_id: int
    endpoint_name: str
    endpoint_url: str
    checked_at: str = Field(description="UTC ISO-8601 timestamp when the check began.")
    status_code: int | None = None
    latency_ms: float | None = None
    success: bool
    error_type: str | None = None


class GlobalHistoryPage(BaseModel):
    """Paginated check log across all endpoints, newest first."""

    total: int = Field(description="Total checks matching the filters.")
    limit: int
    offset: int
    items: list[CheckItemRead]


class SummaryEndpointCounts(BaseModel):
    """Endpoint counts by registration and by derived health state."""

    total: int
    active: int
    inactive: int
    healthy: int
    degraded: int
    failing: int
    unknown: int = Field(description="Endpoints that have never been checked.")


class SummaryRead(BaseModel):
    """Aggregate dashboard summary over an explicit window."""

    window: ReportWindow
    endpoints: SummaryEndpointCounts
    total_checks: int
    successful_checks: int
    failed_checks: int
    availability_percent: float = Field(
        description="successful_checks / total_checks * 100; 0.0 when no checks."
    )
    average_latency_ms: float | None = Field(
        default=None,
        description="Mean latency over checks with a measured response time.",
    )
    degraded_threshold_ms: float
    last_check_at: str | None = Field(
        default=None, description="Most recent check across all endpoints, any time."
    )


class TrendBucket(BaseModel):
    """One time bucket in a response-time / availability series."""

    bucket_start: str = Field(description="UTC ISO-8601 start of the bucket.")
    total: int = Field(description="Checks in the bucket; 0 when none ran.")
    successful: int
    failed: int
    average_latency_ms: float | None = Field(
        default=None, description="Null when no check in the bucket measured latency."
    )


class TrendRead(BaseModel):
    """Bucketed check counts and latency for charting, gaps included."""

    window: ReportWindow
    granularity: Literal["hour", "day"]
    endpoint_id: int | None = None
    buckets: list[TrendBucket]
