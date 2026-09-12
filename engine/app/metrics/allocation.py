"""Revenue allocation across features (E4.3).

There is no ground-truth per-feature revenue split (the customer bought a
bundle). These methods produce principled *estimates*; the sensitivity output
(sensitivity.py) reads how much to trust them.

Methods:
  - even_split:      revenue_i = P / n_features
  - usage_weighted:  revenue_i = P * (usage_i / sum usage)   (Appendix A1)
  - direct:          where a Stripe `product` maps to a feature — the ONLY
                     method whose numbers may be labeled "Actual".

`cost_proportional` is intentionally NOT implemented. It forces every feature
to an identical margin and destroys the ranking (Appendix A trap). It must not
appear anywhere in this codebase.

Provenance labels: `direct` -> "Actual"; every modeled split -> the method name
("Modeled(even_split)" / "Modeled(usage_weighted)"). A modeled split is never
labeled Actual (D3).
"""

from __future__ import annotations

from typing import Any

from app.metrics.cost import compute_cost_by_model
from app.metrics.data import TenantData
from app.metrics.provenance import make_provenance

# v1 modeled methods. `direct` is handled separately (it needs a product map
# and is only available where products resolve to features).
MODELED_METHODS = ("even_split", "usage_weighted")


def feature_tokens(data: TenantData) -> dict[str, int]:
    """Total tokens (input+output) per feature, from usage_events."""
    out: dict[str, int] = {}
    for u in data.usage_events:
        feature = u.get("feature")
        if not feature:
            continue
        out[feature] = out.get(feature, 0) + int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0)
    return out


def feature_cost(data: TenantData) -> dict[str, float]:
    """Cost attributed to each feature via its per-model token usage."""
    costs = compute_cost_by_model(data)
    cost_per_token = {m: mc.cost_per_token for m, mc in costs.items()}
    out: dict[str, float] = {}
    for u in data.usage_events:
        feature = u.get("feature")
        if not feature:
            continue
        model = u.get("model")
        row_tokens = int(u.get("input_tokens") or 0) + int(u.get("output_tokens") or 0)
        out[feature] = out.get(feature, 0.0) + row_tokens * cost_per_token.get(model, 0.0)
    return out


def total_revenue(data: TenantData) -> float:
    return sum(float(r.get("amount") or 0.0) for r in data.revenue_events)


# ── Pure allocation functions (testable in isolation) ───────────────────────

def allocate_even_split(features: list[str], revenue: float) -> dict[str, float]:
    n = len(features)
    if n == 0:
        return {}
    share = revenue / n
    return {f: share for f in features}


def allocate_usage_weighted(tokens_by_feature: dict[str, int], revenue: float) -> dict[str, float]:
    total = sum(tokens_by_feature.values())
    if total <= 0:
        # Degenerate: no usage signal -> fall back to even split.
        return allocate_even_split(list(tokens_by_feature), revenue)
    return {f: revenue * (t / total) for f, t in tokens_by_feature.items()}


def allocate_direct(data: TenantData, features: list[str]) -> tuple[dict[str, float], float]:
    """Map Stripe `product` -> feature (case-insensitive name match).

    Returns (allocation, coverage_pct). Only revenue whose product resolves to
    a known feature is attributed; the rest is uncovered (Q10: product axis is
    known-imperfect). Features with no direct revenue get 0.
    """
    feature_by_lower = {f.lower(): f for f in features}
    allocation: dict[str, float] = {f: 0.0 for f in features}
    mapped_revenue = 0.0
    total = 0.0
    for r in data.revenue_events:
        amount = float(r.get("amount") or 0.0)
        total += amount
        product = r.get("product")
        if not product:
            continue
        feature = feature_by_lower.get(str(product).lower())
        if feature is None:
            continue
        allocation[feature] += amount
        mapped_revenue += amount
    coverage = (mapped_revenue / total * 100.0) if total > 0 else 0.0
    return allocation, coverage


# ── Orchestration: all methods + per-feature GPp1M ──────────────────────────

def _gpp1m_by_feature(
    allocation: dict[str, float],
    tokens_by_feature: dict[str, int],
    cost_by_feature: dict[str, float],
    method: str,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for feature, alloc_rev in allocation.items():
        tokens = tokens_by_feature.get(feature, 0)
        cost = cost_by_feature.get(feature, 0.0)
        gross_profit = alloc_rev - cost
        gpp1m = gross_profit / (tokens / 1e6) if tokens > 0 else None
        out[feature] = {
            "allocated_revenue": alloc_rev,
            "cost": cost,
            "gross_profit": gross_profit,
            "gpp1m": gpp1m,
            # Feature-axis provenance describes the revenue-SPLIT method: only
            # `direct` is a real (observed) split; every modeled split is
            # Modeled(method). Decided by the single authority.
            "provenance": make_provenance(method, actual=(method == "direct")),
        }
    return out


def allocate_all_methods(data: TenantData) -> dict[str, Any]:
    """Compute every available allocation method + per-feature GPp1M."""
    tokens = feature_tokens(data)
    costs = feature_cost(data)
    features = sorted(tokens)
    revenue = total_revenue(data)

    methods: dict[str, Any] = {}

    even = allocate_even_split(features, revenue)
    methods["even_split"] = {
        "allocation": even,
        "by_feature": _gpp1m_by_feature(even, tokens, costs, "even_split"),
    }

    weighted = allocate_usage_weighted({f: tokens[f] for f in features}, revenue)
    methods["usage_weighted"] = {
        "allocation": weighted,
        "by_feature": _gpp1m_by_feature(weighted, tokens, costs, "usage_weighted"),
    }

    direct_alloc, direct_coverage = allocate_direct(data, features)
    if direct_coverage > 0:
        methods["direct"] = {
            "allocation": direct_alloc,
            "by_feature": _gpp1m_by_feature(direct_alloc, tokens, costs, "direct"),
            "coverage_pct": direct_coverage,
        }

    return {
        "features": features,
        "total_revenue": revenue,
        "feature_tokens": tokens,
        "feature_cost": costs,
        "methods": methods,
    }
