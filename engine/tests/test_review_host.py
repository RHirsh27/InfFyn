import hashlib
import hmac
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.v2.preview_guard import PreviewGuard
from app.v2.review_host import app
from tests.test_v2_economics import audit, revenue

SECRET = "synthetic-review-secret-for-unit-tests-only"


def proof(timestamp=None):
    timestamp = str(timestamp if timestamp is not None else int(time.time()))
    visitor = "a" * 64
    return {
        "x-inffyn-time": timestamp,
        "x-inffyn-visitor": visitor,
        "x-inffyn-signature": hmac.new(
            SECRET.encode(), f"{timestamp}:{visitor}".encode(), hashlib.sha256
        ).hexdigest(),
    }


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AUDIT_PROXY_SECRET", SECRET)
    return TestClient(app)


def test_real_calculation_returns_export_without_creating_server_record(client):
    body = audit(
        **revenue(
            [
                ["sale1", "2026-08-02", 30, "USD", "c1", "chat", "direct"],
                ["sale2", "2026-08-02", 4, "USD", "c2", "search", "direct"],
            ]
        )
    ).model_dump(mode="json")
    response = client.post("/v2/review/calculate", json=body, headers=proof())
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    saved = response.json()
    assert saved["result"]["summary"]["known_cost"] == "11"
    assert saved["result"]["summary"]["contribution"] == "23"
    assert saved["report"]["facts_fingerprint"] == saved["fingerprint"]
    assert "payload" not in saved
    second = client.post("/v2/review/calculate", json=body, headers=proof()).json()
    assert second["fingerprint"] == saved["fingerprint"]
    assert second["id"] != saved["id"]
    assert client.get("/v2/audits/" + saved["id"]).status_code == 404
    assert client.get("/health").json()["storage"] == "reviewer-browser"


def test_missing_invalid_expired_proxy_proofs_fail_closed(client, monkeypatch):
    body = audit().model_dump(mode="json")
    for headers in ({}, {**proof(), "x-inffyn-signature": "wrong"}, proof(1)):
        assert (
            client.post("/v2/review/calculate", json=body, headers=headers).status_code
            == 403
        )
    monkeypatch.delenv("AUDIT_PROXY_SECRET")
    assert (
        client.post("/v2/review/calculate", json=body, headers=proof()).status_code
        == 503
    )


def test_invalid_csv_and_size_limits_do_not_produce_plausible_reports(client):
    body = audit().model_dump(mode="json")
    body["usage_csv"] = "invalid,columns\n1,2"
    response = client.post("/v2/review/calculate", json=body, headers=proof())
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_headers"
    assert (
        client.post("/v2/review/calculate", content=b"x" * 4_000_001).status_code == 413
    )


@pytest.mark.parametrize(
    "path",
    [
        "/stripe/sync",
        "/v2/stripe/evidence",
        "/v2/access/invitations",
        "/v2/billing/checkout",
        "/v2/billing-webhook",
    ],
)
def test_stateless_host_has_no_integration_routes(client, path):
    assert client.post(path, json={}).status_code == 404


def test_database_preview_guard_blocks_side_effect_routes_before_handlers():
    guarded = FastAPI()
    guarded.add_middleware(PreviewGuard, enabled=True)

    @guarded.post("/v2/billing/checkout")
    def forbidden():
        raise AssertionError("Preview reached a provider operation")

    @guarded.get("/v2/billing")
    def status():
        return {"status": "preview"}

    with TestClient(guarded) as browser:
        assert browser.post("/v2/billing/checkout").status_code == 403
        assert browser.get("/v2/billing").status_code == 200
