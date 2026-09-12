"""E4 Part A — GPp1M by model (exact) + per-customer profit + coverage."""

from app.metrics.data import TenantData
from app.metrics.exact_metrics import gpp1m_by_model, per_customer_profit


def _pricing():
    return [
        {"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60},
        {"model": "claude-3-sonnet", "input_per_1m": 3, "output_per_1m": 15},
    ]


def test_gpp1m_by_model_single_model_manual_calc():
    # gpt-4: cost 60 (1M in @30 + 0.5M out @60). Only model -> gets 100% of $150.
    # gross profit = 150 - 60 = 90; tokens = 1.5M; GPp1M = 90 / 1.5 = 60.
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 500_000}
        ],
        revenue_events=[{"amount": 150.0, "customer_ref": "cus_a"}],
        reference_pricing=_pricing(),
    )
    result = gpp1m_by_model(data)["by_model"]["gpt-4"]
    assert result["cost"] == 60.0
    assert result["revenue_attributable"] == 150.0
    assert result["gross_profit"] == 90.0
    assert result["gpp1m"] == 60.0
    assert result["provenance"]["label"] == "Modeled(usage_weighted_token_share)"


def test_gpp1m_by_model_two_models_token_share():
    # gpt-4: 1.5M tokens, cost 60. claude: 1.0M in tokens, cost 3. total 2.5M, rev 250.
    # gpt-4 share 0.6 -> rev 150, gp 90, GPp1M 90/1.5 = 60
    # claude share 0.4 -> rev 100, gp 97, GPp1M 97/1.0 = 97
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 500_000},
            {"model": "claude-3-sonnet", "input_tokens": 1_000_000, "output_tokens": 0},
        ],
        revenue_events=[{"amount": 250.0, "customer_ref": "cus_a"}],
        reference_pricing=_pricing(),
    )
    by_model = gpp1m_by_model(data)["by_model"]
    assert round(by_model["gpt-4"]["revenue_attributable"], 6) == 150.0
    assert round(by_model["gpt-4"]["gpp1m"], 6) == 60.0
    assert round(by_model["claude-3-sonnet"]["revenue_attributable"], 6) == 100.0
    assert round(by_model["claude-3-sonnet"]["gpp1m"], 6) == 97.0


def test_actual_cost_labeled_actual_in_gpp1m():
    data = TenantData(
        tenant_id="t",
        usage_events=[{"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 0}],
        revenue_events=[{"amount": 100.0, "customer_ref": "cus_a"}],
        cost_events=[{"model": "gpt-4", "amount": 10.0}],
        reference_pricing=_pricing(),
    )
    result = gpp1m_by_model(data)["by_model"]["gpt-4"]
    assert result["cost"] == 10.0
    assert result["provenance"]["label"] == "Actual"


def test_per_customer_profit_and_coverage():
    # cus_a: usage 1.5M tokens on gpt-4 (cost 60), revenue 150 -> profit 90.
    # cus_b: revenue 50 only (no usage) -> unmatched.
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 500_000, "customer_ref": "cus_a"}
        ],
        revenue_events=[
            {"amount": 150.0, "customer_ref": "cus_a"},
            {"amount": 50.0, "customer_ref": "cus_b"},
        ],
        reference_pricing=_pricing(),
    )
    out = per_customer_profit(data)
    assert out["by_customer"]["cus_a"]["revenue"] == 150.0
    assert round(out["by_customer"]["cus_a"]["attributed_cost"], 6) == 60.0
    assert round(out["by_customer"]["cus_a"]["profit"], 6) == 90.0
    # cus_a's cost is reference-priced (no cost_event) => MODELED, so the profit
    # is Modeled, not bare Actual (#7 both-axes rule). Numbers are unchanged.
    assert out["by_customer"]["cus_a"]["provenance"]["label"] == "Modeled(exact_customer_join)"
    assert "cus_b" not in out["by_customer"]

    cov = out["coverage"]
    assert cov["customers_matched"] == 1
    assert cov["customers_revenue_only"] == 1
    assert round(cov["revenue_matched_pct"], 4) == 75.0  # 150 / 200
    assert cov["usage_matched_pct"] == 100.0


# ── Provenance both-axes rule (#7): Actual only when cost is actual too ───────

def test_per_customer_actual_only_when_cost_is_actual():
    base_usage = [
        {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 0, "customer_ref": "cus_a"}
    ]
    base_revenue = [{"amount": 100.0, "customer_ref": "cus_a"}]

    # Actual cost (observed cost_event) -> Actual.
    actual = per_customer_profit(TenantData(
        tenant_id="t",
        usage_events=base_usage,
        revenue_events=base_revenue,
        cost_events=[{"model": "gpt-4", "amount": 10.0}],
        reference_pricing=_pricing(),
    ))
    assert actual["by_customer"]["cus_a"]["provenance"]["label"] == "Actual"

    # Modeled cost (reference pricing, no cost_event) -> Modeled, not Actual.
    modeled = per_customer_profit(TenantData(
        tenant_id="t",
        usage_events=base_usage,
        revenue_events=base_revenue,
        reference_pricing=_pricing(),
    ))
    assert modeled["by_customer"]["cus_a"]["provenance"]["label"] == "Modeled(exact_customer_join)"


def test_per_customer_modeled_if_any_contributing_cost_is_modeled():
    # gpt-4 has an actual cost_event; claude is reference-priced (modeled).
    # A customer using both has a partly-modeled cost => never bare Actual.
    out = per_customer_profit(TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 0, "customer_ref": "cus_a"},
            {"model": "claude-3-sonnet", "input_tokens": 1_000_000, "output_tokens": 0, "customer_ref": "cus_a"},
        ],
        revenue_events=[{"amount": 100.0, "customer_ref": "cus_a"}],
        cost_events=[{"model": "gpt-4", "amount": 10.0}],
        reference_pricing=_pricing(),
    ))
    assert out["by_customer"]["cus_a"]["provenance"]["label"] == "Modeled(exact_customer_join)"
