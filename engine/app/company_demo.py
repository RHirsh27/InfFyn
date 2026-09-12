"""An isolated, deterministic business scenario calculated by the production engine.

The public routes read only these code-owned fixtures. They never load a tenant,
repository, credential, provider connection, or customer record. The source amounts
are invented scenario inputs, not claims about actual model prices or customers.
"""

import csv
import io
import json
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.monthly.contract import MonthlyInput, Workload
from app.monthly.economics import calculate_month, compare
from app.monthly.preparation import REVENUE_FIELDS, resolve_allocations

SCENARIO_VERSION = "northstar-1.0"
MONTHS = tuple(f"2026-{month:02}" for month in range(3, 9))
COMPANY = {
    "name": "Northstar Intelligence",
    "description": "A synthetic B2B intelligence company with customer products and internal AI workflows.",
    "industry": "Business intelligence software",
    "team_size": 85,
    "currency": "USD",
    "as_of": "2026-09-10",
    "period_label": "March–August 2026",
    "notice": "Synthetic company and evidence. Calculated by the real InfFyn engine. No provider is connected and no customer data is used.",
}

# These are economic assumptions for a coherent fictional business, expressed in
# dollars and accepted business units. Every displayed result is derived below.
SCENARIOS = (
    {
        "key": "research", "name": "Research briefs", "kind": "product",
        "purpose": "Deliver customer-ready market research briefs from analyst-reviewed delivery batches.",
        "team": "Product · Research", "unit": "accepted brief",
        "acceptance": "An analyst accepts a delivery batch only after every brief passes citation and completeness review. Accepted quantity counts briefs; acceptance rate counts batches.",
        "costs": (8000, 8700, 9200, 10200, 11100, 12200),
        "accepted": (960, 1260, 1620, 2040, 2520, 3080),
        "revenue": (30000, 33000, 36000, 39000, 42000, 46000),
        "runs": (30, 33, 36, 39, 42, 45), "failures": (3, 3, 3, 3, 3, 3),
        "inference_share": (80, 80, 80, 80, 80, 80),
    },
    {
        "key": "documents", "name": "Document intelligence", "kind": "product",
        "purpose": "Extract verified structured records from customer document batches.",
        "team": "Product · Documents", "unit": "accepted document",
        "acceptance": "A reviewer accepts a batch after extracted fields meet the completeness standard. Accepted quantity counts documents; acceptance rate counts batches.",
        "costs": (6800, 7700, 9000, 10500, 14000, 19200),
        "accepted": (4000, 4800, 5600, 6500, 7600, 9000),
        "revenue": (18000, 18000, 18000, 19000, 18000, 18000),
        "runs": (30, 34, 38, 42, 46, 50), "failures": (2, 3, 4, 5, 7, 10),
        "inference_share": (80, 78, 74, 70, 65, 60),
    },
    {
        "key": "support", "name": "Support resolution", "kind": "internal",
        "purpose": "Resolve repeatable customer support cases with human review of each delivery batch.",
        "team": "Customer Operations", "unit": "accepted resolution",
        "acceptance": "A support lead accepts a batch only after its resolutions are verified. Accepted quantity counts resolved cases; acceptance rate counts batches.",
        "costs": (4800, 5100, 5400, 5800, 6300, 6700),
        "accepted": (3000, 3600, 4200, 5200, 6000, 7200),
        "runs": (30, 33, 36, 39, 42, 45), "failures": (3, 3, 3, 3, 3, 3),
        "inference_share": (75, 75, 75, 75, 75, 75),
    },
    {
        "key": "finance", "name": "Finance document review", "kind": "internal",
        "purpose": "Prepare reconciled invoice records for finance-team approval.",
        "team": "Finance Operations", "unit": "accepted invoice record",
        "acceptance": "Finance approves each batch against its source documents. Accepted quantity counts reviewed invoice records; acceptance rate counts batches.",
        "costs": (2100, 2300, 2500, 2800, 3100, 3400),
        "accepted": (1800, 2200, 2600, 3000, 3400, 4000),
        "runs": (24, 27, 30, 33, 36, 39), "failures": (2, 2, 2, 2, 2, 2),
        "inference_share": (70, 70, 70, 70, 70, 70),
    },
)
UNALLOCATED_COSTS = (900, 850, 1000, 1100, 1400, 1900)
USAGE_FIELDS = (
    "event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,"
    "customer_segment,feature,workflow,team,run_id,billed_cost,cost_source"
).split(",")
COST_FIELDS = (
    "cost_id,date,category,amount,currency,source,customer_id,customer_segment,"
    "feature,workflow,team,run_id"
).split(",")
OUTCOME_FIELDS = (
    "run_id,status,accepted_quantity,baseline_minutes,after_minutes,loaded_hourly_rate"
).split(",")


