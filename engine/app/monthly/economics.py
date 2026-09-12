"""Monthly reporting uses the existing decimal engine; comparisons require like scope."""

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException

from app.v2.computation import compute
from app.v2.economics import number, rows

from .confidence import confidence
from .preparation import invoice_key, resolve_allocations, retained_import

VERSION = "monthly-1.1.0"


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def dec(value):
    return Decimal(str(value))


def calculate_month(body, workloads, imports=None, *, release_context=None):
    # Only the server supplies release context. It is absent from input contracts
    # and from historical/default reports, preserving their original fingerprints.
    if release_context is not None and release_context != {"stage": "private_alpha"}:
        raise ValueError("Unsupported server-owned monthly release context.")
    seen, reports, components, signatures = set(), [], {}, {}
    event_providers, aggregate_providers = set(), set()
    imports = imports or {}
    refs = (
        {str(i) for i in body.import_ids}
        | {str(i) for w in body.workloads for i in w.import_ids}
        | {str(a.import_id) for a in body.invoice_allocations}
    )
    invoice_sources, invoices_by_id, source_costs, cost_providers = {}, {}, {}, {}
    assignment_map = {}
    for assignment in body.cost_assignments:
        key = (assignment.provider, assignment.project_id)
        if key in assignment_map or str(assignment.workload_id) not in workloads:
            raise HTTPException(
                422, "Each provider project must have one company workload assignment."
            )
        assignment_map[key] = str(assignment.workload_id)
    for iid in sorted(refs):
        job = retained_import(imports, iid, body.month)
        for cost in job["evidence"].get("costs", []):
            if cost["cost_id"] in source_costs:
                raise HTTPException(
                    422,
                    "Overlapping imports contain the same provider cost. Select one source import.",
                )
            source_costs[cost["cost_id"]] = cost
            cost_providers[cost["cost_id"]] = job.get("provider")
        if job.get("provider") == "stripe":
            account = job.get("source_identity")
            if not account:
                raise HTTPException(
                    422,
                    "Stripe evidence is missing its account identity. Import the source again.",
                )
            for revenue in job["evidence"].get("revenue", []):
                key = invoice_key(account, revenue["revenue_id"])
                if key in invoice_sources:
                    raise HTTPException(
                        422,
                        "Overlapping imports contain the same Stripe invoice. Select one source import.",
                    )
                invoice_sources[key] = {
                    "row": revenue,
                    "import_id": iid,
                    "account_id": account,
                }
                invoices_by_id.setdefault(revenue["revenue_id"], []).append(
                    invoice_sources[key]
                )
    allocations, allocation_children = resolve_allocations(
        body.invoice_allocations, imports, workloads, body.month
    )
    allocated_originals = {
        invoice_key(s["account_id"], s["revenue_id"])
        for s in allocations
        if s["allocations"]
    }
    consumed_children, assigned_invoices, used_imported_costs = set(), set(), set()
    for item in body.workloads:
        identity = str(item.workload_id)
        workload = workloads.get(identity)
        if not workload:
            raise HTTPException(404, "Workload not found in this company.")
        if item.audit.kind != workload["kind"]:
            raise HTTPException(422, "Workload type and evidence type must match.")
        revenue_evidence = []
        for row in rows(
            item.audit.revenue_csv,
            {
                "revenue_id",
                "date",
                "amount",
                "currency",
                "customer_id",
                "feature",
                "method",
            },
            "revenue",
            "revenue_id",
        ):
            rid = row["revenue_id"]
            child = allocation_children.get(rid)
            candidates = invoices_by_id.get(rid, [])
            if child:
                if (
                    child["workload_id"] != identity
                    or item.audit.revenue_source != "stripe_reviewed"
                    or item.audit.revenue_basis != "collections"
                ):
                    raise HTTPException(
                        422,
                        "Invoice allocation rows must retain their product workload and Stripe collections basis.",
                    )
                expected = child["row"]
                if any(
                    row.get(k) != expected[k]
                    for k in (
                        "date",
                        "currency",
                        "customer_id",
                        "feature",
                        "method",
                        "allocation_note",
                    )
                ) or number(row["amount"], "revenue amount", signed=True) != dec(
                    expected["amount"]
                ):
                    raise HTTPException(
                        422,
                        "Allocated invoice evidence differs from the reviewed source allocation.",
                    )
                consumed_children.add(rid)
                revenue_evidence.append(
                    {
                        "id": rid,
                        "amount": row["amount"],
                        "source_verified": True,
                        "source_basis": "Provider reported",
                        "attribution_basis": "Modeled allocation",
                        "import_id": child["import_id"],
                    }
                )
            elif rid.startswith("stripe-allocation:"):
                raise HTTPException(
                    422,
                    "An allocation row is missing its original invoice and reviewed allocation lineage.",
                )
            elif candidates:
                if len(candidates) != 1:
                    raise HTTPException(
                        422,
                        "This invoice ID occurs in multiple Stripe accounts. Allocate using its specific source import.",
                    )
                original = candidates[0]
                key = invoice_key(original["account_id"], rid)
                if key in allocated_originals:
                    raise HTTPException(
                        422,
                        "Do not include both an original invoice and its allocated portions.",
                    )
                expected = original["row"]
                if (
                    item.audit.revenue_source != "stripe_reviewed"
                    or item.audit.revenue_basis != "collections"
                    or any(
                        row.get(k) != expected.get(k, "")
                        for k in ("date", "currency", "customer_id")
                    )
                    or number(row["amount"], "revenue amount", signed=True)
                    != dec(expected["amount"])
                ):
                    raise HTTPException(
                        422,
                        "Stripe invoice amount, customer, date and collections basis must match retained evidence.",
                    )
                assigned_invoices.add(key)
                revenue_evidence.append(
                    {
                        "id": rid,
                        "amount": row["amount"],
                        "source_verified": True,
                        "source_basis": "Provider reported",
                        "attribution_basis": "Reviewed association"
                        if row["method"] == "direct"
                        else "Modeled allocation",
                        "import_id": original["import_id"],
                    }
                )
            elif item.audit.revenue_source == "stripe_reviewed":
                raise HTTPException(
                    422,
                    "Stripe revenue requires matching retained invoice evidence; use reviewed-file evidence for separately supplied records.",
                )
            else:
                revenue_evidence.append(
                    {
                        "id": rid,
                        "amount": row["amount"],
                        "source_verified": False,
                        "source_basis": "Customer supplied",
                        "attribution_basis": "Modeled allocation"
                        if row["method"] == "allocated"
                        else "Reviewed association",
                    }
                )
        # Every economic record is owned once in the company month. This also catches
        # separate workloads uploading the same customer invoice or provider charge.
        for field, key in (
            ("usage_csv", "event_id"),
            ("costs_csv", "cost_id"),
            ("revenue_csv", "revenue_id"),
        ):
            for row in rows(getattr(item.audit, field), {key}, field, key):
                if field == "usage_csv":
                    event_providers.add(row.get("provider", "").lower())
                elif (
                    field == "costs_csv" and item.audit.cost_basis == "provider_totals"
                ):
                    for provider in ("openai", "anthropic"):
                        if row[key].startswith(provider + ":"):
                            aggregate_providers.add(provider)
                record_key = ("cost" if field != "revenue_csv" else "revenue", row[key])
                if record_key in seen:
                    raise HTTPException(
                        422,
                        "An economic record appears in multiple inputs. Resolve overlapping costs or revenue before calculating.",
                    )
                seen.add(record_key)
        result = compute(item.audit)
        verified_costs = {}
        for import_id in set(item.import_ids) | set(body.import_ids):
            job = retained_import(imports, import_id, body.month)
            verified_costs.update(
                {x["cost_id"]: x for x in job["evidence"].get("costs", [])}
            )
        for trace in result["trace"]:
            observed = verified_costs.get(trace["id"])
            if (
                observed
                and trace["cost"] is not None
                and dec(observed["amount"]) == dec(trace["cost"])
                and trace.get("date") == observed["date"]
                and trace.get("source") == observed["source"]
            ):
                trace["basis"] = "Provider reported"
                used_imported_costs.add(trace["id"])
                assigned = assignment_map.get(
                    (cost_providers.get(trace["id"]), observed.get("project_id") or "")
                )
                if assigned and assigned != identity:
                    raise HTTPException(
                        422,
                        "Imported cost does not match its reviewed workload assignment.",
                    )
        if result["trace"] and all(
            x["basis"] == "Provider reported" for x in result["trace"]
        ):
            result["summary"]["basis"] = (
                "Provider-reported costs; modeled revenue allocations"
                if any(
                    x["attribution_basis"] == "Modeled allocation"
                    for x in revenue_evidence
                )
                else "Provider-reported costs; reviewed associations"
            )
        definition = {
            k: workload.get(k)
            for k in (
                "id",
                "name",
                "kind",
                "outcome_unit",
                "cost_scope",
                "acceptance_definition",
                "unallocated",
                "mappings",
                "purpose",
                "responsible_team",
            )
        }
        signature = digest(
            {
                k: definition[k]
                for k in (
                    "kind",
                    "outcome_unit",
                    "cost_scope",
                    "acceptance_definition",
                    "unallocated",
                    "mappings",
                )
            }
            | {
                "cost_basis": item.audit.cost_basis,
                "revenue_basis": item.audit.revenue_basis,
                "allocation": item.audit.feature_allocation,
                "currency": item.audit.currency,
                "engine_version": result["calculation_version"],
                "monthly_version": VERSION,
                "invoice_allocation_method": sorted(
                    {
                        p.explanation
                        for a in body.invoice_allocations
                        for p in a.allocations
                        if str(p.workload_id) == identity
                    }
                ),
                "reviewed_project_assignments": sorted(
                    (a.provider, a.project_id)
                    for a in body.cost_assignments
                    if str(a.workload_id) == identity
                ),
            }
        )
        signatures[identity] = signature
        outcome_rows = rows(
            item.audit.outcomes_csv, {"run_id", "status"}, "outcomes", "run_id"
        )
        o = result["outcomes"]
        accepted_runs = sum(x["status"] == "accepted" for x in outcome_rows)
        o["acceptance_rate"] = (
            str(dec(accepted_runs) / o["reviewed_runs"] * 100)
            if o["cohort_complete"] and o["reviewed_runs"]
            else None
        )
        # Time differences are modeled and include failed/rejected runs.
        time_rows = [
            x
            for x in outcome_rows
            if x.get("baseline_minutes") and x.get("after_minutes")
        ]
        o["modeled_hours"] = (
            str(
                sum(
                    (
                        dec(x["baseline_minutes"]) - dec(x["after_minutes"])
                        for x in time_rows
                    ),
                    Decimal(0),
                )
                / 60
            )
            if time_rows
            else None
        )
        if not workload.get("outcome_unit") or not workload.get(
            "acceptance_definition"
        ):
            o["cost_per_accepted_outcome"] = None
            o["acceptance_rate"] = None
        scores = confidence(result, item.audit, item.review, workload)
        if revenue_evidence and all(x["source_verified"] for x in revenue_evidence):
            scores["revenue"]["checks"][0]["reason"] = (
                "Amounts matched retained Stripe invoices. Source verification does not verify management's attribution or recognized revenue."
            )
        if workload.get("unallocated"):
            scores["cost"]["checks"][2].update(
                status="fail",
                points=0,
                reason="Shared costs remain unallocated to a business workload.",
            )
            scores["cost"]["score"] = sum(x["points"] for x in scores["cost"]["checks"])
            scores["cost"]["state"] = (
                "partial" if scores["cost"]["score"] >= 40 else "insufficient"
            )
        result.update(
            workload=definition,
            comparison_signature=signature,
            confidence=scores,
            revenue_evidence=revenue_evidence,
            cost_basis=item.audit.cost_basis,
            control_cost=str(item.review.control_cost)
            if item.review.control_cost is not None
            else None,
            control_variance=str(
                dec(result["summary"]["known_cost"]) - item.review.control_cost
            )
            if item.review.control_cost is not None
            else None,
        )
        for k, v in result["cost_components"].items():
            components[k] = components.get(k, Decimal(0)) + dec(v)
        reports.append(result)
    if consumed_children != set(allocation_children):
        raise HTTPException(
            422,
            "Each reviewed invoice allocation must appear exactly once in its assigned product workload.",
        )
    missing_costs = set(source_costs) - used_imported_costs
    if body.company_scope_complete and missing_costs:
        raise HTTPException(
            422,
            "Imported costs remain unassigned or differ from their source. Include them in a workload or Unallocated before confirming complete company scope.",
        )
    if event_providers & aggregate_providers:
        raise HTTPException(
            422,
            "Provider totals and detailed usage cover the same provider in this company month. Choose one cost basis for that provider; retain the other as reconciliation evidence.",
        )
    total = sum((dec(x["summary"]["known_cost"]) for x in reports), Decimal(0))
    unknown = sum(x["summary"]["unknown_cost_rows"] for x in reports)
    complete = (
        body.company_scope_complete
        and not unknown
        and all(x["summary"]["cost_scope_complete"] for x in reports)
    )
    month_end = reports[0]["period_end"]
    input_basis = body.model_dump(mode="json")
    for workload in input_basis["workloads"]:
        if not workload.get("reviewed_imports"):
            workload.pop("reviewed_imports", None)
    basis = {
        "version": VERSION,
        "input": input_basis,
        "definitions": [x["workload"] for x in reports],
        "engine_versions": [x["calculation_version"] for x in reports],
    }
    if release_context is not None:
        basis["release_context"] = dict(release_context)
    result = {
        "schema_version": "monthly-1.0",
        "calculation_version": VERSION,
        "month": body.month,
        "period_end": month_end,
        "currency": "USD",
        "fingerprint": digest(basis),
        "company_scope_complete": body.company_scope_complete,
        "comparison_signature": digest(signatures),
        "summary": {
            "known_cost": str(total),
            "unknown_cost_rows": unknown,
            "cost_complete": complete,
            "unallocated_cost": str(
                sum(
                    (
                        dec(x["summary"]["known_cost"])
                        for x in reports
                        if x["workload"].get("unallocated")
                    ),
                    Decimal(0),
                )
            ),
            "unassigned_imported_cost": str(
                sum((dec(source_costs[k]["amount"]) for k in missing_costs), Decimal(0))
            ),
            "imported_collections": str(
                sum(
                    (dec(v["row"]["amount"]) for v in invoice_sources.values()),
                    Decimal(0),
                )
            ),
            "unassigned_revenue": str(
                sum(
                    (
                        dec(v["row"]["amount"])
                        for k, v in invoice_sources.items()
                        if k not in assigned_invoices
                    ),
                    Decimal(0),
                )
                - sum((dec(a["allocated_amount"]) for a in allocations), Decimal(0))
            ),
        },
        "invoice_allocations": allocations,
        "cost_assignments": [a.model_dump(mode="json") for a in body.cost_assignments],
        "cost_components": {k: str(v) for k, v in components.items()},
        "workloads": reports,
        "limitations": [
            "Evidence scores are checklist completion, not probability or causality.",
            "Known spend covers included sources only.",
            "Provider totals and event charges must not cover the same spend twice.",
            "Modeled hours and capacity are not realized cash savings.",
        ],
    }
    if release_context is not None:
        result["release_context"] = dict(release_context)
    if len(json.dumps(result).encode()) > 3_800_000:
        raise HTTPException(
            413,
            "Monthly report exceeds the export limit. Aggregate evidence while retaining workload and customer dimensions.",
        )
    return result


