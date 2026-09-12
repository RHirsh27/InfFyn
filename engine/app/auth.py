"""Supabase JWT verification — identity comes only from verified token sub."""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWTError
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.private_alpha import enforce_alpha_user, is_private_alpha

_bearer = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


def _current_alpha_account(token: str):
    """Verify current account state remotely; never cache identities across requests."""
    import httpx

    from supabase import AuthApiError, ClientOptions, create_client

    try:
        # Dedicated, bounded transport does not persist/refresh user sessions or
        # follow redirects carrying authorization to another origin.
        with httpx.Client(timeout=10, follow_redirects=False) as transport:
            client = create_client(
                settings.supabase_url,
                settings.supabase_service_role_key,
                options=ClientOptions(
                    persist_session=False,
                    auto_refresh_token=False,
                    httpx_client=transport,
                ),
            )
            response = client.auth.get_user(jwt=token)
        return response.user if response else None
    except AuthApiError as error:
        if error.status in (401, 403):
            raise HTTPException(
                401, "The private alpha session is no longer valid."
            ) from None
        raise HTTPException(
            503, "Private alpha account verification is temporarily unavailable."
        ) from None
    except Exception:  # noqa: BLE001 -- provider responses may contain credentials or private account details
        raise HTTPException(
            503, "Private alpha account verification is temporarily unavailable."
        ) from None


def _require_current_alpha_account(token: str, subject: str):
    user = _current_alpha_account(token)
    if (
        user is None
        or getattr(user, "id", None) != subject
        or not getattr(user, "email_confirmed_at", None)
        or getattr(user, "is_anonymous", None) is not False
        or getattr(user, "deleted_at", None)
    ):
        raise HTTPException(
            403, "A current verified private alpha account is required."
        )


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def verify_jwt(token: str) -> str:
    """Verify Supabase access token; return user id (sub) or raise 401."""
    try:
        if settings.supabase_jwt_secret:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
                options={"require": ["exp", "sub", "iss"]},
            )
        else:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
                issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
                options={"require": ["exp", "sub", "iss"]},
            )

        sub = payload.get("sub")
        if not sub or not isinstance(sub, str):
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")

        if is_private_alpha(settings):
            if (
                payload.get("role") != "authenticated"
                or payload.get("is_anonymous") is not False
            ):
                raise HTTPException(
                    403, "A verified private alpha account is required."
                )
            enforce_alpha_user(settings, sub)
            _require_current_alpha_account(token, sub)

        return sub
    except HTTPException:
        raise
    except PyJWTError:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token"
        ) from None


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency — verified user id from Bearer token only."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header",
        )
    if not credentials.credentials.strip():
        raise HTTPException(status_code=401, detail="Missing bearer token")

    if is_private_alpha(settings):
        # PrivateAlphaGuard has already verified this exact HTTP request. Reuse
        # only its internal request state, never a client header or persistent cache.
        verified = getattr(request.state, "inffyn_alpha_verified_user", None)
        if verified is not None:
            enforce_alpha_user(settings, verified)
            return verified
    return await run_in_threadpool(verify_jwt, credentials.credentials)
