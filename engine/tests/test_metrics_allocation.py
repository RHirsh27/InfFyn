"""E4 Part B — allocation methods + cross-method sensitivity.

Sample data is engineered so even_split and usage_weighted produce DIFFERENT
feature rankings (the top feature flips between `premium` and `chat`), while
`search` and `whale` hold their rank. The sensitivity output must flag the
first two as volatile and the last two as stable.
"""

from app.metrics.allocation import (
    allocate_all_methods,
    allocate_direct,
    allocate_even_split,
    allocate_usage_weighted,
)
from app.metrics.data import TenantData
from app.metrics.sensitivity import compute_sensitivity


def _pricing():
    return [
        {"model": "gpt-4", "input_per_1m": 30, "output_per_1m": 60},
        {"model": "gpt-4o", "input_per_1m": 2.5, "output_per_1m": 10},
        {"model": "gpt-4o-mini", "input_per_1m": 0.15, "output_per_1m": 0.60},
        {"model": "claude-3-sonnet", "input_per_1m": 3, "output_per_1m": 15},
    ]


def _sample_data(product: str | None = None):
    return TenantData(
        tenant_id="t",
        usage_events=[
            {"model": "gpt-4o-mini", "feature": "chat", "input_tokens": 1_500_000, "output_tokens": 500_000, "customer_ref": "cus_x"},
            {"model": "gpt-4o", "feature": "premium", "input_tokens": 100_000, "output_tokens": 100_000, "customer_ref": "cus_x"},
            {"model": "claude-3-sonnet", "feature": "search", "input_tokens": 1_000_000, "output_tokens": 1_000_000, "customer_ref": "cus_x"},
            {"model": "gpt-4", "feature": "whale", "input_tokens": 2_000_000, "output_tokens": 2_000_000, "customer_ref": "cus_x"},
        ],
        revenue_events=[{"amount": 300.0, "customer_ref": "cus_x", "product": product}],
        reference_pricing=_pricing(),
    )


# ── Pure method unit tests ──────────────────────────────────────────────────

def test_even_split_divides_equally():
    alloc = allocate_even_split(["a", "b", "c", "d"], 300.0)
    assert alloc == {"a": 75.0, "b": 75.0, "c": 75.0, "d": 75.0}


def test_usage_weighted_matches_token_share():
    alloc = allocate_usage_weighted({"a": 2_000_000, "b": 2_000_000}, 100.0)
    assert alloc == {"a": 50.0, "b": 50.0}


def test_direct_maps_product_to_feature_and_reports_coverage():
    data = _sample_data(product="premium")
    alloc, coverage = allocate_direct(data, ["chat", "premium", "search", "whale"])
    assert alloc["premium"] == 300.0
    assert alloc["chat"] == 0.0
    assert coverage == 100.0


# ── Ranking flip + sensitivity classification ────────────────────────────────

def _ranking(method_block, features):
    ordered = sorted(
        features,
        key=lambda f: (method_block["by_feature"][f]["gpp1m"] is None, -(method_block["by_feature"][f]["gpp1m"] or 0.0)),
    )
    return ordered


def test_even_and_usage_weighted_produce_different_rankings():
    result = allocate_all_methods(_sample_data())
    features = result["features"]
    even_rank = _ranking(result["methods"]["even_split"], features)
    usage_rank = _ranking(result["methods"]["usage_weighted"], features)

    assert even_rank[0] == "premium"   # few tokens win under equal split
    assert usage_rank[0] == "chat"     # cheapest per-token wins under usage share
    assert even_rank != usage_rank     # the differentiator: the ranking flips


def test_sensitivity_flags_volatile_and_stable():
    result = allocate_all_methods(_sample_data())
    sens = compute_sensitivity(result)

    assert sens["volatile_features"] == ["chat", "premium"]
    assert sens["stable_features"] == ["search", "whale"]

    # premium reorders (rank 1 -> 2), whale holds (rank 4 -> 4)
    assert sens["per_feature"]["premium"]["stability_class"] == "volatile"
    assert sens["per_feature"]["premium"]["rank_by_method"]["even_split"] == 1
    assert sens["per_feature"]["premium"]["rank_by_method"]["usage_weighted"] == 2
    assert sens["per_feature"]["whale"]["stability_class"] == "stable"
    assert sens["per_feature"]["whale"]["rank_range"] == 0


def test_provenance_actual_only_on_direct():
    result = allocate_all_methods(_sample_data(product="premium"))
    even = result["methods"]["even_split"]["by_feature"]["chat"]
    usage = result["methods"]["usage_weighted"]["by_feature"]["chat"]
    direct = result["methods"]["direct"]["by_feature"]["premium"]

    assert even["provenance"]["label"] == "Modeled(even_split)"
    assert usage["provenance"]["label"] == "Modeled(usage_weighted)"
    assert direct["provenance"]["label"] == "Actual"


def test_cost_proportional_is_never_a_method():
    result = allocate_all_methods(_sample_data(product="premium"))
    assert "cost_proportional" not in result["methods"]