def change(current, previous):
    if current is None or previous is None:
        return {"amount": None, "percent": None}
    a, b = dec(current), dec(previous)
    return {
        "amount": str(a - b),
        "percent": str((a - b) / abs(b) * 100) if b != 0 else None,
    }


def compare(current, previous, today=None):
    today = today or datetime.now(UTC).date()
    reasons = []
    if not previous:
        reasons.append("Select a report for the preceding month to compare progress.")
    else:
        start = date.fromisoformat(current["month"] + "-01")
        expected = date(
            start.year - (start.month == 1),
            12 if start.month == 1 else start.month - 1,
            1,
        ).strftime("%Y-%m")
        if previous["month"] != expected:
            reasons.append("The preceding calendar month is missing.")
        if current["comparison_signature"] != previous["comparison_signature"]:
            reasons.append(
                "Workloads, cost scope, mappings, units, or revenue basis changed."
            )
        if (
            not current["summary"]["cost_complete"]
            or not previous["summary"]["cost_complete"]
        ):
            reasons.append("Complete cost coverage is required in both months.")
    if date.fromisoformat(current["period_end"]) >= today:
        reasons.append("This month is provisional until its calendar period ends.")
    if reasons:
        return {
            "eligible": False,
            "reasons": reasons,
            "spend": change(None, None),
            "workloads": [],
        }
    prior = {x["workload"]["id"]: x for x in previous["workloads"]}
    items = []
    for row in current["workloads"]:
        old = prior[row["workload"]["id"]]
        c, p = row["outcomes"], old["outcomes"]
        baseline = p["cost_per_accepted_outcome"]
        comparable = c["cost_per_accepted_outcome"] is not None and baseline is not None
        items.append(
            {
                "id": row["workload"]["id"],
                "name": row["workload"]["name"],
                "unit_cost": change(c["cost_per_accepted_outcome"], baseline),
                "accepted_volume": change(
                    c["accepted_quantity"], p["accepted_quantity"]
                )
                if comparable
                else change(None, None),
                "contribution": change(
                    row["summary"]["contribution"], old["summary"]["contribution"]
                ),
                "acceptance_rate": change(c["acceptance_rate"], p["acceptance_rate"]),
                "volume_adjusted_cost_difference": str(
                    dec(baseline) * dec(c["accepted_quantity"])
                    - dec(row["summary"]["known_cost"])
                )
                if comparable
                else None,
                "basis": "Prior unit cost at current accepted volume, less current included cost. A baseline comparison, not verified cash savings.",
            }
        )
    return {
        "eligible": True,
        "reasons": [],
        "spend": change(
            current["summary"]["known_cost"], previous["summary"]["known_cost"]
        ),
        "workloads": items,
    }
