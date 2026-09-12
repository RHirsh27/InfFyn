"""E5 — server-side entitlement projection (gating) tests.

Proves the core rule: a FREE tier never receives per-customer profit or which
features are volatile; a PAID tier receives the full result + history.
"""

import json
import time
from unittest.mock import patch
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.metrics.audit import build_result
from app.metrics.data import TenantData
from app.metrics.projection import (
    free_projection,
    get_projected_result,
    is_paid_tier,
)
from app.models import TenantContext

TEST_SECRET = "unit-test-jwt-secret-do-not-use-in-prod"
USER_ID = str(uuid4())
TENANT_ID = str(uuid4())
OTHER_TENANT = str(uuid4())


def _sample_result():
    data = TenantData(
        tenant_id=TENANT_ID,
        usage_events=[
            {"model": "gpt-4o-mini", "feature": "chat", "input_tokens": 1_500_000, "output_tokens": 500_000, "customer_ref": "cus_x"},
            {"model": "gpt-4o", "feature": "premium", "input_tokens": 100_000, "output_tokens": 100_000, "customer_ref": "cus_x"},
            {"model": "claude-3-sonnet", "feature": "search", "input_tokens": 1_000_000, "output_tokens": 1_000_000, "customer_ref": "cus_x"},
            {"model": "gpt-4", "feature": "whale", "input_tokens": 2_000_000, "output_tokens": 2_000_000, "customer_ref": "cus_x"},
        ],
        revenue_events=[{"amount": 300.0, "customer_ref": "cus_x", "product": None}],
        reference_pricing=[
            {"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60},
            {"model": "gpt-4o", "input_per_1m": 2.5, "output_per_1m": 10},
            {"model": "gpt-4o-mini", "input_per_1m": 0.15, "output_per_1m": 0.60},
            {"model": "claude-3-sonnet", "input_per_1m": 3, "output_per_1m": 15},
        ],
    )
    return build_result(data)


# ── Fake Supabase client for projection ─────────────────────────────────────

class _FakeExec:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, client, name):
        self.client = client
        self.name = name
        self.single = False

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        if self.name == "tenants":
            return _FakeExec({"tier": self.client.tier})
        if self.name == "audit_runs":
            return _FakeExec(self.client.runs)
        return _FakeExec(None)


class _FakeClient:
    def __init__(self, tier, runs):
        self.tier = tier
        self.runs = runs

    def table(self, name):
        return _FakeQuery(self, name)


def _run_row():
    return {
        "id": "run-1",
        "created_at": "2026-07-08T00:00:00Z",
        "result": _sample_result(),
        "default_method": "usage_weighted",
        "coverage": {"customer_join": {"revenue_matched_pct": 100.0}},
    }


# ── Unit: free projection contains no paid data ─────────────────────────────

def test_free_projection_shape_and_no_leak():
    proj = free_projection(_sample_result())
    assert set(proj) == {"spend_per_1m_by_model", "headline_finding", "flagged_count"}
    assert proj["flagged_count"] == 2  # premium + chat flip on the sample

    blob = json.dumps(proj)
    # No per-customer profit, no which-features-volatile, no raw revenue.
    assert "per_customer" not in blob
    assert "attributed_cost" not in blob
    assert "volatile_features" not in blob
    for feature in ("chat", "premium", "search", "whale"):
        assert feature not in blob  # feature-level detail is paid-only


def test_is_paid_tier():
    assert is_paid_tier("starter")
    assert is_paid_tier("growth")
    assert is_paid_tier("scale")
    assert not is_paid_tier("free")
    assert not is_paid_tier(None)


def test_get_projected_result_free_excludes_full_result():
    client = _FakeClient(tier="free", runs=[_run_row()])
    out = get_projected_result(client, TENANT_ID)
    assert out["paid"] is False
    assert out["has_run"] is True
    assert "free" in out
    assert "result" not in out
    assert "coverage" not in out
    assert "history" not in out


def test_get_projected_result_paid_includes_full_result_and_history():
    client = _FakeClient(tier="growth", runs=[_run_row()])
    out = get_projected_result(client, TENANT_ID)
    assert out["paid"] is True
    assert "result" in out
    assert "coverage" in out
    assert "history" in out
    assert out["result"]["sensitivity"]["volatile_features"] == ["chat", "premium"]


def test_get_projected_result_no_run():
    client = _FakeClient(tier="free", runs=[])
    out = get_projected_result(client, TENANT_ID)
    assert out["has_run"] is False
    assert "free" not in out


# ── Endpoint: gating over the wire ──────────────────────────────────────────

def make_token(**overrides) -> str:
    payload = {"sub": USER_ID, "aud": "authenticated", "iss": f"{settings.supabase_url.rstrip('/')}/auth/v1", "exp": int(time.time()) + 3600, **overrides}
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "service-role-key-for-tests")
    return TestClient(app)


def auth_headers(tenant_id: str = TENANT_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}", "X-Tenant-Id": tenant_id}


def test_audit_result_non_member_returns_403(client):
    from fastapi import HTTPException

    with patch("app.main.resolve_tenant", side_effect=HTTPException(status_code=403, detail="Forbidden")):
        response = client.get("/audit/result", headers=auth_headers(OTHER_TENANT))
    assert response.status_code == 403


def test_audit_result_free_payload_has_no_paid_fields(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    fake = _FakeClient(tier="free", runs=[_run_row()])
    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=fake
    ):
        response = client.get("/audit/result", headers=auth_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["paid"] is False
    assert "result" not in body
    blob = json.dumps(body)
    assert "attributed_cost" not in blob
    assert "volatile_features" not in blob
    # Teaser count is allowed; feature identities are not.
    assert body["free"]["flagged_count"] == 2
