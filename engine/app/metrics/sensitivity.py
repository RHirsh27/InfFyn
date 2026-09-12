"""Cross-method sensitivity / robustness (E4.4, Appendix A5) — the differentiator.

A single allocation "answer" without a stability read is not the product. For
every feature we rank it under each available method, then classify:

  - stable:   same rank across every method -> trustworthy, bet on it.
  - volatile: reorders depending on the method -> the ranking is an artifact of
              the split choice, don't bet on it.

This is the defensible claim: not "feature X is most profitable", but "feature
X is most profitable AND that holds regardless of how we split revenue".
"""

from __future__ import annotations

from typing import Any


def _rank_features_by_gpp1m(by_feature: dict[str, dict[str, Any]], features: list[str]) -> dict[str, int]:
    """Rank 1 = highest GPp1M. Features with unknown (None) GPp1M sort last."""
    ordered = sorted(
        features,
        key=lambda f: (by_feature[f]["gpp1m"] is None, -(by_feature[f]["gpp1m"] or 0.0)),
    )
    return {f: rank for rank, f in enumerate(ordered, start=1)}


def compute_sensitivity(allocation_result: dict[str, Any]) -> dict[str, Any]:
    methods: dict[str, Any] = allocation_result["methods"]
    features: list[str] = allocation_result["features"]
    method_names = list(methods)

    ranks_per_method: dict[str, dict[str, int]] = {
        m: _rank_features_by_gpp1m(methods[m]["by_feature"], features) for m in method_names
    }

    per_feature: dict[str, Any] = {}
    volatile: list[str] = []
    stable: list[str] = []

    for f in features:
        rank_by_method = {m: ranks_per_method[m][f] for m in method_names}
        gpp1m_by_method = {m: methods[m]["by_feature"][f]["gpp1m"] for m in method_names}
        allocation_by_method = {m: methods[m]["by_feature"][f]["allocated_revenue"] for m in method_names}

        ranks = list(rank_by_method.values())
        rank_range = (max(ranks) - min(ranks)) if ranks else 0
        # Stable only when the feature holds the SAME rank under every method.
        stability_class = "stable" if rank_range == 0 else "volatile"
        (volatile if stability_class == "volatile" else stable).append(f)

        per_feature[f] = {
            "allocation_by_method": allocation_by_method,
            "gpp1m_by_method": gpp1m_by_method,
            "rank_by_method": rank_by_method,
            "rank_range": rank_range,
            "stability_class": stability_class,
        }

    return {
        "methods_compared": method_names,
        "per_feature": per_feature,
        "volatile_features": sorted(volatile),
        "stable_features": sorted(stable),
        "verdict": (
            "all_stable"
            if not volatile
            else "some_volatile: feature ranking depends on the allocation method — do not bet on volatile features"
        ),
    }
