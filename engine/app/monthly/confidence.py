"""Versioned checklist completion, never a probability of economic causality."""

from decimal import Decimal

VERSION = "evidence-1.0.1"
KEYS = ("sources", "coverage", "associations", "reconciliation", "review")
LABELS = (
    "Traceable sources",
    "Complete coverage",
    "Valid associations",
    "Reconciled calculations",
    "Reviewed method",
)


def score(checks, applicable=True):
    if not applicable:
        return {
            "version": VERSION,
            "score": None,
            "state": "not_applicable",
            "checks": [],
            "meaning": "Not applicable to this workload.",
        }
    rows = [
        {
            "id": key,
            "label": label,
            "status": "pass" if passed else "unknown" if passed is None else "fail",
            "points": 20 if passed else 0,
            "reason": reason,
        }
        for key, label, (passed, reason) in zip(KEYS, LABELS, checks)
    ]
    points = sum(x["points"] for x in rows)
    return {
        "version": VERSION,
        "score": points,
        "state": "ready"
        if points == 100
        else "partial"
        if points >= 40
        else "insufficient",
        "checks": rows,
        "meaning": "Evidence checklist completion. Not statistical confidence, causal attribution, or a performance grade.",
    }


def reconciles(actual, control, source):
    if actual is None or control is None or not source:
        return None
    return abs(Decimal(str(actual)) - Decimal(str(control))) <= Decimal("0.01")


def control_reason(actual, control, source):
    if actual is None or control is None or not source:
        return "Supply a separate same-scope, same-basis control total and its source. USD reconciliation tolerance is 0.01."
    difference = Decimal(str(actual)) - Decimal(str(control))
    return f"Included amount USD {actual}; customer-supplied control USD {control}; difference USD {difference}. Control source: {source}. Tolerance USD 0.01."


def confidence(result, audit, review, workload):
    s, o = result["summary"], result["outcomes"]
    cost_ok = s["unknown_cost_rows"] == 0
    source_ok = bool(review.source_note) and all(
        x.get("source") for x in result["trace"]
    )
    revenue_ok = s["revenue"] is not None
    # Non-netted coverage: credits cannot cancel an unassociated positive record.
    from app.v2.economics import rows

    revenue_rows = rows(
        audit.revenue_csv, {"revenue_id", "customer_id"}, "revenue", "revenue_id"
    )
    customer_ids = {
        x.get("customer_id") for x in result["trace"] if x.get("customer_id")
    }
    joined = bool(revenue_rows) and all(
        x["customer_id"] in customer_ids for x in revenue_rows
    )
    accepted_defined = bool(
        workload["outcome_unit"] and workload["acceptance_definition"]
    )
    sourced = sum(bool(x.get("source")) for x in result["trace"])
    joined_count = sum(x["customer_id"] in customer_ids for x in revenue_rows)
    return {
        "cost": score(
            [
                (
                    source_ok,
                    f"{sourced} of {len(result['trace'])} cost records have a source. Source/period review note {'recorded' if review.source_note else 'missing'}.",
                ),
                (
                    cost_ok and audit.cost_scope_complete,
                    f"{s['unknown_cost_rows']} included usage rows lack a price. Full cost scope {'confirmed by reviewer' if audit.cost_scope_complete else 'not confirmed; include failed work and supporting costs'}.",
                ),
                (
                    cost_ok,
                    f"Included records assigned to {workload['name']}. This is a workload association; ambiguous shared expenses must remain Unallocated.",
                ),
                (
                    reconciles(
                        s["known_cost"], review.control_cost, review.control_source
                    ),
                    control_reason(
                        s["known_cost"], review.control_cost, review.control_source
                    ),
                ),
                (
                    review.method_reviewed,
                    "Reviewer confirmed cost basis, scope, mappings and assumptions."
                    if review.method_reviewed
                    else "Review the cost basis, scope, mappings and assumptions before confirming this check.",
                ),
            ]
        ),
        "revenue": score(
            [
                (
                    bool(review.source_note) and revenue_ok,
                    "Provide traceable revenue evidence and its reporting basis.",
                ),
                (
                    review.revenue_scope_complete and revenue_ok,
                    "Confirm that revenue and signed adjustments for this workload and period are complete.",
                ),
                (
                    joined,
                    f"{joined_count} of {len(revenue_rows)} revenue records join an included customer. Unassociated records remain visible; signed adjustments cannot cancel missing associations.",
                ),
                (
                    reconciles(
                        s["revenue"],
                        review.control_revenue,
                        review.revenue_control_source,
                    ),
                    control_reason(
                        s["revenue"],
                        review.control_revenue,
                        review.revenue_control_source,
                    ),
                ),
                (
                    audit.revenue_reviewed and review.method_reviewed,
                    "Review collections versus recognized revenue and the selected allocation method. Association is not causation.",
                ),
            ],
            audit.kind == "product",
        ),
        "outcomes": score(
            [
                (
                    bool(review.source_note) and o["reviewed_runs"] > 0,
                    f"{o['reviewed_runs']} final outcome records supplied. Source/period review note {'recorded' if review.source_note else 'missing'}.",
                ),
                (
                    o["cohort_complete"],
                    "Include accepted, rejected, and failed runs for the full cost cohort.",
                ),
                (
                    accepted_defined and o["cohort_complete"],
                    "Define one accepted business unit and link all included costs to that cohort.",
                ),
                (
                    None
                    if review.expected_runs is None
                    else review.expected_runs
                    == o["included_runs"]
                    == o["reviewed_runs"],
                    f"Included distinct runs: {o['included_runs']}; reviewed outcomes: {o['reviewed_runs']}; customer-supplied expected runs: {review.expected_runs if review.expected_runs is not None else 'missing'}. Counts must agree exactly.",
                ),
                (
                    review.outcome_method_reviewed and accepted_defined,
                    "Confirm the acceptance criteria and any modeled time/capacity assumptions.",
                ),
            ],
            bool(workload["outcome_unit"] or o["reviewed_runs"]),
        ),
    }
