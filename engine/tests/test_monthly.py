from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.monthly.contract import MonthlyInput, Workload
from app.monthly.economics import calculate_month, compare
from app.monthly.providers import merge_page, parse_page, provider_page, stripe_page
from app.v2.local_validation import TENANT, LocalRepository, create_validation_app
from tests.test_v2_economics import audit, csv_text, revenue

WORKLOAD = "55555555-5555-4555-8555-555555555555"
OTHER = "66666666-6666-4666-8666-666666666666"
HEADERS = {"X-Tenant-Id": TENANT}


def definition(kind="internal"):
    return Workload(
        name="Resolution assistant",
        kind=kind,
        outcome_unit="accepted resolution",
        cost_scope="Inference and human review including failed runs",
        acceptance_definition="Operator verifies resolved case",
        mappings={"openai": ["project-1"]},
    ).model_dump() | {"id": WORKLOAD}


def body(month="2026-08", cost="11", accepted="1", kind="internal"):
    a = audit(
        kind=kind,
        cost_scope_complete=True,
        outcome_cohort_complete=True,
        outcomes_csv=csv_text(
            "run_id,status,accepted_quantity,baseline_minutes,after_minutes,loaded_hourly_rate",
            [["r1", "accepted", accepted, 10, 5, 60], ["r2", "failed", 0, 0, 3, 60]],
        ),
    ).model_dump(mode="json")
    a["usage_csv"] = a["usage_csv"].replace(
        "u2,2026-08-02,test,large,200,40,1,c2,search,r2,9",
        f"u2,2026-08-02,test,large,200,40,1,c2,search,r2,{Decimal(cost) - 2}",
    )
    if kind == "product":
        a.update(revenue([["rev1", "2026-08-02", 50, "USD", "c1", "chat", "direct"]]))
    for key in ("usage_csv", "revenue_csv"):
        a[key] = a[key].replace("2026-08", month)
    from calendar import monthrange

    year, m = map(int, month.split("-"))
    a.update(
        period_start=month + "-01",
        period_end=f"{month}-{monthrange(year, m)[1]}",
        cost_basis="events",
    )
    return MonthlyInput.model_validate(
        {
            "month": month,
            "company_scope_complete": True,
            "workloads": [
                {
                    "workload_id": WORKLOAD,
                    "audit": a,
                    "review": {
                        "source_note": "Reviewed export for this month",
                        "method_reviewed": True,
                        "outcome_method_reviewed": True,
                        "control_cost": cost,
                        "control_source": "Separate monthly supplier control",
                        "expected_runs": 2,
                        "revenue_scope_complete": True,
                        "control_revenue": 50,
                        "revenue_control_source": "Revenue ledger",
                    },
                }
            ],
        }
    )


def calc(b):
    return calculate_month(b, {WORKLOAD: definition(b.workloads[0].audit.kind)})


def test_internal_denominator_includes_failed_costs_and_confidence():
    r = calc(body())
    w = r["workloads"][0]
    assert r["summary"]["known_cost"] == "11"
    assert w["outcomes"]["cost_per_accepted_outcome"] == "11"
    assert w["outcomes"]["acceptance_rate"] == "50.0"
    assert Decimal(w["outcomes"]["modeled_hours"]) == Decimal(2) / 60
    assert w["outcomes"]["modeled_capacity_value"] == "2"
    assert w["confidence"]["cost"]["score"] == 100
    assert w["confidence"]["outcomes"]["score"] == 100
    assert w["confidence"]["revenue"]["score"] is None
    assert w["summary"]["revenue"] is None


def test_product_economics_and_separate_source_confidence():
    r = calc(body(kind="product"))["workloads"][0]
    assert r["summary"]["contribution"] == "39"
    assert r["confidence"]["revenue"]["score"] == 100
    assert r["summary"]["basis"] == "Customer supplied"
    assert "causal attribution" in r["confidence"]["cost"]["meaning"]


def test_unmapped_refunds_cannot_net_away_missing_associations():
    b = body(kind="product")
    b.workloads[
        0
    ].audit.revenue_csv += "credit,2026-08-04,-10,USD,unknown,,direct\nextra,2026-08-04,10,USD,unknown,,direct\n"
    r = calc(b)["workloads"][0]
    assert r["confidence"]["revenue"]["checks"][2]["status"] == "fail"


