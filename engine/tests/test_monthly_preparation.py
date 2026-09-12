from copy import deepcopy
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from app.monthly.contract import MonthlyInput, Preparation
from app.monthly.economics import calculate_month
from app.monthly.preparation import (
    REVENUE_FIELDS,
    csv_text,
    invalidate_draft,
    prepare,
    resolve_allocations,
)
from app.v2.local_validation import LocalRepository, create_validation_app
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tests.test_monthly import HEADERS, OTHER, WORKLOAD, body, definition


def sources():
    iid, cid = str(uuid4()), str(uuid4())
    shared = {
        "state": "complete",
        "month": "2026-08",
        "evidence_expires_at": (datetime.now(UTC) + timedelta(days=20)).isoformat(),
    }
    return (
        iid,
        cid,
        {
            iid: {
                **shared,
                "provider": "stripe",
                "source_identity": "acct_test",
                "evidence": {
                    "costs": [],
                    "usage": [],
                    "revenue": [
                        {
                            "revenue_id": "in_bundle",
                            "date": "2026-08-02",
                            "amount": "60000.03",
                            "currency": "USD",
                            "customer_id": "c1",
                            "feature": "",
                            "method": "direct",
                        }
                    ],
                },
            },
            cid: {
                **shared,
                "provider": "openai",
                "source_identity": "test-generation",
                "evidence": {
                    "usage": [],
                    "revenue": [],
                    "costs": [
                        {
                            "cost_id": "openai:org:one",
                            "date": "2026-08-02",
                            "category": "inference",
                            "amount": "21000.01",
                            "currency": "USD",
                            "source": "OpenAI API",
                            "project_id": "project-1",
                        },
                        {
                            "cost_id": "openai:org:shared",
                            "date": "2026-08-02",
                            "category": "inference",
                            "amount": "1000.02",
                            "currency": "USD",
                            "source": "OpenAI API",
                            "project_id": "",
                        },
                    ],
                },
            },
        },
    )


def split_case():
    iid, cid, imports = sources()
    defs = {
        WORKLOAD: definition("product"),
        OTHER: {
            **definition("product"),
            "id": OTHER,
            "name": "Document intelligence",
            "mappings": {},
        },
    }
    allocations = [
        {
            "import_id": iid,
            "revenue_id": "in_bundle",
            "reviewed": True,
            "allocations": [
                {
                    "workload_id": WORKLOAD,
                    "amount": "30000.01",
                    "explanation": "Contract line A",
                },
                {
                    "workload_id": OTHER,
                    "amount": "20000.01",
                    "explanation": "Contract line B",
                },
            ],
        }
    ]
    p = Preparation(month="2026-08", import_ids=[iid], invoice_allocations=allocations)
    snapshots, children = resolve_allocations(
        p.invoice_allocations, imports, defs, p.month
    )
    b = body(kind="product").model_dump(mode="json")
    second = deepcopy(b["workloads"][0])
    second["workload_id"] = OTHER
    second["audit"]["usage_csv"] = (
        second["audit"]["usage_csv"]
        .replace("u1,", "other-u1,")
        .replace("u2,", "other-u2,")
    )
    b["workloads"].append(second)
    for w in b["workloads"]:
        w["audit"]["revenue_csv"] = csv_text(
            REVENUE_FIELDS,
            [
                c["row"]
                for c in children.values()
                if c["workload_id"] == w["workload_id"]
            ],
        )
        w["audit"]["revenue_source"] = "stripe_reviewed"
        w["audit"]["revenue_basis"] = "collections"
    b.update(import_ids=[iid], invoice_allocations=allocations)
    return MonthlyInput.model_validate(b), defs, imports, iid, cid, snapshots


