"""Prepare retained evidence without guessing allocations or upgrading provenance."""

import csv
import hashlib
import io
import json
from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException

COST_FIELDS = ["cost_id", "date", "category", "amount", "currency", "source", "model"]
REVENUE_FIELDS = [
    "revenue_id",
    "date",
    "amount",
    "currency",
    "customer_id",
    "feature",
    "method",
    "allocation_note",
]


def csv_text(fields, records):
    output = io.StringIO()
    writer = csv.DictWriter(
        output, fieldnames=fields, extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    writer.writerows(records)
    return output.getvalue() if records else ""


def retained_import(imports, identity, month, provider=None):
    row = imports.get(str(identity))
    if (
        not row
        or row.get("state") != "complete"
        or row.get("month") != month
        or not row.get("evidence")
    ):
        raise HTTPException(
            422,
            "Referenced provider evidence is incomplete, expired, or belongs to a different period.",
        )
    expiry = row.get("evidence_expires_at")
    if expiry and datetime.fromisoformat(expiry.replace("Z", "+00:00")) <= datetime.now(
        UTC
    ):
        raise HTTPException(
            410, "Referenced provider evidence has expired. Import the source again."
        )
    if provider and (row.get("provider") != provider or not row.get("source_identity")):
        raise HTTPException(
            422, "Invoice allocation requires a retained Stripe account source."
        )
    return row


def invoice_key(account, revenue_id):
    return account + ":" + revenue_id


def allocation_id(account, revenue_id, workload_id):
    # Economic identity is stable across fresh imports and allocation restatements.
    raw = invoice_key(account, revenue_id) + ":" + str(workload_id)
    return "stripe-allocation:" + hashlib.sha256(raw.encode()).hexdigest()


def resolve_allocations(allocations, imports, definitions, month, require_review=True):
    snapshots, children, seen = [], {}, set()
    invoice_indexes = {}
    for item in allocations:
        source = retained_import(imports, item.import_id, month, "stripe")
        iid = str(item.import_id)
        if iid not in invoice_indexes:
            index = {}
            for r in source["evidence"].get("revenue", []):
                index.setdefault(r["revenue_id"], []).append(r)
            invoice_indexes[iid] = index
        matches = invoice_indexes[iid].get(item.revenue_id, [])
        if len(matches) != 1:
            raise HTTPException(
                422, "Original invoice is missing or duplicated in retained evidence."
            )
        original = matches[0]
        account = source["source_identity"]
        key = invoice_key(account, item.revenue_id)
        if key in seen:
            raise HTTPException(
                422,
                "The same invoice cannot be allocated twice, including across imports.",
            )
        seen.add(key)
        amount = Decimal(original["amount"])
        if amount < 0 or original["currency"] != "USD":
            raise HTTPException(
                422,
                "Allocate USD paid invoices; signed adjustments require separate reviewed evidence.",
            )
        if item.allocations and require_review and not item.reviewed:
            raise HTTPException(
                422, "Review the invoice allocation before creating the report."
            )
        allocated, workload_ids, portions = Decimal(0), set(), []
        for portion in item.allocations:
            wid = str(portion.workload_id)
            definition = definitions.get(wid)
            if (
                not definition
                or definition["kind"] != "product"
                or definition.get("unallocated")
            ):
                raise HTTPException(
                    422,
                    "Invoice allocations must refer to a product workload in this company.",
                )
            if wid in workload_ids:
                raise HTTPException(
                    422, "Include each workload once in an invoice allocation."
                )
            workload_ids.add(wid)
            allocated += portion.amount
            child = {
                "revenue_id": allocation_id(account, item.revenue_id, wid),
                "date": original["date"],
                "amount": str(portion.amount),
                "currency": "USD",
                "customer_id": original.get("customer_id", ""),
                "feature": definition["name"],
                "method": "allocated",
                "allocation_note": portion.explanation,
            }
            children[child["revenue_id"]] = {
                "workload_id": wid,
                "row": child,
                "import_id": str(item.import_id),
            }
            portions.append(
                {**portion.model_dump(mode="json"), "revenue_id": child["revenue_id"]}
            )
        if allocated > amount:
            raise HTTPException(
                422,
                "Invoice allocations exceed the original amount. Reduce allocations or leave a remainder.",
            )
        snapshots.append(
            {
                "import_id": str(item.import_id),
                "revenue_id": item.revenue_id,
                "account_id": account,
                "date": original["date"],
                "customer_id": original.get("customer_id", ""),
                "currency": "USD",
                "original_amount": str(amount),
                "allocated_amount": str(allocated),
                "remainder": str(amount - allocated),
                "allocations": portions,
                "source_verified": True,
                "source_basis": "Provider reported",
                "basis": "Modeled allocation",
                "reviewed": item.reviewed,
                "revenue_basis": "collections",
            }
        )
    return snapshots, children


def prepare(body, definitions, imports):
    month_start = date.fromisoformat(body.month + "-01")
    if month_start > datetime.now(UTC).date().replace(day=1):
        raise HTTPException(422, "Future reporting months are not supported.")
    assignments = {}
    for a in body.cost_assignments:
        key = (a.provider, a.project_id)
        if key in assignments or str(a.workload_id) not in definitions:
            raise HTTPException(
                422, "Each provider project must have one company workload assignment."
            )
        assignments[key] = str(a.workload_id)
    unallocated = [wid for wid, w in definitions.items() if w.get("unallocated")]
    buckets, groups, seen, invoices = {}, {}, set(), {}
    unallocated_total = Decimal(0)
    selected = {str(x) for x in body.import_ids} | {
        str(x.import_id) for x in body.invoice_allocations
    }
    for iid in sorted(selected):
        job = retained_import(imports, iid, body.month)
        provider = job.get("provider")
        for row in job["evidence"].get("revenue", []):
            key = invoice_key(job["source_identity"], row["revenue_id"])
            if key in invoices:
                raise HTTPException(
                    422,
                    "Overlapping imports contain the same Stripe invoice. Select one source import.",
                )
            invoices[key] = Decimal(row["amount"])
        for row in job["evidence"].get("costs", []):
            if row["cost_id"] in seen:
                raise HTTPException(
                    422,
                    "Overlapping imports contain the same cost. Select one source import.",
                )
            seen.add(row["cost_id"])
            key = (provider, row.get("project_id") or "")
            wid = assignments.get(key)
            if not wid:
                wid = next(
                    (
                        i
                        for i, w in definitions.items()
                        if key[1] and key[1] in w.get("mappings", {}).get(provider, [])
                    ),
                    None,
                )
            if not wid:
                wid = unallocated[0] if len(unallocated) == 1 else None
            if not wid or definitions[wid].get("unallocated"):
                unallocated_total += Decimal(row["amount"])
            group = groups.setdefault(
                key,
                {
                    "provider": provider,
                    "project_id": key[1],
                    "amount": Decimal(0),
                    "workload_id": wid,
                    "records": 0,
                },
            )
            group["amount"] += Decimal(row["amount"])
            group["records"] += 1
            if wid:
                bucket = buckets.setdefault(
                    wid, {"costs": [], "revenue": [], "import_ids": set()}
                )
                bucket["costs"].append(row)
                bucket["import_ids"].add(iid)
    snapshots, children = resolve_allocations(
        body.invoice_allocations, imports, definitions, body.month, require_review=False
    )
    for child in children.values():
        bucket = buckets.setdefault(
            child["workload_id"], {"costs": [], "revenue": [], "import_ids": set()}
        )
        bucket["revenue"].append(child["row"])
        bucket["import_ids"].add(child["import_id"])
    prepared = []
    for wid, bucket in buckets.items():
        w = definitions[wid]
        has_revenue = bool(bucket["revenue"])
        prepared.append(
            {
                "workload_id": wid,
                "import_ids": sorted(bucket["import_ids"]),
                "audit": {
                    "title": w["name"] + " / " + body.month,
                    "kind": w["kind"],
                    "period_start": body.month + "-01",
                    "period_end": f"{body.month}-{monthrange(month_start.year, month_start.month)[1]}",
                    "usage_csv": "",
                    "cost_basis": "provider_totals",
                    "costs_csv": csv_text(COST_FIELDS, bucket["costs"]),
                    "revenue_csv": csv_text(REVENUE_FIELDS, bucket["revenue"]),
                    "revenue_source": "stripe_reviewed" if has_revenue else "none",
                    "revenue_basis": "collections" if has_revenue else "unavailable",
                    "revenue_reviewed": False,
                    "cost_scope_complete": False,
                },
                "review": {
                    "source_note": "Prepared from retained provider imports. Review assignments and the reporting scope."
                },
            }
        )
    result = {
        "month": body.month,
        "workloads": prepared,
        "import_ids": sorted(selected),
        "invoice_allocations": [
            a.model_dump(mode="json") for a in body.invoice_allocations
        ],
        "revenue_allocations": snapshots,
        "unallocated_cost": str(unallocated_total),
        "unassigned_revenue": str(
            sum(invoices.values(), Decimal(0))
            - sum((Decimal(s["allocated_amount"]) for s in snapshots), Decimal(0))
        ),
        "source_groups": [{**g, "amount": str(g["amount"])} for g in groups.values()],
    }
    if len(json.dumps(result).encode()) > 3_500_000:
        raise HTTPException(
            413,
            "Prepared evidence exceeds the monthly limit. Use aggregated, scoped source exports.",
        )
    return result


def definition_basis(definitions):
    return hashlib.sha256(
        json.dumps(definitions, sort_keys=True, default=str).encode()
    ).hexdigest()


def invalidate_draft(content, old_content, changed_definitions=False):
    """A new evidence or allocation basis requires a fresh human confirmation."""
    invalidations = []

    # Ticking a review checkbox confirms the same allocation, and changing only
    # cost evidence does not change an already-reviewed invoice allocation.
    def without_review(items):
        return [{k: v for k, v in a.items() if k != "reviewed"} for a in items]

    allocation_changed = bool(old_content) and without_review(
        content.get("invoice_allocations", [])
    ) != without_review((old_content or {}).get("invoice_allocations", []))
    global_change = (
        changed_definitions
        or allocation_changed
        or any(
            content.get(k) != (old_content or {}).get(k)
            for k in ("import_ids", "cost_assignments")
        )
    )
    prior = {str(w["workload_id"]): w for w in (old_content or {}).get("workloads", [])}
    current_ids = {str(w["workload_id"]) for w in content["workloads"]}
    removed_workloads = set(prior) - current_ids
    global_change |= set(prior) != current_ids
    changed_revenue = set()
    for item in content["workloads"]:
        old = prior.get(str(item["workload_id"]))
        audit = item["audit"]
        if old and any(
            audit.get(k) != old["audit"].get(k)
            for k in (
                "revenue_csv",
                "revenue_basis",
                "revenue_source",
                "period_start",
                "period_end",
                "kind",
                "currency",
                "feature_allocation",
            )
        ):
            changed_revenue.add(str(item["workload_id"]))
        evidence_changed = old and (
            item.get("import_ids") != old.get("import_ids")
            or any(
                audit.get(k) != old["audit"].get(k)
                for k in (
                    "usage_csv",
                    "costs_csv",
                    "rates_csv",
                    "revenue_csv",
                    "outcomes_csv",
                    "cost_basis",
                    "revenue_basis",
                    "revenue_source",
                    "period_start",
                    "period_end",
                    "kind",
                    "currency",
                    "feature_allocation",
                )
            )
        )
        if changed_definitions or (old_content and (global_change or evidence_changed)):
            for key in (
                "revenue_reviewed",
                "cost_scope_complete",
                "outcome_cohort_complete",
            ):
                audit[key] = False
            for key in (
                "method_reviewed",
                "revenue_scope_complete",
                "outcome_method_reviewed",
            ):
                item["review"][key] = False
            invalidations.append(str(item["workload_id"]))
    if invalidations or (old_content and global_change):
        content["company_scope_complete"] = False
        content["step"] = "reconcile"
    for allocation in content.get("invoice_allocations", []):
        if (
            changed_definitions
            or allocation_changed
            or any(
                str(p["workload_id"]) in (removed_workloads | changed_revenue)
                for p in allocation["allocations"]
            )
        ):
            allocation["reviewed"] = False
    return content, invalidations
