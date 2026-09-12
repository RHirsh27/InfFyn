"""Exact metrics (E4.2 / E4.3 model axis) — no feature allocation required.

- GPp1M by model: the model axis is clean. Tokens and cost are exact per
  model; revenue is attributed to a model by its token share (the single
  natural weight for the model axis). No arbitrary split choice is involved,
  so this number is reported as exact.
- Per-customer profit: where usage_events and revenue_events share a
  `customer_ref`, profit = customer revenue (exact, from Stripe) minus the
  cost attributed to that customer's usage. Join coverage is reported so the
  reader knows how much of revenue/usage actually matched.
"""

from __future__ import annotations

from typing import Any

from app.metrics.cost import compute_cost_by_model
from app.metrics.data import TenantData
from app.metrics.provenance import make_provenance


def _total_revenue(data: TenantData) -> float:
    return sum(float(r.get("amount") or 0.0) for r in data.revenue_events)


def gpp1m_by_model(data: TenantData) -> dict[str, Any]:
    """(revenue_attributable - cost) / (tokens/1e6) per model. Exact axis."""
    costs = compute_cost_by_model(data)
    total_tokens = sum(mc.total_tokens for mc in costs.values())
    total_revenue = _total_revenue(data)

    by_model: dict[str, Any] = {}
    for model, mc in sorted(costs.items()):
        token_share = (mc.total_tokens / total_tokens) if total_tokens > 0 else 0.0
        revenue_attributable = total_revenue * token_share
        cost = mc.cost if mc.cost is not None else None
        if cost is None or mc.total_tokens <= 0:
            gpp1m = None
            gross_profit = None
        else:
            gross_profit = revenue_attributable - cost
            gpp1m = gross_profit / (mc.total_tokens / 1e6)
        by_model[model] = {
            "total_tokens": mc.total_tokens,
            "revenue_attributable": revenue_attributable,
            "cost": cost,
            "cost_source": mc.cost_source,
            "gross_profit": gross_profit,
            "gpp1m": gpp1m,
            # Model-axis revenue is the token-share weight (exact for this axis);
            # actuality therefore turns on whether the COST is actual. Decided by
            # the single authority.
            "provenance": make_provenance(
                "usage_weighted_token_share", actual=(mc.cost_source == "actual")
            ),
        }
    return {"by_model": by_model, "total_revenue": total_revenue, "total_tokens": total_tokens}


def per_customer_profit(data: TenantData) -> dict[str, Any]:
    """Exact per-customer profit where the customer axis joins, + coverage."""
    costs = compute_cost_by_model(data)
    cost_per_token = {m: mc.cost_per_token for m, mc in costs.items()}
    cost_source_by_model = {m: mc.cost_source for m, mc in costs.items()}

    # Revenue per customer (exact, from Stripe).
    revenue_by_customer: dict[str, float] = {}
    for r in data.revenue_events:
        cust = r.get("customer_ref")
        if not cust:
            continue
        revenue_by_customer[cust] = revenue_by_customer.get(cust, 0.0) + float(r.get("amount") or 0.0)

    # Attributed cost + tokens per customer (from usage). Track which models
    # feed each customer's cost so we can tell whether that cost is fully
    # actual (observed cost_events) or partly modeled (reference pricing).
    cost_by_customer: dict[str, float] = {}
    tokens_by_customer: dict[str, int] = {}
    models_by_customer: dict[str, set[str]] = {}
    for u in data.usage_events:
        cust = u.get("customer_ref")
        if not cust:
            continue
        model = u.get("model")
        row_tokens = int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0)
        tokens_by_customer[cust] = tokens_by_customer.get(cust, 0) + row_tokens
        cost_by_customer[cust] = cost_by_customer.get(cust, 0.0) + row_tokens * cost_per_token.get(model, 0.0)
        if model and row_tokens > 0:
            models_by_customer.setdefault(cust, set()).add(model)

    matched = sorted(set(revenue_by_customer) & set(tokens_by_customer))

    by_customer: dict[str, Any] = {}
    for cust in matched:
        revenue = revenue_by_customer[cust]
        cost = cost_by_customer.get(cust, 0.0)
        # Revenue is exact (Stripe). The profit is Actual only if the COST is
        # also actual — every model feeding this customer's cost came from an
        # observed cost_event. Any modeled/unpriced model => Modeled (never
        # bare Actual on a partly-modeled number).
        used_models = models_by_customer.get(cust, set())
        cost_actual = bool(used_models) and all(
            cost_source_by_model.get(m) == "actual" for m in used_models
        )
        by_customer[cust] = {
            "revenue": revenue,
            "attributed_cost": cost,
            "profit": revenue - cost,
            "provenance": make_provenance("exact_customer_join", actual=cost_actual),
        }

    total_revenue = sum(revenue_by_customer.values())
    total_usage_tokens = sum(tokens_by_customer.values())
    matched_revenue = sum(revenue_by_customer[c] for c in matched)
    matched_tokens = sum(tokens_by_customer[c] for c in matched)

    coverage = {
        "customers_matched": len(matched),
        "customers_revenue_only": len(set(revenue_by_customer) - set(tokens_by_customer)),
        "customers_usage_only": len(set(tokens_by_customer) - set(revenue_by_customer)),
        "revenue_matched_pct": (matched_revenue / total_revenue * 100.0) if total_revenue > 0 else 0.0,
        "usage_matched_pct": (matched_tokens / total_usage_tokens * 100.0) if total_usage_tokens > 0 else 0.0,
    }

    return {"by_customer": by_customer, "coverage": coverage}
