import csv
import io
from decimal import Decimal

import pytest

from app.v2.contract import AuditInput
from app.v2.economics import (
    AuditError,
    calculate,
    fingerprint,
    preview,
    report,
    sensitivity,
)


def csv_text(headers, rows):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers.split(","))
    writer.writerows(rows)
    return out.getvalue()


def audit(**updates):
    values = dict(
        kind="product",
        period_start="2026-08-01",
        period_end="2026-08-31",
        usage_csv=csv_text(
            "event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,feature,run_id,billed_cost,cost_source",
            [
                [
                    "u1",
                    "2026-08-02",
                    "test",
                    "small",
                    100,
                    20,
                    1,
                    "c1",
                    "chat",
                    "r1",
                    "2",
                    "provider export",
                ],
                [
                    "u2",
                    "2026-08-02",
                    "test",
                    "large",
                    200,
                    40,
                    1,
                    "c2",
                    "search",
                    "r2",
                    "9",
                    "provider export",
                ],
            ],
        ),
    )
    values.update(updates)
    return AuditInput(**values)


def revenue(rows):
    return dict(
        revenue_csv=csv_text(
            "revenue_id,date,amount,currency,customer_id,feature,method", rows
        ),
        revenue_reviewed=True,
        revenue_source="reviewed_file",
        revenue_basis="recognized",
    )


def test_directionality_refunds_and_dimensions_reconcile():
    a = audit(
        **revenue(
            [
                ["sale1", "2026-08-02", 30, "USD", "c1", "chat", "direct"],
                ["sale2", "2026-08-02", 5, "USD", "c2", "search", "direct"],
                ["refund1", "2026-08-03", -1, "USD", "c2", "search", "direct"],
            ]
        )
    )
    r = calculate(a)
    assert r["summary"]["known_cost"] == "11"
    assert r["summary"]["contribution"] == "23"
    assert r["mapping_coverage"]["customer_id"]["unmapped_revenue"] == "0"
    for groups in r["groups"].values():
        assert sum(Decimal(g["known_cost"]) for g in groups) == 11
        assert sum(Decimal(g["revenue"] or "0") for g in groups) == 34
    assert {f.get("name") for f in r["findings"]} == {"c2", "search"}
    assert (
        next(g for g in r["groups"]["model"] if g["name"] == "small")["revenue"] is None
    )
    assert report(r)["facts_fingerprint"] == fingerprint(a)
    assert calculate(a) == r


def test_unknown_cost_never_zero_profit():
    a = audit(
        usage_csv=audit().usage_csv.replace(",9,provider export", ",,provider export"),
        **revenue([["sale", "2026-08-02", 30, "USD", "c2", "search", "direct"]]),
    )
    r = calculate(a)
    assert r["summary"]["known_cost"] == "2"
    assert r["summary"]["unknown_cost_rows"] == 1
    assert r["summary"]["contribution"] is None
    assert (
        next(g for g in r["groups"]["feature"] if g["name"] == "search")["contribution"]
        is None
    )


def test_effective_rates_cache_and_unblended_dimensions():
    usage = csv_text(
        "event_id,date,provider,model,input_tokens,output_tokens,cached_input_tokens,requests,feature",
        [
            ["a", "2026-08-01", "p", "m", 1000000, 0, 500000, 1, "input"],
            ["b", "2026-08-01", "p", "m", 0, 1000000, 0, 1, "output"],
        ],
    )
    rates = csv_text(
        "rate_id,provider,model,effective_from,effective_to,input_per_million,output_per_million,cached_input_per_million,currency,source",
        [
            [
                "v1",
                "p",
                "m",
                "2026-08-01",
                "2026-08-31",
                2,
                10,
                1,
                "USD",
                "test contract",
            ]
        ],
    )
    r = calculate(audit(usage_csv=usage, rates_csv=rates))
    assert r["summary"]["known_cost"] == "11.5"
    assert [g["known_cost"] for g in r["groups"]["feature"]] == ["1.5", "10"]
    assert r["summary"]["basis"] == "Modeled"
    assert r["trace"][0]["rate_id"] == "v1"


@pytest.mark.parametrize(
    "value", ["NaN", "Infinity", "-1", "1.5", "", "nonsense", "1e100"]
)
def test_invalid_counts_fail_with_field(value):
    a = audit(usage_csv=audit().usage_csv.replace(",100,20,", f",{value},20,"))
    with pytest.raises(AuditError, match="input_tokens"):
        calculate(a)


def test_internal_failed_work_included_and_capacity_is_not_cash():
    a = audit(
        kind="internal",
        cost_scope_complete=True,
        outcome_cohort_complete=True,
        outcomes_csv="run_id,status,accepted_quantity,baseline_minutes,after_minutes,loaded_hourly_rate\nr1,accepted,1,30,10,60\nr2,failed,0,30,40,60\n",
    )
    r = calculate(a)
    assert r["summary"]["revenue"] is None and r["summary"]["contribution"] is None
    assert r["outcomes"]["cost_per_accepted_outcome"] == "11"
    assert r["outcomes"]["modeled_capacity_value"] == "10"
    assert "not realized cash" in r["outcomes"]["capacity_basis"]
    incomplete = calculate(a.model_copy(update={"outcome_cohort_complete": False}))
    assert incomplete["outcomes"]["cost_per_accepted_outcome"] is None


