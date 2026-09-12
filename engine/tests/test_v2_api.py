import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.v2.local_validation import create_validation_app, LocalRepository, TENANT, USER
from app.v2.billing import entitled, apply_webhook
from tests.test_v2_economics import audit, revenue

HEADERS = {"X-Tenant-Id": TENANT}


@pytest.fixture
def setup(tmp_path):
    path = tmp_path / "audit.sqlite"
    return TestClient(create_validation_app(path)), LocalRepository(path)


def test_save_return_idempotency_version_and_tenant_isolation(setup):
    c, repo = setup
    body = audit().model_dump(mode="json")
    a = c.post("/v2/audits", json=body, headers=HEADERS)
    assert a.status_code == 200
    saved = a.json()
    assert saved["access_level"] == "full"
    assert c.post("/v2/audits", json=body, headers=HEADERS).json()["id"] == saved["id"]
    changed = {**body, "title": "Restated period"}
    assert (
        c.post("/v2/audits", json=changed, headers=HEADERS).json()["id"] != saved["id"]
    )
    assert len(c.get("/v2/audits", headers=HEADERS).json()["audits"]) == 2
    assert c.get("/v2/audits/" + saved["id"], headers=HEADERS).json() == saved
    assert (
        c.get(
            "/v2/audits/" + saved["id"],
            headers={"X-Tenant-Id": "33333333-3333-4333-8333-333333333333"},
        ).status_code
        == 403
    )
    assert repo.get("another-tenant", saved["id"]) is None


def test_free_projection_upgrade_and_post_cancel_report_retention(setup):
    c, repo = setup
    repo.set_paid(TENANT, False)
    body = audit(
        **revenue([["secret", "2026-08-02", 34, "USD", "c1", "chat", "direct"]])
    ).model_dump(mode="json")
    a = c.post("/v2/audits", json=body, headers=HEADERS).json()
    assert (
        a["access_level"] == "preview"
        and "revenue" not in a["result"]
        and a["report"] is None
    )
    assert (
        c.post("/v2/audits/" + a["id"] + "/rerun", headers=HEADERS).status_code == 402
    )
    repo.set_paid(TENANT, True)
    upgraded = c.post("/v2/audits/" + a["id"] + "/rerun", headers=HEADERS).json()
    assert (
        upgraded["access_level"] == "full"
        and upgraded["result"]["summary"]["revenue"] == "34"
    )
    repo.set_paid(TENANT, False)
    assert (
        c.get("/v2/audits/" + upgraded["id"], headers=HEADERS).json()["access_level"]
        == "full"
    )


def test_claim_is_single_use_and_atomic(setup):
    c, repo = setup
    p = c.post("/v2/preview", json=audit().model_dump(mode="json")).json()
    assert "revenue" not in p["preview"]
    token = p["claim_token"]

    def claim():
        return repo.claim(hashlib.sha256(token.encode()).hexdigest(), TENANT, USER)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: claim(), range(2)))
    assert sum(r is not None for r in results) == 1
    assert (
        c.post("/v2/previews/claim", json={"token": token}, headers=HEADERS).status_code
        == 410
    )
    assert (
        c.post(
            "/v2/previews/claim", json={"token": "x" * 64}, headers=HEADERS
        ).status_code
        == 410
    )


def test_expiry_and_deletion_remove_payload_and_output(setup):
    c, repo = setup
    a = c.post(
        "/v2/audits", json=audit().model_dump(mode="json"), headers=HEADERS
    ).json()
    record = repo.get(TENANT, a["id"])
    record["evidence_expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    ).isoformat()
    with repo.connection() as db:
        db.execute(
            "update audits set record=? where id=?", (json.dumps(record), a["id"])
        )
    assert (
        c.get("/v2/audits/" + a["id"] + "/evidence", headers=HEADERS).status_code == 410
    )
    repo.cleanup()
    assert repo.get(TENANT, a["id"])["payload"] is None
    assert c.delete("/v2/audits/" + a["id"], headers=HEADERS).status_code == 200
    assert c.get("/v2/audits/" + a["id"], headers=HEADERS).status_code == 404


def test_bounds_errors_and_disabled_provider_operations(setup):
    c, _ = setup
    assert (
        c.post("/v2/audits", content=b"x" * 4_000_001, headers=HEADERS).status_code
        == 413
    )
    body = audit().model_dump(mode="json")
    body["usage_csv"] = "bad,file\n1,2"
    r = c.post("/v2/audits", json=body, headers=HEADERS)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "invalid_headers"
    assert c.post("/v2/billing/checkout", json={}, headers=HEADERS).status_code == 503


def test_anonymous_global_quota_is_durable(setup):
    _, repo = setup
    for _ in range(10):
        assert repo.consume_preview("public-pilot")
    assert not LocalRepository(repo.path).consume_preview("public-pilot")


def test_oversize_result_is_rejected_before_saving(setup, monkeypatch):
    from app.v2 import computation

    c, repo = setup
    monkeypatch.setattr(
        computation,
        "calculate",
        lambda body: {"findings": [], "trace": "x" * 3_800_001},
    )
    monkeypatch.setattr(computation, "sensitivity", lambda body, result: {})
    monkeypatch.setattr(computation, "report", lambda result: {})
    response = c.post(
        "/v2/audits", json=audit().model_dump(mode="json"), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "result_too_large"
    assert repo.list(TENANT) == []


def test_revised_release_retires_legacy_mutations(monkeypatch):
    from app import main

    monkeypatch.setattr(main.settings, "audit_v2_enabled", True)

    def no_database():
        raise AssertionError("Retired mutation reached the database")

    monkeypatch.setattr(main, "get_supabase_client", no_database)
    main.app.dependency_overrides[main.get_current_user] = lambda: USER
    try:
        with TestClient(main.app) as client:
            for path, body in (
                ("/audit/run", {}),
                ("/stripe/sync", {}),
                ("/ingest/csv", {"storage_path": "synthetic.csv"}),
            ):
                assert client.post(path, headers=HEADERS, json=body).status_code == 410
    finally:
        main.app.dependency_overrides.pop(main.get_current_user, None)


def test_billing_entitlement_rejects_unpaid_wrong_price_expired():
    state = {
        "status": "active",
        "price_id": "p",
        "current_period_end": (
            datetime.now(timezone.utc) + timedelta(days=1)
        ).isoformat(),
    }
    assert entitled(state, "p")
    for changed in (
        {"status": "past_due"},
        {"status": "trialing"},
        {"price_id": "wrong"},
        {"current_period_end": None},
        {
            "current_period_end": (
                datetime.now(timezone.utc) - timedelta(days=1)
            ).isoformat()
        },
    ):
        assert not entitled({**state, **changed}, "p")


def test_invalid_webhook_signature_never_touches_database():
    from types import SimpleNamespace

    repo = MagicMock()
    with pytest.raises(HTTPException) as err:
        apply_webhook(
            b"{}",
            "t=1,v1=invalid",
            repo,
            SimpleNamespace(stripe_billing_webhook_secret="whsec_synthetic"),
        )
    assert err.value.status_code == 400 and not repo.mock_calls