def test_missing_controls_earn_no_points_and_no_invented_certainty():
    b = body()
    b.workloads[0].review.control_cost = None
    r = calc(b)["workloads"][0]
    assert r["confidence"]["cost"]["score"] == 80
    assert r["confidence"]["cost"]["checks"][3]["status"] == "unknown"


def test_control_mismatch_and_exact_decimal_tolerance():
    b = body()
    b.workloads[0].review.control_cost = Decimal("11.01")
    assert calc(b)["workloads"][0]["confidence"]["cost"]["score"] == 100
    b.workloads[0].review.control_cost = Decimal("11.02")
    assert calc(b)["workloads"][0]["confidence"]["cost"]["score"] == 80


def test_aggregate_costs_do_not_invent_usage():
    b = body()
    a = b.workloads[0].audit
    a.cost_basis = "provider_totals"
    a.usage_csv = ""
    a.outcomes_csv = ""
    a.costs_csv = "cost_id,date,category,amount,currency,source\np1,2026-08-01,inference,250.23,USD,Provider cost API\ns1,2026-08-01,subscription,30,USD,Subscription invoice\ncredit,2026-08-02,inference,-10,USD,Supplier credit"
    r = calc(b)
    assert r["summary"]["known_cost"] == "270.23"
    assert r["cost_components"]["inference"] == "240.23"
    assert r["workloads"][0]["outcomes"]["cost_per_accepted_outcome"] is None


def test_aggregate_and_event_costs_rejected():
    b = body().model_dump(mode="json")
    b["workloads"][0]["audit"]["cost_basis"] = "provider_totals"
    with pytest.raises(ValidationError):
        MonthlyInput.model_validate(b)


def test_duplicate_economic_records_across_workloads_rejected():
    b = body()
    item = b.workloads[0].model_copy(deep=True)
    item.workload_id = OTHER
    b.workloads.append(item)
    with pytest.raises(HTTPException, match="multiple inputs"):
        calculate_month(
            b, {WORKLOAD: definition(), OTHER: definition() | {"id": OTHER}}
        )


def test_missing_unit_withholds_unit_metrics():
    w = definition()
    w["outcome_unit"] = ""
    r = calculate_month(body(), {WORKLOAD: w})["workloads"][0]
    assert r["outcomes"]["cost_per_accepted_outcome"] is None
    assert r["outcomes"]["acceptance_rate"] is None


def test_comparison_separates_spend_volume_and_unit_efficiency():
    old = calc(body("2026-07", cost="20", accepted="2"))
    new = calc(body("2026-08", cost="30", accepted="6"))
    r = compare(new, old, today=date(2026, 9, 10))
    assert r["eligible"]
    assert r["spend"]["percent"] == "50.0"
    assert r["workloads"][0]["unit_cost"]["percent"] == "-50.0"
    assert r["workloads"][0]["volume_adjusted_cost_difference"] == "30"
    assert "not verified cash savings" in r["workloads"][0]["basis"]


@pytest.mark.parametrize("reason", ["gap", "scope", "current", "missing", "unknown"])
def test_comparison_ineligible_cases(reason):
    old = calc(body("2026-07"))
    new = calc(body())
    today = date(2026, 9, 10)
    if reason == "gap":
        old["month"] = "2026-06"
    if reason == "scope":
        old["comparison_signature"] = "different"
    if reason == "current":
        today = date(2026, 8, 15)
    if reason == "missing":
        old = None
    if reason == "unknown":
        new["summary"]["cost_complete"] = False
    r = compare(new, old, today=today)
    assert not r["eligible"] and r["reasons"] and r["spend"]["amount"] is None


def test_zero_baseline_safe():
    old = calc(body("2026-07"))
    new = calc(body())
    old["summary"]["known_cost"] = "0"
    assert compare(new, old, today=date(2026, 9, 10))["spend"]["percent"] is None


def test_provider_schema_costs_and_usage_are_separate():
    data = {
        "data": [
            {
                "start_time": 1785542400,
                "results": [
                    {
                        "project_id": "project-1",
                        "line_item": "tokens",
                        "amount": {"value": 12.25, "currency": "usd"},
                    }
                ],
            }
        ],
        "has_more": False,
    }
    rows, page = parse_page("openai", "costs", data, "connection", "2026-08")
    assert (
        rows[0]["amount"] == "12.25"
        and rows[0]["category"] == "inference"
        and page is None
    )
    assert "input_tokens" not in rows[0]
    assert rows == parse_page("openai", "costs", data, "connection", "2026-08")[0]


