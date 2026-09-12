"""Export code-owned Northstar inputs only. No settings, credentials or network."""

import argparse
import csv
import io
import json
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from app.company_demo import SCENARIO_VERSION, scenario_input, workload_definitions
from app.v2.economics import calculate


def example_files():
    body, _ = scenario_input(5)
    definitions = {x["id"]: x for x in workload_definitions()}
    files = {}
    manifest = {
        "synthetic": True,
        "scenario_version": SCENARIO_VERSION,
        "month": body.month,
        "notice": "Fictional Northstar data. CSV replay is customer-supplied evidence; it does not carry verified provider lineage or recreate the demo report fingerprint.",
        "workloads": [],
    }
    for item in body.workloads:
        definition = definitions[str(item.workload_id)]
        slug = definition["name"].lower().replace(" ", "-")
        audit = item.audit.model_copy(deep=True)
        # Files replay without the demonstration's retained Stripe import.
        # Preserve the modeled allocation and explanation; never fabricate lineage.
        if audit.revenue_csv:
            audit.revenue_source = "reviewed_file"
            reader = csv.DictReader(io.StringIO(audit.revenue_csv))
            records = list(reader)
            for index, record in enumerate(records, 1):
                # Reserved stripe-allocation IDs require a retained provider
                # original. File-only examples explicitly use supplied IDs.
                record["revenue_id"] = f"synthetic-reviewed-file-{slug}-{index}"
            rewritten = io.StringIO()
            writer = csv.DictWriter(rewritten, fieldnames=reader.fieldnames)
            writer.writeheader()
            writer.writerows(records)
            audit.revenue_csv = rewritten.getvalue()
        settings = audit.model_dump(mode="json")
        for field in ["usage_csv", "costs_csv", "rates_csv", "revenue_csv", "outcomes_csv"]:
            value = settings.pop(field)
            if value:
                files[f"{slug}/{field.removesuffix('_csv')}.csv"] = value
        result = calculate(audit)
        files[f"{slug}/settings.json"] = json.dumps(settings, indent=2) + "\n"
        files[f"{slug}/workload.json"] = json.dumps({k: v for k, v in definition.items() if k != "id"}, indent=2) + "\n"
        manifest["workloads"].append({
            "folder": slug,
            "kind": audit.kind,
            "cost_basis": audit.cost_basis,
            "known_cost": result["summary"]["known_cost"],
            "revenue": result["summary"]["revenue"],
            "contribution": result["summary"]["contribution"],
            "accepted_quantity": result["outcomes"]["accepted_quantity"],
            "cost_per_accepted_outcome": result["outcomes"]["cost_per_accepted_outcome"],
            "control_cost": str(item.review.control_cost),
            "control_source": item.review.control_source,
        })
    files["manifest.json"] = json.dumps(manifest, indent=2) + "\n"
    files["README.txt"] = (ROOT / "app/public/examples/CSV-IMPORT-GUIDE.txt").read_text(encoding="utf-8")
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed ZIP without writing")
    args = parser.parse_args()
    target = ROOT / "app/public/examples/InfFyn-normalized-CSV-examples.zip"
    files = example_files()
    if args.check:
        with ZipFile(target) as archive:
            assert sorted(archive.namelist()) == sorted(files), "CSV package file list changed"
            for name, content in files.items():
                assert archive.read(name).decode("utf-8") == content, f"Example differs from engine input: {name}"
        print(f"PASS: {len(files)} synthetic example files match the real engine inputs and calculated manifest.")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            info = ZipInfo(name, date_time=(2026, 9, 10, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, content.encode("utf-8"))
    print(f"Exported {len(files)} synthetic files to {target}")


if __name__ == "__main__":
    main()
