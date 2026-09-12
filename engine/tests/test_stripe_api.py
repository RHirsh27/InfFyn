import time
from unittest.mock import MagicMock, patch
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import TenantContext
from app.stripe.crypto import decrypt_token, encrypt_token
from app.stripe.oauth import (
    disconnect_connection,
    exchange_code_for_tokens,
    get_access_token_for_tenant,
    upsert_connection,
)
from app.stripe.oauth_state import create_oauth_state, verify_oauth_state

TEST_SECRET = "unit-test-jwt-secret-do-not-use-in-prod"
TEST_ENC_KEY = Fernet.generate_key().decode()
USER_ID = str(uuid4())
TENANT_ID = str(uuid4())
OTHER_TENANT = str(uuid4())


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


def _ok_post(json_body: dict):
    """A mock httpx response that succeeds and returns json_body."""
    resp = MagicMock()
    resp.json.return_value = json_body
    resp.raise_for_status.return_value = None
    return resp


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-key-for-tests")
    monkeypatch.setattr(settings, "oauth_state_secret", "oauth-state-test-secret-32b!!")
    # New Stripe App OAuth config (replaces the Connect client id / oauth client secret).
    monkeypatch.setattr(settings, "stripe_app_client_id", "acc_test_client")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dev")
    monkeypatch.setattr(settings, "stripe_oauth_redirect_uri", "http://localhost:8001/stripe/connect/callback")
    return TestClient(app)


def auth_headers(tenant_id: str = TENANT_ID) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {make_token()}",
        "X-Tenant-Id": tenant_id,
    }