def test_unknown_cost_or_unmapped_cost_withholds_outcome_ratio():
    a = audit(
        kind="internal",
        cost_scope_complete=True,
        outcome_cohort_complete=True,
        outcomes_csv="run_id,status,accepted_quantity\nr1,accepted,1\nr2,rejected,0\n",
        costs_csv="cost_id,date,category,amount,currency,source\nc1,2026-08-02,human_review,40,USD,timesheet\n",
    )
    assert calculate(a)["outcomes"]["cost_per_accepted_outcome"] is None


def test_revenue_review_and_internal_revenue_fail_closed():
    with pytest.raises(ValueError, match="Review the revenue"):
        audit(revenue_csv="data")
    with pytest.raises(ValueError, match="do not use revenue"):
        audit(
            kind="internal",
            **revenue([["x", "2026-08-01", 1, "USD", "c1", "chat", "direct"]]),
        )


def test_preview_has_no_profit_revenue_or_customer_data():
    p = preview(
        calculate(
            audit(
                **revenue(
                    [["x", "2026-08-01", 1, "USD", "secret-customer", "chat", "direct"]]
                )
            )
        )
    )
    assert set(p) == {
        "calculation_version",
        "kind",
        "currency",
        "known_cost",
        "unknown_cost_rows",
        "tokens",
        "requests",
        "cost_components",
        "usage_rows",
        "basis",
    }
    assert "secret-customer" not in str(p)


def test_duplicate_outside_period_currency_and_bad_rows():
    base = audit().usage_csv
    for text, code in [
        (base + base.splitlines()[1] + "\n", "duplicate_id"),
        (base.replace("2026-08-02", "2026-09-01"), "outside_period"),
        (base.replace("100,20", "100,20,30"), "invalid_row"),
    ]:
        with pytest.raises(AuditError) as err:
            calculate(audit(usage_csv=text))
        assert err.value.code == code
    with pytest.raises(AuditError, match="USD only"):
        calculate(
            audit(**revenue([["x", "2026-08-01", 1, "EUR", "c1", "chat", "direct"]]))
        )


def test_explicit_feature_allocation_conserves_and_exposes_sensitivity():
    usage = (
        audit().usage_csv.replace("c2,search", "c1,search").replace(",40,1,", ",40,9,")
    )
    a = audit(
        usage_csv=usage,
        feature_allocation="requests",
        **revenue([["x", "2026-08-01", 20, "USD", "c1", "", "direct"]]),
    )
    r = calculate(a)
    assert sum(Decimal(g["revenue"] or "0") for g in r["groups"]["feature"]) == 20
    assert all(g["basis"] == "Modeled" for g in r["groups"]["feature"])
    assert sensitivity(a, r)["status"] == "compared"
    assert any(
        g["classification"] == "method-dependent" for g in sensitivity(a, r)["features"]
    )


def test_rate_overlaps_rejected_and_historical_hash_changes():
    rates = "rate_id,provider,model,effective_from,effective_to,input_per_million,output_per_million,cached_input_per_million,currency,source\nv1,p,m,2026-08-01,2026-08-31,1,2,0,USD,test\nv2,p,m,2026-08-15,2026-08-31,2,3,0,USD,test\n"
    with pytest.raises(AuditError, match="overlapping"):
        calculate(audit(rates_csv=rates))
    assert fingerprint(audit()) != fingerprint(audit(title="Restated"))


def test_customer_cohort_association_includes_costs_and_revenue():
    a = audit(
        usage_csv=audit()
        .usage_csv.replace("cost_source", "cost_source,customer_segment")
        .replace("provider export", "provider export,growth"),
        costs_csv="cost_id,date,category,amount,currency,source,customer_id\nc1,2026-08-02,tools,4,USD,bill,c1\n",
        **revenue([["x", "2026-08-01", 20, "USD", "c1", "chat", "direct"]]),
    )
    groups = calculate(a)["groups"]["customer_segment"]
    assert len(groups) == 1 and groups[0]["name"] == "growth"
    assert groups[0]["known_cost"] == "15" and groups[0]["revenue"] == "20"


def test_credit_does_not_make_mapping_coverage_exceed_100_percent():
    a = audit(
        costs_csv="cost_id,date,category,amount,currency,source\ncredit,2026-08-02,tools,-10,USD,credit note\n"
    )
    coverage = calculate(a)["mapping_coverage"]["customer_id"][
        "known_cost_mapped_percent"
    ]
    assert 0 <= Decimal(coverage) <= 100
