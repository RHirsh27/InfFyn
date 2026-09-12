"""Pure decimal economics. No network, credentials, floating-point money or LLM math."""

from __future__ import annotations

import csv
import hashlib
import io
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext

from .contract import AuditInput

VERSION = "inffyn-2.0.3"
ZERO = Decimal(0)
MILLION = Decimal(1_000_000)
DIMENSIONS = ("customer_id", "customer_segment", "feature", "model", "workflow", "team")


class AuditError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def number(value, field: str, *, signed=False, integer=False) -> Decimal:
    try:
        result = Decimal(str(value))
        if (
            not result.is_finite()
            or abs(result) > Decimal("1e18")
            or (not signed and result < 0)
        ):
            raise InvalidOperation
        if integer and result != result.to_integral_value():
            raise InvalidOperation
        if result.as_tuple().exponent < -12:
            raise InvalidOperation
        return result
    except (InvalidOperation, ValueError):
        raise AuditError(
            "invalid_number",
            f"{field}: expected a finite {'integer' if integer else 'number'}{' (negative values allowed)' if signed else ' at least zero'}, with at most 12 decimal places.",
        ) from None


def rows(text: str, required: set[str], source: str, id_field: str) -> list[dict]:
    if not text.strip():
        return []
    if "\x00" in text:
        raise AuditError("invalid_csv", f"{source}: null bytes are not accepted.")
    try:
        reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), strict=True)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or required - set(headers):
            missing = ", ".join(sorted(required - set(headers)))
            raise AuditError(
                "invalid_headers",
                f"{source}: missing {missing or 'unique headers'}. Received: {', '.join(headers)[:300]}",
            )
        result, seen = [], set()
        for line, row in enumerate(reader, 2):
            if line > 20001:
                raise AuditError("row_limit", f"{source}: maximum 20,000 rows.")
            if None in row or any(v is None for v in row.values()):
                raise AuditError(
                    "invalid_row",
                    f"{source} row {line}: column count does not match the header.",
                )
            row = {k: v.strip() for k, v in row.items()}
            identity = row.get(id_field, "")
            if not identity or len(identity) > 200 or identity in seen:
                raise AuditError(
                    "duplicate_id",
                    f"{source} row {line}: {id_field} must be nonempty and unique.",
                )
            if any(len(v) > 2000 for v in row.values()):
                raise AuditError(
                    "field_limit",
                    f"{source} row {line}: field exceeds 2,000 characters.",
                )
            seen.add(identity)
            row["_line"] = line
            result.append(row)
        return result
    except csv.Error:
        raise AuditError("invalid_csv", f"{source}: malformed CSV.") from None


def in_period(row, audit, source):
    try:
        day = date.fromisoformat(row["date"])
    except ValueError:
        raise AuditError(
            "invalid_date", f"{source} row {row['_line']}: date must be YYYY-MM-DD."
        ) from None
    if not audit.period_start <= day <= audit.period_end:
        raise AuditError(
            "outside_period",
            f"{source} row {row['_line']}: date is outside the selected period.",
        )
    if row.get("currency", audit.currency) != audit.currency:
        raise AuditError(
            "mixed_currency",
            f"{source} row {row['_line']}: v1 accepts USD only; convert and document the basis before importing.",
        )
    return day


def text_decimal(value):
    return format(value, "f") if isinstance(value, Decimal) else value


def json_safe(value):
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    return text_decimal(value)


def fingerprint(audit: AuditInput):
    return hashlib.sha256((VERSION + audit.model_dump_json()).encode()).hexdigest()


def calculate(audit: AuditInput) -> dict:
    with localcontext() as ctx:
        ctx.prec = 60
        return json_safe(_calculate(audit))


