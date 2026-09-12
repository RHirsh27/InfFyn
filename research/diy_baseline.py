"""Independent, bounded export analysis. No prototype imports or provider access.

Run: python -B research/diy_baseline.py
Uses already normalized synthetic export records and supplied prices/mappings.
Rejects event corrections; it is not an accounting ledger or a native adapter.
"""
import copy
import hashlib
import json
import time
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, localcontext
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "prototype" / "examples"


def number(value):
    if value is None:
        return None
    if isinstance(value, (float, bool)):
        raise ValueError("Use explicit decimal amounts")
    answer = Decimal(value)
    if not answer.is_finite():
        raise ValueError("Nonfinite amount")
    return answer


def instant(value):
    answer = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if answer.tzinfo is None:
        raise ValueError("Timezone required")
    return answer


def identity(row):
    return row["tenant_id"], row["source"], row["source_id"]


def population(manifest, batches, cutoff):
    """Only complete-period batches with simple declared replacement versions."""
    selected, issues = [], []
    expected = {s["scope_id"] for s in manifest["expected_sources"]}
    if any(b["scope_id"] not in expected for b in batches):
        raise ValueError("Unexpected source scope")
    for scope in manifest["expected_sources"]:
        versions = sorted((b for b in batches if b["scope_id"] == scope["scope_id"]
                           and instant(b["received_at"]) <= instant(cutoff)), key=lambda b: b["version"])
        if not versions:
            raise ValueError("Missing expected source: " + scope["scope_id"])
        for previous, current in zip(versions, versions[1:]):
            if current.get("supersedes") != {"batch_id": previous["batch_id"], "version": previous["version"]}:
                raise ValueError("Unsupported batch revision history")
        batch = versions[-1]
        if (batch["start"], batch["end"]) != (scope["start"], scope["end"]):
            raise ValueError("Partial source intervals unsupported")
        if batch["completeness"] != "complete":
            issues.append("source_declared_partial:" + scope["scope_id"])
        payload = batch["records_json"]
        if hashlib.sha256(payload.encode()).hexdigest() != batch["source_sha256"]:
            raise ValueError("Source payload hash mismatch")
        records = json.loads(payload)
        if len(records) != batch["declared_count"]:
            raise ValueError("Source count mismatch")
        for field, total in batch["declared_totals"].items():
            if any(r.get(field) is None for r in records):
                raise ValueError("Unknown declared export total")
            if sum((number(r[field]) for r in records), Decimal(0)) != number(total):
                raise ValueError("Source total mismatch")
        for row in records:
            for key in ("source", "kind", "currency", "provider", "account"):
                if key in scope and row.get(key) != scope[key]:
                    raise ValueError("Source scope mismatch")
            if row["tenant_id"] != manifest["tenant_id"]:
                raise ValueError("Wrong client")
            if instant(row["received_at"]) > instant(cutoff):
                raise ValueError("Evidence not yet received")
            selected.append(row)
    return selected, issues


