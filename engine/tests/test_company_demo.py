"""The public company example is reproducible economics, never a fake account."""

import json
from decimal import Decimal

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.company_demo import (
    MONTHS, build_company_demo, calculate_demo_month, company_demo_json, identity, router,
    scenario_input, workload_definitions,
)
from app.monthly.contract import MonthlyInput
from app.monthly.preparation import resolve_allocations


@pytest.fixture(scope="module")
def demo():
    return build_company_demo()


def workload(report, name):
    return next(w for w in report["result"]["workloads"] if w["workload"]["name"] == name)


def test_six_calendar_months_reconcile_to_business_scenario(demo):
    reports = list(reversed(demo["reports"]))
    assert [r["month"] for r in reports] == list(MONTHS)
    assert [Decimal(r["result"]["summary"]["known_cost"]) for r in reports] == [
        22600, 24650, 27100, 30400, 35900, 43400,
    ]
    for report in reports:
        result = report["result"]
        total = Decimal(result["summary"]["known_cost"])
        assert 20000 <= total <= 50000
        assert sum(Decimal(w["summary"]["known_cost"]) for w in result["workloads"]) == total
        assert sum(Decimal(v) for v in result["cost_components"].values()) == total
        for w in result["workloads"]:
            for axis in w["groups"].values():
                assert sum(Decimal(g["known_cost"]) for g in axis) == Decimal(w["summary"]["known_cost"])


def test_growth_efficiency_and_margin_drag_are_calculated(demo):
    latest, first = demo["reports"][0], demo["reports"][-1]
    doc = workload(latest, "Document intelligence")
    assert Decimal(doc["summary"]["contribution"]) == -1200
    assert any(f["type"] == "Margin Drag" for f in doc["findings"])
    assert Decimal(doc["summary"]["margin_percent"]) < Decimal(workload(first, "Document intelligence")["summary"]["margin_percent"])
    for name in ("Research briefs", "Support resolution", "Finance document review"):
        new, old = workload(latest, name), workload(first, name)
        assert Decimal(new["outcomes"]["accepted_quantity"]) > Decimal(old["outcomes"]["accepted_quantity"])
        assert Decimal(new["outcomes"]["cost_per_accepted_outcome"]) < Decimal(old["outcomes"]["cost_per_accepted_outcome"])
    assert not demo["performance"][0]["comparison"]["eligible"]
    assert all(m["comparison"]["eligible"] for m in demo["performance"][1:])
    assert all("not verified cash savings" in w["basis"] for w in demo["performance"][-1]["comparison"]["workloads"])


def test_low_confidence_issues_and_unallocated_cost_stay_visible(demo):
    latest = demo["reports"][0]
    finance = workload(latest, "Finance document review")
    assert Decimal(finance["control_variance"]) == -220
    assert finance["confidence"]["cost"]["score"] == 80
    assert finance["confidence"]["cost"]["checks"][3]["status"] == "fail"
    assert finance["confidence"]["revenue"]["score"] is None
    shared = workload(latest, "Unallocated AI spend")
    assert Decimal(latest["result"]["summary"]["unallocated_cost"]) == 1900
    assert shared["confidence"]["cost"]["checks"][2]["status"] == "fail"
    assert shared["outcomes"]["cost_per_accepted_outcome"] is None


def test_bundled_invoice_children_reconcile_without_original_double_count(demo):
    body, sources = scenario_input(5)
    definitions = {w["id"]: w for w in workload_definitions()}
    snapshots, children = resolve_allocations(body.invoice_allocations, sources, definitions, body.month)
    snapshot = snapshots[0]
    assert Decimal(snapshot["original_amount"]) == 64000
    assert Decimal(snapshot["allocated_amount"]) + Decimal(snapshot["remainder"]) == Decimal(snapshot["original_amount"])
    assert snapshot["basis"] == "Modeled allocation"
    assert len(children) == 2
    product_rows = [w for w in demo["reports"][0]["result"]["workloads"] if w["kind"] == "product"]
    assert sum(Decimal(w["summary"]["revenue"]) for w in product_rows) == 64000
    assert all(w["summary"]["basis"] == "Modeled" for w in product_rows)
    assert all("allocated" in item.audit.revenue_csv for item in body.workloads if item.audit.kind == "product")
    bad = body.model_copy(deep=True)
    bad.invoice_allocations[0].allocations[0].amount = Decimal("65000")
    with pytest.raises(HTTPException, match="exceed"):
        resolve_allocations(bad.invoice_allocations, sources, definitions, bad.month)


def test_failed_batches_are_in_unit_cost_and_acceptance_denominators(demo):
    doc = workload(demo["reports"][0], "Document intelligence")
    outcomes = doc["outcomes"]
    assert outcomes["included_runs"] == outcomes["reviewed_runs"] == 50
    assert outcomes["cohort_complete"]
    assert Decimal(outcomes["accepted_quantity"]) == 9000
    assert Decimal(outcomes["acceptance_rate"]) == 80
    assert Decimal(outcomes["cost_per_accepted_outcome"]) * 9000 == pytest.approx(Decimal("19200"))
    assert "acceptance rate counts batches" in doc["workload"]["acceptance_definition"]


def test_demo_is_deterministic_bounded_and_never_claims_connection(demo):
    assert demo == build_company_demo()
    encoded = company_demo_json()
    assert len(encoded) < 3_800_000
    assert json.loads(encoded) == demo
    assert demo["synthetic"] and demo["read_only"]
    assert all(not c["available"] and c["status"] == "not_connected" for c in demo["connections"])
    for report in demo["reports"]:
        assert report["result"]["synthetic"]
        assert "Synthetic company and evidence" in report["result"]["limitations"][0]
        for allocation in report["result"]["invoice_allocations"]:
            assert allocation["synthetic"] and not allocation["source_verified"]
            assert "Synthetic" in allocation["source_basis"]
        for w in report["result"]["workloads"]:
            assert w["synthetic"]
            assert "Synthetic fixture" in w["evidence"]["source_review"]
            assert all("synthetic" in trace["source"].lower() for trace in w["trace"])
            assert all(not r["source_verified"] for r in w.get("revenue_evidence", []))
    assert "No provider is connected" in demo["company"]["notice"]


def test_public_demo_is_read_only_and_evidence_replays_identically(demo):
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.get("/demo/company", headers={"Authorization": "Bearer ignored-synthetic-demo"})
        assert response.status_code == 200
        assert response.headers["x-inffyn-data"] == "synthetic"
        assert response.json()["reports"][0]["fingerprint"] == demo["reports"][0]["fingerprint"]
        assert client.post("/demo/company", json={"name": "Other company"}).status_code == 405
        report_id = identity("2026-08-report")
        evidence = client.get(f"/demo/company/reports/{report_id}/evidence").json()
        body = MonthlyInput.model_validate(evidence["input"])
        result = calculate_demo_month(body, {w["id"]: w for w in evidence["workloads"]}, {s["id"]: s for s in evidence["sources"]})
        assert result == demo["reports"][0]["result"]
        assert client.get(f"/demo/company/reports/{identity('unknown')}/evidence").status_code == 404