def _calculate(audit):
    usage = rows(
        audit.usage_csv,
        {
            "event_id",
            "date",
            "provider",
            "model",
            "input_tokens",
            "output_tokens",
            "requests",
        },
        "usage",
        "event_id",
    )
    aggregate = getattr(audit, "cost_basis", "events") != "events"
    if not usage and not aggregate:
        raise AuditError("empty_usage", "Usage requires at least one row.")
    rates = rows(
        audit.rates_csv,
        {
            "rate_id",
            "provider",
            "model",
            "effective_from",
            "effective_to",
            "input_per_million",
            "output_per_million",
            "cached_input_per_million",
            "currency",
            "source",
        },
        "rates",
        "rate_id",
    )
    costs = rows(
        audit.costs_csv,
        {"cost_id", "date", "category", "amount", "currency", "source"},
        "costs",
        "cost_id",
    )
    revenues = rows(
        audit.revenue_csv,
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
    )
    outcomes = rows(
        audit.outcomes_csv,
        {"run_id", "status", "accepted_quantity"},
        "outcomes",
        "run_id",
    )
    if aggregate and (usage or not costs):
        raise AuditError(
            "cost_basis",
            "Aggregate cost reports require costs and cannot also include usage charges.",
        )
    rated = defaultdict(list)
    for rate in rates:
        try:
            start, end = (
                date.fromisoformat(rate["effective_from"]),
                date.fromisoformat(rate["effective_to"]),
            )
        except ValueError:
            raise AuditError(
                "invalid_rate_period", "Rate effective dates must be YYYY-MM-DD."
            ) from None
        if start > end or rate["currency"] != audit.currency or not rate["source"]:
            raise AuditError(
                "invalid_rate",
                "Rates need an ordered date range, USD currency and a source.",
            )
        model_key = (rate["provider"], rate["model"])
        for other in rated[model_key]:
            if (
                (other["provider"], other["model"]) == (rate["provider"], rate["model"])
                and start <= other["end"]
                and end >= other["start"]
            ):
                raise AuditError(
                    "overlapping_rates",
                    "A provider/model cannot have overlapping effective rate periods.",
                )
        rated[model_key].append(
            {
                **rate,
                "start": start,
                "end": end,
                **{
                    k: number(rate[k], f"rate {rate['rate_id']} {k}")
                    for k in (
                        "input_per_million",
                        "output_per_million",
                        "cached_input_per_million",
                    )
                },
            }
        )
    entries = []
    for row in usage:
        day = in_period(row, audit, "usage")
        inp, out, cached, requests = [
            number(
                (row.get(k) or "0") if k == "cached_input_tokens" else row[k],
                f"usage row {row['_line']} {k}",
                integer=True,
            )
            for k in (
                "input_tokens",
                "output_tokens",
                "cached_input_tokens",
                "requests",
            )
        ]
        if not row["provider"] or not row["model"]:
            raise AuditError(
                "missing_model", "Usage rows require provider and model identifiers."
            )
        if cached > inp or (requests == 0 and inp + out > 0):
            raise AuditError(
                "invalid_usage",
                f"usage row {row['_line']}: cached tokens exceed input or token usage has zero requests.",
            )
        rate = next(
            (
                r
                for r in rated[(row["provider"], row["model"])]
                if (r["provider"], r["model"]) == (row["provider"], row["model"])
                and r["start"] <= day <= r["end"]
            ),
            None,
        )
        amount, basis, rate_id = None, "Unavailable", None
        if row.get("billed_cost") != "" and row.get("billed_cost") is not None:
            if not row.get("cost_source"):
                raise AuditError(
                    "missing_source",
                    "Billed usage costs require cost_source for each supplied amount.",
                )
            amount, basis = (
                number(row["billed_cost"], "billed_cost"),
                "Customer supplied",
            )
        elif rate:
            amount = (
                (inp - cached) * rate["input_per_million"]
                + cached * rate["cached_input_per_million"]
                + out * rate["output_per_million"]
            ) / MILLION
            basis, rate_id = "Reference estimate", rate["rate_id"]
        entries.append(
            {
                **{k: row.get(k, "") for k in DIMENSIONS},
                "id": row["event_id"],
                "date": str(day),
                "run_id": row.get("run_id", ""),
                "source": row.get("cost_source") or (rate["source"] if rate else None),
                "category": "inference",
                "cost": amount,
                "basis": basis,
                "rate_id": rate_id,
                "rate_snapshot": {
                    k: rate[k]
                    for k in (
                        "rate_id",
                        "provider",
                        "model",
                        "effective_from",
                        "effective_to",
                        "input_per_million",
                        "output_per_million",
                        "cached_input_per_million",
                        "source",
                        "currency",
                    )
                }
                if rate_id
                else None,
                "input_tokens": inp,
                "output_tokens": out,
                "cached_input_tokens": cached,
                "tokens": inp + out,
                "requests": requests,
            }
        )
    for row in costs:
        in_period(row, audit, "costs")
        if (
            row["category"]
            not in (
                (
                    "inference",
                    "subscription",
                    "tools",
                    "compute",
                    "human_review",
                    "other",
                )
                if aggregate
                else ("tools", "compute", "human_review", "other")
            )
            or not row["source"]
        ):
            raise AuditError(
                "invalid_cost",
                "Additional costs need a source and category tools, compute, human_review or other. Inference belongs in usage.",
            )
        entries.append(
            {
                **{k: row.get(k, "") for k in DIMENSIONS},
                "id": row["cost_id"],
                "date": row["date"],
                "run_id": row.get("run_id", ""),
                "category": row["category"],
                "cost": number(row["amount"], "cost amount", signed=True),
                "source": row["source"],
                "basis": "Customer supplied",
                "rate_id": None,
                "tokens": ZERO,
                "requests": ZERO,
            }
        )
    segments_by_customer = defaultdict(set)
    features_by_customer = defaultdict(lambda: defaultdict(lambda: ZERO))
    for entry in entries:
        if entry["category"] == "inference" and entry["customer_id"]:
            segments_by_customer[entry["customer_id"]].add(entry["customer_segment"])
            if entry["feature"]:
                features_by_customer[entry["customer_id"]][entry["feature"]] += entry[
                    "requests"
                ]
    for entry in entries:
        segments = segments_by_customer[entry["customer_id"]]
        if not entry["customer_segment"] and len(segments) == 1 and "" not in segments:
            entry["customer_segment"] = next(iter(segments))
    for row in revenues:
        in_period(row, audit, "revenue")
        if row["method"] not in ("direct", "allocated") or (
            row["method"] == "allocated" and not row.get("allocation_note")
        ):
            raise AuditError(
                "invalid_revenue_method",
                "Revenue method must be direct or allocated; allocations need allocation_note.",
            )
        row["amount"] = number(row["amount"], "revenue amount", signed=True)
        # Stable customer-to-cohort lookup is an association, not a revenue allocation.
        if row.get("customer_id") and not row.get("customer_segment"):
            segments = segments_by_customer[row["customer_id"]]
            if len(segments) == 1 and "" not in segments:
                row["customer_segment"] = next(iter(segments))
    total_cost = sum((e["cost"] for e in entries if e["cost"] is not None), ZERO)
    unknown = sum(e["cost"] is None for e in entries)
    revenue_available = bool(revenues) and audit.kind == "product"
    total_revenue = (
        sum((r["amount"] for r in revenues), ZERO) if revenue_available else None
    )
    tokens = sum((e["tokens"] for e in entries), ZERO)
    cost_complete = unknown == 0
    modeled_cost = any(e["basis"] == "Reference estimate" for e in entries)
    summary = {
        "known_cost": total_cost,
        "unknown_cost_rows": unknown,
        "revenue": total_revenue,
        "contribution": total_revenue - total_cost
        if revenue_available and cost_complete
        else None,
        "margin_percent": (total_revenue - total_cost) / total_revenue * 100
        if revenue_available and total_revenue > 0 and cost_complete
        else None,
        "tokens": tokens,
        "requests": sum((e["requests"] for e in entries), ZERO),
        "gpp1m": (total_revenue - total_cost) * MILLION / tokens
        if revenue_available and cost_complete and tokens > 0
        else None,
        "basis": "Modeled"
        if modeled_cost or any(r["method"] == "allocated" for r in revenues)
        else "Customer supplied",
        "cost_scope_complete": audit.cost_scope_complete,
    }
    groups = {}
    # Each dimension independently reconciles to the same total. Never sum axes together.
    for dim in DIMENSIONS:
        bucket = defaultdict(
            lambda: {
                "known_cost": ZERO,
                "unknown_cost_rows": 0,
                "tokens": ZERO,
                "requests": ZERO,
                "revenue": ZERO,
                "has_revenue": False,
                "modeled": modeled_cost,
            }
        )
        for e in entries:
            g = bucket[e[dim] or "Unmapped"]
            g["known_cost"] += e["cost"] or ZERO
            g["unknown_cost_rows"] += e["cost"] is None
            g["tokens"] += e["tokens"]
            g["requests"] += e["requests"]
        for rev in revenues:
            key = rev.get(dim, "") or "Unmapped"
            portions = [(key, rev["amount"])]
            if (
                dim == "feature"
                and key == "Unmapped"
                and audit.feature_allocation != "none"
            ):
                candidates = features_by_customer[rev["customer_id"]]
                weights = {
                    k: (v if audit.feature_allocation == "requests" else Decimal(1))
                    for k, v in candidates.items()
                }
                denom = sum(weights.values(), ZERO)
                if denom:
                    portions, remainder = [], rev["amount"]
                    ordered = sorted(weights)
                    for index, k in enumerate(ordered):
                        part = (
                            remainder
                            if index == len(ordered) - 1
                            else rev["amount"] * weights[k] / denom
                        )
                        portions.append((k, part))
                        remainder -= part
            for k, amount in portions:
                g = bucket[k]
                g["revenue"] += amount
                g["has_revenue"] = True
                g["modeled"] |= rev["method"] == "allocated" or (
                    dim == "feature" and not rev["feature"] and k != "Unmapped"
                )
        groups[dim] = []
        for key, g in sorted(bucket.items()):
            contribution = (
                g["revenue"] - g["known_cost"]
                if g["has_revenue"] and not g["unknown_cost_rows"]
                else None
            )
            groups[dim].append(
                {
                    "name": key,
                    **{
                        k: v
                        for k, v in g.items()
                        if k not in ("modeled", "has_revenue", "revenue")
                    },
                    "revenue": g["revenue"] if g["has_revenue"] else None,
                    "contribution": contribution,
                    "margin_percent": contribution / g["revenue"] * 100
                    if contribution is not None and g["revenue"] > 0
                    else None,
                    "basis": "Modeled" if g["modeled"] else "Customer supplied",
                }
            )
        assert sum((g["known_cost"] for g in groups[dim]), ZERO) == total_cost
        assert sum((g["revenue"] or ZERO for g in groups[dim]), ZERO) == (
            total_revenue or ZERO
        )
    run_ids = {e["run_id"] for e in entries if e["run_id"]}
    outcome_ids, accepted, capacity = set(), ZERO, ZERO
    for row in outcomes:
        outcome_ids.add(row["run_id"])
        if row["run_id"] not in run_ids or row["status"] not in (
            "accepted",
            "rejected",
            "failed",
        ):
            raise AuditError(
                "invalid_outcome",
                "Each final outcome must belong to an included run and have status accepted, rejected or failed.",
            )
        qty = number(row["accepted_quantity"], "accepted_quantity")
        if row["status"] != "accepted" and qty != 0:
            raise AuditError(
                "invalid_outcome",
                "Rejected and failed outcomes must have zero accepted quantity.",
            )
        accepted += qty
        effort = [
            row.get(k)
            for k in ("baseline_minutes", "after_minutes", "loaded_hourly_rate")
        ]
        if any(effort):
            if not all(effort):
                raise AuditError(
                    "partial_capacity",
                    "Capacity value needs baseline_minutes, after_minutes and loaded_hourly_rate together.",
                )
            before, after, rate = [number(v, "capacity input") for v in effort]
            capacity += (before - after) * rate / 60
    cohort_ready = (
        bool(outcomes)
        and audit.outcome_cohort_complete
        and outcome_ids == run_ids
        and all(e["run_id"] for e in entries)
    )
    outcome_result = {
        "included_runs": len(run_ids),
        "reviewed_runs": len(outcome_ids),
        "accepted_quantity": accepted,
        "cohort_complete": cohort_ready,
        "cost_per_accepted_outcome": total_cost / accepted
        if cohort_ready and cost_complete and audit.cost_scope_complete and accepted > 0
        else None,
        "modeled_capacity_value": capacity
        if any(r.get("baseline_minutes") for r in outcomes)
        else None,
        "capacity_basis": "Modeled capacity value; not realized cash savings",
    }
    findings = []
    if unknown:
        findings.append(
            {
                "type": "Missing cost",
                "detail": f"{unknown} usage rows have no supplied cost or effective rate. Complete margin is withheld.",
                "impact": None,
            }
        )
    for dim in ("customer_id", "feature", "workflow"):
        for g in groups[dim]:
            if (
                g["name"] != "Unmapped"
                and g["contribution"] is not None
                and g["contribution"] < 0
            ):
                findings.append(
                    {
                        "type": "Margin Drag",
                        "dimension": dim,
                        "name": g["name"],
                        "detail": "Review the revenue association, included costs and pricing before changing this item.",
                        "impact": -g["contribution"],
                        "basis": g["basis"],
                    }
                )
    findings.sort(key=lambda f: f.get("impact") or ZERO, reverse=True)
    result = {
        "calculation_version": VERSION,
        "fingerprint": fingerprint(audit),
        "title": audit.title,
        "kind": audit.kind,
        "period_start": str(audit.period_start),
        "period_end": str(audit.period_end),
        "currency": audit.currency,
        "revenue_basis": audit.revenue_basis,
        "summary": summary,
        "groups": groups,
        "cost_components": {
            k: sum(
                (
                    e["cost"]
                    for e in entries
                    if e["category"] == k and e["cost"] is not None
                ),
                ZERO,
            )
            for k in (
                (
                    "inference",
                    "subscription",
                    "tools",
                    "compute",
                    "human_review",
                    "other",
                )
                if aggregate
                else ("inference", "tools", "compute", "human_review", "other")
            )
        },
        "outcomes": outcome_result,
        "evidence": {
            "priced_usage_rows": len(usage) - unknown,
            "usage_rows": len(usage),
            "source_review": "Customer supplied; not independently verified",
            "revenue_reviewed": audit.revenue_reviewed,
            "scope": "Customer confirms included cost scope complete"
            if audit.cost_scope_complete
            else "Included costs only; other costs may be absent",
            "association": "Revenue association does not establish AI-caused revenue",
            "allocation": audit.feature_allocation,
        },
        "findings": findings,
        "trace": entries,
    }
    absolute_cost = sum(
        (abs(e["cost"]) for e in entries if e["cost"] is not None), ZERO
    )
    result["mapping_coverage"] = {
        dim: {
            "known_cost_mapped_percent": str(
                sum(
                    (
                        abs(e["cost"])
                        for e in entries
                        if e["cost"] is not None and e[dim]
                    ),
                    ZERO,
                )
                / absolute_cost
                * 100
            )
            if absolute_cost > 0
            else None,
            "unmapped_revenue": next(
                (g["revenue"] for g in vals if g["name"] == "Unmapped"),
                "0" if result["summary"]["revenue"] is not None else None,
            ),
        }
        for dim, vals in groups.items()
    }
    if audit.kind == "internal":
        if not cohort_ready or not audit.cost_scope_complete:
            findings.append(
                {
                    "type": "Outcome coverage",
                    "detail": "Complete the reviewed run cohort and included cost scope before comparing cost per accepted result.",
                    "impact": None,
                }
            )
        else:
            findings.append(
                {
                    "type": "Accepted outcome cost",
                    "detail": "The unit cost includes failed and rejected work. Review outcome quality alongside this cost before changing the workflow.",
                    "impact": None,
                }
            )
    return result