def identity(key):
    return str(uuid5(NAMESPACE_URL, f"https://inffyn.example/synthetic/{SCENARIO_VERSION}/{key}"))


def csv_text(fields, records):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    return stream.getvalue()


def divide_integer(amount, count):
    """Allocate integral cents or business units with an exact final total."""
    quotient, remainder = divmod(amount, count)
    return [quotient + (i < remainder) for i in range(count)]


def money(cents):
    return format(Decimal(cents) / 100, ".2f")


def workload_definitions():
    result = []
    for scenario in SCENARIOS:
        result.append({
            **Workload(
                name=scenario["name"], kind=scenario["kind"],
                purpose=scenario["purpose"], responsible_team=scenario["team"],
                outcome_unit=scenario["unit"],
                cost_scope="AI inference and human review, including rejected and failed delivery batches. Corporate overhead is excluded.",
                acceptance_definition=scenario["acceptance"],
                mappings={
                    "openai": [f"demo-project-{scenario['key']}"],
                    "anthropic": [f"demo-workspace-{scenario['key']}"],
                },
            ).model_dump(),
            "id": identity(scenario["key"]),
        })
    result.append({
        **Workload(
            name="Unallocated AI spend", kind="internal", unallocated=True,
            purpose="Keep shared subscriptions and experiments visible until an owner confirms their business use.",
            responsible_team="Finance · Assignment pending",
            cost_scope="Shared AI subscriptions and sandbox expenses with no reviewed workload assignment.",
        ).model_dump(),
        "id": identity("unallocated"),
    })
    return result


def scenario_evidence(scenario, index):
    month = MONTHS[index]
    last_day = monthrange(2026, index + 3)[1]
    count, failed = scenario["runs"][index], scenario["failures"][index]
    accepted_count = count - failed
    quantities = divide_integer(scenario["accepted"][index], accepted_count)
    total_cents = scenario["costs"][index] * 100
    inference_cents = total_cents * scenario["inference_share"][index] // 100
    inference = divide_integer(inference_cents, count)
    review = divide_integer(total_cents - inference_cents, count)
    usage, costs, outcomes = [], [], []
    for run in range(count):
        run_id = f"demo-{month}-{scenario['key']}-batch-{run + 1:03}"
        day = f"{month}-{1 + run % last_day:02}"
        accepted = run < accepted_count
        quantity = quantities[run] if accepted else 0
        provider = "anthropic" if run % 3 == 0 else "openai"
        dimensions = {
            "customer_id": "demo-enterprise-portfolio" if scenario["kind"] == "product" else "",
            "customer_segment": "Enterprise portfolio" if scenario["kind"] == "product" else "",
            "feature": scenario["name"], "workflow": scenario["name"],
            "team": scenario["team"], "run_id": run_id,
        }
        usage.append({
            **dimensions, "event_id": run_id + "-inference", "date": day,
            "provider": provider, "model": f"synthetic-{provider}-model",
            "input_tokens": (quantity or 80) * 12000,
            "output_tokens": (quantity or 80) * 2200,
            "requests": (quantity or 80) * (3 if scenario["key"] == "documents" else 2),
            "billed_cost": money(inference[run]),
            "cost_source": "Synthetic usage export; invented billed amounts, not provider-verified prices",
        })
        costs.append({
            **dimensions, "cost_id": run_id + "-review", "date": day,
            "category": "human_review", "amount": money(review[run]), "currency": "USD",
            "source": "Synthetic review-time ledger with invented loaded costs",
        })
        outcomes.append({
            "run_id": run_id,
            "status": "accepted" if accepted else "failed" if run % 2 else "rejected",
            "accepted_quantity": quantity,
            # End-to-end elapsed labor estimates are modeled separately from the
            # incremental human-review expense included in the cost ledger.
            "baseline_minutes": quantity * 4 if scenario["kind"] == "internal" else "",
            "after_minutes": quantity * 2 + 30 if scenario["kind"] == "internal" else "",
            "loaded_hourly_rate": 55 if scenario["kind"] == "internal" else "",
        })
    cost = scenario["costs"][index]
    revenue = scenario.get("revenue", (None,) * 6)[index]
    return {
        "workload_id": identity(scenario["key"]),
        "audit": {
            "title": scenario["name"], "kind": scenario["kind"],
            "period_start": month + "-01", "period_end": f"{month}-{last_day}",
            "cost_basis": "events", "usage_csv": csv_text(USAGE_FIELDS, usage),
            "costs_csv": csv_text(COST_FIELDS, costs),
            "outcomes_csv": csv_text(OUTCOME_FIELDS, outcomes),
            "cost_scope_complete": True, "outcome_cohort_complete": True,
            "revenue_source": "stripe_reviewed" if revenue is not None else "none",
            "revenue_basis": "collections" if revenue is not None else "unavailable",
            "revenue_reviewed": revenue is not None,
        },
        "review": {
            "source_note": "Synthetic monthly usage, review ledger and final batch outcomes. Company-scale demonstration only; no live provider verification.",
            "method_reviewed": True, "outcome_method_reviewed": True,
            # August finance has a deliberate $220 missing-charge discrepancy.
            "control_cost": str(cost + (220 if scenario["key"] == "finance" and index == 5 else 0)),
            "control_source": "Synthetic independent supplier and review-cost control",
            "expected_runs": count, "revenue_scope_complete": revenue is not None,
            "control_revenue": str(revenue) if revenue is not None else None,
            "revenue_control_source": "Synthetic reviewed allocation of the bundled invoice" if revenue is not None else "",
        },
    }


