import logging
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.private_alpha import route_access
from app.v2.maintenance import maintenance_router


@pytest.fixture
def operations(monkeypatch):
    settings = SimpleNamespace(
        maintenance_secret="synthetic-operations-secret-32-characters",
        audit_v2_enabled=True,
        audit_retention_approved=True,
        monthly_enabled=False,
        sentry_dsn=None,
    )
    repo = SimpleNamespace(db=None, cleanup=Mock())
    monthly = SimpleNamespace(cleanup=Mock())
    monkeypatch.setattr("app.monthly.repository.MonthlyRepository", lambda _: monthly)
    app = FastAPI()
    factory = Mock(return_value=repo)
    app.include_router(maintenance_router(settings, factory), prefix="/v2")
    return TestClient(app), settings, repo, monthly, factory


@pytest.mark.parametrize("path", ["/v2/maintenance", "/v2/maintenance/check"])
def test_operations_require_dedicated_secret(operations, path):
    client, settings, repo, monthly, factory = operations
    for header in ("", "Bearer invalid", "Bearer a-normal-user-session"):
        assert client.post(path, headers={"Authorization": header}).status_code == 401
    settings.maintenance_secret = "short"
    assert (
        client.post(path, headers={"Authorization": "Bearer short"}).status_code == 401
    )
    factory.assert_not_called()
    assert route_access("POST", path) == "maintenance"
    assert route_access("GET", path) is None


def auth(settings):
    return {"Authorization": "Bearer " + settings.maintenance_secret}


def test_retention_includes_monthly_records_when_intake_paused(operations):
    client, settings, repo, monthly, _ = operations
    result = client.post("/v2/maintenance", headers=auth(settings))
    assert result.status_code == 200
    assert result.json()["monthly_included"] is True
    assert result.headers["cache-control"] == "no-store"
    repo.cleanup.assert_called_once()
    monthly.cleanup.assert_called_once()


def test_retention_never_claims_completion_after_partial_failure(operations, caplog):
    client, settings, repo, monthly, _ = operations
    monthly.cleanup.side_effect = RuntimeError("private-financial-data-and-credential")
    with caplog.at_level(logging.WARNING):
        result = client.post("/v2/maintenance", headers=auth(settings))
    assert result.status_code == 503
    assert result.json()["code"] == "retention_failed"
    assert "completed_at" not in result.json()
    assert "private-financial" not in caplog.text + result.text
    assert "inffyn_retention_failed" in caplog.text


def test_retention_requires_approved_policy(operations):
    client, settings, repo, monthly, _ = operations
    settings.audit_retention_approved = False
    assert client.post("/v2/maintenance", headers=auth(settings)).status_code == 503
    repo.cleanup.assert_not_called()
    monthly.cleanup.assert_not_called()


def test_monthly_status_cannot_claim_availability_before_policy_approval(operations):
    from app.v2.router import build_router

    _, settings, _, _, factory = operations
    settings.monthly_enabled = True
    settings.audit_retention_approved = False
    settings.billing_enabled = False
    settings.billing_price_approved = False
    app = FastAPI()
    app.include_router(
        build_router(settings, lambda: None, lambda: None, lambda *a: None, factory)
    )
    result = TestClient(app).get("/v2/status").json()
    assert result["available"] is False
    assert result["monthly_available"] is False
    factory.assert_not_called()


def test_monitoring_check_scrubs_fixed_event_and_never_touches_data(operations, caplog):
    client, settings, _, _, factory = operations
    settings.audit_retention_approved = False
    with caplog.at_level(logging.ERROR):
        response = client.post(
            "/v2/maintenance/check",
            headers=auth(settings),
            json={"customer": "untrusted-canary"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["platform_log_emitted"] is True
    assert data["external_monitor_configured"] is False
    assert data["external_delivery_verified"] is False
    assert data["event_id"] in caplog.text
    assert "SYNTHETIC_PRIVATE_EVIDENCE" not in caplog.text
    assert "untrusted-canary" not in caplog.text
    factory.assert_not_called()


def test_external_send_is_not_claimed_as_verified_delivery(operations, monkeypatch):
    client, settings, _, _, _ = operations
    settings.sentry_dsn = "synthetic-configured-only"
    capture, flush = Mock(), Mock()
    monkeypatch.setattr("sentry_sdk.capture_event", capture)
    monkeypatch.setattr("sentry_sdk.flush", flush)
    response = client.post("/v2/maintenance/check", headers=auth(settings))
    assert response.json()["external_monitor_configured"] is True
    assert response.json()["external_delivery_verified"] is False
    assert "SYNTHETIC_PRIVATE_EVIDENCE" not in str(capture.call_args)
    flush.assert_called_once_with(timeout=5)
