"""Exercise the exact downloadable files, including safe failures and independent money controls."""

import csv
import importlib.util
import io
import json
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile

import pytest
from app.import_review.core import Decision, Rules, digest, profile, spreadsheet_csv
from app.monthly.contract import MonthlyAudit, MonthlyInput
from app.monthly.economics import calculate_month
from app.v2.economics import AuditError, calculate

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "app/public/examples/csv-test-pack"
ARCHIVE = PACK.parent / "InfFyn-CSV-test-pack.zip"
PREFIX = "InfFyn-CSV-test-pack/"
LEVELS = ("01-clean-control", "02-decent", "03-messy", "04-very-messy")


def content(path):
    with ZipFile(ARCHIVE) as bundle:
        return bundle.read(PREFIX + path)


def spec(path):
    return json.loads(content(path))


def review(level, filename, *, decisions=True, changes=None):
    recipe = spec(f"{level}/{filename.removesuffix('.csv')}.review.json")
    rules = Rules.model_validate(recipe["rules"] | (changes or {}))
    return profile(
        content(f"{level}/{filename}"),
        recipe["kind"],
        "2026-08",
        rules,
        [Decision.model_validate(d) for d in recipe["decisions"]] if decisions else [],
    )


def body(level):
    definitions = spec("reference/workloads.json")
    settings = spec(f"{level}/settings-reference.json")
    workloads = []
    for item in settings["workloads"]:
        slug = item["slug"]
        audit = item["audit"] | {
            "costs_csv": review(level, slug + "-costs.csv")["canonical_csv"],
            "outcomes_csv": content(f"shared/{slug}-outcomes.csv").decode(),
            "revenue_csv": review(level, "research-collections.csv")["canonical_csv"]
            if slug == "research"
            else "",
        }
        workloads.append(
            {
                "workload_id": definitions[slug]["id"],
                "audit": audit,
                "review": item["review"],
            }
        )
    return MonthlyInput.model_validate(
        {"month": "2026-08", "company_scope_complete": True, "workloads": workloads}
    ), {v["id"]: v for v in definitions.values()}


@pytest.mark.parametrize("level", LEVELS)
def test_all_levels_match_independent_economics_after_review(level):
    request, definitions = body(level)
    result = calculate_month(request, definitions)
    assert Decimal(result["summary"]["known_cost"]) == 43200
    by_kind = {w["workload"]["kind"]: w for w in result["workloads"]}
    product, internal = by_kind["product"], by_kind["internal"]
    for item, cost, accepted, unit_cost in [
        (product, 32000, 4000, "8"),
        (internal, 11200, 8000, "1.4"),
    ]:
        assert Decimal(item["summary"]["known_cost"]) == cost
        assert Decimal(item["outcomes"]["accepted_quantity"]) == accepted
        assert Decimal(item["outcomes"]["cost_per_accepted_outcome"]) == Decimal(
            unit_cost
        )
        assert (
            item["outcomes"]["included_runs"] == item["outcomes"]["reviewed_runs"] == 50
        )
        assert Decimal(item["outcomes"]["acceptance_rate"]) == 80
        assert Decimal(item["control_variance"]) == 0
        assert (
            item["summary"]["gpp1m"] is None
        )  # Aggregate costs cannot fabricate tokens.
        assert item["outcomes"]["modeled_capacity_value"] is None
        assert all(t["basis"] != "Provider reported" for t in item["trace"])
    assert Decimal(product["summary"]["revenue"]) == 48000
    assert Decimal(product["summary"]["contribution"]) == 16000
    assert abs(
        Decimal(product["summary"]["margin_percent"]) - Decimal(100) / 3
    ) < Decimal("1e-20")
    assert product["summary"]["basis"] == "Modeled"
    assert internal["summary"]["revenue"] is None
    assert internal["summary"]["contribution"] is None
    assert internal["confidence"]["revenue"]["score"] is None
    assert (
        result["invoice_allocations"] == []
    )  # CSVs do not fabricate connected invoice lineage.
    expected = next(
        s["economics"]
        for s in spec("expected-results.json")["scenarios"]
        if s["folder"] == level
    )
    assert result["summary"]["known_cost"] == expected["company_known_cost"]
    for actual, saved in zip(result["workloads"], expected["workloads"]):
        assert {k: actual[k] for k in saved} == saved


