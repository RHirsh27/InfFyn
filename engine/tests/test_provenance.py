"""The single-authority guarantee for provenance labels.

Proves (1) `make_provenance` is the one place the Actual/Modeled label string is
decided, and (2) no cost-bearing emission path (model axis, per-customer) labels
a number "Actual" when its cost is modeled. (The feature-axis `direct` label is
a statement about the revenue SPLIT being real, and is intentionally Actual on
that basis — see allocation.py.)
"""

from app.metrics.data import TenantData
from app.metrics.exact_metrics import gpp1m_by_model, per_customer_profit
from app.metrics.provenance import make_provenance


def test_make_provenance_is_the_label_authority():
    assert make_provenance("direct", actual=True) == {"method": "direct", "label": "Actual"}
    assert make_provenance("even_split", actual=False) == {
        "method": "even_split",
        "label": "Modeled(even_split)",
    }
    assert (
        make_provenance("exact_customer_join", actual=False)["label"]
        == "Modeled(exact_customer_join)"
    )


def test_no_actual_on_modeled_cost_across_cost_bearing_axes():
    # Reference-priced only (no cost_events) => every cost is MODELED. No
    # cost-bearing number (model axis or per-customer) may read "Actual".
    data = TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4", "input_tokens": 1_000_000, "output_tokens": 0, "customer_ref": "cus_a"},
        ],
        revenue_events=[{"amount": 100.0, "customer_ref": "cus_a"}],
        reference_pricing=[{"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60}],
    )

    model_axis = gpp1m_by_model(data)["by_model"]
    assert model_axis and all(m["provenance"]["label"] != "Actual" for m in model_axis.values())

    per_cust = per_customer_profit(data)["by_customer"]
    assert per_cust and all(c["provenance"]["label"] != "Actual" for c in per_cust.values())
