import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.v2.access import access_router, access_state
from app.v2.throttle import visitor_bucket, quota
from app.v2.repository import AuditRepository


def test_grants_and_subscriptions_are_independent():
    repo = Mock()
    repo.subscription.return_value = {}
    repo.grant.return_value = {"revoked_at": None}
    assert access_state(repo, "company", "price")["access_source"] == "complimentary"
    repo.grant.return_value = {"revoked_at": "2026-09-07"}
    assert not access_state(repo, "company", "price")["entitled"]
    repo.subscription.return_value = {
        "status": "active",
        "price_id": "price",
        "current_period_end": (
            datetime.now(timezone.utc) + timedelta(days=2)
        ).isoformat(),
    }
    assert access_state(repo, "company", "price")["access_source"] == "subscription"


def test_admin_gate_and_secret_hashing():
    repo = Mock()
    repo.is_admin.return_value = False
    repo.consume_quota.return_value = True
    repo.issue_invitation.return_value = "invitation-id"
    settings = SimpleNamespace(
        audit_v2_enabled=True,
        audit_retention_approved=True,
        app_base_url="https://example.test",
    )
    app = FastAPI()
    app.include_router(access_router(settings, lambda: repo, lambda: "user"))
    client = TestClient(app)
    body = {"email": "Person@example.test", "company_name": "Example"}
    assert client.post("/access/invitations", json=body).status_code == 403
    repo.issue_invitation.assert_not_called()
    repo.is_admin.return_value = True
    response = client.post("/access/invitations", json=body)
    assert response.status_code == 200
    token = response.json()["url"].split("#")[1]
    assert len(token) == 64
    repo.issue_invitation.assert_called_once_with(
        "user",
        "person@example.test",
        "Example",
        hashlib.sha256(token.encode()).hexdigest(),
    )
    repo.consume_quota.return_value = False
    assert client.post("/access/invitations", json=body).status_code == 429


def test_visitor_proof_requires_fresh_valid_signature():
    secret = "x" * 32
    visitor = "a" * 64
    timestamp = str(int(time.time()))
    headers = {
        "x-inffyn-visitor": visitor,
        "x-inffyn-time": timestamp,
        "x-inffyn-signature": hmac.new(
            secret.encode(), f"{timestamp}:{visitor}".encode(), hashlib.sha256
        ).hexdigest(),
    }
    request = SimpleNamespace(headers=headers)
    assert visitor_bucket(request, secret) == "visitor:" + visitor
    for field, value in [
        ("x-inffyn-visitor", "b" * 64),
        ("x-inffyn-time", "0"),
        ("x-inffyn-signature", "wrong"),
    ]:
        with pytest.raises(HTTPException) as error:
            visitor_bucket(SimpleNamespace(headers={**headers, field: value}), secret)
        assert error.value.status_code == 403
    with pytest.raises(HTTPException) as error:
        visitor_bucket(request, None)
    assert error.value.status_code == 503


def test_quota_blocks_without_altering_reports():
    repo = Mock()
    repo.consume_quota.return_value = False
    with pytest.raises(HTTPException) as error:
        quota(repo, "company", 60)
    assert error.value.status_code == 429
    assert repo.mock_calls == [(("consume_quota"), ("company", 60), {})]


def test_empty_postgrest_lookups_are_valid_first_account_states():
    query = Mock()
    for method in ("table", "select", "eq", "gt", "maybe_single"):
        getattr(query, method).return_value = query
    query.execute.return_value = None
    repo = AuditRepository(query)
    assert repo.subscription("new-company") == {"status": "inactive"}
    assert repo.grant("new-company") is None
    assert not repo.is_admin("new-user")
    assert repo.get("new-company", "unknown-audit") is None
    assert access_state(repo, "new-company", "price")["access_source"] == "free"
