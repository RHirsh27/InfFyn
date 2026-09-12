from types import SimpleNamespace
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.monthly.router import build_monthly_router
from app.v2.local_validation import TENANT, USER, LocalRepository


@pytest.fixture
def connected_app(tmp_path):
    repo = LocalRepository(tmp_path / "connectors.sqlite")
    config = SimpleNamespace(
        monthly_enabled=True,
        provider_token_enc_key=Fernet.generate_key().decode(),
        openai_import_enabled=True,
        anthropic_import_enabled=True,
        stripe_import_enabled=False,
    )
    ctx = SimpleNamespace(tenant_id=TENANT, user_id=USER, role="owner")
    app = FastAPI()
    app.include_router(
        build_monthly_router(
            config, lambda: (ctx, repo), lambda *args: {"entitled": True}
        )
    )
    return TestClient(app), repo, ctx


def test_credentials_encrypted_never_echoed_and_disconnect(connected_app):
    c, repo, ctx = connected_app
    secret = "synthetic-admin-credential-for-isolated-test"
    result = c.post(
        "/monthly/connections/openai",
        json={"credential": secret, "label": "Test organization"},
    )
    assert result.status_code == 200 and secret not in result.text
    stored = repo.monthly.list("connections", TENANT)[0]
    assert stored["encrypted_credential"] != secret and secret not in str(stored)
    response = c.get("/monthly/connections")
    assert "encrypted_credential" not in response.text and secret not in response.text
    ctx.role = "member"
    assert c.delete("/monthly/connections/openai").status_code == 403
    assert (
        c.post(
            "/monthly/connections/openai",
            json={"credential": secret, "label": "Replacement"},
        ).status_code
        == 403
    )
    ctx.role = "owner"
    assert c.delete("/monthly/connections/openai").status_code == 200
    assert repo.monthly.list("connections", TENANT) == []


def test_import_resume_duplicate_request_and_conflict(connected_app, monkeypatch):
    c, _repo, _ = connected_app
    secret = "synthetic-admin-credential-for-isolated-test"
    c.post("/monthly/connections/openai", json={"credential": secret, "label": "Test"})
    calls = []

    def page(provider, credential, month, cursor, source_id):
        assert credential == secret
        calls.append(cursor)
        if cursor.get("phase") == "usage":
            return "usage", [], {"phase": "done"}
        return (
            "costs",
            [
                {
                    "cost_id": "provider-row",
                    "date": "2026-08-01",
                    "amount": "12.25",
                    "currency": "USD",
                    "category": "inference",
                    "source": "synthetic provider",
                }
            ],
            {"phase": "usage"},
        )

    monkeypatch.setattr("app.monthly.router.provider_page", page)
    request = {"month": "2026-08", "request_id": str(uuid4())}
    first = c.post("/monthly/imports/openai", json=request).json()
    assert c.post("/monthly/imports/openai", json=request).json()["id"] == first["id"]
    c.post(
        "/monthly/connections/anthropic", json={"credential": secret, "label": "Test"}
    )
    assert c.post("/monthly/imports/anthropic", json=request).status_code == 409
    assert (
        c.get(f"/monthly/imports/{first['id']}/evidence").json().get("evidence") is None
    )
    a = c.post(f"/monthly/imports/{first['id']}/advance").json()
    assert a["state"] == "pending" and a["counts"]["costs"] == 1
    b = c.post(f"/monthly/imports/{first['id']}/advance").json()
    assert b["state"] == "complete"
    assert c.post(f"/monthly/imports/{first['id']}/advance").json()["step"] == 2
    assert len(calls) == 2
    evidence = c.get(f"/monthly/imports/{first['id']}/evidence").json()
    assert (
        len(evidence["evidence"]["costs"]) == 1
        and evidence["evidence"]["costs"][0]["amount"] == "12.25"
    )
    assert (
        c.get("/monthly/connections").json()["connections"][0]["status"] == "connected"
    )
    listed = c.get("/monthly/imports").json()["imports"][0]
    assert "evidence" not in listed and listed["counts"]["costs"] == 1


def test_provider_error_redaction_and_cursor_retention(connected_app, monkeypatch):
    c, repo, _ = connected_app
    secret = "synthetic-admin-credential-for-isolated-test"
    c.post("/monthly/connections/openai", json={"credential": secret, "label": "Test"})

    def failure(*args):
        raise RuntimeError("private provider payload " + secret)

    monkeypatch.setattr("app.monthly.router.provider_page", failure)
    row = c.post(
        "/monthly/imports/openai", json={"month": "2026-08", "request_id": str(uuid4())}
    ).json()
    response = c.post(f"/monthly/imports/{row['id']}/advance")
    assert response.json()["state"] == "failed" and secret not in response.text
    saved = repo.monthly.get("imports", TENANT, row["id"])
    assert secret not in str(saved) and saved["cursor"] == {}


def test_concurrent_import_progress_uses_compare_and_set(connected_app):
    _, repo, _ = connected_app
    row = repo.monthly.create_import(
        TENANT, "openai", "2026-08", str(uuid4()), "synthetic-source"
    )
    assert repo.monthly.step_import(TENANT, row["id"], 0, {"cursor": {"page": "one"}})
    assert not repo.monthly.step_import(
        TENANT, row["id"], 0, {"cursor": {"page": "stale"}}
    )
    assert repo.monthly.get("imports", TENANT, row["id"])["cursor"] == {"page": "one"}


def test_replacing_credential_cannot_mix_sources_in_a_paused_import(
    connected_app, monkeypatch
):
    c, repo, _ = connected_app
    c.post(
        "/monthly/connections/openai",
        json={"credential": "synthetic-admin-original-credential", "label": "Original"},
    )
    calls = []

    def page(*args):
        calls.append(True)
        return "costs", [{"cost_id": "one", "amount": "10"}], {"phase": "usage"}

    monkeypatch.setattr("app.monthly.router.provider_page", page)
    request = {"month": "2026-08", "request_id": str(uuid4())}
    job = c.post("/monthly/imports/openai", json=request).json()
    assert c.post(f"/monthly/imports/{job['id']}/advance").json()["state"] == "pending"
    c.post(
        "/monthly/connections/openai",
        json={"credential": "synthetic-admin-replaced-credential", "label": "Replaced"},
    )
    response = c.post(f"/monthly/imports/{job['id']}/advance").json()
    assert response["state"] == "failed" and "changed" in response["error"]
    assert len(calls) == 1
    assert repo.monthly.get("imports", TENANT, job["id"])["evidence"]["costs"] == [
        {"cost_id": "one", "amount": "10"}
    ]
    assert c.post("/monthly/imports/openai", json=request).status_code == 409
