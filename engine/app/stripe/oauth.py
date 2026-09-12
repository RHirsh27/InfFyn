"""Stripe App OAuth 2.0 (read-only) — engine-side authorize + token exchange.

Migration note: this replaces the dead read-only Connect OAuth. Read-only access is
now only available via a Stripe App (manifest `engine/stripe-app.json`, grants
`invoice_read` + `charge_read`, zero writes).

Mechanism (per https://docs.stripe.com/stripe-apps/api-authentication/oauth):
  • authorize → https://marketplace.stripe.com/oauth/v2/authorize?client_id=…&redirect_uri=…&state=…
    (permissions come from the manifest — no scope/response_type params)
  • token / refresh → POST https://api.stripe.com/v1/oauth/token, authenticated with the
    app developer's OWN secret key via HTTP Basic (username = sk_…, password empty).
  • the access_token IS the api key for reads (stripe.api_key = access_token); no
    stripe_account header. Access tokens last 1h; refresh tokens last 1y and ROLL on
    every exchange, so each refresh must persist the new refresh token.

The signed/HMAC state (CSRF) and the connection/status semantics are unchanged.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from stripe import AuthenticationError
from supabase import Client

from app.config import settings
from app.stripe.crypto import decrypt_token, encrypt_token
from app.stripe.oauth_state import create_oauth_state

# Stripe App OAuth 2.0 endpoints (replace the retired connect.stripe.com endpoints).
STRIPE_APP_AUTHORIZE_URL = "https://marketplace.stripe.com/oauth/v2/authorize"
STRIPE_OAUTH_TOKEN_URL = "https://api.stripe.com/v1/oauth/token"


def _require_stripe_oauth_config() -> None:
    missing = []
    if not settings.stripe_app_client_id:
        missing.append("STRIPE_APP_CLIENT_ID")
    if not settings.stripe_secret_key:
        missing.append("STRIPE_SECRET_KEY")
    if not settings.stripe_oauth_redirect_uri:
        missing.append("STRIPE_OAUTH_REDIRECT_URI")
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Stripe App OAuth not configured: {', '.join(missing)}",
        )


def build_authorize_url(tenant_id: str, user_id: str) -> str:
    """Build the Stripe App OAuth install/authorize URL. Response contract unchanged:
    the /stripe/connect/start route returns { authorize_url } from this string."""
    _require_stripe_oauth_config()
    state = create_oauth_state(settings, tenant_id, user_id)
    params = {
        "client_id": settings.stripe_app_client_id,
        "redirect_uri": settings.stripe_oauth_redirect_uri,
        "state": state,
    }
    return f"{STRIPE_APP_AUTHORIZE_URL}?{urlencode(params)}"


def _post_oauth_token(data: dict[str, str]) -> dict[str, Any]:
    """POST to the Stripe App token endpoint, authenticated with the app developer
    secret key via HTTP Basic (username = secret key, empty password)."""
    _require_stripe_oauth_config()
    try:
        response = httpx.post(
            STRIPE_OAUTH_TOKEN_URL,
            data=data,
            auth=(settings.stripe_secret_key, ""),
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        # A rejected authorization_code or a revoked/expired refresh token lands here.
        raise HTTPException(
            status_code=400,
            detail="Stripe OAuth token exchange failed. Reconnect and try again.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Stripe OAuth unreachable") from exc


def exchange_code_for_tokens(code: str) -> dict[str, str]:
    """Exchange the one-time authorization code for tokens. Returns
    { stripe_account_id, access_token, refresh_token, scope }."""
    data = _post_oauth_token({"code": code, "grant_type": "authorization_code"})

    account_id = data.get("stripe_user_id") or data.get("account_id")
    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    if not account_id or not isinstance(account_id, str):
        raise HTTPException(status_code=400, detail="Stripe OAuth response missing account id")
    if not access_token or not refresh_token:
        raise HTTPException(status_code=400, detail="Stripe OAuth response missing tokens")

    return {
        "stripe_account_id": account_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "scope": data.get("scope", "stripe_apps"),
    }


def _refresh_tokens(refresh_token: str) -> dict[str, str]:
    """Exchange a refresh token for a fresh access token (and a rolled refresh token).
    Raises stripe.AuthenticationError if the grant was revoked/expired so callers can
    route to the needs_reauth recovery path."""
    try:
        data = _post_oauth_token({"refresh_token": refresh_token, "grant_type": "refresh_token"})
    except HTTPException as exc:
        if exc.status_code == 400:
            raise AuthenticationError("Stripe refresh token rejected — reconnect required") from exc
        raise

    access_token = data.get("access_token")
    new_refresh = data.get("refresh_token")
    if not access_token or not new_refresh:
        raise AuthenticationError("Stripe refresh response missing tokens — reconnect required")

    return {
        "access_token": access_token,
        "refresh_token": new_refresh,
        "stripe_account_id": data.get("account_id") or data.get("stripe_user_id") or "",
    }


def upsert_connection(
    supabase: Client,
    tenant_id: str,
    stripe_account_id: str,
    refresh_token: str,
) -> dict[str, Any]:
    """Store the connection with the encrypted read-only refresh token."""
    row = {
        "tenant_id": tenant_id,
        "stripe_account_id": stripe_account_id,
        "refresh_token_encrypted": encrypt_token(refresh_token),
        "scope": "read_only",
        "status": "connected",
        "last_error": None,
    }
    result = (
        supabase.table("stripe_connections")
        .upsert(row, on_conflict="tenant_id")
        .execute()
    )
    if result is None or not result.data:
        raise HTTPException(status_code=500, detail="Failed to save Stripe connection")
    return result.data[0] if isinstance(result.data, list) else result.data


def get_connection_for_tenant(supabase: Client, tenant_id: str) -> dict[str, Any] | None:
    result = (
        supabase.table("stripe_connections")
        .select("*")
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if result is None:
        return None
    return result.data


def _store_rolled_refresh_token(supabase: Client, tenant_id: str, refresh_token: str) -> None:
    """Persist the rolled refresh token after a successful refresh (tokens roll each use)."""
    supabase.table("stripe_connections").update(
        {"refresh_token_encrypted": encrypt_token(refresh_token)}
    ).eq("tenant_id", tenant_id).execute()


def get_access_token_for_tenant(supabase: Client, tenant_id: str) -> str:
    """Obtain a fresh read-only access token for a tenant: decrypt the stored refresh
    token, refresh it, persist the rolled refresh token, and return the access token.
    Raises stripe.AuthenticationError (→ needs_reauth) if the grant was revoked."""
    connection = get_connection_for_tenant(supabase, tenant_id)
    if not connection:
        raise HTTPException(status_code=404, detail="No Stripe connection for tenant")

    ciphertext = connection.get("refresh_token_encrypted")
    if not ciphertext:
        raise AuthenticationError("Stripe connection has no refresh token — reconnect required")

    refreshed = _refresh_tokens(decrypt_token(ciphertext))
    _store_rolled_refresh_token(supabase, tenant_id, refreshed["refresh_token"])
    return refreshed["access_token"]


def mark_connection_status(
    supabase: Client,
    tenant_id: str,
    *,
    status: str,
    last_error: str | None = None,
    last_sync_at: str | None = None,
    last_cursor: str | None = None,
) -> None:
    payload: dict[str, Any] = {"status": status, "last_error": last_error}
    if last_sync_at is not None:
        payload["last_sync_at"] = last_sync_at
    if last_cursor is not None:
        payload["last_cursor"] = last_cursor
    supabase.table("stripe_connections").update(payload).eq("tenant_id", tenant_id).execute()


def disconnect_connection(supabase: Client, tenant_id: str) -> dict[str, Any]:
    """Disconnect Stripe for a tenant. The GUARANTEE behind "revocable anytime": the
    stored read-only refresh token is CLEARED (set to NULL), so nothing is retained
    after disconnect — a later sync can't silently re-read. The row is marked
    disconnected and its cursor reset so a future reconnect starts clean.

    Stripe-side note: a Stripe App grant is fully revoked when the user uninstalls the
    app from their Stripe dashboard; there is no clean programmatic deauthorize for the
    app OAuth token the way Connect had. Clearing our stored token locally is the real,
    enforceable guarantee, so that's what we do here.
    """
    supabase.table("stripe_connections").update(
        {
            "status": "disconnected",
            "refresh_token_encrypted": None,
            "last_error": None,
            "last_cursor": None,
        }
    ).eq("tenant_id", tenant_id).execute()
    return {"status": "disconnected"}
