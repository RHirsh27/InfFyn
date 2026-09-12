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


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_SECRET)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(
        settings, "supabase_service_role_key", "service-role-key-for-tests"
    )
    return TestClient(app)


def auth_headers(tenant_id: str = TENANT_ID) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {make_token()}",
        "X-Tenant-Id": tenant_id,
    }


def test_ingest_csv_non_member_returns_403(client):
    with patch("app.main.resolve_tenant") as resolve:
        from fastapi import HTTPException

        resolve.side_effect = HTTPException(status_code=403, detail="Forbidden")
        response = client.post(
            "/ingest/csv",
            headers=auth_headers(OTHER_TENANT),
            json={"storage_path": f"{OTHER_TENANT}/uploads/x.csv"},
        )
    assert response.status_code == 403


def test_ingest_csv_missing_column_returns_400(client, monkeypatch):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    bad_csv = (
        b"date,model,feature,customer_segment,output_tokens,requests,revenue_usd\n"
        b"2026-01-01,gpt-4,chat,enterprise,100,1,1.00\n"
    )

    mock_supabase = MagicMock()

    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=mock_supabase
    ), patch("app.ingest.jobs.download_storage_file", return_value=bad_csv), patch(
        "app.ingest.jobs.get_existing_job", return_value=None
    ):
        response = client.post(
            "/ingest/csv",
            headers=auth_headers(),
            json={"storage_path": f"{TENANT_ID}/uploads/test.csv"},
        )

    assert response.status_code == 400
    body = response.json()
    assert "missing required column: input_tokens" in body["detail"]["errors"][0]
    mock_supabase.table.return_value.insert.assert_not_called()


def test_ingest_csv_wrong_storage_prefix_returns_403(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    mock_supabase = MagicMock()

    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=mock_supabase
    ):
        response = client.post(
            "/ingest/csv",
            headers=auth_headers(),
            json={"storage_path": f"{OTHER_TENANT}/uploads/steal.csv"},
        )

    assert response.status_code == 403


def test_ingest_csv_queues_job_for_valid_file(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    good_csv = (
        b"date,model,feature,customer_segment,input_tokens,output_tokens,requests,revenue_usd\n"
        b"2026-01-01,gpt-4,chat,enterprise,100,50,1,1.00\n"
    )
    job_id = str(uuid4())

    mock_supabase = MagicMock()
    jobs_table = MagicMock()
    mock_supabase.table.return_value = jobs_table
    jobs_table.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": job_id,
                "status": "pending",
                "rows_ingested": 0,
                "rows_rejected": 0,
                "storage_path": f"{TENANT_ID}/uploads/good.csv",
            }
        ]
    )

    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=mock_supabase
    ), patch("app.ingest.jobs.download_storage_file", return_value=good_csv), patch(
        "app.ingest.jobs.get_existing_job", return_value=None
    ):
        response = client.post(
            "/ingest/csv",
            headers=auth_headers(),
            json={"storage_path": f"{TENANT_ID}/uploads/good.csv"},
        )

    assert response.status_code == 200
    assert response.json()["job_id"] == job_id
    assert response.json()["status"] == "pending"


def test_ingest_csv_idempotent_completed(client):
    ctx = TenantContext(tenant_id=TENANT_ID, user_id=USER_ID, role="owner")
    existing_job = {
        "id": str(uuid4()),
        "status": "completed",
        "rows_ingested": 2,
        "rows_rejected": 0,
        "storage_path": f"{TENANT_ID}/uploads/dup.csv",
    }
    mock_supabase = MagicMock()

    with patch("app.main.resolve_tenant", return_value=ctx), patch(
        "app.main.get_supabase_client", return_value=mock_supabase
    ), patch("app.ingest.jobs.download_storage_file", return_value=b"same"), patch(
        "app.ingest.jobs.get_existing_job", return_value=existing_job
    ):
        response = client.post(
            "/ingest/csv",
            headers=auth_headers(),
            json={"storage_path": f"{TENANT_ID}/uploads/dup.csv"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["rows_ingested"] == 2
    mock_supabase.table.return_value.insert.assert_not_called()
