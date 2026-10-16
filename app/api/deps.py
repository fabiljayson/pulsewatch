"""FastAPI dependency providers.

Components are stored on ``app.state`` by the application factory, so tests
can build an isolated app with a temporary database and a mock HTTP transport.
"""

from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.database import Database
from app.services.checker import CheckService


def get_settings(request: Request) -> Settings:
    """Runtime settings for the running application."""
    return request.app.state.settings


def get_database(request: Request) -> Database:
    """Database handle bound to the configured path."""
    return request.app.state.database


def get_checker(request: Request) -> CheckService:
    """Health-check service (mockable via the app factory)."""
    return request.app.state.checker
