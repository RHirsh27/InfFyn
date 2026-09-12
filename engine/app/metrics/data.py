"""Tenant-scoped canonical data loader (Q7).

The metrics engine reads ONLY these normalized tables. Every tenant table is
filtered by an explicit `tenant_id` (the engine uses the service role, which
bypasses RLS — so the filter is the tenancy guarantee, not RLS). Reference
pricing is global reference data and is not tenant-filtered.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from supabase import Client

# Columns pulled per canonical table. Kept explicit so the engine never
# accidentally reads a raw/source column it should not depend on.
_USAGE_COLS = "model,feature,input_tokens,output_tokens,quantity,customer_ref,occurred_at"
_REVENUE_COLS = "amount,customer_ref,product,occurred_at,currency"
_COST_COLS = "amount,model,cost_category,customer_ref,occurred_at,currency"
_PRICING_COLS = "model,input_per_1m,output_per_1m,source,captured_at"

_PAGE = 1000

# Deterministic pagination order per table (Fix #4). Every `.range()` fetch
# must use a stable sort with a unique tiebreaker (`id`) so pages cannot
# overlap or skip rows when a tenant exceeds one page (~1,000 rows).
_ORDER_BY_TABLE: dict[str, tuple[str, ...]] = {
    "usage_events": ("occurred_at", "id"),
    "revenue_events": ("occurred_at", "id"),
    "cost_events": ("occurred_at", "id"),
    "reference_pricing": ("model", "id"),
}


def _apply_order(query: Any, table: str) -> Any:
    for column in _ORDER_BY_TABLE.get(table, ("id",)):
        query = query.order(column)
    return query


@dataclass
class TenantData:
    tenant_id: str
    usage_events: list[dict[str, Any]] = field(default_factory=list)
    revenue_events: list[dict[str, Any]] = field(default_factory=list)
    cost_events: list[dict[str, Any]] = field(default_factory=list)
    reference_pricing: list[dict[str, Any]] = field(default_factory=list)

    def pricing_by_model(self) -> dict[str, dict[str, float]]:
        out: dict[str, dict[str, float]] = {}
        for row in self.reference_pricing:
            model = row.get("model")
            if not model:
                continue
            out[model] = {
                "input_per_1m": float(row.get("input_per_1m") or 0.0),
                "output_per_1m": float(row.get("output_per_1m") or 0.0),
                "source": row.get("source"),
                "captured_at": row.get("captured_at"),
            }
        return out


def _fetch_all(supabase: Client, table: str, columns: str, tenant_id: str | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        query = supabase.table(table).select(columns)
        if tenant_id is not None:
            query = query.eq("tenant_id", tenant_id)
        query = _apply_order(query, table)
        result = query.range(start, start + _PAGE - 1).execute()
        batch = result.data if result is not None and result.data else []
        rows.extend(batch)
        if len(batch) < _PAGE:
            break
        start += _PAGE
    return rows


def load_tenant_data(supabase: Client, tenant_id: str) -> TenantData:
    """Load all canonical inputs for one tenant + global reference pricing."""
    return TenantData(
        tenant_id=tenant_id,
        usage_events=_fetch_all(supabase, "usage_events", _USAGE_COLS, tenant_id),
        revenue_events=_fetch_all(supabase, "revenue_events", _REVENUE_COLS, tenant_id),
        cost_events=_fetch_all(supabase, "cost_events", _COST_COLS, tenant_id),
        reference_pricing=_fetch_all(supabase, "reference_pricing", _PRICING_COLS, None),
    )