def sensitivity(audit: AuditInput, result: dict) -> dict:
    if audit.feature_allocation == "none" or audit.kind == "internal":
        return {
            "status": "not_applicable",
            "detail": "No feature revenue allocation selected.",
        }
    alternative = "equal" if audit.feature_allocation == "requests" else "requests"
    alternate = calculate(audit.model_copy(update={"feature_allocation": alternative}))
    other = {r["name"]: r for r in alternate["groups"]["feature"]}
    comparisons = []
    for row in result["groups"]["feature"]:
        a, b = row["contribution"], other.get(row["name"], {}).get("contribution")
        if a is not None and b is not None:
            a, b = Decimal(a), Decimal(b)
            changed_sign = (a < 0) != (b < 0)
            comparisons.append(
                {
                    "feature": row["name"],
                    "min_contribution": str(min(a, b)),
                    "max_contribution": str(max(a, b)),
                    "classification": "method-dependent"
                    if changed_sign
                    or abs(a - b) > max(abs(a), abs(b), Decimal(1)) * Decimal("0.1")
                    else "stable across tested methods",
                }
            )
    return {
        "status": "compared",
        "methods": [audit.feature_allocation, alternative],
        "materiality_rule": "Sign change or more than 10% of larger absolute contribution (minimum denominator $1)",
        "features": comparisons,
        "detail": "Two allocation scenarios, not a confidence interval. Review method-dependent findings before acting.",
    }


