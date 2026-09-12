"""E4 Part A — cost computation (prefer-actual) hand-checks."""

from app.metrics.cost import compute_cost_by_model
from app.metrics.data import TenantData


def _pricing():
    return [
        {"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60},
        {"model": "claude-3-sonnet", "input_per_1m": 3, "output_per_1m": 15},
    ]


def test_modeled_cost_hand_check():
    # gpt-4: 1,000,000 input @ $30/1M + 500,000 output @ $60/1M = 30 + 30 = 60.00
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 500_000}
        ],
        reference_pricing=_pricing(),
    )
    costs = compute_cost_by_model(data)
    assert costs["gpt-4"].cost == 60.0
    assert costs["gpt-4"].cost_source == "modeled"
    assert costs["gpt-4"].total_tokens == 1_500_000


def test_prefer_actual_beats_modeled():
    # A real cost_event for gpt-4 must win over the reference-price estimate.
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 500_000}
        ],
        cost_events=[{"model": "gpt-4", "amount": 42.0, "cost_category": "inference"}],
        reference_pricing=_pricing(),
    )
    costs = compute_cost_by_model(data)
    assert costs["gpt-4"].cost == 42.0
    assert costs["gpt-4"].cost_source == "actual"


def test_unpriced_model_flagged_not_guessed():
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "mystery-model", "input_tokens": 100, "output_tokens": 100}
        ],
        reference_pricing=_pricing(),
    )
    costs = compute_cost_by_model(data)
    assert costs["mystery-model"].cost is None
    assert costs["mystery-model"].cost_source == "unpriced"
