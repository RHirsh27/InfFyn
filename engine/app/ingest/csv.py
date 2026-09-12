"""Token-usage CSV validation and normalization (fail closed)."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

REQUIRED_COLUMNS = (
    "date",
    "model",
    "feature",
    "customer_segment",
    "input_tokens",
    "output_tokens",
    "requests",
    "revenue_usd",
)


@dataclass(frozen=True)
class ParsedUsageRow:
    row_number: int
    occurred_at: str
    model: str
    feature: str
    customer_ref: str
    input_tokens: int
    output_tokens: int
    quantity: int
    raw_ref: str


class CsvValidationError(Exception):
    def __init__(self, message: str, errors: list[str] | None = None):
        super().__init__(message)
        self.errors = errors or [message]


def _normalize_header(name: str) -> str:
    return name.strip().lower()


def validate_headers(fieldnames: list[str] | None) -> list[str]:
    if not fieldnames:
        raise CsvValidationError(
            "missing required column: date",
            ["missing required column: date"],
        )

    normalized = {_normalize_header(h): h for h in fieldnames if h}
    missing = [col for col in REQUIRED_COLUMNS if col not in normalized]
    if missing:
        errors = [f"missing required column: {col}" for col in missing]
        raise CsvValidationError(errors[0], errors)

    return [_normalize_header(h) for h in fieldnames if h]


def _parse_date(value: str, row_number: int) -> str:
    raw = value.strip()
    if not raw:
        raise CsvValidationError(
            f"row {row_number}: date must not be empty",
            [f"row {row_number}: date must not be empty"],
        )

    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            parsed = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except ValueError:
            continue

    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()
    except ValueError as exc:
        raise CsvValidationError(
            f"row {row_number}: unparseable date value '{value}'",
            [f"row {row_number}: unparseable date value '{value}'"],
        ) from exc


def _parse_non_negative_int(value: str, field: str, row_number: int) -> int:
    raw = value.strip()
    if not raw:
        raise CsvValidationError(
            f"row {row_number}: unparseable {field} value '{value}'",
            [f"row {row_number}: unparseable {field} value '{value}'"],
        )
    try:
        parsed = int(raw)
    except ValueError as exc:
        raise CsvValidationError(
            f"row {row_number}: unparseable {field} value '{value}'",
            [f"row {row_number}: unparseable {field} value '{value}'"],
        ) from exc
    if parsed < 0:
        raise CsvValidationError(
            f"row {row_number}: {field} must be non-negative",
            [f"row {row_number}: {field} must be non-negative"],
        )
    return parsed


def _require_non_empty(value: str, field: str, row_number: int) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise CsvValidationError(
            f"row {row_number}: {field} must not be empty",
            [f"row {row_number}: {field} must not be empty"],
        )
    return trimmed


def parse_token_usage_csv(content: bytes, storage_path: str) -> list[ParsedUsageRow]:
    """Validate and normalize CSV content. Raises CsvValidationError on any issue."""
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    validate_headers(reader.fieldnames)

    rows: list[ParsedUsageRow] = []
    row_errors: list[str] = []

    for idx, raw_row in enumerate(reader, start=2):
        if not any(v and str(v).strip() for v in raw_row.values()):
            continue

        normalized_row = {
            _normalize_header(k): (v if v is not None else "")
            for k, v in raw_row.items()
            if k
        }

        try:
            occurred_at = _parse_date(normalized_row["date"], idx)
            model = _require_non_empty(normalized_row["model"], "model", idx)
            feature = _require_non_empty(normalized_row["feature"], "feature", idx)
            customer_ref = _require_non_empty(
                normalized_row["customer_segment"], "customer_segment", idx
            )
            input_tokens = _parse_non_negative_int(
                normalized_row["input_tokens"], "input_tokens", idx
            )
            output_tokens = _parse_non_negative_int(
                normalized_row["output_tokens"], "output_tokens", idx
            )
            quantity = _parse_non_negative_int(
                normalized_row["requests"], "requests", idx
            )
            # revenue_usd validated by header presence only (E3.2/E4 scope)

            rows.append(
                ParsedUsageRow(
                    row_number=idx,
                    occurred_at=occurred_at,
                    model=model,
                    feature=feature,
                    customer_ref=customer_ref,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    quantity=quantity,
                    raw_ref=f"storage://{storage_path}#row={idx}",
                )
            )
        except CsvValidationError as exc:
            row_errors.extend(exc.errors)

    if row_errors:
        raise CsvValidationError(row_errors[0], row_errors)

    if not rows:
        raise CsvValidationError(
            "CSV contains no data rows",
            ["CSV contains no data rows"],
        )

    return rows


def to_usage_event_records(
    parsed_rows: list[ParsedUsageRow], tenant_id: str
) -> list[dict[str, Any]]:
    return [
        {
            "tenant_id": tenant_id,
            "source": "token_csv",
            "occurred_at": row.occurred_at,
            "model": row.model,
            "feature": row.feature,
            "unit": "tokens",
            "input_tokens": row.input_tokens,
            "output_tokens": row.output_tokens,
            "quantity": row.quantity,
            "customer_ref": row.customer_ref,
            "raw_ref": row.raw_ref,
            "confidence": "clean",
        }
        for row in parsed_rows
    ]
