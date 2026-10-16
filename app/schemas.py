"""Pydantic request/response schemas for the PulseWatch API."""

from __future__ import annotations

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


class EndpointRead(BaseModel):
    """Representation of a monitored endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Unique endpoint identifier.")
    name: str
    url: str
    is_active: bool
    created_at: str = Field(description="UTC ISO-8601 creation timestamp.")
    updated_at: str = Field(description="UTC ISO-8601 last-update timestamp.")


class EndpointList(BaseModel):
    """Paginated list of endpoints."""

    total: int = Field(description="Total number of matching endpoints.")
    limit: int
    offset: int
    items: list[EndpointRead]


class CheckResultRead(BaseModel):
    """A single recorded health check."""

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
            "Mean latency over checks with a measured response time; "
            "null when none were measured."
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