def scenario_input(index):
    month = MONTHS[index]
    end = date(2026, index + 3, monthrange(2026, index + 3)[1])
    workloads = [scenario_evidence(s, index) for s in SCENARIOS]
    workloads.append({
        "workload_id": identity("unallocated"),
        "audit": {
            "title": "Unallocated AI spend", "kind": "internal",
            "period_start": month + "-01", "period_end": str(end),
            "cost_basis": "expenses", "usage_csv": "",
            "costs_csv": csv_text(COST_FIELDS, [{
                "cost_id": f"demo-{month}-unallocated", "date": str(end),
                "category": "subscription", "amount": str(UNALLOCATED_COSTS[index]),
                "currency": "USD", "source": "Synthetic shared AI subscription invoice",
            }]),
            "cost_scope_complete": True,
        },
        "review": {
            "source_note": "Synthetic shared subscription and sandbox costs awaiting a reviewed owner assignment.",
            "method_reviewed": True, "control_cost": str(UNALLOCATED_COSTS[index]),
            "control_source": "Synthetic independent shared-subscription control",
        },
    })
    import_id = identity(month + "-invoice-import")
    revenue_id = f"stripe:demo-bundled-invoice-{month}"
    amount = sum(s["revenue"][index] for s in SCENARIOS if s["kind"] == "product")
    invoice = {
        "revenue_id": revenue_id, "date": str(end), "amount": str(amount),
        "currency": "USD", "customer_id": "demo-enterprise-portfolio",
        "feature": "", "method": "direct",
        "source": "Synthetic paid Stripe invoice fixture; no Stripe account connected",
    }
    imports = {import_id: {
        "id": import_id, "provider": "stripe", "month": month, "state": "complete",
        "source_identity": "acct_synthetic_northstar",
        "evidence_expires_at": "2099-12-31T00:00:00Z",
        "synthetic": True, "evidence": {"costs": [], "usage": [], "revenue": [invoice]},
    }}
    allocation = {
        "import_id": import_id, "revenue_id": revenue_id, "reviewed": True,
        "allocations": [{
            "workload_id": identity(s["key"]), "amount": str(s["revenue"][index]),
            "explanation": "Synthetic management allocation based on the reviewed bundled-service schedule. Not recognized revenue or AI-caused value.",
        } for s in SCENARIOS if s["kind"] == "product"],
    }
    body = MonthlyInput.model_validate({
        "month": month, "company_scope_complete": True, "workloads": workloads,
        "import_ids": [import_id], "invoice_allocations": [allocation],
    })
    _, children = resolve_allocations(
        body.invoice_allocations, imports,
        {w["id"]: w for w in workload_definitions()}, month,
    )
    for item in body.workloads:
        portions = [c["row"] for c in children.values() if c["workload_id"] == str(item.workload_id)]
        if portions:
            item.audit.revenue_csv = csv_text(REVENUE_FIELDS, portions)
    return body, imports


