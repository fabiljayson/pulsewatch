"""Authentication routes: status, login, logout, current user."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app import __version__
from app.auth import (
    CurrentUser,
    clear_session_cookie,
    create_token,
    password_matches,
    require_auth,
    set_session_cookie,
    signing_secret,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Credentials for the single admin account."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"username": "admin", "password": "secret"}]}
    )

    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    """Session issued on successful login."""

    token: str = Field(description="Bearer token for API clients.")
    token_type: str = "bearer"
    expires_in: int
    username: str


class AuthStatus(BaseModel):
    """Whether authentication is enabled for this deployment."""

    enabled: bool
    username: str | None = None
    version: str


class CurrentUserRead(BaseModel):
    """The authenticated user."""

    username: str


@router.get(
    "/status",
    response_model=AuthStatus,
    summary="Authentication status",
    description="Tells the UI whether a login screen is required.",
)
async def auth_status(request: Request) -> AuthStatus:
    settings = request.app.state.settings
    return AuthStatus(
        enabled=settings.auth_enabled,
        username=settings.admin_username if settings.auth_enabled else None,
        version=__version__,
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Log in with admin credentials",
    responses={401: {"description": "Invalid credentials."}},
)
async def login(payload: LoginRequest, request: Request, response: Response) -> LoginResponse:
    settings = request.app.state.settings
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Authentication is disabled on this deployment",
        )
    if not password_matches(request, payload.username, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token, expires_at = create_token(signing_secret(request), payload.username)
    set_session_cookie(response, token)
    import time

    return LoginResponse(
        token=token,
        expires_in=max(0, expires_at - int(time.time())),
        username=payload.username,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Log out and clear the session cookie",
)
async def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get(
    "/me",
    response_model=CurrentUserRead,
    summary="Current authenticated user",
    responses={401: {"description": "Not authenticated."}},
)
async def me(user: Annotated[CurrentUser | None, Depends(require_auth)]) -> CurrentUserRead:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Authentication is disabled on this deployment",
        )
    return CurrentUserRead(username=user.username)
