"""Reproducible synthetic messy CSVs, replayed through the actual import/economics engines.

No database, credentials, network, randomness or current timestamps are used.
"""

import csv
import io
import json
import sys
from copy import deepcopy
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
from app.import_review.core import HEADERS, Decision, Rules, digest, profile
from app.monthly.contract import MonthlyInput, Workload
from app.monthly.economics import calculate_month
from app.v2.economics import AuditError

DEST = ROOT / "app/public/examples/csv-test-pack"
ZIP_PATH = DEST.parent / "InfFyn-CSV-test-pack.zip"
MONTH = "2026-08"
LEVELS = ("01-clean-control", "02-decent", "03-messy", "04-very-messy")
COST_FIELDS = HEADERS["costs_csv"].split(",")
REVENUE_FIELDS = HEADERS["revenue_csv"].split(",")
LABELS = {
    "cost_id": "Entry reference",
    "revenue_id": "Collection reference",
    "date": "Service day",
    "category": "Charge type",
    "amount": "Net amount",
    "currency": "ISO currency",
    "source": "Evidence reference",
    "customer_id": "Account reference",
    "feature": "Business feature",
    "workflow": "Activity",
    "team": "Responsible team",
    "run_id": "Batch reference",
    "method": "Attribution method",
    "allocation_note": "Allocation explanation",
}


def csv_bytes(headers, records, *, delimiter=",", bom=False, crlf=False):
    stream = io.StringIO(newline="")
    writer = csv.writer(
        stream, delimiter=delimiter, lineterminator="\r\n" if crlf else "\n"
    )
    writer.writerow(headers)
    writer.writerows(records)
    return (("\ufeff" if bom else "") + stream.getvalue()).encode("utf-8")


def data_csv(fields, rows, **options):
    return csv_bytes(
        fields, [[row.get(f, "") for f in fields] for row in rows], **options
    )


def money(value, rules):
    amount = Decimal(value) * (100 if rules.amount_unit == "cents" else 1)
    value = (
        format(amount, ",.2f")
        if rules.number_format != "plain"
        else format(amount, ".2f")
    )
    return (
        value.translate(str.maketrans(",.", ".,"))
        if rules.number_format == "eu"
        else value
    )


def sources():
    definitions, evidence, outcomes = {}, {}, {}
    for slug, kind, inference, review, credit, accepted_quantity in [
        ("research", "product", 500, 150, -500, 100),
        ("support", "internal", 150, 80, -300, 200),
    ]:
        identity = str(uuid5(NAMESPACE_URL, "inffyn-synthetic-csv-pack/" + slug))
        definitions[slug] = Workload(
            name=f"SYNTHETIC {slug.title()} test workload",
            kind=kind,
            purpose="CSV acceptance exercise; invented business activity",
            responsible_team="Research delivery"
            if kind == "product"
            else "Support operations",
            outcome_unit="accepted research brief"
            if kind == "product"
            else "accepted support resolution",
            cost_scope="Synthetic inference and human review, including failed work and signed credits",
            acceptance_definition="Human reviewer accepts the batch against the synthetic quality checklist",
        ).model_dump() | {"id": identity}
        rows = []
        for n in range(50):
            for category, amount in [
                ("inference", inference),
                ("human_review", review),
            ]:
                rows.append(
                    {
                        "cost_id": f"syn-{slug}-{n:03}-{category}",
                        "date": f"2026-08-{1 + n % 28:02}",
                        "category": category,
                        "amount": str(amount),
                        "currency": "USD",
                        "source": f"SYNTHETIC control ledger / {category}",
                        "customer_id": "synthetic-account-a"
                        if kind == "product"
                        else "",
                        "feature": slug,
                        "workflow": slug,
                        "team": definitions[slug]["responsible_team"],
                        "run_id": f"syn-{slug}-batch-{n:03}",
                    }
                )
        rows.append(
            rows[0]
            | {
                "cost_id": f"syn-{slug}-credit",
                "date": "2026-08-31",
                "amount": str(credit),
                "source": "SYNTHETIC documented inference credit; retain its negative sign",
            }
        )
        evidence[f"{slug}-costs.csv"] = ("costs_csv", rows)
        outcomes[slug] = csv_bytes(
            ["run_id", "status", "accepted_quantity"],
            [
                [
                    f"syn-{slug}-batch-{n:03}",
                    "accepted" if n < 40 else "rejected" if n < 45 else "failed",
                    accepted_quantity if n < 40 else 0,
                ]
                for n in range(50)
            ],
        )
    evidence["research-collections.csv"] = (
        "revenue_csv",
        [
            {
                "revenue_id": "syn-research-collections",
                "date": "2026-08-10",
                "amount": "50000",
                "currency": "USD",
                "customer_id": "synthetic-account-a",
                "feature": "research",
                "method": "allocated",
                "allocation_note": "SYNTHETIC management allocation of collected cash to research; not recognized revenue or proof AI caused the sale",
            },
            {
                "revenue_id": "syn-research-refund",
                "date": "2026-08-28",
                "amount": "-2000",
                "currency": "USD",
                "customer_id": "synthetic-account-a",
                "feature": "research",
                "method": "allocated",
                "allocation_note": "SYNTHETIC refund associated with the same research allocation; signed adjustment to collections",
            },
        ],
    )
    return definitions, evidence, outcomes


