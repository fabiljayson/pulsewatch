"""Centralized application configuration.

Settings are read from ``PULSEWATCH_*`` environment variables with safe
defaults, so the service runs with zero configuration for local development.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_str(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else default


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}, got {value}")
    return value


def _env_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw.strip())
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, got {raw!r}") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}, got {value}")
    return value


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean (true/false), got {raw!r}")


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable runtime configuration for PulseWatch."""

    db_path: Path
    http_timeout_seconds: float = 5.0
    http_connect_timeout_seconds: float = 3.0
    allow_redirects: bool = False
    max_redirects: int = 3
    history_max_limit: int = 100
    report_default_hours: int = 24
    max_url_length: int = 2048
    max_name_length: int = 100
    endpoints_list_default_limit: int = 100
    endpoints_list_max_limit: int = 500
    history_default_limit: int = 20
    report_max_hours: int = 8760

    @classmethod
    def from_env(cls) -> Settings:
        """Build settings from environment variables."""
        return cls(
            db_path=Path(_env_str("PULSEWATCH_DB_PATH", "pulsewatch.db")),
            http_timeout_seconds=_env_float(
                "PULSEWATCH_HTTP_TIMEOUT_SECONDS", 5.0, minimum=0.1, maximum=120.0
            ),
            http_connect_timeout_seconds=_env_float(
                "PULSEWATCH_HTTP_CONNECT_TIMEOUT_SECONDS", 3.0, minimum=0.1, maximum=120.0
            ),
            allow_redirects=_env_bool("PULSEWATCH_ALLOW_REDIRECTS", False),
            max_redirects=_env_int("PULSEWATCH_MAX_REDIRECTS", 3, minimum=0, maximum=10),
            history_max_limit=_env_int(
                "PULSEWATCH_HISTORY_MAX_LIMIT", 100, minimum=1, maximum=1000
            ),
            report_default_hours=_env_int(
                "PULSEWATCH_REPORT_DEFAULT_HOURS", 24, minimum=1, maximum=8760
            ),
        )
