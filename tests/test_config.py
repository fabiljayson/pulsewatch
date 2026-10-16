"""Configuration parsing tests (environment-driven settings)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.config import Settings


def test_defaults(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for key in [k for k in os.environ if k.startswith("PULSEWATCH_")]:
        monkeypatch.delenv(key)
    monkeypatch.setenv("PULSEWATCH_DB_PATH", str(tmp_path / "x.db"))
    settings = Settings.from_env()
    assert settings.db_path == tmp_path / "x.db"
    assert settings.http_timeout_seconds == 5.0
    assert settings.allow_redirects is False
    assert settings.max_redirects == 3
    assert settings.history_max_limit == 100
    assert settings.report_default_hours == 24
    assert settings.check_interval_seconds == 300


def test_custom_values(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PULSEWATCH_DB_PATH", str(tmp_path / "custom.db"))
    monkeypatch.setenv("PULSEWATCH_HTTP_TIMEOUT_SECONDS", "7.5")
    monkeypatch.setenv("PULSEWATCH_HTTP_CONNECT_TIMEOUT_SECONDS", "1.5")
    monkeypatch.setenv("PULSEWATCH_ALLOW_REDIRECTS", "true")
    monkeypatch.setenv("PULSEWATCH_MAX_REDIRECTS", "5")
    monkeypatch.setenv("PULSEWATCH_HISTORY_MAX_LIMIT", "50")
    monkeypatch.setenv("PULSEWATCH_REPORT_DEFAULT_HOURS", "12")
    monkeypatch.setenv("PULSEWATCH_CHECK_INTERVAL_SECONDS", "60")
    settings = Settings.from_env()
    assert settings.http_timeout_seconds == 7.5
    assert settings.http_connect_timeout_seconds == 1.5
    assert settings.allow_redirects is True
    assert settings.max_redirects == 5
    assert settings.history_max_limit == 50
    assert settings.report_default_hours == 12
    assert settings.check_interval_seconds == 60


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("PULSEWATCH_HTTP_TIMEOUT_SECONDS", "not-a-float"),
        ("PULSEWATCH_HTTP_TIMEOUT_SECONDS", "0"),  # below minimum
        ("PULSEWATCH_HTTP_TIMEOUT_SECONDS", "999"),
        ("PULSEWATCH_HTTP_CONNECT_TIMEOUT_SECONDS", "abc"),
        ("PULSEWATCH_MAX_REDIRECTS", "many"),
        ("PULSEWATCH_MAX_REDIRECTS", "-1"),
        ("PULSEWATCH_HISTORY_MAX_LIMIT", "0"),
        ("PULSEWATCH_REPORT_DEFAULT_HOURS", "x"),
        ("PULSEWATCH_ALLOW_REDIRECTS", "maybe"),
        ("PULSEWATCH_CHECK_INTERVAL_SECONDS", "abc"),
        ("PULSEWATCH_CHECK_INTERVAL_SECONDS", "-1"),
    ],
)
def test_invalid_values_raise(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, key: str, value: str
) -> None:
    monkeypatch.setenv("PULSEWATCH_DB_PATH", str(tmp_path / "x.db"))
    monkeypatch.setenv(key, value)
    with pytest.raises(ValueError):
        Settings.from_env()


def test_boolean_forms(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PULSEWATCH_DB_PATH", str(tmp_path / "x.db"))
    for truthy in ("1", "true", "TRUE", "yes", "on"):
        monkeypatch.setenv("PULSEWATCH_ALLOW_REDIRECTS", truthy)
        assert Settings.from_env().allow_redirects is True
    for falsy in ("0", "false", "no", "off"):
        monkeypatch.setenv("PULSEWATCH_ALLOW_REDIRECTS", falsy)
        assert Settings.from_env().allow_redirects is False


def test_blank_env_falls_back_to_default(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PULSEWATCH_DB_PATH", str(tmp_path / "x.db"))
    monkeypatch.setenv("PULSEWATCH_HTTP_TIMEOUT_SECONDS", "   ")
    monkeypatch.setenv("PULSEWATCH_CHECK_INTERVAL_SECONDS", "")
    assert Settings.from_env().http_timeout_seconds == 5.0
    assert Settings.from_env().check_interval_seconds == 300