def test_invoice_split_reconciles_exactly_and_preserves_distinct_provenance():
    b, defs, imports, _, _, _ = split_case()
    result = calculate_month(b, defs, imports)
    s = result["invoice_allocations"][0]
    assert Decimal(s["allocated_amount"]) + Decimal(s["remainder"]) == Decimal(
        "60000.03"
    )
    assert s["remainder"] == "10000.01"
    assert result["summary"]["unassigned_revenue"] == "10000.01"
    assert s["account_id"] == "acct_test" and s["source_verified"]
    assert s["basis"] == "Modeled allocation"
    assert result["workloads"][0]["summary"]["basis"] == "Modeled"
    assert result["workloads"][0]["revenue_evidence"][0]["source_verified"] is True


@pytest.mark.parametrize(
    "change,match",
    [
        ("overage", "exceed"),
        ("internal", "product workload"),
        ("unreviewed", "Review the invoice"),
        ("tamper", "differs"),
        ("original", "original invoice"),
        ("missing", "exactly once"),
        ("orphan", "lineage"),
        ("duplicate_import", "same Stripe invoice"),
        ("expired", "expired"),
        ("wrong_account", "account identity"),
    ],
)
def test_invoice_allocation_rejects_unsafe_sources_and_double_count(change, match):
    b, defs, imports, iid, _, _ = split_case()
    if change == "overage":
        b.invoice_allocations[0].allocations[0].amount = Decimal(60000)
    if change == "internal":
        defs[OTHER]["kind"] = "internal"
    if change == "unreviewed":
        b.invoice_allocations[0].reviewed = False
    if change == "tamper":
        b.workloads[0].audit.revenue_csv = b.workloads[0].audit.revenue_csv.replace(
            "30000.01", "30000.02"
        )
    if change == "original":
        b.workloads[
            0
        ].audit.revenue_csv += "in_bundle,2026-08-02,60000.03,USD,c1,,direct,Original\n"
    if change == "missing":
        b.workloads[1].audit.revenue_csv = ""
    if change == "orphan":
        b.invoice_allocations = []
    if change == "duplicate_import":
        other = uuid4()
        imports[str(other)] = deepcopy(imports[iid])
        b.import_ids.append(other)
    if change == "expired":
        imports[iid]["evidence_expires_at"] = "2020-01-01T00:00:00+00:00"
    if change == "wrong_account":
        imports[iid]["source_identity"] = ""
    with pytest.raises(HTTPException, match=match):
        calculate_month(b, defs, imports)


def test_stripe_label_requires_source_even_without_splits():
    b = body(kind="product")
    b.workloads[0].audit.revenue_source = "stripe_reviewed"
    with pytest.raises(HTTPException, match="matching retained"):
        calculate_month(b, {WORKLOAD: definition("product")})


def test_changed_allocation_explanation_changes_comparison_basis():
    b, defs, imports, _, _, _ = split_case()
    original = calculate_month(b, defs, imports)
    b.invoice_allocations[0].allocations[0].explanation = "Estimated consumption share"
    b.workloads[0].audit.revenue_csv = b.workloads[0].audit.revenue_csv.replace(
        "Contract line A", "Estimated consumption share"
    )
    newer = calculate_month(b, defs, imports)
    assert newer["comparison_signature"] != original["comparison_signature"]
    assert newer["fingerprint"] != original["fingerprint"]


def test_preparation_preserves_unallocated_costs_and_unassigned_collections():
    iid, cid, imports = sources()
    defs = {
        WORKLOAD: definition("product"),
        OTHER: {
            **definition(),
            "id": OTHER,
            "unallocated": True,
            "name": "Unallocated",
            "mappings": {},
        },
    }
    result = prepare(Preparation(month="2026-08", import_ids=[iid, cid]), defs, imports)
    assert result["unallocated_cost"] == "1000.02"
    assert result["unassigned_revenue"] == "60000.03"
    assert len(result["workloads"]) == 2
    assert all(w["audit"]["cost_scope_complete"] is False for w in result["workloads"])
    assert result["source_groups"][0]["amount"] in ("21000.01", "1000.02")