def preview(result: dict) -> dict:
    """Explicit allowlist: no revenue, margin, finding detail, identifiers or trace."""
    return {
        "calculation_version": result["calculation_version"],
        "kind": result["kind"],
        "currency": result["currency"],
        "known_cost": result["summary"]["known_cost"],
        "unknown_cost_rows": result["summary"]["unknown_cost_rows"],
        "tokens": result["summary"]["tokens"],
        "requests": result["summary"]["requests"],
        "cost_components": result["cost_components"],
        "usage_rows": result["evidence"]["usage_rows"],
        "basis": result["summary"]["basis"],
    }


def report(result: dict) -> dict:
    """Deterministic executive facts; an LLM is not required for a correct report."""
    summary = result["summary"]
    return {
        "title": result["title"],
        "period": f"{result['period_start']} through {result['period_end']}",
        "calculation_version": result["calculation_version"],
        "facts_fingerprint": result["fingerprint"],
        "headline": "Internal workflow economics"
        if result["kind"] == "internal"
        else (
            "Collections less included costs"
            if result["revenue_basis"] == "collections"
            else "Contribution after included costs"
        ),
        "summary": summary,
        "evidence": result["evidence"],
        "outcomes": result["outcomes"],
        "mapping_coverage": result.get("mapping_coverage"),
        "sensitivity": result.get("sensitivity"),
        "findings": result["findings"],
        "limitations": [
            "Supplied records are not independently verified.",
            "Revenue associations do not establish causation.",
            "Reference pricing produces estimates; supplier credits, discounts or omitted costs can change results.",
            "Collections are not recognized revenue."
            if result["revenue_basis"] == "collections"
            else "Results cover the reviewed period and included cost scope.",
        ],
        "generation": "deterministic",
    }