# ── /stripe/connect/start still returns the { authorize_url } contract ────────
def test_stripe_connect_start_returns_authorize_url(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    with patch("app.main.resolve_tenant", return_value=ctx):
        response = client.post("/stripe/connect/start", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    # Response shape preserved (dashboard ConnectStripeButton depends on authorize_url).
    assert body["scope"] == "read_only"
    assert "authorize_url" in body
    # New Stripe App OAuth authorize endpoint (not the retired connect.stripe.com one).
    assert "marketplace.stripe.com/oauth/v2/authorize" in body["authorize_url"]
    assert "connect.stripe.com" not in body["authorize_url"]
    assert "client_id=" in body["authorize_url"]
    assert "state=" in body["authorize_url"]  # HMAC-signed CSRF state present


def test_stripe_sync_non_member_returns_403(client):
    with patch("app.main.resolve_tenant") as resolve:
        resolve.side_effect = HTTPException(status_code=403, detail="Forbidden")
        response = client.post(
            "/stripe/sync?background=false",
            headers=auth_headers(OTHER_TENANT),
        )
    assert response.status_code == 403


def test_stripe_sync_needs_reauth_on_auth_error(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.sync_stripe_revenue",
        side_effect=HTTPException(status_code=401, detail="reconnect"),
    ):
        response = client.post(
            "/stripe/sync?background=false",
            headers=auth_headers(),
        )
    assert response.status_code == 401


# ── OAuth 2.0 token exchange parses the Stripe App response ───────────────────
def test_exchange_code_for_tokens_parses_response(monkeypatch):
    monkeypatch.setattr(settings, "stripe_app_client_id", "acc_test_client")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dev")
    monkeypatch.setattr(settings, "stripe_oauth_redirect_uri", "http://localhost/cb")

    body = {
        "access_token": "sk_access_live",
        "refresh_token": "rt_new",
        "stripe_user_id": "acct_9",
        "scope": "stripe_apps",
        "token_type": "bearer",
    }
    with patch("app.stripe.oauth.httpx.post", return_value=_ok_post(body)) as post:
        out = exchange_code_for_tokens("ac_123")

    assert out["stripe_account_id"] == "acct_9"
    assert out["access_token"] == "sk_access_live"
    assert out["refresh_token"] == "rt_new"
    # Token exchange hits the Stripe App token endpoint with grant_type=authorization_code.
    assert post.call_args.args[0] == "https://api.stripe.com/v1/oauth/token"
    assert post.call_args.kwargs["data"]["grant_type"] == "authorization_code"


# ── Refresh token is stored ENCRYPTED, never plaintext (round-trips) ──────────
def test_upsert_connection_stores_encrypted_refresh_token(monkeypatch):
    monkeypatch.setattr(settings, "stripe_token_enc_key", TEST_ENC_KEY)
    supabase = MagicMock()
    conn_table = MagicMock()
    supabase.table.return_value = conn_table
    conn_table.upsert.return_value.execute.return_value = MagicMock(data=[{"id": "1"}])

    upsert_connection(supabase, "tenant-1", "acct_1", "rt_secret_plain")

    row = conn_table.upsert.call_args.args[0]
    assert row["refresh_token_encrypted"] != "rt_secret_plain"  # never plaintext
    assert decrypt_token(row["refresh_token_encrypted"]) == "rt_secret_plain"  # round-trips
    assert row["scope"] == "read_only"
    assert row["status"] == "connected"


# ── HMAC-signed state still verified; tampering rejected (CSRF preserved) ─────
def test_oauth_state_signed_and_tamper_rejected(monkeypatch):
    monkeypatch.setattr(settings, "oauth_state_secret", "oauth-state-test-secret-32b!!")
    state = create_oauth_state(settings, TENANT_ID, USER_ID)
    payload = verify_oauth_state(settings, state)
    assert payload["tid"] == TENANT_ID
    assert payload["uid"] == USER_ID

    body, sig = state.rsplit(".", 1)
    tampered = f"{body}.{sig[:-1]}{'0' if sig[-1] != '0' else '1'}"
    with pytest.raises(HTTPException):
        verify_oauth_state(settings, tampered)


# ── Happy-path refresh: returns a fresh access token and rolls + encrypts ─────
def test_get_access_token_refreshes_rolls_and_encrypts(monkeypatch):
    monkeypatch.setattr(settings, "stripe_token_enc_key", TEST_ENC_KEY)
    monkeypatch.setattr(settings, "stripe_app_client_id", "acc_test_client")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dev")
    monkeypatch.setattr(settings, "stripe_oauth_redirect_uri", "http://localhost/cb")

    supabase = MagicMock()
    conn_table = MagicMock()
    supabase.table.return_value = conn_table
    connection = {
        "stripe_account_id": "acct_1",
        "refresh_token_encrypted": encrypt_token("rt_old"),
    }
    body = {"access_token": "sk_access_new", "refresh_token": "rt_new", "account_id": "acct_1"}

    with patch("app.stripe.oauth.get_connection_for_tenant", return_value=connection), patch(
        "app.stripe.oauth.httpx.post", return_value=_ok_post(body)
    ) as post:
        token = get_access_token_for_tenant(supabase, "tenant-1")

    assert token == "sk_access_new"
    assert post.call_args.kwargs["data"]["grant_type"] == "refresh_token"
    # The rolled refresh token is persisted encrypted (not plaintext).
    stored = conn_table.update.call_args.args[0]["refresh_token_encrypted"]
    assert stored != "rt_new"
    assert decrypt_token(stored) == "rt_new"


# ── Disconnect actually CLEARS the stored token (revocable anytime), tenant-scoped ─
def test_disconnect_connection_nulls_token_and_marks_disconnected():
    supabase = MagicMock()
    conn_table = MagicMock()
    supabase.table.return_value = conn_table

    out = disconnect_connection(supabase, "tenant-1")

    # The stored refresh token is set to NULL — nothing retained after disconnect.
    payload = conn_table.update.call_args.args[0]
    assert payload["refresh_token_encrypted"] is None
    assert payload["status"] == "disconnected"
    # Scoped to the caller's own tenant only.
    conn_table.update.return_value.eq.assert_called_with("tenant_id", "tenant-1")
    assert out == {"status": "disconnected"}