def analyze(records, rates, start, end, source_issues=()):
    """Calculate only the explicit, normalized period; reject unsupported shapes."""
    events = {}
    for row in records:
        key = identity(row)
        if key in events and events[key] != row:
            raise ValueError("Conflicting duplicate source identity")
        if row.get("supersedes"):
            raise ValueError("Event correction chains unsupported; supply an approved current export")
        events[key] = row
    if len({(r["tenant_id"], r["currency"]) for r in events.values()}) != 1:
        raise ValueError("Run one client and currency at a time")
    prices = {}
    for price in rates:
        key = price["tenant_id"], price["version"]
        if key in prices and prices[key] != price:
            raise ValueError("Conflicting rate version")
        if any(number(v) < 0 for v in price["per_million"].values()):
            raise ValueError("Negative price")
        prices[key] = price
    costs, revenues, outcomes, invoices, invoice_counts = [], defaultdict(Decimal), {}, defaultdict(Decimal), defaultdict(int)
    issues, captures = list(source_issues), set()
    for row in events.values():
        kind = row["kind"]
        if kind == "invoice":
            if (instant(row["service_start"]), instant(row["service_end"])) != (instant(start), instant(end)):
                raise ValueError("Invoice requires exact period and full asserted supplier pool")
            pool = row["provider"], row["account"]
            amount, document = number(row["amount"]), row.get("document_type", "invoice")
            if document not in ("invoice", "credit") or (document == "invoice" and amount < 0) or (document == "credit" and amount > 0):
                raise ValueError("Unsupported invoice/credit sign")
            invoices[pool] += amount
            invoice_counts[pool] += document == "invoice"
            continue
        if not instant(start) <= instant(row["incurred_at"]) < instant(end):
            raise ValueError("Cross-period records unsupported")
        if kind == "revenue":
            if row["basis"] != "recognized" or not row.get("customer_id"):
                raise ValueError("Explicit customer-associated recognized revenue required")
            revenues[row["customer_id"]] += number(row["amount"])
            continue
        if not row.get("workflow_id") or not row.get("run_id") or not row.get("customer_id"):
            raise ValueError("Unmapped cost or business outcome unsupported")
        run = row["workflow_id"], row["run_id"]
        if kind == "outcome":
            if run in outcomes:
                raise ValueError("Multiple outcome declarations per run unsupported")
            if row["status"] not in ("accepted", "rejected", "unknown"):
                raise ValueError("Unknown business outcome status")
            if row["status"] != "unknown" and (type(row["quantity"]) is not int or row["quantity"] < 0):
                raise ValueError("Outcome count must be explicit and nonnegative")
            outcomes[run] = row
            continue
        if kind == "usage":
            capture = row["provider"], row["account"], row["request_id"], row["attempt"]
            if capture in captures:
                raise ValueError("Repeated authoritative attempt")
            captures.add(capture)
            meters = row["meters"]
            if set(meters) - {"input_uncached", "input_cached", "cache_write", "output"} or any(type(v) is not int or v < 0 for v in meters.values()):
                raise ValueError("Unsupported token meter")
            if sum(meters.get(k, 0) for k in ("input_uncached", "input_cached", "cache_write")) != row["input_total"]:
                raise ValueError("Overlapping input meters")
            price = prices.get((row["tenant_id"], row["rate_version"]))
            applicable = price and all(price[k] == row[k] for k in ("provider", "account", "model", "currency")) and instant(price["effective_start"]) <= instant(row["incurred_at"]) < instant(price["effective_end"])
            if type(row["billable"]) is not bool:
                raise ValueError("Billability must be explicit")
            amount = Decimal(0) if not row["billable"] else None
            if row["billable"] and applicable and all(not q or m in price["per_million"] for m, q in meters.items()):
                amount = sum((Decimal(q) * number(price["per_million"].get(m, "0")) / 1_000_000 for m, q in meters.items()), Decimal(0))
            category, coverage = "inference", "covered_by_supplier_invoice"
        elif kind == "cost_component":
            category, coverage = row["category"], row["invoice_coverage"]
            amount = number(row.get("amount"))
            if row["basis"] == "rated":
                quantity, unit_rate = number(row.get("quantity")), number(row.get("unit_rate"))
                calculated = quantity * unit_rate if quantity is not None and unit_rate is not None else None
                if amount is not None and amount != calculated:
                    raise ValueError("Rated component amount contradicts its inputs")
                amount = calculated
            elif row["basis"] not in ("observed", "allocated"):
                raise ValueError("Unsupported component basis")
        else:
            raise ValueError("Unsupported event kind")
        if coverage not in ("covered_by_supplier_invoice", "additional_to_supplier_invoice", "internal"):
            raise ValueError("Explicit invoice coverage required")
        if amount is not None and amount < 0:
            raise ValueError("Negative expense requires unsupported correction handling")
        if amount is None:
            issues.append("unpriced:" + row["source_id"])
        costs.append(dict(row=row, amount=amount, category=category, coverage=coverage, run=run))
    if not revenues:
        raise ValueError("Recognized revenue evidence missing; absence is not zero revenue")
    pools = set(invoices) | {(c["row"]["provider"], c["row"]["account"]) for c in costs if c["coverage"] == "covered_by_supplier_invoice"}
    selected_cost, total_known, bridge = Decimal(0), True, []
    for pool in sorted(pools):
        members = [c for c in costs if c["coverage"] == "covered_by_supplier_invoice" and (c["row"]["provider"], c["row"]["account"]) == pool]
        subtotal = sum((c["amount"] for c in members if c["amount"] is not None), Decimal(0))
        if not invoice_counts[pool]:
            issues.append("missing_principal_invoice:" + "/".join(pool)); total_known = False
            selected_cost += subtotal
            residual = None
        else:
            selected_cost += invoices[pool]
            residual = invoices[pool] - subtotal
            if residual:
                issues.append("invoice_gap:" + "/".join(pool))
        bridge.append(dict(provider=pool[0], account=pool[1], known_attribution=subtotal,
                           supplier_net=invoices.get(pool), residual=residual))
    additional = [c for c in costs if c["coverage"] != "covered_by_supplier_invoice"]
    selected_cost += sum((c["amount"] for c in additional if c["amount"] is not None), Decimal(0))
    total_known &= all(c["amount"] is not None for c in additional)
    by_category = defaultdict(Decimal)
    for cost in costs:
        if cost["amount"] is not None:
            by_category[cost["category"]] += cost["amount"]
    customers = {}
    for customer in sorted(set(revenues) | {c["row"]["customer_id"] for c in costs}):
        customer_costs = [c for c in costs if c["row"]["customer_id"] == customer]
        known = sum((c["amount"] for c in customer_costs if c["amount"] is not None), Decimal(0))
        complete = bool(customer_costs) and not issues and all(c["amount"] is not None for c in customer_costs)
        customers[customer] = dict(recognized_revenue=revenues.get(customer), known_attributed_cost=known,
            contribution=revenues[customer] - known if customer in revenues and complete else None)
    runs = {c["run"] for c in costs}
    if runs != set(outcomes):
        issues.append("missing_run_cost_or_outcome")
    if any(not o["cohort_complete"] or o["status"] == "unknown" for o in outcomes.values()):
        issues.append("partial_or_unknown_cohort")
    if len({o["metric"] for o in outcomes.values()}) != 1 or len({r[0] for r in runs}) != 1:
        raise ValueError("Multiple workflows or business metrics unsupported")
    accepted = sum(o["quantity"] for o in outcomes.values() if o["status"] == "accepted")
    return dict(status="calculated_with_exceptions" if issues else "calculated_from_declared_exports",
        recognized_revenue=sum(revenues.values(), Decimal(0)), known_cost=selected_cost,
        total_cost=selected_cost if total_known else None, known_category_costs=dict(by_category),
        customer_associated_contribution=sum(revenues.values(), Decimal(0)) - selected_cost if total_known and not source_issues else None,
        customers=customers, supplier_bridge=bridge, accepted_outcomes=accepted,
        failed_attempts=sum(c["row"].get("outcome") == "error" for c in costs),
        rejected_runs=sum(o["status"] == "rejected" for o in outcomes.values()),
        cost_per_accepted_outcome=selected_cost / accepted if accepted and not issues and total_known else None,
        issues=sorted(set(issues)), source_rows=len(events))


