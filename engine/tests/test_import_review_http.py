"""HTTP contract tests with an explicit in-memory adapter; real SQL is tested separately."""

import base64
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.import_review import router as routes
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.testclient import TestClient

from tests.test_import_review import RAW, rules


class MemoryStore:
    def __init__(self):
        self.sources, self.revisions, self.confirmations, self.recipes = {}, {}, {}, []

    def source(self, identity):
        if str(identity) not in self.sources:
            raise HTTPException(404, "Source unavailable")
        return self.sources[str(identity)]

    def revision(self, source, revision=None):
        return self.revisions[(source["id"], revision or source["revision"])]

    def confirmation(self, identity):
        if str(identity) not in self.confirmations:
            raise HTTPException(404)
        return self.confirmations[str(identity)]

    def list(self, table, month=None):
        return (
            self.recipes
            if table == "recipes"
            else [
                {k: v for k, v in s.items() if k != "original"}
                for s in self.sources.values()
                if s["month"] == month
            ]
        )

    def write(self, operation, identity=None, expected=0, data=None):
        if operation == "create":
            for source in self.sources.values():
                if all(
                    source[k] == data[k] for k in ("month", "kind", "account", "sha256")
                ):
                    return source
            source = {
                k: data[k] for k in ("month", "kind", "account", "sha256", "filename")
            }
            source.update(
                id=str(uuid4()),
                revision=1,
                original=base64.b64decode(data["original"]),
                expires_at=(datetime.now(UTC) + timedelta(days=90)).isoformat(),
            )
            self.sources[source["id"]] = source
        else:
            source = self.source(identity)
            if source["revision"] != expected:
                raise HTTPException(409)
        if operation in ("create", "revise"):
            if operation == "revise":
                source["revision"] += 1
            self.revisions[(source["id"], source["revision"])] = deepcopy(
                {k: data[k] for k in ("rules", "decisions", "profile")}
            )
            return source
        if operation == "confirm":
            p = self.revision(source)["profile"]
            if not p["ready"] or p["canonical_hash"] != data["canonical_hash"]:
                raise HTTPException(409)
            value = {
                "id": str(uuid4()),
                "source_id": source["id"],
                "revision": expected,
                "canonical_hash": p["canonical_hash"],
                "source_hash": source["sha256"],
                "rules_hash": data["rules_hash"],
                "created_at": datetime.now(UTC).isoformat(),
            }
            self.confirmations[value["id"]] = value
            return value
        if operation == "recipe":
            r = {
                "id": str(uuid4()),
                "rules": self.revision(source)["rules"],
                "name": data["name"],
            }
            self.recipes.append(r)
            return r
        raise AssertionError(operation)


@pytest.fixture
def client(monkeypatch):
    store = MemoryStore()
    monkeypatch.setattr(routes, "ImportStore", lambda *_: store)
    monkeypatch.setattr(routes, "quota", lambda *_: None)
    triple = (
        SimpleNamespace(tenant_id="tenant", user_id="actor"),
        SimpleNamespace(db=object()),
        None,
    )
    router = APIRouter(prefix="/monthly")
    routes.register(
        router, lambda: triple, lambda _: None, lambda *_: {}, lambda r, _: r
    )
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as c:
        yield c


def test_http_create_revise_confirm_export_and_resume(client):
    payload = {
        "month": "2026-08",
        "kind": "costs_csv",
        "account": "synthetic",
        "filename": "costs.csv",
        "original_base64": base64.b64encode(RAW).decode(),
        "rules": rules().model_dump(),
    }
    response = client.post("/monthly/import-reviews", json=payload)
    assert response.status_code == 200
    review = response.json()
    identity = review["source"]["id"]
    assert "original" not in review["source"]
    assert "rows" not in review["profile"]
    assert (
        base64.b64decode(
            client.get(f"/monthly/import-reviews/{identity}/original").json()[
                "original_base64"
            ]
        )
        == RAW
    )
    assert (
        client.post("/monthly/import-reviews", json=payload).json()["source"]["id"]
        == identity
    )
    assert (
        len(
            client.get(f"/monthly/import-reviews/{identity}/rows?cursor=0").json()[
                "rows"
            ]
        )
        == 2
    )
    changed = client.put(
        f"/monthly/import-reviews/{identity}/revision",
        json={"expected_revision": 1, "rules": rules().model_dump(), "decisions": []},
    )
    assert changed.status_code == 200
    assert (
        client.put(
            f"/monthly/import-reviews/{identity}/revision",
            json={
                "expected_revision": 1,
                "rules": rules().model_dump(),
                "decisions": [],
            },
        ).status_code
        == 409
    )
    confirmation = client.post(
        f"/monthly/import-reviews/{identity}/confirm",
        json={
            "expected_revision": 2,
            "canonical_hash": review["profile"]["canonical_hash"],
            "accepted_limitations": True,
        },
    )
    assert confirmation.status_code == 200
    cid = confirmation.json()["id"]
    exported = client.get(
        f"/monthly/import-reviews/{identity}/export?confirmation_id={cid}"
    ).json()
    assert "1234.50" in exported["canonical_csv"]
    assert exported["manifest"]["basis"] == "customer_supplied_reviewed"
    assert (
        client.get(f"/monthly/import-reviews/{identity}").json()["source"]["revision"]
        == 2
    )
    assert client.get("/monthly/import-reviews?month=2026-07").json()["sources"] == []
    assert client.get(f"/monthly/import-reviews/{uuid4()}").status_code == 404


def test_invalid_bytes_and_missing_confirmation_fail_safely(client):
    payload = {
        "month": "2026-08",
        "kind": "costs_csv",
        "account": "synthetic",
        "filename": "costs.csv",
        "original_base64": "%%%",
    }
    assert client.post("/monthly/import-reviews", json=payload).status_code == 422
    payload["original_base64"] = base64.b64encode(RAW).decode()
    payload["rules"] = rules().model_dump()
    identity = client.post("/monthly/import-reviews", json=payload).json()["source"][
        "id"
    ]
    assert client.get(f"/monthly/import-reviews/{identity}/export").status_code == 422
    assert (
        client.get(f"/monthly/import-reviews/{identity}/rows?cursor=-1").status_code
        == 422
    )


def test_group_decisions_require_reviewed_count_and_retain_every_row(client):
    bad = RAW.replace(b'"1,234.50"', b"unknown")
    payload = {
        "month": "2026-08",
        "kind": "costs_csv",
        "account": "synthetic",
        "filename": "costs.csv",
        "original_base64": base64.b64encode(bad).decode(),
        "rules": rules().model_dump(),
    }
    original = client.post("/monthly/import-reviews", json=payload).json()
    identity = original["source"]["id"]
    bulk = {
        "issue": "invalid:amount",
        "expected_count": 2,
        "action": "exclude",
        "reason": "Awaiting corrected source amounts",
    }
    request = {
        "expected_revision": 1,
        "rules": rules().model_dump(),
        "decisions": [],
        "bulk": [bulk],
    }
    assert (
        client.put(
            f"/monthly/import-reviews/{identity}/revision", json=request
        ).status_code
        == 409
    )
    bulk["expected_count"] = 1
    revised = client.put(f"/monthly/import-reviews/{identity}/revision", json=request)
    assert revised.status_code == 200
    assert revised.json()["profile"]["counts"] == {"excluded": 1, "included": 1}
    assert revised.json()["profile"]["unknown_source_amount_rows"] == 1
