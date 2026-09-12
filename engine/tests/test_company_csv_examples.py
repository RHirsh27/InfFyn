"""Published downloadable evidence must actually replay through the engine."""

import csv
import hashlib
import io
import json
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile
from uuid import NAMESPACE_URL, uuid5

from app.monthly.contract import MonthlyAudit, MonthlyInput
from app.monthly.economics import calculate_month
from app.v2.economics import calculate

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "app/public/examples"


def replay(folder):
    with ZipFile(EXAMPLES / "InfFyn-normalized-CSV-examples.zip") as archive:
        settings = json.loads(archive.read(folder + "/settings.json"))
        for field in ("usage", "costs", "rates", "revenue", "outcomes"):
            name = f"{folder}/{field}.csv"
            settings[field + "_csv"] = archive.read(name).decode() if name in archive.namelist() else ""
    return MonthlyAudit.model_validate(settings)


def test_published_bundle_reconciles_through_real_parser():
    with ZipFile(EXAMPLES / "InfFyn-normalized-CSV-examples.zip") as archive:
        manifest = json.loads(archive.read("manifest.json"))
    assert manifest["synthetic"] is True
    total = Decimal(0)
    for workload in manifest["workloads"]:
        audit = replay(workload["folder"])
        result = calculate(audit)
        total += Decimal(result["summary"]["known_cost"])
        for key in ("known_cost", "revenue", "contribution"):
            assert result["summary"][key] == workload[key]
        assert result["outcomes"]["accepted_quantity"] == workload["accepted_quantity"]
        if audit.revenue_csv:
            assert audit.revenue_source == "reviewed_file"
            assert result["summary"]["basis"] == "Modeled"
    assert total == 43400
    doc = calculate(replay("document-intelligence"))
    assert Decimal(doc["summary"]["contribution"]) == -1200
    assert Decimal(doc["outcomes"]["accepted_quantity"]) == 9000
    assert doc["outcomes"]["included_runs"] == 50
    internal = calculate(replay("support-resolution"))
    assert internal["summary"]["revenue"] is None
    assert Decimal(internal["outcomes"]["accepted_quantity"]) == 7200
    assert calculate(replay("unallocated-ai-spend"))["outcomes"]["cost_per_accepted_outcome"] is None


def test_missing_cost_in_downloaded_example_withholds_complete_claims():
    audit = replay("document-intelligence")
    reader = csv.DictReader(io.StringIO(audit.usage_csv))
    rows = list(reader)
    rows[0]["billed_cost"] = ""
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=reader.fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    audit.usage_csv = out.getvalue()
    result = calculate(audit)
    assert result["summary"]["contribution"] is None
    assert result["outcomes"]["cost_per_accepted_outcome"] is None
    assert any(f["type"] == "Missing cost" for f in result["findings"])


def test_product_files_replay_in_company_review_without_provider_lineage():
    definitions, workloads = {}, []
    with ZipFile(EXAMPLES / "InfFyn-normalized-CSV-examples.zip") as archive:
        manifest = json.loads(archive.read("manifest.json"))
        for item in manifest["workloads"]:
            folder = item["folder"]
            identity = str(uuid5(NAMESPACE_URL, "inffyn-csv-test/" + folder))
            definition = json.loads(archive.read(folder + "/workload.json"))
            definitions[identity] = {**definition, "id": identity}
            audit = replay(folder)
            assert "stripe-allocation:" not in audit.revenue_csv
            workloads.append({"workload_id": identity, "audit": audit.model_dump(mode="json")})
    body = MonthlyInput.model_validate({"month": "2026-08", "company_scope_complete": True, "workloads": workloads})
    result = calculate_month(body, definitions, {})
    assert Decimal(result["summary"]["known_cost"]) == 43400
    doc = next(w for w in result["workloads"] if w["workload"]["name"] == "Document intelligence")
    assert Decimal(doc["summary"]["contribution"]) == -1200
    assert doc["summary"]["basis"] == "Modeled"
    assert not result["invoice_allocations"], "A reviewed CSV does not fabricate retained-invoice lineage"


def test_public_pdf_is_the_verified_executive_artifact():
    original = (ROOT / "output/pdf/InfFyn-Northstar-August-2026.pdf").read_bytes()
    public = (EXAMPLES / "InfFyn-Northstar-August-2026.pdf").read_bytes()
    assert public.startswith(b"%PDF-")
    assert hashlib.sha256(public).digest() == hashlib.sha256(original).digest()