def test_anthropic_cents_conversion_and_null_workspace():
    data = {
        "data": [
            {
                "starting_at": "2026-08-01T00:00:00Z",
                "results": [
                    {
                        "workspace_id": None,
                        "description": "input tokens",
                        "amount": "1234.5",
                        "currency": "USD",
                    }
                ],
            }
        ],
        "has_more": False,
    }
    rows, _ = parse_page("anthropic", "costs", data, "connection", "2026-08")
    assert rows[0]["amount"] == "12.345" and rows[0]["project_id"] == "default"


@pytest.mark.parametrize(
    "data", [{}, {"data": [], "has_more": True}, {"data": [], "has_more": "false"}]
)
def test_malformed_provider_response_never_completes(data):
    with pytest.raises((TypeError, ValueError)):
        parse_page("openai", "costs", data, "connection", "2026-08")


def test_paginated_import_request_and_phase_transition():
    calls = []

    def fetch(url, headers, params):
        calls.append((url, params))
        return {"data": [], "has_more": False}

    phase, _rows, cursor = provider_page(
        "openai", "synthetic-admin-token", "2026-08", {}, "c", fetch
    )
    assert phase == "costs" and cursor == {"phase": "usage"}
    assert calls[0][0] == "https://api.openai.com/v1/organization/costs"
    assert calls[0][1]["end_time"] == int(datetime(2026, 9, 1, tzinfo=UTC).timestamp())


def test_stripe_import_uses_payment_period_excludes_non_usd():
    def fetch(url, headers, params):
        assert "created" not in params
        return {
            "data": [
                {
                    "id": "old-invoice",
                    "currency": "usd",
                    "amount_paid": 5000,
                    "customer": "c1",
                    "status_transitions": {"paid_at": 1785630000},
                }
            ],
            "has_more": False,
        }

    _, rows, cursor = stripe_page("test", "2026-08", {}, "c", fetch)
    assert rows[0]["amount"] == "50" and cursor["phase"] == "done"


def test_duplicate_import_pages_rejected():
    e = {"costs": [{"cost_id": "same"}], "usage": [], "revenue": []}
    with pytest.raises(ValueError):
        merge_page(e, "costs", [{"cost_id": "same"}])


@pytest.fixture
def api_setup(tmp_path):
    path = tmp_path / "monthly.sqlite"
    return TestClient(create_validation_app(path)), LocalRepository(path)


