"""HMAC-signed OAuth state bound to tenant + user (CSRF protection)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException

STATE_TTL_SECONDS = 600


def _secret(settings) -> bytes:
    raw = (
        settings.oauth_state_secret
        or settings.supabase_jwt_secret
        or settings.stripe_oauth_client_secret
    )
    if not raw:
        raise HTTPException(status_code=500, detail="OAuth state secret not configured")
    return raw.encode("utf-8")


def create_oauth_state(settings, tenant_id: str, user_id: str) -> str:
    payload = {
        "tid": tenant_id,
        "uid": user_id,
        "exp": int(time.time()) + STATE_TTL_SECONDS,
    }
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(_secret(settings), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_oauth_state(settings, state: str) -> dict[str, Any]:
    try:
        body, sig = state.rsplit(".", 1)
        expected = hmac.new(_secret(settings), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("bad signature")
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
        if payload.get("exp", 0) < time.time():
            raise ValueError("expired")
        if not payload.get("tid") or not payload.get("uid"):
            raise ValueError("missing ids")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state") from exc
