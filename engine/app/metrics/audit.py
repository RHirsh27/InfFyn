"""Audit run orchestration (E4, Part B).

Ties the metrics together into one tenant-scoped run: cost, GPp1M by model,
feature allocation under every method, sensitivity, per-customer profit +
coverage, all provenance-tagged. Persists the full result to `audit_runs`
(tenant-scoped, retained) and writes a zero-PII aggregate to `audit_aggregates`
(coarse buckets only — no tenant_id, no customer_ref, no raw amounts).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.metrics.allocation import allocate_all_methods
from app.metrics.cost import cost_by_model_payload
from app.metrics.data import TenantData, load_tenant_data
from app.metrics.exact_metrics import gpp1m_by_model, per_customer_profit
from app.metrics.sensitivity import compute_sensitivity

DEFAULT_METHOD = "usage_weighted"

METHODOLOGY = (
    "Feature-level revenue splits are ESTIMATES, not ground truth: the customer "
    "buys a bundle, so no per-feature revenue exists. We report every method "
    "(even_split, usage_weighted) and a cross-method sensitivity read. Only "
    "`direct` results (a Stripe product mapped to a feature) are labeled Actual. "
    "Per-customer profit and GPp1M-by-model are exact where the data joins; "
    "coverage is reported. cost_proportional is intentionally not offered."
)


def _bucket_spend(total_cost: float) -> str:
    if total_cost < 100:
        return "<100"
    if total_cost < 1_000:
        return "100-1k"
    if total_cost < 10_000:
        return "1k-10k"
    if total_cost < 100_000:
        return "10k-100k"
    return "100k+"


def _bucket_volume(total_tokens: int) -> str:
    if total_tokens < 1_000_000:
        return "<1M"
    if total_tokens < 10_000_000:
        return "1M-10M"
    if total_tokens < 100_000_000:
        return "10M-100M"
    if total_tokens < 1_000_000_000:
        return "100M-1B"
    return "1B+"


def _token_share_mix(tokens_by_key: dict[str, int]) -> dict[str, float]:
    total = sum(tokens_by_key.values())
    if total <= 0:
        return {}
    return {k: round(v / total * 100.0, 1) for k, v in sorted(tokens_by_key.items())}


def build_result(data: TenantData) -> dict[str, Any]:
    cost = cost_by_model_payload(data)
    gpp1m_model = gpp1m_by_model(data)
    customer = per_customer_profit(data)
    allocation = allocate_all_methods(data)
    sensitivity = compute_sensitivity(allocation)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "default_method": DEFAULT_METHOD,
        "cost_by_model": cost,
        "gpp1m_by_model": gpp1m_model,
        "per_customer_profit": customer,
        "allocation": allocation,
        "sensitivity": sensitivity,
        "methodology": METHODOLOGY,
    }


def build_coverage(result: dict[str, Any]) -> dict[str, Any]:
    direct = result["allocation"]["methods"].get("direct")
    return {
        "customer_join": result["per_customer_profit"]["coverage"],
        "direct_revenue_pct": direct["coverage_pct"] if direct else 0.0,
        "unpriced_models": result["cost_by_model"]["unpriced_models"],
    }


def build_aggregate_row(result: dict[str, Any]) -> dict[str, Any]:
    """Zero-PII substrate row: coarse buckets + non-identifying mixes only.

    Carries no tenant_id, no customer_ref, no raw revenue amounts. Model and
    feature names are public/non-identifying; only ratios and buckets are kept.
    """
    cost = result["cost_by_model"]
    allocation = result["allocation"]

    model_tokens = {m: v["total_tokens"] for m, v in cost["by_model"].items()}
    gpp1m_by_model_ratios = {
        m: (round(v["gpp1m"], 4) if v["gpp1m"] is not None else None)
        for m, v in result["gpp1m_by_model"]["by_model"].items()
    }

    total_tokens = sum(model_tokens.values())
    return {
        "gpp1m_by_model": gpp1m_by_model_ratios,
        "model_mix": _token_share_mix(model_tokens),
        "segment_mix": _token_share_mix(allocation["feature_tokens"]),  # feature token-share, non-PII
        "spend_bucket": _bucket_spend(cost["total_cost"]),
        "volume_bucket": _bucket_volume(total_tokens),
        "company_stage": None,  # not collected in v1
    }


def run_audit(supabase: Client, tenant_id: str) -> dict[str, Any]:
    """Load canonical data, compute the full audit, persist, return result."""
    data = load_tenant_data(supabase, tenant_id)
    result = build_result(data)
    coverage = build_coverage(result)

    insert = (
        supabase.table("audit_runs")
        .insert(
            {
                "tenant_id": tenant_id,
                "result": result,
                "default_method": DEFAULT_METHOD,
                "coverage": coverage,
            }
        )
        .execute()
    )
    run_id = insert.data[0]["id"] if insert is not None and insert.data else None

    # Anonymized substrate write — best-effort, never leaks PII.
    supabase.table("audit_aggregates").insert(build_aggregate_row(result)).execute()

    return {"run_id": run_id, "coverage": coverage, **result}