def calculate_demo_month(body, definitions, imports):
    """Preserve real math while carrying fixture provenance into every export."""
    result = calculate_month(body, definitions, imports)
    result.update(synthetic=True, scenario_version=SCENARIO_VERSION)
    result["limitations"].insert(0, COMPANY["notice"])
    result["limitations"].append("Demo capacity estimates cover end-to-end labor; included human-review expenses cover incremental AI review only.")
    for workload in result["workloads"]:
        workload["synthetic"] = True
        workload["evidence"]["source_review"] = "Synthetic fixture; no independent provider or customer verification."
        for source in workload.get("revenue_evidence", []):
            source.update(synthetic=True, source_verified=False, source_basis="Synthetic invoice fixture; no provider verification")
        if workload.get("revenue_evidence"):
            workload["confidence"]["revenue"]["checks"][0]["reason"] = "Amounts matched a synthetic invoice fixture. No provider verification or causal attribution is demonstrated."
    for allocation in result.get("invoice_allocations", []):
        allocation.update(
            synthetic=True, source_verified=False,
            source_basis="Synthetic invoice fixture; no provider verification",
        )
    return result


def build_company_demo():
    definitions = workload_definitions()
    by_id = {w["id"]: w for w in definitions}
    reports, selections, performance = [], [], []
    previous = None
    for index, month in enumerate(MONTHS):
        body, imports = scenario_input(index)
        result = calculate_demo_month(body, by_id, imports)
        end = date.fromisoformat(result["period_end"])
        created = (end + timedelta(days=2)).isoformat() + "T12:00:00Z"
        report = {
            "id": identity(month + "-report"), "month": month,
            "fingerprint": result["fingerprint"], "created_at": created,
            # Code-owned synthetic fixtures have no customer-retention clock.
            "evidence_expires_at": "2099-12-31T00:00:00Z",
            "report_expires_at": "2099-12-31T00:00:00Z", "result": result,
        }
        reports.append(report)
        selections.append({"report_id": report["id"], "month": month, "selected_at": created})
        compact_result = {**result, "workloads": [
            {key: row[key] for key in ("workload", "summary", "outcomes", "confidence", "cost_components")}
            for row in result["workloads"]
        ]}
        performance.append({
            "report": {**report, "result": compact_result},
            "comparison": compare(result, previous, today=date(2026, 9, 10)),
        })
        previous = result
    last_input, last_imports = scenario_input(5)
    return {
        "synthetic": True, "read_only": True, "scenario_version": SCENARIO_VERSION,
        "company": COMPANY, "workloads": definitions,
        "reports": list(reversed(reports)), "selections": selections,
        "performance": performance,
        "connections": [{
            "provider": provider, "available": False, "status": "not_connected",
            "label": provider.title(),
            "notice": "No account is connected in this demonstration. All source records are explicitly synthetic fixtures.",
        } for provider in ("openai", "anthropic", "stripe")],
        "invoices": [{
            **next(iter(last_imports.values()))["evidence"]["revenue"][0],
            "synthetic": True,
            "allocations": last_input.invoice_allocations[0].model_dump(mode="json")["allocations"],
            "remainder": "0.00", "basis": "Modeled allocation of synthetic invoice collections",
        }],
        "evidence_notes": [
            "All company, customer, source and model identifiers are fictional.",
            "Accepted quantities count business units; acceptance rates count reviewed delivery batches.",
            "The August finance control contains a deliberate USD 220 discrepancy.",
            "Shared costs are included in spend and remain Unallocated.",
            "Evidence checklist completion is not independent verification or causal certainty.",
            "Internal before/after minutes model end-to-end labor capacity; the cost ledger includes incremental AI review expense only.",
        ],
    }


@lru_cache(maxsize=1)
def company_demo_json():
    return json.dumps(build_company_demo(), separators=(",", ":"), ensure_ascii=False).encode("utf-8")


router = APIRouter(prefix="/demo/company", tags=["Synthetic company demonstration"])


@router.get("")
def company_demo():
    return Response(
        company_demo_json(), media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600", "X-InfFyn-Data": "synthetic"},
    )


@router.get("/reports/{report_id}/evidence")
def demo_evidence(report_id: UUID):
    for index, month in enumerate(MONTHS):
        if str(report_id) == identity(month + "-report"):
            body, imports = scenario_input(index)
            return {
                "synthetic": True, "scenario_version": SCENARIO_VERSION,
                "company": COMPANY, "workloads": workload_definitions(),
                "input": body.model_dump(mode="json"), "sources": list(imports.values()),
            }
    raise HTTPException(404, "Synthetic report not found.")
