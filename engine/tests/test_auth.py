import time
from unittest.mock import MagicMock, patch
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import TenantContext

TEST_SECRET = "unit-test-jwt-secret-do-not-use-in-prod"
USER_ID = str(uuid4())
TENANT_ID = str(uuid4())


def make_token(**overrides) -> str:
    secret = overrides.pop("_secret", TEST_SECRET)
    payload = {
        "sub": USER_ID,
        "aud": "authenticated",
        "iss": f"{settings.supabase_url.rstrip('/')}/auth/v1",
        "exp": int(time.time()) + 3600,
        **overrides,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(
        settings, "supabase_service_role_key", "service-role-key-for-tests"
    )
    return TestClient(app)


def test_valid_token_returns_200(client):
    token = make_token()
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")

    with patch("app.main.resolve_tenant", return_value=ctx):
        response = client.get(
            "/tenant/verify",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Id": TENANT_ID,
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == USER_ID
    assert body["tenant_id"] == TENANT_ID
    assert body["role"] == "owner"


def test_spoof_x_user_id_without_bearer_returns_401(client):
    """X-User-Id alone must not grant access — the old hole is closed."""
    response = client.get(
        "/tenant/verify",
        headers={
            "X-User-Id": USER_ID,
            "X-Tenant-Id": TENANT_ID,
        },
    )
    assert response.status_code == 401


def test_spoof_x_user_id_with_invalid_bearer_returns_401(client):
    response = client.get(
        "/tenant/verify",
        headers={
            "Authorization": "Bearer not-a-real-jwt",
            "X-User-Id": USER_ID,
            "X-Tenant-Id": TENANT_ID,
        },
    )
    assert response.status_code == 401


def test_expired_token_returns_401(client):
    token = make_token(exp=int(time.time()) - 60)
    response = client.get(
        "/tenant/verify",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": TENANT_ID,
        },
    )
    assert response.status_code == 401


def test_tampered_signature_returns_401(client):
    token = make_token(_secret="wrong-secret")
    response = client.get(
        "/tenant/verify",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Id": TENANT_ID,
        },
    )
    assert response.status_code == 401


def test_missing_authorization_returns_401(client):
    response = client.get(
        "/tenant/verify",
        headers={"X-Tenant-Id": TENANT_ID},
    )
    assert response.status_code == 401


def test_verify_jwt_returns_sub():
    from app.auth import verify_jwt

    with patch.object(settings, "supabase_jwt_secret", TEST_SECRET):
        token = make_token()
        assert verify_jwt(token) == USER_ID
