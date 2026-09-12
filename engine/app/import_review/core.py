"""Pure normalization with immutable originals, explicit decisions and exact controls."""

import csv
import hashlib
import io
import json
import re
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, localcontext
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.v2.economics import AuditError, number

VERSION = "reviewed-csv-1"
HEADERS = {
    "usage_csv": "event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,customer_segment,feature,workflow,team,run_id,billed_cost,cost_source,cached_input_tokens,currency",
    "costs_csv": "cost_id,date,category,amount,currency,source,customer_id,feature,workflow,team,run_id",
    "revenue_csv": "revenue_id,date,amount,currency,customer_id,feature,method,allocation_note",
}
REQUIRED = {
    "usage_csv": {
        "event_id",
        "date",
        "provider",
        "model",
        "input_tokens",
        "output_tokens",
        "requests",
        "currency",
    },
    "costs_csv": {"cost_id", "date", "category", "amount", "currency", "source"},
    "revenue_csv": {"revenue_id", "date", "amount", "currency", "method"},
}
NUMBERS = {
    "amount",
    "billed_cost",
    "input_tokens",
    "output_tokens",
    "requests",
    "cached_input_tokens",
}
IDENTITIES = {"event_id", "cost_id", "revenue_id", "run_id", "customer_id"}
ALIASES = {
    "date": ["day", "usage date", "invoice date"],
    "amount": ["amount usd", "total usd"],
    "input_tokens": ["input tokens"],
    "output_tokens": ["output tokens"],
    "requests": ["request count"],
}


class Rules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    delimiter: Literal[",", ";", "\t"] = ","
    header_row: int = Field(default=1, ge=1, le=20)
    mapping: dict[str, str] = Field(default_factory=dict, max_length=30)
    constants: dict[str, str] = Field(default_factory=dict, max_length=20)
    date_format: Literal["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"] = "%Y-%m-%d"
    number_format: Literal["plain", "us", "eu"] = "plain"
    amount_unit: Literal["dollars", "cents"] = "dollars"


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    row: int = Field(ge=1, le=20020)
    action: Literal["exclude", "duplicate", "structure", "amend"]
    reason: str = Field(min_length=3, max_length=300)
    field: str = Field(default="", max_length=40)
    value: str = Field(default="", max_length=2000)