def variant(level, kind, original):
    fields = HEADERS[kind].split(",")
    rules = Rules(
        delimiter="," if level == LEVELS[0] else ";",
        header_row=3 if level in LEVELS[2:] else 1,
        mapping={f: f if level == LEVELS[0] else LABELS[f] for f in fields},
        date_format="%Y-%m-%d"
        if level == LEVELS[0]
        else "%d/%m/%Y"
        if level == LEVELS[2]
        else "%m/%d/%Y",
        number_format="plain"
        if level == LEVELS[0]
        else "eu"
        if level == LEVELS[2]
        else "us",
        amount_unit="cents" if level == LEVELS[1] else "dollars",
    )
    records = deepcopy(original)
    for row in records:
        row["amount"] = money(row["amount"], rules)
        row["date"] = date.fromisoformat(row["date"]).strftime(rules.date_format)
    decisions = []

    def amend(index, field, bad_value):
        value = records[index][field]
        records[index][field] = bad_value
        decisions.append(
            Decision(
                row=rules.header_row + 1 + index,
                action="amend",
                field=field,
                value=value,
                reason=f"Synthetic source correction: reference/{'cost' if kind == 'costs_csv' else 'collection'}-control.csv confirms {original[index][fields[0]]} {field}",
            )
        )

    def append(row, action, reason):
        records.append(row)
        decisions.append(
            Decision(row=rules.header_row + len(records), action=action, reason=reason)
        )

    if level in LEVELS[2:]:
        if kind == "costs_csv":
            amend(1, "category", "Human review")
            amend(8, "date", "31/08/26")
        else:
            amend(0, "method", "Allocated")
            amend(1, "allocation_note", "")
        # The copied row follows an included original once its correction is reviewed.
        append(
            deepcopy(records[2 if kind == "costs_csv" else 0]),
            "duplicate",
            "SYNTHETIC overlapping export: same immutable ID and amount as the earlier included record",
        )
        append(
            records[-1]
            | {
                fields[0]: "syn-prior-month",
                "date": "07/01/2026",
                "amount": money("999", rules),
            },
            "exclude",
            "SYNTHETIC July-only record; outside August scope. Preserve for a separate July review",
        )
        append(
            {f: "" for f in fields}
            | {
                fields[0]: "TOTAL",
                "amount": money(sum(Decimal(r["amount"]) for r in original), rules),
                "currency": "USD",
            },
            "structure",
            "SYNTHETIC display subtotal; not an additional economic charge",
        )
        append(
            {f: "" for f in fields},
            "structure",
            "Blank export separator; no economic record",
        )

    if level == LEVELS[3]:
        if kind == "costs_csv":
            for i, value in [
                (0, "$500.00"),
                (3, ""),
                (4, "NaN"),
                (5, "pending"),
                (6, "1,2,3.00"),
                (7, "'150.00"),
                (12, "1e3"),
            ]:
                amend(i, "amount", value)
            amend(10, "source", "")
            amend(
                len(original) - 1,
                "amount",
                f"({abs(Decimal(original[-1]['amount'])):.2f})",
            )
        else:
            amend(0, "amount", "$50,000.00")
            amend(1, "amount", "(2,000.00)")
        append(
            records[0]
            | {fields[0]: "syn-eur-appendix", "amount": "275.25", "currency": "EUR"},
            "exclude",
            "SYNTHETIC unrelated EUR appendix outside this defined USD test scope; keep EUR separate, do not convert or relabel it",
        )
        append(
            deepcopy(records[-1]),
            "exclude",
            "Repeated synthetic EUR appendix; neither EUR row is included or claimed as company USD coverage",
        )
    # Fields retain their original IDs; the interpretation editor may not invent replacements.
    headers = [rules.mapping[f] for f in fields]
    if level != LEVELS[0]:
        headers += ["Export note (ignored)"]
    rows = []
    for i, record in enumerate(records):
        cells = [record.get(f, "") for f in fields]
        if level != LEVELS[0]:
            cells += [
                'SYNTHETIC analyst note, "reviewed separately"'
                if i % 7 == 0
                else "SYNTHETIC"
            ]
        rows.append(cells)
    raw = csv_bytes(
        headers,
        rows,
        delimiter=rules.delimiter,
        bom=level == LEVELS[1],
        crlf=level == LEVELS[1],
    )
    if rules.header_row == 3:
        raw = (
            b"SYNTHETIC export; invented data only\nAugust 2026; retain this original\n"
            + raw
        )
    return raw, rules, decisions


