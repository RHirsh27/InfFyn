"""Metric definitions — wire compute functions into the registry.

Importing this module registers all v1 metrics. Each entry is a definition
(name, inputs, compute_fn, output_shape); adding one here is the only step
needed to expose a new metric.
"""

from __future__ import annotations

from app.metrics.allocation import allocate_all_methods
from app.metrics.cost import cost_by_model_payload
from app.metrics.data import TenantData
from app.metrics.exact_metrics import gpp1m_by_model, per_customer_profit
from app.metrics.registry import Metric, registry
from app.metrics.sensitivity import compute_sensitivity


def _feature_sensitivity(data: TenantData):
    return compute_sensitivity(allocate_all_methods(data))

registry.register(
    Metric(
        name="cost_by_model",
        inputs=("usage_events", "cost_events", "reference_pricing"),
        compute_fn=cost_by_model_payload,
        output_shape="{by_model: {model: {tokens, cost, cost_source}}, total_cost, unpriced_models}",
    )
)

registry.register(
    Metric(
        name="gpp1m_by_model",
        inputs=("usage_events", "revenue_events", "cost_events", "reference_pricing"),
        compute_fn=gpp1m_by_model,
        output_shape="{by_model: {model: {gpp1m, gross_profit, revenue_attributable, cost, provenance}}}",
    )
)

registry.register(
    Metric(
        name="per_customer_profit",
        inputs=("usage_events", "revenue_events", "cost_events", "reference_pricing"),
        compute_fn=per_customer_profit,
        output_shape="{by_customer: {customer: {revenue, attributed_cost, profit}}, coverage}",
    )
)

registry.register(
    Metric(
        name="feature_allocation",
        inputs=("usage_events", "revenue_events", "cost_events", "reference_pricing"),
        compute_fn=allocate_all_methods,
        output_shape="{features, total_revenue, methods: {even_split, usage_weighted, direct?}}",
    )
)

registry.register(
    Metric(
        name="feature_sensitivity",
        inputs=("usage_events", "revenue_events", "cost_events", "reference_pricing"),
        compute_fn=_feature_sensitivity,
        output_shape="{per_feature: {feature: {rank_by_method, gpp1m_by_method, stability_class}}, volatile_features, stable_features}",
    )
)