def digest(value):
    return hashlib.sha256(
        value
        if isinstance(value, bytes)
        else json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def read_csv(raw, rules):
    if len(raw) > 2_000_000:
        raise AuditError(
            "file_limit",
            "CSV exceeds 2 MB. Aggregate by date and business dimensions before uploading.",
        )
    try:
        text = raw.decode("utf-8-sig")
        if "\x00" in text:
            raise ValueError()
        records = list(
            csv.reader(io.StringIO(text), delimiter=rules.delimiter, strict=True)
        )
    except (UnicodeError, csv.Error, ValueError):
        raise AuditError(
            "invalid_csv", "Use a valid UTF-8 CSV without null bytes."
        ) from None
    if len(records) < rules.header_row:
        raise AuditError("header_row", "The selected header row is absent.")
    headers = records[rules.header_row - 1]
    if (
        not headers
        or len(headers) > 60
        or len(set(headers)) != len(headers)
        or any(not h.strip() or len(h) > 200 for h in headers)
    ):
        raise AuditError("headers", "Use at most 60 nonempty, unique column headers.")
    if len(records) - rules.header_row > 20_000:
        raise AuditError(
            "row_limit", "CSV exceeds 20,000 rows. Aggregate the source export."
        )
    if any(len(cell) > 2000 for row in records for cell in row):
        raise AuditError(
            "cell_limit",
            "A cell exceeds 2,000 characters. Remove narrative or prompt columns before importing.",
        )
    return headers, records[rules.header_row :]


def suggest(headers, kind):
    normalized = {h.lower().strip(): h for h in headers}
    return {
        target: normalized[key]
        for target in HEADERS[kind].split(",")
        for key in [target, *ALIASES.get(target, [])]
        if key in normalized
    }


def decimal_value(raw, rules, field):
    value = raw.strip()
    # Explicit grouping patterns prevent malformed values being silently rewritten.
    patterns = {
        "plain": r"[+-]?\d+(?:\.\d+)?",
        "us": r"[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?",
        "eu": r"[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?",
    }
    if not re.fullmatch(patterns[rules.number_format], value):
        raise ValueError(
            "Choose the correct number format; missing amounts are unknown."
        )
    if rules.number_format == "us":
        value = value.replace(",", "")
    if rules.number_format == "eu":
        value = value.replace(".", "").replace(",", ".")
    result = number(
        value,
        field,
        signed=field == "amount",
        integer=field not in {"amount", "billed_cost"},
    )
    if rules.amount_unit == "cents" and field in {"amount", "billed_cost"}:
        result /= 100
    return format(result, "f")


def profile(raw, kind, month, rules, decisions=()):
    with localcontext() as ctx:
        ctx.prec = 60
        return _profile(raw, kind, month, rules, decisions)


def _profile(raw, kind, month, rules, decisions):
    date.fromisoformat(month + "-01")
    fields = HEADERS[kind].split(",")
    headers, records = read_csv(raw, rules)
    if (
        set(rules.mapping) - set(fields)
        or set(rules.constants) - set(fields)
        or any(h not in headers for h in rules.mapping.values())
    ):
        raise AuditError(
            "mapping", "Map only available source headers to supported fields."
        )
    if set(rules.constants) - {
        "currency",
        "provider",
        "category",
        "method",
        "cost_source",
    } or set(rules.mapping) & set(rules.constants):
        raise AuditError(
            "mapping",
            "Business IDs must come from a source column. A field cannot have both a constant and a column.",
        )
    missing = REQUIRED[kind] - (rules.mapping.keys() | rules.constants.keys())
    groups = {}
    for decision in decisions:
        if not rules.header_row < decision.row <= rules.header_row + len(records):
            raise AuditError("decision", "A decision refers to a missing source row.")
        if decision.action == "amend" and (
            decision.field not in fields
            or decision.field in IDENTITIES
            or decision.field == "currency"
        ):
            raise AuditError(
                "decision",
                "Amend a supported non-identifier field; IDs require a source mapping.",
            )
        groups.setdefault(decision.row, []).append(decision)
    result, included, seen = [], [], set()
    amount_field = "billed_cost" if kind == "usage_csv" else "amount"
    control_keys = (
        "source_parseable",
        "amendments",
        "included",
        "quarantined",
        "excluded",
        "duplicate",
        "structure",
    )
    by_currency = {"USD": {k: Decimal(0) for k in control_keys}}
    unknown = 0
    for n, cells in enumerate(records, rules.header_row + 1):
        errors = []
        original = dict(zip(headers, cells))
        row = {
            f: original.get(rules.mapping.get(f, ""), rules.constants.get(f, ""))
            for f in fields
        }
        before = dict(row)
        currency = before.get("currency") or "UNSPECIFIED"
        controls = by_currency.setdefault(
            currency, {k: Decimal(0) for k in control_keys}
        )
        actions = groups.get(n, [])
        dispositions = [d for d in actions if d.action != "amend"]
        if len(dispositions) > 1 or len(
            {d.field for d in actions if d.action == "amend"}
        ) != len([d for d in actions if d.action == "amend"]):
            raise AuditError(
                "decision", "Use one disposition and one amendment per field per row."
            )
        if len(cells) != len(headers):
            errors.append("column_count")
        source_amount = None
        try:
            source_amount = Decimal(
                decimal_value(before[amount_field], rules, amount_field)
            )
            controls["source_parseable"] += source_amount
        except (ValueError, AuditError):
            unknown += 1
        for d in actions:
            if d.action == "amend":
                row[d.field] = d.value
        for f in REQUIRED[kind]:
            if not row.get(f, "").strip():
                errors.append("missing:" + f)
        for f, value in list(row.items()):
            try:
                if f in NUMBERS and value:
                    row[f] = decimal_value(value, rules, f)
                elif f == "date" and value:
                    row[f] = (
                        datetime.strptime(value.strip(), rules.date_format)  # noqa: DTZ007 -- calendar dates, not instants
                        .date()
                        .isoformat()
                    )
                    if row[f][:7] != month:
                        errors.append("outside_period")
                elif (
                    f in IDENTITIES
                    and value
                    and (value != value.strip() or len(value) > 200)
                ):
                    errors.append("identifier_whitespace_or_length:" + f)
            except (ValueError, AuditError):
                errors.append("invalid:" + f)
        if row.get("currency") and row["currency"] != "USD":
            errors.append("currency")
        if kind == "costs_csv" and row["category"] not in {
            "inference",
            "subscription",
            "tools",
            "compute",
            "human_review",
            "other",
        }:
            errors.append("cost_category")
        if (
            kind == "usage_csv"
            and row["billed_cost"]
            and not row["cost_source"].strip()
        ):
            errors.append("missing:cost_source")
        if kind == "revenue_csv" and row["method"] not in {"direct", "allocated"}:
            errors.append("revenue_method")
        if (
            kind == "revenue_csv"
            and row["method"] == "allocated"
            and not row["allocation_note"].strip()
        ):
            errors.append("allocation_explanation")
        identity = row[fields[0]]
        if identity in seen:
            errors.append("duplicate_id")
        disposition = (
            dispositions[0].action
            if dispositions
            else ("quarantined" if errors else "included")
        )
        if disposition == "exclude":
            disposition = "excluded"
        if disposition == "duplicate" and identity not in seen:
            raise AuditError(
                "duplicate",
                "A duplicate exclusion needs an earlier included source ID. Otherwise use an explained exclusion.",
            )
        final_amount = None
        try:
            final_amount = (
                Decimal(row[amount_field])
                if "invalid:" + amount_field not in errors
                else None
            )
            if final_amount is not None and not final_amount.is_finite():
                final_amount = None
        except (InvalidOperation, ValueError):
            final_amount = None
        if final_amount is not None:
            controls["amendments"] += final_amount - (
                source_amount if source_amount is not None else Decimal(0)
            )
            controls[disposition] += final_amount
        elif source_amount is not None:
            controls[disposition] += source_amount
        if disposition == "included":
            seen.add(identity)
            included.append(row)
        result.append(
            {
                "row": n,
                "source": original,
                "normalized": row,
                "disposition": disposition,
                "issues": errors,
                "decisions": [d.model_dump() for d in actions],
            }
        )
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(included)
    canonical = stream.getvalue()
    counts = dict(Counter(r["disposition"] for r in result))
    issues = dict(
        Counter(
            issue
            for r in result
            if r["disposition"] == "quarantined"
            for issue in r["issues"]
        )
    )
    value = {
        "version": VERSION,
        "headers": headers,
        "fields": fields,
        "missing_mapping": sorted(missing),
        "suggested_mapping": suggest(headers, kind),
        "schema_hash": digest(headers),
        "canonical_hash": digest(canonical.encode()),
        "canonical_csv": canonical,
        "rows": result,
        "counts": counts,
        "issues": issues,
        "controls": {k: str(v) for k, v in by_currency["USD"].items()},
        "controls_by_currency": {
            c: {k: str(v) for k, v in group.items()} for c, group in by_currency.items()
        },
        "unknown_source_amount_rows": unknown,
        "ready": bool(included) and not missing and not counts.get("quarantined"),
        "limitations": [
            "Customer-supplied CSV; review does not verify provider charges or causal revenue.",
            "Source-row numbers are lineage, not business IDs.",
            "Primary controls are USD only; other currencies remain separately partitioned and cannot enter the monthly calculation.",
            "Control partition accounts for parsed rows; it is not reconciliation to a provider bill.",
            "Preamble rows before the selected header remain in the original and are excluded from detail controls.",
        ],
    }
    if len(json.dumps(value).encode()) > 3_000_000 or len(canonical.encode()) > (
        3_000_000 if kind == "usage_csv" else 1_000_000
    ):
        raise AuditError(
            "normalized_limit",
            "Reviewed evidence exceeds retained limits. Aggregate by date and business dimensions.",
        )
    return value


def spreadsheet_csv(canonical, kind):
    """Separate human export; never change the canonical engine evidence."""
    stream = io.StringIO()
    writer = csv.DictWriter(
        stream, fieldnames=HEADERS[kind].split(","), lineterminator="\n"
    )
    writer.writeheader()
    for row in csv.DictReader(io.StringIO(canonical)):
        writer.writerow(
            {
                k: "'" + v
                if k not in NUMBERS and v.lstrip().startswith(("=", "+", "-", "@"))
                else v
                for k, v in row.items()
            }
        )
    return stream.getvalue()