def profile_summary(value):
    return {
        key: value[key]
        for key in (
            "ready",
            "counts",
            "issues",
            "controls",
            "controls_by_currency",
            "unknown_source_amount_rows",
            "canonical_hash",
        )
    }


def calculation(profiles, definitions, outcomes):
    workloads = []
    for slug in definitions:
        product = slug == "research"
        workloads.append(
            {
                "workload_id": definitions[slug]["id"],
                "audit": {
                    "title": "SYNTHETIC CSV comparison - " + slug,
                    "kind": definitions[slug]["kind"],
                    "period_start": "2026-08-01",
                    "period_end": "2026-08-31",
                    "cost_basis": "expenses",
                    "costs_csv": profiles[slug + "-costs.csv"]["canonical_csv"],
                    "outcomes_csv": outcomes[slug].decode(),
                    "revenue_csv": profiles["research-collections.csv"]["canonical_csv"]
                    if product
                    else "",
                    "revenue_source": "reviewed_file" if product else "none",
                    "revenue_basis": "collections" if product else "unavailable",
                    "revenue_reviewed": product,
                    "cost_scope_complete": True,
                    "outcome_cohort_complete": True,
                },
                "review": {
                    "source_note": "Authored synthetic fixture; independent control is also synthetic, not provider verification",
                    "method_reviewed": True,
                    "revenue_scope_complete": product,
                    "outcome_method_reviewed": True,
                    "control_cost": "32000" if product else "11200",
                    "control_source": "SYNTHETIC control ledger",
                    "control_revenue": "48000" if product else None,
                    "revenue_control_source": "SYNTHETIC collections control"
                    if product
                    else "",
                    "expected_runs": 50,
                },
            }
        )
    body = MonthlyInput.model_validate(
        {"month": MONTH, "company_scope_complete": True, "workloads": workloads}
    )
    report = calculate_month(body, {w["id"]: w for w in definitions.values()})
    return body, report


