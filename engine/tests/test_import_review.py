"""Independent normalization controls and reviewed-reference trust-boundary checks."""

import csv
import io
from copy import deepcopy
from decimal import Decimal

import pytest
from app.import_review.core import Decision, Rules, digest, profile, spreadsheet_csv
from app.import_review.service import attach_content, validate_references
from app.monthly.contract import MonthlyInput
from app.monthly.economics import calculate_month
from app.v2.economics import AuditError
from fastapi import HTTPException

from tests.test_monthly import WORKLOAD, body, definition

RAW = b'ID;Day;Charge;Currency;Category;Source\nc1;08/02/2026;"1,234.50";USD;human_review;payroll\nc2;08/03/2026;"-34.50";USD;other;credit\n'


def rules():
    return Rules(
        delimiter=";",
        date_format="%m/%d/%Y",
        number_format="us",
        mapping={
            "cost_id": "ID",
            "date": "Day",
            "amount": "Charge",
            "currency": "Currency",
            "category": "Category",
            "source": "Source",
        },
    )


def test_exact_normalization_and_engine_agreement():
    p = profile(RAW, "costs_csv", "2026-08", rules())
    assert p["ready"]
    assert p["controls"]["included"] == "1200.00"
    rows = list(csv.DictReader(io.StringIO(p["canonical_csv"])))
    assert rows[0]["date"] == "2026-08-02"
    assert rows[0]["amount"] == "1234.50"
    a = body().model_dump(mode="json")
    a["workloads"][0]["audit"]["costs_csv"] = p["canonical_csv"]
    result = calculate_month(MonthlyInput.model_validate(a), {WORKLOAD: definition()})
    assert Decimal(result["summary"]["known_cost"]) == Decimal(1211)


@pytest.mark.parametrize(
    "value,issue",
    [
        (b"n/a", "invalid:amount"),
        (b"", "missing:amount"),
        (b"12,34", "invalid:amount"),
        (b"NaN", "invalid:amount"),
    ],
)
def test_bad_amount_never_becomes_zero(value, issue):
    p = profile(RAW.replace(b'"1,234.50"', value), "costs_csv", "2026-08", rules())
    assert not p["ready"]
    assert p["unknown_source_amount_rows"] == 1
    assert issue in p["rows"][0]["issues"]


def test_exclusions_amendments_and_duplicate_conservation():
    raw = RAW + b'c1;08/02/2026;"1,234.50";USD;human_review;payroll\n'
    p = profile(
        raw,
        "costs_csv",
        "2026-08",
        rules(),
        [
            Decision(
                row=2,
                action="amend",
                field="amount",
                value="1200",
                reason="Corrected source credit",
            ),
            Decision(row=4, action="duplicate", reason="Repeated immutable source ID"),
        ],
    )
    assert p["ready"]
    c = {k: Decimal(v) for k, v in p["controls"].items()}
    assert c["source_parseable"] + c["amendments"] == sum(
        c[k] for k in ("included", "excluded", "quarantined", "duplicate", "structure")
    )
    assert p["rows"][0]["source"]["Charge"] == "1,234.50"
    assert c["included"] == Decimal("1165.50")


def test_ambiguous_dates_explicit_format_and_period():
    p = profile(
        RAW,
        "costs_csv",
        "2026-08",
        rules().model_copy(update={"date_format": "%d/%m/%Y"}),
    )
    assert not p["ready"] and "outside_period" in p["issues"]


def test_unknown_currency_and_identifier_whitespace():
    p = profile(
        RAW.replace(b"USD", b"EUR").replace(b"c1;", b" c1;"),
        "costs_csv",
        "2026-08",
        rules(),
    )
    assert not p["ready"]
    assert "currency" in p["issues"]
    assert "identifier_whitespace_or_length:cost_id" in p["issues"]
    assert p["controls"]["source_parseable"] == "0"
    assert p["controls_by_currency"]["EUR"]["source_parseable"] == "1200.00"


def test_spreadsheet_export_is_safe_without_changing_canonical_amounts():
    p = profile(RAW.replace(b"payroll", b"=1+1"), "costs_csv", "2026-08", rules())
    safe = spreadsheet_csv(p["canonical_csv"], "costs_csv")
    assert "'=1+1" in safe
    assert "'=1+1" not in p["canonical_csv"]
    assert "-34.50" in safe and "'-34.50" not in safe


