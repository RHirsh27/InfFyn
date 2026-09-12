"""Honesty acceptance tests for the Board Report.

A beautiful report that lies is a FAILED build. These tests run on a sample AuditResult
that mixes ACTUAL and MODELED figures and a VOLATILE conclusion, and prove:
  - findings carry the engine's provenance/sensitivity (not recomputed),
  - the shipped (fallback) report marks modeled figures as estimates, hedges the
    volatile conclusion, and invents no numbers,
  - the validator catches a draft that states a modeled figure as fact, asserts a
    volatile conclusion as settled, or fabricates a figure.
"""

import re

from app.metrics.board_report import (
    SYSTEM_PROMPT,
    build_findings,
    render_fallback,
    validate_report,
)


def _sample():
    # Enterprise: ACTUAL + stable (earner). Doc: MODELED + stable (small earner).
    # Free-tier: MODELED + VOLATILE (loss). Bulk: ACTUAL + stable (small loss).
    return {
        "default_method": "usage_weighted",
        "allocation": {
            "features": [
                "Enterprise Search API",
                "Doc Summarization",
                "Free-tier Autocomplete",
                "Bulk Embeddings",
            ],
            "methods": {
                "usage_weighted": {
                    "by_feature": {
                        "Enterprise Search API": {"gpp1m": 76.80, "provenance": {"method": "exact", "label": "Actual"}},
                        "Doc Summarization": {"gpp1m": 3.20, "provenance": {"method": "usage_weighted", "label": "Modeled (usage-weighted token share)"}},
                        "Free-tier Autocomplete": {"gpp1m": -8.65, "provenance": {"method": "usage_weighted", "label": "Modeled (usage-weighted token share)"}},
                        "Bulk Embeddings": {"gpp1m": -1.10, "provenance": {"method": "exact", "label": "Actual"}},
                    }
                }
            },
        },
        "sensitivity": {"volatile_features": ["Free-tier Autocomplete"], "per_feature": {}},
        "gpp1m_by_model": {"total_revenue": 5000.0, "total_tokens": 200_000_000, "by_model": {}},
        "cost_by_model": {"total_cost": 1220.0, "by_model": {}, "unpriced_models": []},
        "per_customer_profit": {"by_customer": {}, "coverage": {"revenue_matched_pct": 84.0, "customers_matched": 31}},
    }


def test_findings_carry_provenance_and_sensitivity():
    f = build_findings(_sample())
    by = {x["name"]: x for x in f["features"]}
    assert by["Enterprise Search API"]["basis"] == "ACTUAL"
    assert by["Enterprise Search API"]["stability"] == "STABLE"
    assert by["Doc Summarization"]["basis"] == "MODELED"  # carried from provenance label
    assert by["Free-tier Autocomplete"]["stability"] == "VOLATILE"  # carried from sensitivity
    assert by["Bulk Embeddings"]["basis"] == "ACTUAL"
    assert f["underwater_count"] == 2
    assert f["feature_count"] == 4


def test_shipped_report_is_honest():
    f = build_findings(_sample())
    report = render_fallback(f)

    # ACTUAL figure stated plainly.
    assert "76.80" in report
    # MODELED figure appears WITH estimate language nearby.
    assert re.search(r"(estimat|modeled|~)\S{0,45}3\.20|3\.20\S{0,45}(modeled|estimat)", report, re.I) or "~$3.20" in report
    # VOLATILE conclusion is hedged.
    assert re.search(r"(depend|method-dependent|directional|investigat)", report, re.I)
    # No invented numbers — the shipped report passes its own validator.
    assert validate_report(report, f) == []


def test_validator_catches_the_three_failure_modes():
    f = build_findings(_sample())
    bad = (
        "Doc Summarization earns $3.20 per 1M tokens. "  # modeled stated as fact
        "Free-tier Autocomplete loses $8.65 per 1M tokens. "  # volatile stated as settled
        "Enterprise Search API earns $99.99 per 1M tokens."  # fabricated figure
    )
    v = " ".join(validate_report(bad, f))
    assert "99.99" in v  # fabrication caught
    assert "Doc Summarization" in v  # modeled-as-fact caught
    assert "Free-tier Autocomplete" in v  # volatile-as-settled caught


def test_system_prompt_encodes_the_rules():
    p = SYSTEM_PROMPT.lower()
    for token in ["actual", "modeled", "volatile", "invent", "estimate", "hedge", "coverage", "cost-only", "above water"]:
        assert token in p


# ── Revenue-aware framing: zero revenue must be cost-only, never a loss verdict ──
def _zero_revenue_sample():
    # No Stripe revenue: 0% matched, 0 customers. Every feature is cost-only (negative
    # "profit" is just negative cost). Includes feature_cost/feature_tokens for cost/1M.
    costs = {"summarize": 0.22, "chat_assistant": 1.29, "doc_search": 3.95, "code_review": 4.47}
    by_feature = {
        name: {"gpp1m": -cpm, "provenance": {"method": "usage_weighted", "label": "Modeled (usage-weighted token share)"}}
        for name, cpm in costs.items()
    }
    return {
        "default_method": "usage_weighted",
        "allocation": {
            "features": list(costs),
            "feature_cost": dict(costs),
            "feature_tokens": {name: 1_000_000 for name in costs},  # cost/tokens*1e6 == cpm
            "methods": {"usage_weighted": {"by_feature": by_feature}},
        },
        "sensitivity": {"volatile_features": [], "per_feature": {}},
        "gpp1m_by_model": {"total_revenue": 0.0, "total_tokens": 4_000_000, "by_model": {}},
        "cost_by_model": {"total_cost": sum(costs.values()), "by_model": {}, "unpriced_models": []},
        "per_customer_profit": {"by_customer": {}, "coverage": {"revenue_matched_pct": 0.0, "customers_matched": 0}},
    }


def test_zero_revenue_is_cost_only_not_a_loss_verdict():
    f = build_findings(_zero_revenue_sample())
    assert f["coverage_state"] == "none"

    report = render_fallback(f)
    low = report.lower()
    # Frames the real situation and points to Stripe.
    assert "cost only" in low
    assert "connect stripe" in low
    # Shows real cost figures.
    assert "4.47" in report and "0.22" in report
    # NEVER a profit/loss verdict.
    for bad in ["above water", "underwater", "losing money", "loses money", "unprofitable", "below break-even"]:
        assert bad not in low, f"cost-only report must not say '{bad}'"
    # And it passes its own validator (the shipped report is always clean).
    assert validate_report(report, f) == []


def test_full_revenue_still_gives_profit_findings():
    f = build_findings(_sample())
    assert f["coverage_state"] == "full"
    report = render_fallback(f)
    assert validate_report(report, f) == []
    # Profit framing intact (modeled marked, real earner stated).
    assert "76.80" in report


def test_validator_catches_above_water_over_underwater():
    # The exact live bug: headline says "above water" while features are underwater.
    f = build_findings(_sample())  # full revenue, has underwater features
    bad = "All features are above water. Enterprise Search API earns $76.80 per 1M tokens."
    v = " ".join(validate_report(bad, f))
    assert "above water" in v


def test_validator_catches_loss_language_when_zero_revenue():
    f = build_findings(_zero_revenue_sample())
    bad = "All 4 features are underwater and losing money. code_review loses $4.47 per 1M tokens."
    v = " ".join(validate_report(bad, f))
    assert "verdict language" in v or "above water" in v or "underwater" in v
