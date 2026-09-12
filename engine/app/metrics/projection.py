"""Server-side entitlement projection (E5 gating).

The gating rule: a FREE-tier client must never receive paid data over the wire
(no per-customer profit, no which-features-are-volatile). This module projects
a stored audit_runs result down to the fields a tier is entitled to. It runs
engine-side (service role); the app calls it and only ever renders what it
returns — UI hiding is NOT gating.

Free projection reveals only:
  - spend_per_1m_by_model (cost axis — benign)
  - one headline finding (derived from the cost/model axis)
  - flagged_count (the COUNT of volatile features, never which)

Paid projection reveals the full stored result + coverage + run history.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

PAID_TIERS = frozenset({"starter", "growth", "scale"})


def is_paid_tier(tier: str | None) -> bool:
    return tier in PAID_TIERS


def _spend_per_1m_by_model(result: dict[str, Any]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    by_model = result.get("cost_by_model", {}).get("by_model", {})
    for model, v in by_model.items():
        tokens = v.get("total_tokens") or 0
        cost = v.get("cost")
        out[model] = (cost / (tokens / 1e6)) if (cost is not None and tokens > 0) else None
    return out


def _headline_finding(result: dict[str, Any]) -> str:
    """A single, free-safe headline derived from the cost/model axis only."""
    cost_block = result.get("cost_by_model", {})
    by_model = cost_block.get("by_model", {})
    total = cost_block.get("total_cost") or 0.0

    best: tuple[str, float] | None = None
    for model, v in by_model.items():
        cost = v.get("cost")
        if cost is None:
            continue
        if best is None or cost > best[1]:
            best = (model, cost)

    if best and total > 0:
        pct = round(best[1] / total * 100)
        return f"{best[0]} drives {pct}% of your inference spend."

    flagged = len(result.get("sensitivity", {}).get("volatile_features", []))
    if flagged:
        return (
            f"{flagged} feature(s) show unstable profitability depending on how "
            "revenue is split across features."
        )
    return "Upload usage and connect revenue to see where your margin actually goes."


def free_projection(result: dict[str, Any]) -> dict[str, Any]:
    """Only the fields a free tier is entitled to. No paid data included."""
    return {
        "spend_per_1m_by_model": _spend_per_1m_by_model(result),
        "headline_finding": _headline_finding(result),
        "flagged_count": len(result.get("sensitivity", {}).get("volatile_features", [])),
    }


def _get_tier(supabase: Client, tenant_id: str) -> str:
    res = (
        supabase.table("tenants")
        .select("tier")
        .eq("id", tenant_id)
        .maybe_single()
        .execute()
    )
    if res is None or not res.data:
        return "free"
    return res.data.get("tier") or "free"


def _get_run(supabase: Client, tenant_id: str, run_id: str | None) -> dict[str, Any] | None:
    query = (
        supabase.table("audit_runs")
        .select("id,created_at,result,default_method,coverage")
        .eq("tenant_id", tenant_id)
    )
    if run_id:
        query = query.eq("id", run_id)
    else:
        query = query.order("created_at", desc=True).limit(1)
    res = query.execute()
    rows = res.data if res is not None and res.data else []
    return rows[0] if rows else None


def _history(supabase: Client, tenant_id: str, limit: int = 20) -> list[dict[str, Any]]:
    res = (
        supabase.table("audit_runs")
        .select("id,created_at,default_method")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data if res is not None and res.data else []


def get_projected_result(
    supabase: Client, tenant_id: str, run_id: str | None = None
) -> dict[str, Any]:
    """Resolve tier, load the requested/latest run, project by entitlement."""
    tier = _get_tier(supabase, tenant_id)
    paid = is_paid_tier(tier)

    run = _get_run(supabase, tenant_id, run_id)
    if run is None:
        return {"tier": tier, "paid": paid, "has_run": False}

    base = {
        "tier": tier,
        "paid": paid,
        "has_run": True,
        "run_id": run["id"],
        "created_at": run.get("created_at"),
        "default_method": run.get("default_method"),
    }

    if paid:
        return {
            **base,
            "result": run["result"],
            "coverage": run.get("coverage"),
            "history": _history(supabase, tenant_id),
        }

    # Free tier: only the projected teaser — no result, coverage, or history.
    return {**base, "free": free_projection(run["result"])}
