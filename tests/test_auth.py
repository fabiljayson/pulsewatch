"""Authentication tests: status, login, session, protection, logout."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import TOKEN_TTL_SECONDS, create_token, verify_token
from app.config import Settings
from app.main import create_app


@pytest.fixture
def auth_settings(tmp_path: Path) -> Settings:
    return Settings(db_path=tmp_path / "auth.db", admin_username="admin", admin_password="s3cret")


@pytest.fixture
def auth_client(auth_settings: Settings) -> TestClient:
    with TestClient(create_app(auth_settings)) as client:
        yield client


def test_auth_disabled_by_default(client) -> None:
    status = client.get("/api/v1/auth/status").json()
    assert status["enabled"] is False
    # API fully open without login
    assert client.get("/api/v1/endpoints").status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 409


def test_auth_status_when_enabled(auth_client: TestClient) -> None:
    status = auth_client.get("/api/v1/auth/status").json()
    assert status == {"enabled": True, "username": "admin", "version": status["version"]}


def test_login_success_issues_cookie_and_token(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "s3cret"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert "pulsewatch_session" in response.cookies
    # Bearer token works for API calls
    api = TestClient(auth_client.app)
    assert (
        api.get(
            "/api/v1/endpoints", headers={"Authorization": f"Bearer {body['token']}"}
        ).status_code
        == 200
    )
    # Cookie session works too
    assert auth_client.get("/api/v1/endpoints").status_code == 200


def test_login_wrong_password_401(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_wrong_username_401(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/v1/auth/login", json={"username": "root", "password": "s3cret"}
    )
    assert response.status_code == 401


def test_login_when_disabled_409(client) -> None:
    response = client.post("/api/v1/auth/login", json={"username": "admin", "password": "x"})
    assert response.status_code == 409


def test_protected_routes_require_auth(auth_client: TestClient) -> None:
    for method, path in [
        ("get", "/api/v1/endpoints"),
        ("post", "/api/v1/endpoints"),
        ("get", "/api/v1/endpoints/1"),
        ("post", "/api/v1/endpoints/1/check"),
        ("get", "/api/v1/endpoints/1/history"),
        ("get", "/api/v1/endpoints/1/report"),
    ]:
        if method == "post":
            response = auth_client.post(path, json={})
        else:
            response = auth_client.get(path)
        assert response.status_code == 401, path


def test_health_stays_public_when_auth_enabled(auth_client: TestClient) -> None:
    assert auth_client.get("/health").status_code == 200


def test_me_returns_user(auth_client: TestClient) -> None:
    auth_client.post("/api/v1/auth/login", json={"username": "admin", "password": "s3cret"})
    assert auth_client.get("/api/v1/auth/me").json() == {"username": "admin"}


def test_logout_clears_cookie(auth_client: TestClient) -> None:
    auth_client.post("/api/v1/auth/login", json={"username": "admin", "password": "s3cret"})
    assert auth_client.get("/api/v1/endpoints").status_code == 200
    assert auth_client.post("/api/v1/auth/logout").status_code == 204
    assert auth_client.get("/api/v1/endpoints").status_code == 401


def test_invalid_bearer_token_401(auth_client: TestClient) -> None:
    response = auth_client.get("/api/v1/endpoints", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401


def test_token_roundtrip_and_tamper() -> None:
    secret = b"0123456789abcdef0123456789abcdef"
    token, expires_at = create_token(secret, "admin")
    assert verify_token(secret, token) == "admin"
    assert verify_token(b"other-secret-xxxxxxxxxxxxxxxx", token) is None
    tampered = token[:-2] + ("aa" if token[-2:] != "aa" else "bb")
    assert verify_token(secret, tampered) is None
    assert verify_token(secret, "garbage") is None
    assert expires_at > 0


def test_expired_token_rejected() -> None:
    import app.auth as auth_module

    secret = b"x" * 32
    original = auth_module.TOKEN_TTL_SECONDS
    try:
        auth_module.TOKEN_TTL_SECONDS = -10
        expired, _ = auth_module.create_token(secret, "admin")
    finally:
        auth_module.TOKEN_TTL_SECONDS = original
    assert auth_module.verify_token(secret, expired) is None
    assert original == TOKEN_TTL_SECONDS
