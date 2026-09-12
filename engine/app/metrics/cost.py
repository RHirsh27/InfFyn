"""Cost computation (E4.4, prefer-actual).

For each model, cost = the actual `cost_event` total if one exists for that
model, else it is computed from usage tokens x reference pricing
(input_tokens/1e6 * input_per_1m + output_tokens/1e6 * output_per_1m).

Every model's cost carries a `cost_source` tag: "actual" (real cost_event),
"modeled" (reference pricing), or "unpriced" (no cost_event and no reference
price — cost cannot be estimated, reported as null and flagged).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.metrics.data import TenantData


@dataclass(frozen=True)
class ModelCost:
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost: float | None
    cost_source: str  # "actual" | "modeled" | "unpriced"

    @property
    def cost_per_token(self) -> float:
        if self.cost is None or self.total_tokens <= 0:
            return 0.0
        return self.cost / self.total_tokens


def _actual_cost_by_model(data: TenantData) -> dict[str, float]:
    """Sum actual cost_events by model (inference/cogs costs with a model tag)."""
    totals: dict[str, float] = {}
    for row in data.cost_events:
        model = row.get("model")
        amount = row.get("amount")
        if not model or amount is None:
            continue
        totals[model] = totals.get(model, 0.0) + float(amount)
    return totals


def _usage_tokens_by_model(data: TenantData) -> dict[str, tuple[int, int]]:
    """(input_tokens, output_tokens) summed per model."""
    totals: dict[str, list[int]] = {}
    for row in data.usage_events:
        model = row.get("model")
        if not model:
            continue
        agg = totals.setdefault(model, [0, 0])
        agg[0] += int(row.get("input_tokens") or 0)
        agg[1] += int(row.get("output_tokens") or 0)
    return {m: (v[0], v[1]) for m, v in totals.items()}


def compute_cost_by_model(data: TenantData) -> dict[str, ModelCost]:
    """Prefer-actual cost per model, tagged with its provenance."""
    actual = _actual_cost_by_model(data)
    tokens = _usage_tokens_by_model(data)
    pricing = data.pricing_by_model()

    # Every model seen in usage OR in an actual cost event gets a row.
    models = set(tokens) | set(actual)
    out: dict[str, ModelCost] = {}
    for model in models:
        in_tok, out_tok = tokens.get(model, (0, 0))
        total = in_tok + out_tok

        if model in actual:
            out[model] = ModelCost(
                model=model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                total_tokens=total,
                cost=actual[model],
                cost_source="actual",
            )
            continue

        price = pricing.get(model)
        if price is None:
            out[model] = ModelCost(
                model=model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                total_tokens=total,
                cost=None,
                cost_source="unpriced",
            )
            continue

        cost = in_tok / 1e6 * price["input_per_1m"] + out_tok / 1e6 * price["output_per_1m"]
        out[model] = ModelCost(
            model=model,
            input_tokens=in_tok,
            output_tokens=out_tok,
            total_tokens=total,
            cost=cost,
            cost_source="modeled",
        )
    return out


def cost_by_model_payload(data: TenantData) -> dict[str, Any]:
    by_model = compute_cost_by_model(data)
    return {
        "by_model": {
            m: {
                "input_tokens": mc.input_tokens,
                "output_tokens": mc.output_tokens,
                "total_tokens": mc.total_tokens,
                "cost": mc.cost,
                "cost_source": mc.cost_source,
            }
            for m, mc in sorted(by_model.items())
        },
        "total_cost": sum(mc.cost for mc in by_model.values() if mc.cost is not None),
        "unpriced_models": sorted(m for m, mc in by_model.items() if mc.cost_source == "unpriced"),
    }