def test_prepare_does_not_invent_zero_cost_for_revenue_only_workload():
    b, defs, imports, iid, _, _ = split_case()
    result = prepare(
        Preparation(
            month="2026-08", import_ids=[iid], invoice_allocations=b.invoice_allocations
        ),
        defs,
        imports,
    )
    assert all(w["audit"]["costs_csv"] == "" for w in result["workloads"])
    assert all(w["audit"]["revenue_reviewed"] is False for w in result["workloads"])


@pytest.fixture
def draft_api(tmp_path):
    path = tmp_path / "draft.sqlite"
    client, repo = TestClient(create_validation_app(path)), LocalRepository(path)
    d = definition("product")
    d.pop("id")
    assert (
        client.post(
            f"/v2/monthly/workloads/{WORKLOAD}", headers=HEADERS, json=d
        ).status_code
        == 200
    )
    content = {
        "month": "2026-08",
        "workloads": body(kind="product").model_dump(mode="json")["workloads"],
    }
    content["workloads"][0]["audit"]["revenue_reviewed"] = False
    return client, repo, content


def test_draft_allows_incomplete_review_round_trip_and_stale_write_conflict(draft_api):
    c, _, content = draft_api
    path = "/v2/monthly/drafts/2026-08"
    assert c.get(path, headers=HEADERS).json() == {"draft": None}
    saved = c.put(
        path, headers=HEADERS, json={"expected_revision": 0, "content": content}
    )
    assert saved.status_code == 200, saved.text
    row = saved.json()["draft"]
    assert row["revision"] == 1
    assert row["content"]["workloads"][0]["audit"]["revenue_reviewed"] is False
    assert c.get(path, headers=HEADERS).json()["draft"]["content"] == row["content"]
    assert (
        c.put(
            path, headers=HEADERS, json={"expected_revision": 0, "content": content}
        ).status_code
        == 409
    )
    assert c.get(path, headers={"X-Tenant-Id": str(uuid4())}).status_code == 403
    assert c.get(path).status_code == 422  # loopback harness requires its tenant header


def test_evidence_edit_invalidates_review_and_does_not_extend_retention(draft_api):
    c, _, content = draft_api
    path = "/v2/monthly/drafts/2026-08"
    first = c.put(
        path, headers=HEADERS, json={"expected_revision": 0, "content": content}
    ).json()["draft"]
    content["workloads"][0]["audit"]["usage_csv"] += (
        "new,2026-08-04,test,large,0,0,1,c1,chat,r3,100\n"
    )
    changed = c.put(
        path, headers=HEADERS, json={"expected_revision": 1, "content": content}
    ).json()["draft"]
    assert changed["invalidations"] == [WORKLOAD]
    assert changed["content"]["workloads"][0]["review"]["method_reviewed"] is False
    assert changed["evidence_expires_at"] == first["evidence_expires_at"]
    assert changed["content"]["step"] == "reconcile"


def test_definition_edit_invalidates_resumed_draft(draft_api):
    c, _, content = draft_api
    path = "/v2/monthly/drafts/2026-08"
    c.put(path, headers=HEADERS, json={"expected_revision": 0, "content": content})
    d = definition("product")
    d.pop("id")
    d["cost_scope"] = "Expanded cost scope"
    c.post(f"/v2/monthly/workloads/{WORKLOAD}", headers=HEADERS, json=d)
    resumed = c.get(path, headers=HEADERS).json()["draft"]
    assert resumed["invalidations"] == [WORKLOAD]
    assert resumed["content"]["workloads"][0]["review"]["method_reviewed"] is False


