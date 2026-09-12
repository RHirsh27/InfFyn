import time

import pytest
from fastapi import HTTPException

from app.config import settings
from app.stripe.oauth_state import create_oauth_state, verify_oauth_state


@pytest.fixture(autouse=True)
def oauth_secret(monkeypatch):
    monkeypatch.setattr(settings, "oauth_state_secret", "test-oauth-state-secret-key-32bytes!")
    monkeypatch.setattr(settings, "supabase_jwt_secret", None)


def test_oauth_state_roundtrip():
    state = create_oauth_state(settings, "tenant-1", "user-1")
    payload = verify_oauth_state(settings, state)
    assert payload["tid"] == "tenant-1"
    assert payload["uid"] == "user-1"


def test_oauth_state_rejects_tamper():
    state = create_oauth_state(settings, "tenant-1", "user-1")
    body, _sig = state.rsplit(".", 1)
    bad = f"{body}.deadbeef"
    with pytest.raises(HTTPException) as exc:
        verify_oauth_state(settings, bad)
    assert exc.value.status_code == 400


def test_oauth_state_rejects_expired(monkeypatch):
    monkeypatch.setattr(time, "time", lambda: 0)
    state = create_oauth_state(settings, "tenant-1", "user-1")
    monkeypatch.setattr(time, "time", lambda: 999999)
    with pytest.raises(HTTPException):
        verify_oauth_state(settings, state)
