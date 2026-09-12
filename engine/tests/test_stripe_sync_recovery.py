from unittest.mock import MagicMock, patch

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from stripe import AuthenticationError

from app.config import settings
from app.stripe import oauth
from app.stripe.crypto import encrypt_token
from app.stripe.sync import sync_stripe_revenue

TEST_ENC_KEY = Fernet.generate_key().decode()


# ── The needs_reauth path now surfaces through the refresh/token call ─────────
# A revoked grant is detected when we try to refresh the access token
# (get_access_token_for_tenant → AuthenticationError), which flows into the same
# recovery handler as before.
def test_sync_refresh_revoked_marks_needs_reauth_no_revenue_write():
    supabase = MagicMock()
    revenue_table = MagicMock()
    conn_table = MagicMock()
    supabase.table.side_effect = lambda name: revenue_table if name == "revenue_events" else conn_table

    connection = {"stripe_account_id": "acct_test", "status": "connected", "last_cursor": "0"}

    with patch("app.stripe.sync.get_connection_for_tenant", return_value=connection), patch(
        "app.stripe.sync.get_access_token_for_tenant",
        side_effect=AuthenticationError("Stripe refresh token rejected — reconnect required"),
    ), patch("app.stripe.sync.mark_connection_status") as mark:
        with pytest.raises(HTTPException) as exc:
            sync_stripe_revenue(supabase, "tenant-1")

    assert exc.value.status_code == 401
    mark.assert_called_once()
    assert mark.call_args.kwargs["status"] == "needs_reauth"
    revenue_table.upsert.assert_not_called()  # fail closed — no partial writes


# ── Verify the recovery for real: the actual refresh call rejects a revoked
#    token, raises AuthenticationError, and does NOT persist a rolled token ─────
def test_get_access_token_raises_on_revoked_refresh_and_stores_nothing(monkeypatch):
    monkeypatch.setattr(settings, "stripe_token_enc_key", TEST_ENC_KEY)
    monkeypatch.setattr(settings, "stripe_app_client_id", "acc_test_client")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dev")
    monkeypatch.setattr(settings, "stripe_oauth_redirect_uri", "http://localhost:8001/stripe/connect/callback")

    supabase = MagicMock()
    conn_table = MagicMock()
    supabase.table.return_value = conn_table

    connection = {
        "stripe_account_id": "acct_1",
        "status": "connected",
        "refresh_token_encrypted": encrypt_token("rt_old_valid"),
    }

    # Stripe token endpoint rejects the refresh (revoked/expired) → HTTP 400.
    resp = MagicMock()
    resp.text = "invalid_grant"
    resp.raise_for_status.side_effect = httpx.HTTPStatusError(
        "400 Bad Request", request=MagicMock(), response=resp
    )

    with patch("app.stripe.oauth.get_connection_for_tenant", return_value=connection), patch(
        "app.stripe.oauth.httpx.post", return_value=resp
    ):
        with pytest.raises(AuthenticationError):
            oauth.get_access_token_for_tenant(supabase, "tenant-1")

    # The rolled-token write is never reached — nothing is persisted on failure.
    conn_table.update.assert_not_called()
