"""E4 Part B — /audit/run endpoint + run_audit persistence + zero-PII substrate."""

import time
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.metrics.audit import build_aggregate_row, build_result, run_audit
from app.metrics.data import TenantData
from app.models import TenantContext

TEST_SECRET = "unit-test-jwt-secret-do-not-use-in-prod"
USER_ID = str(uuid4())
TENANT_ID = str(uuid4())
OTHER_TENANT = str(uuid4())


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


def _sample_data():
    return TenantData(
        tenant_id=TENANT_ID,
        usage_events=[
            {"model": "gpt-4o-mini", "feature": "chat", "input_tokens": 1_500_000, "output_tokens": 500_000, "customer_ref": "cus_x"},
            {"model": "gpt-4", "feature": "whale", "input_tokens": 2_000_000, "output_tokens": 2_000_000, "customer_ref": "cus_x"},
        ],
        revenue_events=[{"amount": 300.0, "customer_ref": "cus_x", "product": None}],
        reference_pricing=[
            {"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60},
            {"model": "gpt-4o-mini", "input_per_1m": 0.15, "output_per_1m": 0.60},
        ],
    )


class _FakeTable:
    def __init__(self, store, name):
        self.store = store
        self.name = name

    def insert(self, payload):
        self.store.setdefault(self.name, []).append(payload)
        return self

    def execute(self):
        return SimpleNamespace(data=[{"id": "run-1"}])


class _FakeClient:
    def __init__(self):
        self.store: dict = {}

    def table(self, name):
        return _FakeTable(self.store, name)


def test_audit_run_non_member_returns_403(client):
    from fastapi import HTTPException

    with patch("app.main.resolve_tenant", side_effect=HTTPException(status_code=403, detail="Forbidden")):
        response = client.post("/audit/run", headers=auth_headers(OTHER_TENANT))
    assert response.status_code == 403


def test_audit_run_returns_result(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    fake = _FakeClient()
    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=fake
    ), patch("app.metrics.audit.load_tenant_data", return_value=_sample_data()):
        response = client.post("/audit/run", headers=auth_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == "run-1"
    assert body["default_method"] == "usage_weighted"
    assert "sensitivity" in body
    assert "gpp1m_by_model" in body


def test_run_audit_persists_run_and_writes_anonymized_aggregate():
    fake = _FakeClient()
    with patch("app.metrics.audit.load_tenant_data", return_value=_sample_data()):
        result = run_audit(fake, TENANT_ID)

    # audit_runs row is tenant-scoped and holds the full result + coverage.
    run_row = fake.store["audit_runs"][0]
    assert run_row["tenant_id"] == TENANT_ID
    assert run_row["default_method"] == "usage_weighted"
    assert "result" in run_row and "coverage" in run_row

    # audit_aggregates row is zero-PII: coarse buckets + non-identifying mixes.
    agg = fake.store["audit_aggregates"][0]
    assert set(agg) == {"gpp1m_by_model", "model_mix", "segment_mix", "spend_bucket", "volume_bucket", "company_stage"}
    assert "tenant_id" not in agg
    serialized = str(agg)
    assert TENANT_ID not in serialized
    assert "cus_x" not in serialized  # no customer_ref leaks
    assert result["run_id"] == "run-1"


def test_aggregate_row_has_no_raw_amounts_or_customer_refs():
    data = _sample_data()
    result = build_result(data)
    agg = build_aggregate_row(result)
    # spend/volume are buckets (strings), not raw numbers.
    assert isinstance(agg["spend_bucket"], str)
    assert isinstance(agg["volume_bucket"], str)
    # segment_mix keys are feature names (non-PII), values are percentages.
    assert set(agg["segment_mix"]) == {"chat", "whale"}
    assert all(0 <= v <= 100 for v in agg["segment_mix"].values())
