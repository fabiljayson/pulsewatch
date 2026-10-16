"""Authentication: single-admin sessions signed with HMAC.

Enabled only when ``PULSEWATCH_ADMIN_PASSWORD`` is set; otherwise the API stays
open (Day 01 behaviour) and login returns 409. Passwords are compared in
constant time. Sessions are stateless HMAC-signed tokens delivered both as an
HttpOnly cookie (browser) and in the JSON body (API clients / Bearer).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, Request, status

TOKEN_TTL_SECONDS = 24 * 60 * 60
_COOKIE_NAME = "pulsewatch_session"


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64d(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def signing_secret(request: Request) -> bytes:
    """Per-process signing secret (sessions do not survive restarts)."""
    secret = getattr(request.app.state, "auth_secret", None)
    if secret is None:
        secret = secrets.token_bytes(32)
        request.app.state.auth_secret = secret
    return secret


def password_matches(request: Request, username: str, password: str) -> bool:
    """Constant-time credential check against configured admin credentials."""
    settings = request.app.state.settings
    if settings.admin_password is None:
        return False
    user_ok = hmac.compare_digest(username, settings.admin_username)
    pass_ok = hmac.compare_digest(password, settings.admin_password)
    return user_ok and pass_ok


def create_token(secret: bytes, username: str) -> tuple[str, int]:
    """Create a signed session token; returns (token, expires_at_unix)."""
    expires_at = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{username}:{expires_at}".encode()
    signature = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return f"{_b64e(payload)}.{signature}", expires_at


def verify_token(secret: bytes, token: str) -> str | None:
    """Return the username for a valid, unexpired token, else None."""
    try:
        encoded, _, signature = token.partition(".")
        payload = _b64d(encoded)
        expected = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        username, expiry = payload.decode().rsplit(":", 1)
        if int(expiry) < time.time():
            return None
        return username or None
    except (ValueError, UnicodeDecodeError):
        return None


@dataclass(frozen=True, slots=True)
class CurrentUser:
    """Authenticated caller."""

    username: str


def require_auth(request: Request) -> CurrentUser | None:
    """Protect a route when auth is enabled; pass through when disabled."""
    settings = request.app.state.settings
    if settings.admin_password is None:
        return None
    secret = signing_secret(request)
    token: str | None = None
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        token = request.cookies.get(_COOKIE_NAME)
    username = verify_token(secret, token) if token else None
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return CurrentUser(username=username)


AuthDep = Depends(require_auth)


def set_session_cookie(response: Any, token: str) -> None:
    """Attach the session cookie to a login response."""
    response.set_cookie(
        _COOKIE_NAME,
        token,
        max_age=TOKEN_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Any) -> None:
    """Remove the session cookie on logout."""
    response.delete_cookie(_COOKIE_NAME, path="/")