def generate():
    files = {}

    def write(name, content):
        files[name] = content.encode() if isinstance(content, str) else content

    def write_json(name, value):
        write(
            name, json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        )

    definitions, evidence, outcomes = sources()
    write_json("reference/workloads.json", definitions)
    write(
        "reference/cost-control.csv",
        data_csv(
            COST_FIELDS,
            evidence["research-costs.csv"][1] + evidence["support-costs.csv"][1],
        ),
    )
    write(
        "reference/collection-control.csv",
        data_csv(REVENUE_FIELDS, evidence["research-collections.csv"][1]),
    )
    for slug, raw in outcomes.items():
        write(f"shared/{slug}-outcomes.csv", raw)
    results = {
        "synthetic": True,
        "month": MONTH,
        "company": "SYNTHETIC Northstar CSV Test Company",
        "notice": "Authored test evidence only. Engine replay is not hosted authentication, provider, recovery or customer acceptance.",
        "scenarios": [],
        "edge_cases": [],
    }
    answer_rows, mapping_rows = [], []
    for level in LEVELS:
        profiles, case = {}, {"folder": level, "sources": {}}
        for filename, (kind, original) in evidence.items():
            raw, rules, decisions = variant(level, kind, original)
            initial = profile(raw, kind, MONTH, rules)
            reviewed = profile(raw, kind, MONTH, rules, decisions)
            if not reviewed["ready"]:
                raise AssertionError((level, filename, reviewed["issues"]))
            profiles[filename] = reviewed
            write(f"{level}/{filename}", raw)
            write_json(
                f"{level}/{filename.removesuffix('.csv')}.review.json",
                {
                    "synthetic": True,
                    "kind": kind,
                    "month": MONTH,
                    "rules": rules.model_dump(),
                    "decisions": [d.model_dump() for d in decisions],
                    "note": "Reference for manual interpretation; JSON is not a supported UI upload. Row numbers are CSV record numbers, including the selected header/preamble.",
                },
            )
            case["sources"][filename] = {
                "kind": kind,
                "sha256": digest(raw),
                "initial": profile_summary(initial),
                "reviewed": profile_summary(reviewed),
            }
            for target, source in rules.mapping.items():
                mapping_rows.append(
                    [
                        level,
                        filename,
                        target,
                        source,
                        rules.delimiter,
                        rules.header_row,
                        rules.date_format,
                        rules.number_format,
                        rules.amount_unit,
                    ]
                )
            for d in decisions:
                answer_rows.append(
                    [level, filename, d.row, d.action, d.field, d.value, d.reason]
                )
        body, report = calculation(profiles, definitions, outcomes)
        case["economics"] = {
            "company_known_cost": report["summary"]["known_cost"],
            "workloads": [
                {
                    key: w[key]
                    for key in (
                        "workload",
                        "summary",
                        "outcomes",
                        "cost_components",
                        "control_variance",
                        "confidence",
                    )
                }
                for w in report["workloads"]
            ],
        }
        # The controls are intentionally literal assertions, separate from calculated outputs.
        assert Decimal(case["economics"]["company_known_cost"]) == 43200
        write_json(
            f"{level}/settings-reference.json",
            {
                "synthetic": True,
                "note": "Reference only: create workload IDs in your own designated test company. Never submit these fixture UUIDs as another company's IDs.",
                "month": MONTH,
                "workloads": [
                    {
                        "slug": slug,
                        "audit": {
                            k: v
                            for k, v in w.audit.model_dump(mode="json").items()
                            if not k.endswith("_csv")
                        },
                        "review": w.review.model_dump(mode="json"),
                    }
                    for slug, w in zip(definitions, body.workloads)
                ],
            },
        )
        results["scenarios"].append(case)

    # Small, isolated boundary cases: these are separate exercises, never appended to a month's data.
    base = deepcopy(evidence["research-costs.csv"][1][:1])
    canonical_rules = Rules(mapping={f: f for f in COST_FIELDS})

    def edge(
        name,
        raw,
        *,
        rules=canonical_rules,
        kind="costs_csv",
        error=None,
        issue=None,
        note="",
    ):
        write("05-edge-cases/" + name, raw)
        entry = {"file": name, "kind": kind, "rules": rules.model_dump(), "note": note}
        try:
            p = profile(raw, kind, MONTH, rules)
        except AuditError as exc:
            assert exc.code == error, (name, exc.code, error)
            entry["expected_error"] = exc.code
        else:
            assert error is None
            if issue:
                assert issue in p["issues"], (name, issue, p["issues"])
            entry["expected"] = profile_summary(p)
        results["edge_cases"].append(entry)

    edge(
        "duplicate-headers.csv",
        b"cost_id,cost_id\na,b\n",
        error="headers",
        note="Reject the file. Re-export unique headers; do not guess which duplicate column is authoritative.",
    )
    edge(
        "broken-quoting.csv",
        b'cost_id,date,category,amount,currency,source\nc1,2026-08-01,inference,500,USD,"unfinished\n',
        error="invalid_csv",
        note="Reject malformed CSV. Obtain a correctly quoted export.",
    )
    edge(
        "ragged-record.csv",
        b"cost_id,date,category,amount,currency,source\nc1,2026-08-01,inference,500,USD,SYNTHETIC,unexpected\n",
        rules=Rules(mapping={f: f for f in COST_FIELDS[:6]}),
        issue="column_count",
        note="Quarantine the extra-cell record. Repair the source; do not discard a real charge to make validation pass.",
    )
    edge(
        "missing-business-id.csv",
        data_csv(COST_FIELDS, [base[0] | {"cost_id": ""}]),
        issue="missing:cost_id",
        note="Obtain the stable source ID. The editor may not invent or amend business IDs.",
    )
    edge(
        "unknown-amount.csv",
        data_csv(COST_FIELDS, [base[0] | {"amount": "pending"}]),
        issue="invalid:amount",
        note="Keep the amount unknown and scope incomplete until source evidence supplies it. Unknown is not zero.",
    )
    edge(
        "mixed-currencies.csv",
        data_csv(
            COST_FIELDS,
            [
                base[0],
                base[0] | {"cost_id": "syn-eur", "currency": "EUR", "amount": "275.25"},
            ],
        ),
        issue="currency",
        note="USD 500 and EUR 275.25 remain separate. Unlike the unrelated appendix in the comparison pack, this EUR charge is in scope: do not exclude it and claim complete coverage.",
    )
    edge(
        "whitespace-business-id.csv",
        data_csv(COST_FIELDS, [base[0] | {"cost_id": " " + base[0]["cost_id"]}]),
        issue="identifier_whitespace_or_length:cost_id",
        note="Obtain a reviewed source correction. Do not silently trim or regenerate business IDs.",
    )
    edge(
        "harmless-formula-text.csv",
        data_csv(COST_FIELDS, [base[0] | {"source": "=1+1"}]),
        note="Harmless arithmetic text, with no external command or link. Canonical export keeps literal source text; spreadsheet-safe export prefixes it with an apostrophe. Ready does not mean this is an adequate evidence reference.",
    )
    drift_rules = Rules(mapping={f: f for f in COST_FIELDS})
    edge(
        "changed-schema.csv",
        data_csv(COST_FIELDS, base).replace(b"amount,", b"New charge column,", 1),
        rules=drift_rules,
        error="mapping",
        note="Reusing last month's recipe must flag the renamed amount column. Review the new mapping before calculating.",
    )
    usage_fields = HEADERS["usage_csv"].split(",")
    usage = {
        "event_id": "syn-unpriced",
        "date": "2026-08-01",
        "provider": "synthetic-provider",
        "model": "synthetic-unknown-model",
        "input_tokens": "1000000",
        "output_tokens": "250000",
        "requests": "100",
        "run_id": "syn-unpriced-run",
        "currency": "USD",
    }
    edge(
        "unpriced-usage.csv",
        data_csv(usage_fields, [usage]),
        rules=Rules(mapping={f: f for f in usage_fields}),
        kind="usage_csv",
        note="Row structure is reviewable, but no billed cost or rate exists. Withhold contribution and cost per accepted outcome. Do not use aggregate expenses settings for this event-based exercise.",
    )
    bad_outcomes = outcomes["research"].replace(b",failed,0", b",failed,1", 1)
    write("05-edge-cases/failed-outcome-with-quantity.csv", bad_outcomes)
    results["edge_cases"].append(
        {
            "file": "failed-outcome-with-quantity.csv",
            "kind": "outcomes_csv",
            "expected_error": "invalid_outcome",
            "note": "In the direct Outcomes input, replace the shared research outcomes after using clean costs. Calculation must reject a failed run with accepted quantity 1. The reviewed organizer currently supports usage, costs and revenue, not outcomes.",
        }
    )
    write_json("expected-results.json", results)
    write(
        "answer-key/row-decisions.csv",
        csv_bytes(
            [
                "scenario",
                "file",
                "source_record",
                "action",
                "field",
                "replacement",
                "explanation",
            ],
            answer_rows,
        ),
    )
    write(
        "answer-key/column-mapping.csv",
        csv_bytes(
            [
                "scenario",
                "file",
                "target_field",
                "source_header",
                "delimiter",
                "header_record",
                "date_format",
                "number_format",
                "amount_unit",
            ],
            mapping_rows,
        ),
    )
    write("README.md", (ROOT / "docs/CSV-TEST-PACK.md").read_bytes())
    write_json(
        "manifest.json",
        {
            "synthetic": True,
            "month": MONTH,
            "files": {
                name: {"bytes": len(raw), "sha256": digest(raw)}
                for name, raw in sorted(files.items())
            },
        },
    )
    for name, raw in files.items():
        path = DEST / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    with ZipFile(ZIP_PATH, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(files.items()):
            info = ZipInfo(
                "InfFyn-CSV-test-pack/" + name, date_time=(2026, 8, 31, 0, 0, 0)
            )
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, raw)
    print(
        json.dumps(
            {
                "synthetic": True,
                "files": len(files),
                "csv_files": sum(n.endswith(".csv") for n in files),
                "company_spend_usd": "43200",
                "zip_bytes": ZIP_PATH.stat().st_size,
            }
        )
    )


if __name__ == "__main__":
    generate()
