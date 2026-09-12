"""Write explicitly synthetic two-month fixtures through the real review and economics engines."""

import csv
import io
import json
import sys
from calendar import monthrange
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
from app.import_review.core import Rules, profile
from app.monthly.contract import MonthlyInput, Workload
from app.monthly.economics import calculate_month, compare

DEST = ROOT / "app/public/examples/reviewed-import"
WORKLOAD = "55555555-5555-4555-8555-555555555555"


def csv_text(headers, rows, delimiter=","):
    output = io.StringIO()
    writer = csv.writer(output, delimiter=delimiter, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue()


def generate():
    DEST.mkdir(parents=True, exist_ok=True)
    definition = Workload(
        name="Synthetic research delivery",
        kind="product",
        purpose="Deliver reviewed client research",
        responsible_team="Research operations",
        outcome_unit="accepted research delivery",
        cost_scope="Inference and paid human review, including failed deliveries",
        acceptance_definition="Reviewer confirms the delivery meets the client brief",
    ).model_dump() | {"id": WORKLOAD}
    results = []
    mapping = Rules(
        delimiter=";",
        number_format="us",
        mapping={
            "cost_id": "Cost ID",
            "date": "Day",
            "amount": "Amount",
            "category": "Category",
            "currency": "Currency",
            "source": "Source",
            "run_id": "Delivery",
        },
    )
    for month, inference, human, accepted in [
        ("2026-07", 28000, 4000, 40),
        ("2026-08", 26000, 10000, 35),
    ]:
        records = []
        for n in range(50):
            for category, total in [("inference", inference), ("human_review", human)]:
                records.append(
                    [
                        f"{month}-{category}-{n}",
                        month + "-15",
                        f"{total / 50:,.2f}",
                        category,
                        "USD",
                        "Synthetic monthly ledger",
                        f"delivery-{n}",
                    ]
                )
        raw = csv_text(
            ["Cost ID", "Day", "Amount", "Category", "Currency", "Source", "Delivery"],
            records,
            ";",
        )
        p = profile(raw.encode(), "costs_csv", month, mapping)
        assert p["ready"]
        outcomes = csv_text(
            ["run_id", "status", "accepted_quantity"],
            [
                [
                    f"delivery-{n}",
                    "accepted" if n < accepted else "failed",
                    1 if n < accepted else 0,
                ]
                for n in range(50)
            ],
        )
        revenue = csv_text(
            [
                "revenue_id",
                "date",
                "amount",
                "currency",
                "customer_id",
                "feature",
                "method",
                "allocation_note",
            ],
            [
                [
                    month + "-contract",
                    month + "-01",
                    "64000",
                    "USD",
                    "synthetic-client",
                    "research",
                    "allocated",
                    "Synthetic management allocation to research delivery; not causal attribution",
                ]
            ],
        )
        year, m = map(int, month.split("-"))
        payload = {
            "month": month,
            "company_scope_complete": True,
            "workloads": [
                {
                    "workload_id": WORKLOAD,
                    "audit": {
                        "kind": "product",
                        "period_start": month + "-01",
                        "period_end": f"{month}-{monthrange(year, m)[1]}",
                        "cost_basis": "expenses",
                        "costs_csv": p["canonical_csv"],
                        "outcomes_csv": outcomes,
                        "revenue_csv": revenue,
                        "revenue_source": "reviewed_file",
                        "revenue_basis": "recognized",
                        "revenue_reviewed": True,
                        "cost_scope_complete": True,
                        "outcome_cohort_complete": True,
                    },
                    "review": {
                        "source_note": "Synthetic fixture only",
                        "method_reviewed": True,
                        "revenue_scope_complete": True,
                        "outcome_method_reviewed": True,
                        "control_cost": str(inference + human),
                        "control_source": "Synthetic independent cost control",
                        "control_revenue": "64000",
                        "revenue_control_source": "Synthetic revenue control",
                        "expected_runs": 50,
                    },
                }
            ],
        }
        result = calculate_month(
            MonthlyInput.model_validate(payload), {WORKLOAD: definition}
        )
        result["synthetic"] = True
        results.append(result)
        for suffix, text in [
            ("messy-costs.csv", raw),
            ("canonical-costs.csv", p["canonical_csv"]),
            ("outcomes.csv", outcomes),
            ("revenue.csv", revenue),
        ]:
            (DEST / f"{month}-{suffix}").write_text(text, encoding="utf-8")
        (DEST / f"{month}-report.json").write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
    comparison = compare(results[1], results[0])
    summary = {
        "synthetic": True,
        "notice": "Authored demonstration generated by the actual engines. No customer, provider or hosted validation.",
        "workload": definition,
        "rules": mapping.model_dump(),
        "months": [
            {
                "month": r["month"],
                "spend": r["summary"]["known_cost"],
                "inference": r["workloads"][0]["cost_components"]["inference"],
                "human_review": r["workloads"][0]["cost_components"]["human_review"],
                "accepted": r["workloads"][0]["outcomes"]["accepted_quantity"],
                "reviewed_runs": r["workloads"][0]["outcomes"]["reviewed_runs"],
                "cost_per_accepted_outcome": r["workloads"][0]["outcomes"][
                    "cost_per_accepted_outcome"
                ],
            }
            for r in results
        ],
        "comparison": comparison,
    }
    (DEST / "walkthrough.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary["months"]))


if __name__ == "__main__":
    generate()