@pytest.mark.parametrize("level", LEVELS)
@pytest.mark.parametrize(
    "filename", ["research-costs.csv", "support-costs.csv", "research-collections.csv"]
)
def test_exact_raw_and_corrected_controls_and_exports(level, filename):
    initial = review(level, filename, decisions=False)
    corrected = review(level, filename)
    assert initial["ready"] == (level in LEVELS[:2])
    assert corrected["ready"] is True
    expected = next(
        s for s in spec("expected-results.json")["scenarios"] if s["folder"] == level
    )["sources"][filename]
    for name, value in [("initial", initial), ("reviewed", corrected)]:
        assert {k: value[k] for k in expected[name]} == expected[name]
        for c in value["controls_by_currency"].values():
            assert Decimal(c["source_parseable"]) + Decimal(c["amendments"]) == sum(
                Decimal(c[k])
                for k in [
                    "included",
                    "quarantined",
                    "excluded",
                    "duplicate",
                    "structure",
                ]
            )
    target = (
        32000
        if filename.startswith("research-costs")
        else 11200
        if filename.startswith("support")
        else 48000
    )
    assert Decimal(corrected["controls"]["included"]) == target
    exported = list(csv.DictReader(io.StringIO(corrected["canonical_csv"])))
    assert sum(Decimal(row["amount"]) for row in exported) == target
    assert len(exported) == (2 if filename.endswith("collections.csv") else 101)
    assert sum(
        Decimal(row["amount"]) for row in exported if Decimal(row["amount"]) < 0
    ) == (
        -2000
        if filename.endswith("collections.csv")
        else -500
        if filename.startswith("research")
        else -300
    )
    assert len({row.get("cost_id", row.get("revenue_id")) for row in exported}) == len(
        exported
    )
    if level == LEVELS[3]:
        assert initial["unknown_source_amount_rows"] > 1
        assert (
            corrected["unknown_source_amount_rows"]
            == initial["unknown_source_amount_rows"]
        )
        assert corrected["controls_by_currency"]["EUR"]["included"] == "0"
        assert Decimal(corrected["controls_by_currency"]["EUR"]["excluded"]) == Decimal(
            "550.50"
        )


def test_wrong_cents_setting_is_detectable_against_independent_control():
    wrong = review(
        "02-decent", "research-costs.csv", changes={"amount_unit": "dollars"}
    )
    assert wrong[
        "ready"
    ]  # Syntax alone cannot infer whether an export uses dollars or cents.
    assert Decimal(wrong["controls"]["included"]) == 3200000
    request, definitions = body("02-decent")
    request.workloads[0].audit.costs_csv = wrong["canonical_csv"]
    result = calculate_month(request, definitions)
    cost = result["workloads"][0]["confidence"]["cost"]
    assert (
        next(check for check in cost["checks"] if check["id"] == "reconciliation")[
            "status"
        ]
        == "fail"
    )


@pytest.mark.parametrize("index", range(11))
def test_edge_files_fail_at_the_documented_boundary(index):
    case = spec("expected-results.json")["edge_cases"][index]
    raw = content("05-edge-cases/" + case["file"])
    if case["kind"] == "outcomes_csv":
        request, _ = body(LEVELS[0])
        audit = request.workloads[0].audit.model_copy(
            update={"outcomes_csv": raw.decode()}
        )
        with pytest.raises(AuditError) as exc:
            calculate(audit)
        assert exc.value.code == "invalid_outcome"
        return
    rules = Rules.model_validate(case["rules"])
    if "expected_error" in case:
        with pytest.raises(AuditError) as exc:
            profile(raw, case["kind"], "2026-08", rules)
        assert exc.value.code == case["expected_error"]
        return
    value = profile(raw, case["kind"], "2026-08", rules)
    assert {k: value[k] for k in case["expected"]} == case["expected"]
    if case["file"] == "harmless-formula-text.csv":
        assert ",=1+1," in value["canonical_csv"]
        assert ",'=1+1," in spreadsheet_csv(value["canonical_csv"], "costs_csv")
    if case["file"] == "unpriced-usage.csv":
        result = calculate(
            MonthlyAudit(
                kind="product",
                period_start="2026-08-01",
                period_end="2026-08-31",
                cost_basis="events",
                usage_csv=value["canonical_csv"],
                cost_scope_complete=True,
                outcome_cohort_complete=True,
                outcomes_csv="run_id,status,accepted_quantity\nsyn-unpriced-run,accepted,100\n",
                revenue_csv="revenue_id,date,amount,currency,customer_id,feature,method\nsyn-sale,2026-08-01,1000,USD,,,direct\n",
                revenue_source="reviewed_file",
                revenue_basis="collections",
                revenue_reviewed=True,
            )
        )
        assert value["ready"]
        assert result["summary"]["unknown_cost_rows"] == 1
        assert result["summary"]["contribution"] is None
        assert result["outcomes"]["cost_per_accepted_outcome"] is None
    if case["file"] == "unknown-amount.csv":
        assert value["unknown_source_amount_rows"] == 1
        assert not value["ready"]


def test_manifest_and_generator_reproduce_exact_published_files(tmp_path):
    module_spec = importlib.util.spec_from_file_location(
        "csv_test_pack_generator", ROOT / "scripts/export-csv-test-pack.py"
    )
    generator = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(generator)
    generator.DEST = tmp_path / "pack"
    generator.ZIP_PATH = tmp_path / "pack.zip"
    generator.generate()
    manifest = spec("manifest.json")
    assert manifest["synthetic"] is True
    assert len(manifest["files"]) == 48
    with ZipFile(ARCHIVE) as published, ZipFile(generator.ZIP_PATH) as rebuilt:
        assert published.namelist() == rebuilt.namelist()
        assert len([p for p in published.namelist() if p.endswith(".csv")]) == 29
        for path in published.namelist():
            raw = published.read(path)
            relative = path.removeprefix(PREFIX)
            assert raw == rebuilt.read(path), relative
            assert raw == (PACK / relative).read_bytes(), relative
            if relative != "manifest.json":
                assert manifest["files"][relative] == {
                    "bytes": len(raw),
                    "sha256": digest(raw),
                }
    assert content("README.md") == (ROOT / "docs/CSV-TEST-PACK.md").read_bytes()