def test_draft_rejects_credential_fields_other_workloads_and_expired_imports(draft_api):
    c, _, content = draft_api
    path = "/v2/monthly/drafts/2026-08"
    content["credential"] = "do-not-store-this"
    response = c.put(
        path, headers=HEADERS, json={"expected_revision": 0, "content": content}
    )
    assert response.status_code == 422 and "do-not-store-this" not in response.text
    content.pop("credential")
    content["workloads"][0]["workload_id"] = OTHER
    assert (
        c.put(
            path, headers=HEADERS, json={"expected_revision": 0, "content": content}
        ).status_code
        == 422
    )


def test_incomplete_invoice_editor_persists_without_relaxing_final_contract(draft_api):
    c, repo, content = draft_api
    iid, _, imported = sources()
    with repo.connection() as db:
        repo.monthly._put(
            db, "imports", HEADERS["X-Tenant-Id"], {**imported[iid], "id": iid}
        )
    content["invoice_allocations"] = [
        {
            "import_id": iid,
            "revenue_id": "in_bundle",
            "reviewed": False,
            "allocations": [{"workload_id": "", "amount": "", "explanation": ""}],
        }
    ]
    response = c.put(
        "/v2/monthly/drafts/2026-08",
        headers=HEADERS,
        json={"expected_revision": 0, "content": content},
    )
    assert response.status_code == 200, response.text
    assert (
        response.json()["draft"]["evidence_expires_at"]
        == imported[iid]["evidence_expires_at"]
    )
    assert (
        response.json()["draft"]["content"]["invoice_allocations"][0]["allocations"][0][
            "amount"
        ]
        == ""
    )
    response = c.post(
        "/v2/monthly/prepare",
        headers=HEADERS,
        json={
            "month": "2026-08",
            "import_ids": [iid],
            "invoice_allocations": content["invoice_allocations"],
        },
    )
    assert response.status_code == 422


def test_local_monthly_cleanup_removes_expired_drafts(draft_api):
    c, repo, content = draft_api
    c.put(
        "/v2/monthly/drafts/2026-08",
        headers=HEADERS,
        json={"expected_revision": 0, "content": content},
    )
    row = repo.monthly.draft(HEADERS["X-Tenant-Id"], "2026-08")
    row["evidence_expires_at"] = "2020-01-01T00:00:00+00:00"
    with repo.connection() as db:
        repo.monthly._put(db, "drafts", HEADERS["X-Tenant-Id"], row)
    repo.monthly.cleanup()
    with repo.connection() as db:
        assert (
            db.execute(
                "select count(*) from monthly_records where kind='drafts'"
            ).fetchone()[0]
            == 0
        )


@pytest.mark.parametrize(
    "change,preserves_invoice_review",
    [
        ("cost", True),
        ("outcomes", True),
        ("cost_assignment", True),
        ("allocation", False),
        ("revenue", False),
        ("definition", False),
        ("removed_workload", False),
    ],
)
def test_invoice_confirmation_invalidation_follows_its_actual_basis(
    change, preserves_invoice_review
):
    original, _, _, _, _, _ = split_case()
    old = original.model_dump(mode="json")
    content = deepcopy(old)
    if change == "cost":
        content["workloads"][0]["audit"]["usage_csv"] += (
            "new,2026-08-04,test,large,0,0,1,c1,chat,r3,100\n"
        )
    if change == "outcomes":
        content["workloads"][0]["audit"]["outcomes_csv"] += "r3,failed,0,0,0,0\n"
    if change == "cost_assignment":
        content["cost_assignments"] = [
            {"provider": "openai", "project_id": "project-1", "workload_id": WORKLOAD}
        ]
    if change == "allocation":
        content["invoice_allocations"][0]["allocations"][0]["explanation"] = (
            "Changed allocation basis"
        )
    if change == "revenue":
        content["workloads"][0]["audit"]["revenue_basis"] = "recognized"
    if change == "removed_workload":
        content["workloads"] = content["workloads"][1:]
    changed, _ = invalidate_draft(content, old, change == "definition")
    assert changed["invoice_allocations"][0]["reviewed"] is preserves_invoice_review
    assert changed["company_scope_complete"] is False