def save_with_api(c, month="2026-08"):
    d = definition()
    d.pop("id")
    assert (
        c.post(f"/v2/monthly/workloads/{WORKLOAD}", headers=HEADERS, json=d).status_code
        == 200
    )
    response = c.post(
        "/v2/monthly/reports", headers=HEADERS, json=body(month).model_dump(mode="json")
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_monthly_api_persistence_selection_idempotency_and_tenant_denial(api_setup):
    c, repo = api_setup
    r = save_with_api(c)
    assert "payload" not in r
    assert save_with_api(c)["id"] == r["id"]
    selection = {"report_id": r["id"], "reason": "Reviewed evidence"}
    assert (
        c.post("/v2/monthly/selection", headers=HEADERS, json=selection).status_code
        == 200
    )
    assert (
        c.post("/v2/monthly/selection", headers=HEADERS, json=selection).status_code
        == 200
    )
    assert len(repo.monthly.list("events", TENANT)) == 1
    assert len(c.get("/v2/monthly/performance", headers=HEADERS).json()["months"]) == 1
    for path in (
        "reports",
        "workloads",
        "performance",
        f"reports/{r['id']}",
        f"reports/{r['id']}/evidence",
    ):
        assert (
            c.get("/v2/monthly/" + path, headers={"X-Tenant-Id": OTHER}).status_code
            == 403
        )
    assert repo.monthly.get("reports", OTHER, r["id"]) is None


def test_selection_replacement_requires_current_version(api_setup):
    c, _repo = api_setup
    r = save_with_api(c)
    assert (
        c.post(
            "/v2/monthly/selection",
            headers=HEADERS,
            json={"report_id": r["id"], "reason": "Reviewed"},
        ).status_code
        == 200
    )
    b = body()
    b.workloads[0].review.source_note = "Restated cost support"
    new = c.post(
        "/v2/monthly/reports", headers=HEADERS, json=b.model_dump(mode="json")
    ).json()
    assert new["id"] != r["id"]
    assert (
        c.post(
            "/v2/monthly/selection",
            headers=HEADERS,
            json={"report_id": new["id"], "reason": "Correction"},
        ).status_code
        == 409
    )
    assert (
        c.post(
            "/v2/monthly/selection",
            headers=HEADERS,
            json={
                "report_id": new["id"],
                "expected_report_id": r["id"],
                "reason": "Correction",
            },
        ).status_code
        == 200
    )
    assert c.get(f"/v2/monthly/reports/{r['id']}", headers=HEADERS).json() == r


def test_cancel_blocks_new_calculation_but_preserves_history(api_setup):
    c, repo = api_setup
    r = save_with_api(c)
    repo.set_paid(TENANT, False)
    assert (
        c.post(
            "/v2/monthly/reports", headers=HEADERS, json=body().model_dump(mode="json")
        ).status_code
        == 402
    )
    assert c.get(f"/v2/monthly/reports/{r['id']}", headers=HEADERS).status_code == 200


def test_expired_evidence_report_retained(api_setup):
    c, repo = api_setup
    r = save_with_api(c)
    row = repo.monthly.get("reports", TENANT, r["id"])
    row["evidence_expires_at"] = "2020-01-01T00:00:00+00:00"
    with repo.connection() as db:
        repo.monthly._put(db, "reports", TENANT, row)
    assert (
        c.get(f"/v2/monthly/reports/{r['id']}/evidence", headers=HEADERS).status_code
        == 410
    )
    assert c.get(f"/v2/monthly/reports/{r['id']}", headers=HEADERS).status_code == 200


def test_secret_validation_does_not_echo_input(api_setup):
    c, _ = api_setup
    r = c.post(
        "/v2/monthly/connections/openai",
        headers=HEADERS,
        json={"credential": "short-secret", "label": ""},
    )
    assert r.status_code == 422 and "short-secret" not in r.text


def test_connector_flags_fail_closed(api_setup):
    c, _ = api_setup
    statuses = c.get("/v2/monthly/connections", headers=HEADERS).json()["connections"]
    assert all(not x["available"] for x in statuses)
    assert (
        c.post(
            "/v2/monthly/imports/openai",
            headers=HEADERS,
            json={"month": "2026-08", "request_id": str(uuid4())},
        ).status_code
        == 503
    )


def test_mapping_collision_between_workloads(api_setup):
    c, _ = api_setup
    save_with_api(c)
    d = definition()
    d.pop("id")
    d["name"] = "Another workload"
    assert (
        c.post(f"/v2/monthly/workloads/{OTHER}", headers=HEADERS, json=d).status_code
        == 409
    )


def test_provider_total_and_event_overlap_across_workloads_rejected():
    b = body()
    b.workloads[0].audit.usage_csv = b.workloads[0].audit.usage_csv.replace(
        ",test,", ",openai,"
    )
    item = b.workloads[0].model_copy(deep=True)
    item.workload_id = OTHER
    item.audit.cost_basis = "provider_totals"
    item.audit.usage_csv = ""
    item.audit.outcomes_csv = ""
    item.audit.costs_csv = "cost_id,date,category,amount,currency,source\nopenai:aggregate,2026-08-01,inference,11,USD,Provider"
    b.workloads.append(item)
    with pytest.raises(HTTPException, match="same provider"):
        calculate_month(
            b, {WORKLOAD: definition(), OTHER: definition() | {"id": OTHER}}
        )


def test_provider_provenance_requires_retained_matching_evidence():
    b = body()
    item = b.workloads[0]
    item.audit.cost_basis = "provider_totals"
    item.audit.usage_csv = item.audit.outcomes_csv = ""
    item.audit.costs_csv = "cost_id,date,category,amount,currency,source\nopenai:one,2026-08-01,inference,11,USD,openai cost API"
    assert calc(b)["workloads"][0]["trace"][0]["basis"] == "Customer supplied"
    identity = uuid4()
    item.import_ids = [identity]
    imported = {
        str(identity): {
            "state": "complete",
            "month": "2026-08",
            "evidence": {
                "costs": [
                    {
                        "cost_id": "openai:one",
                        "date": "2026-08-01",
                        "source": "openai cost API",
                        "amount": "11",
                    }
                ]
            },
        }
    }
    result = calculate_month(b, {WORKLOAD: definition()}, imported)
    assert result["workloads"][0]["trace"][0]["basis"] == "Provider reported"
    item.audit.costs_csv = item.audit.costs_csv.replace(",11,", ",12,")
    with pytest.raises(HTTPException, match="unassigned or differ"):
        calculate_month(b, {WORKLOAD: definition()}, imported)
    b.company_scope_complete = False
    assert (
        calculate_month(b, {WORKLOAD: definition()}, imported)["workloads"][0]["trace"][
            0
        ]["basis"]
        == "Customer supplied"
    )
    with pytest.raises(HTTPException, match="incomplete, expired"):
        calc(b)


def test_performance_and_history_exclude_heavy_source_evidence(api_setup):
    c, _ = api_setup
    r = save_with_api(c)
    c.post(
        "/v2/monthly/selection",
        headers=HEADERS,
        json={"report_id": r["id"], "reason": "Reviewed"},
    )
    assert (
        "result"
        not in c.get("/v2/monthly/reports", headers=HEADERS).json()["reports"][0]
    )
    compact = c.get("/v2/monthly/performance", headers=HEADERS).json()["months"][0][
        "report"
    ]["result"]["workloads"][0]
    assert "trace" not in compact and "groups" not in compact
    assert (
        "trace"
        in c.get(f"/v2/monthly/reports/{r['id']}", headers=HEADERS).json()["result"][
            "workloads"
        ][0]
    )


def test_adoption_retains_earlier_audit_and_rejects_partial_period(api_setup):
    c, repo = api_setup
    save_with_api(c)
    original = c.post(
        "/v2/audits",
        headers=HEADERS,
        json=audit(kind="internal").model_dump(mode="json"),
    ).json()
    before = repo.get(TENANT, original["id"])
    response = c.post(
        "/v2/monthly/adopt",
        headers=HEADERS,
        json={"audit_id": original["id"], "workload_id": WORKLOAD},
    )
    assert response.status_code == 200, response.text
    assert repo.get(TENANT, original["id"]) == before
    partial = audit(kind="internal").model_dump(mode="json")
    partial["period_end"] = "2026-08-20"
    old = c.post("/v2/audits", headers=HEADERS, json=partial).json()
    assert (
        c.post(
            "/v2/monthly/adopt",
            headers=HEADERS,
            json={"audit_id": old["id"], "workload_id": WORKLOAD},
        ).status_code
        == 422
    )


def test_retention_endpoint_requires_server_secret_and_release_flags(monkeypatch):
    from types import SimpleNamespace

    from fastapi import FastAPI

    from app.v2.router import build_router

    calls = []
    config = SimpleNamespace(
        maintenance_secret="synthetic-maintenance-secret-32-characters",
        audit_v2_enabled=True,
        audit_retention_approved=True,
        monthly_enabled=True,
    )
    repo = SimpleNamespace(db=None, cleanup=lambda: calls.append("audits"))
    monkeypatch.setattr(
        "app.monthly.repository.MonthlyRepository",
        lambda db: SimpleNamespace(cleanup=lambda: calls.append("monthly")),
    )
    app = FastAPI()
    app.include_router(
        build_router(config, lambda: None, lambda: None, lambda *a: None, lambda: repo)
    )
    c = TestClient(app)
    assert c.post("/v2/maintenance").status_code == 401
    assert (
        c.post(
            "/v2/maintenance", headers={"Authorization": "Bearer invalid"}
        ).status_code
        == 401
    )
    assert calls == []
    auth = {"Authorization": "Bearer " + config.maintenance_secret}
    assert c.post("/v2/maintenance", headers=auth).status_code == 200
    assert calls == ["audits", "monthly"]
    config.audit_retention_approved = False
    assert c.post("/v2/maintenance", headers=auth).status_code == 503