def test_saved_recipe_applies_next_month_and_schema_drift_is_not_silent():
    july = profile(RAW.replace(b"08/", b"07/"), "costs_csv", "2026-07", rules())
    august = profile(
        RAW, "costs_csv", "2026-08", Rules.model_validate(rules().model_dump())
    )
    assert july["schema_hash"] == august["schema_hash"]
    assert july["canonical_hash"] != august["canonical_hash"]
    with pytest.raises(AuditError):
        profile(RAW.replace(b"Charge", b"Net Amount"), "costs_csv", "2026-08", rules())


def test_private_alpha_admits_only_exact_reviewed_routes():
    from app.private_alpha import route_access

    identity = "55555555-5555-4555-8555-555555555555"
    assert (
        route_access("POST", f"/v2/monthly/import-reviews/{identity}/confirm")
        == "authenticated"
    )
    assert (
        route_access("GET", f"/v2/monthly/import-reviews/{identity}/export")
        == "authenticated"
    )
    assert route_access("DELETE", f"/v2/monthly/import-reviews/{identity}") is None
    assert route_access("POST", "/v2/monthly/imports/openai") is None


def test_no_fabricated_identity_constant():
    r = rules()
    del r.mapping["cost_id"]
    r.constants["cost_id"] = "generated-id"
    with pytest.raises(AuditError):
        profile(RAW, "costs_csv", "2026-08", r)


def test_limits_and_bad_headers():
    for raw in (b"x" * 2_000_001, b"ID;ID\na;b", b"\xff\x00"):
        with pytest.raises(AuditError):
            profile(raw, "costs_csv", "2026-08", rules())


def test_all_rows_have_disposition_and_exclusion_reason():
    p = profile(
        RAW.replace(b'"1,234.50"', b"unknown"),
        "costs_csv",
        "2026-08",
        rules(),
        [Decision(row=2, action="exclude", reason="Awaiting payroll correction")],
    )
    assert p["ready"] and p["counts"] == {"excluded": 1, "included": 1}
    assert p["unknown_source_amount_rows"] == 1


class Store:
    def __init__(self):
        self.p = profile(RAW, "costs_csv", "2026-08", rules())
        self.s = {
            "id": "source-1",
            "kind": "costs_csv",
            "month": "2026-08",
            "sha256": digest(RAW),
            "account": "account-a",
        }
        self.c = {
            "id": "confirm-1",
            "source_id": "source-1",
            "revision": 1,
            "source_hash": digest(RAW),
            "canonical_hash": self.p["canonical_hash"],
            "rules_hash": digest(rules().model_dump()),
            "created_at": "2026-09-12",
        }

    def confirmation(self, identity):
        if identity != self.c["id"]:
            raise HTTPException(404)
        return self.c

    def source(self, identity):
        assert identity == self.s["id"]
        return self.s

    def revision(self, source, revision):
        return {"profile": self.p}


def test_client_cannot_claim_reviewed_status_for_changed_data_or_other_company():
    s = Store()
    content = body().model_dump(mode="json")
    w = content["workloads"][0]
    w["reviewed_imports"] = {"costs_csv": "confirm-1"}
    w["audit"]["costs_csv"] = s.p["canonical_csv"]
    assert validate_references(content, s)[0]["basis"] == "customer_supplied_reviewed"
    w["audit"]["costs_csv"] += "\n"
    with pytest.raises(HTTPException):
        validate_references(content, s)
    w["reviewed_imports"]["costs_csv"] = "other-company"
    with pytest.raises(HTTPException):
        validate_references(content, s)


def test_duplicate_workload_attachment_rejected():
    s = Store()
    content = body().model_dump(mode="json")
    content["workloads"][0]["audit"]["costs_csv"] = s.p["canonical_csv"]
    content["workloads"][0]["reviewed_imports"] = {"costs_csv": "confirm-1"}
    content["workloads"].append(deepcopy(content["workloads"][0]))
    with pytest.raises(HTTPException):
        validate_references(content, s)


def test_attachment_invalidates_review_and_does_not_overwrite_existing_evidence():
    s = Store()
    draft = {"content": body().model_dump(mode="json")}
    original = deepcopy(draft)
    result = attach_content(draft, WORKLOAD, s.s, s.c, {"profile": s.p})
    assert draft == original
    assert result["workloads"][0]["audit"]["cost_scope_complete"] is False
    with pytest.raises(HTTPException):
        attach_content(
            {"content": result},
            WORKLOAD,
            s.s,
            {**s.c, "id": "replacement"},
            {"profile": s.p},
        )