def main():
    began = time.perf_counter()
    supplied = json.loads((EXAMPLES / "workflow-input.json").read_text())
    manifest = json.loads((EXAMPLES / "workflow-coverage-manifest.json").read_text())
    batches = json.loads((EXAMPLES / "workflow-coverage-batches.json").read_text())
    start, end = manifest["expected_sources"][0]["start"], manifest["expected_sources"][0]["end"]
    records, clean_issues = population(manifest, batches, "2026-09-06T00:00:00Z")
    if {identity(r) for r in records} != {identity(r) for r in supplied["events"]}:
        raise ValueError("Raw fixture and selected normalized exports have different source populations")
    rates = supplied["rates"]
    clean = analyze(records, rates, start, end, clean_issues)
    early_records, early_issues = population(manifest, batches, "2026-09-03T00:00:00Z")
    cases = {"clean_final_exports": clean, "initial_partial_source": analyze(early_records, rates, start, end, early_issues)}
    variants = {}
    missing = copy.deepcopy(rates); del missing[0]["per_million"]["output"]
    variants["missing_output_price"] = records, missing
    gap = copy.deepcopy(records); next(r for r in gap if r["kind"] == "invoice")["amount"] = "2"
    variants["invoice_gap"] = gap, rates
    labor = copy.deepcopy(records); unknown = next(r for r in labor if r.get("category") == "human_review"); unknown.update(unit_rate=None, amount=None)
    variants["unknown_labor"] = labor, rates
    conflict = copy.deepcopy(records); duplicate = copy.deepcopy(conflict[0]); duplicate["customer_id"] = "conflicting-customer"; conflict.append(duplicate)
    variants["conflicting_source_duplicate"] = conflict, rates
    partial = copy.deepcopy(records); next(r for r in partial if r["kind"] == "outcome")["cohort_complete"] = False
    variants["partial_run_cohort"] = partial, rates
    variants["identical_replay"] = records + [copy.deepcopy(records[0])], rates
    variants["missing_revenue"] = [r for r in records if r["kind"] != "revenue"], rates
    for name, (events, prices) in variants.items():
        try:
            cases[name] = analyze(events, prices, start, end)
        except ValueError as exc:
            cases[name] = {"status": "rejected", "reason": str(exc)}
    checks = {
        "missing_price_withholds_unit_ratio": cases["missing_output_price"]["cost_per_accepted_outcome"] is None,
        "invoice_gap_stays_signed": cases["invoice_gap"]["supplier_bridge"][0]["residual"] == Decimal("0.74"),
        "invoice_gap_withholds_unit_ratio": cases["invoice_gap"]["cost_per_accepted_outcome"] is None,
        "unknown_labor_is_not_zero": cases["unknown_labor"]["total_cost"] is None and cases["unknown_labor"]["cost_per_accepted_outcome"] is None,
        "conflicting_identity_rejected": cases["conflicting_source_duplicate"]["status"] == "rejected",
        "partial_source_withholds_unit_ratio": cases["initial_partial_source"]["cost_per_accepted_outcome"] is None,
        "partial_run_withholds_unit_ratio": cases["partial_run_cohort"]["cost_per_accepted_outcome"] is None,
        "identical_replay_is_noop": cases["identical_replay"] == clean,
        "missing_revenue_is_not_zero": cases["missing_revenue"]["status"] == "rejected",
    }
    # Reference output is loaded only after every independent calculation.
    reference = json.loads((EXAMPLES / "workflow-evidence.json").read_text())["final_snapshot"]
    comparisons = {"total_cost": clean["total_cost"] == number(reference["totals"]["cost_total"]),
        "recognized_revenue": clean["recognized_revenue"] == number(reference["totals"]["recognized_revenue"]),
        "contribution": clean["customer_associated_contribution"] == number(reference["totals"]["profit_estimate"]),
        "accepted_outcomes": clean["accepted_outcomes"] == reference["workflow_economics"][0]["accepted_outcomes"],
        "cost_per_accepted_outcome": clean["cost_per_accepted_outcome"] == number(reference["workflow_economics"][0]["cost_per_accepted_outcome"]),
        "customers": all(clean["customers"][k]["contribution"] == number(v["profit_estimate"]) for k, v in reference["customers"].items())}
    output = dict(notice="SYNTHETIC independent DIY counterexample; not provider validation or accounting approval",
        upstream_dependencies="Already-normalized batch records, supplied rates, mappings, coverage declarations, and recognized revenue",
        variant_scope="Calculation-level mutations after parsing; variants do not claim newly verified export hashes or external completeness",
        comparison_to_generated_reference=comparisons, adversarial_checks=checks, cases=cases,
        runtime_seconds=round(time.perf_counter() - began, 6))
    destination = ROOT / "research" / "diy-baseline-result.json"
    destination.write_text(json.dumps(output, indent=2, default=lambda v: str(v) if isinstance(v, Decimal) else TypeError()), encoding="utf-8")
    print(json.dumps({"output": str(destination), "reference_matches": comparisons,
                      "runtime_seconds": output["runtime_seconds"],
                      "case_statuses": {k: v["status"] for k, v in cases.items()}}, indent=2))
    return 0 if all(comparisons.values()) and all(checks.values()) else 1


if __name__ == "__main__":
    with localcontext() as context:
        context.prec = 40
        raise SystemExit(main())
