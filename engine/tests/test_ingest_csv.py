from pathlib import Path

import pytest

from app.ingest.csv import CsvValidationError, parse_token_usage_csv, to_usage_event_records

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def test_sample_csv_parses_two_rows():
    content = (FIXTURES / "token-usage-sample.csv").read_bytes()
    rows = parse_token_usage_csv(content, "tenant-a/uploads/file.csv")
    assert len(rows) == 2
    assert rows[0].model == "gpt-4"
    assert rows[0].input_tokens == 10000
    assert rows[0].quantity == 150
    assert rows[0].customer_ref == "enterprise"
    assert rows[0].raw_ref == "storage://tenant-a/uploads/file.csv#row=2"


def test_missing_column_fail_closed():
    content = (FIXTURES / "token-usage-missing-input-tokens.csv").read_bytes()
    with pytest.raises(CsvValidationError) as exc:
        parse_token_usage_csv(content, "tenant-a/uploads/bad.csv")
    assert "missing required column: input_tokens" in exc.value.errors[0]


def test_unparseable_token_value():
    csv_text = (
        "date,model,feature,customer_segment,input_tokens,output_tokens,requests,revenue_usd\n"
        "2026-01-01,gpt-4,chat,enterprise,not-a-number,100,1,1.00\n"
    )
    with pytest.raises(CsvValidationError) as exc:
        parse_token_usage_csv(csv_text.encode(), "path.csv")
    assert "unparseable input_tokens" in exc.value.errors[0]


def test_empty_model_rejected():
    csv_text = (
        "date,model,feature,customer_segment,input_tokens,output_tokens,requests,revenue_usd\n"
        "2026-01-01,,chat,enterprise,100,100,1,1.00\n"
    )
    with pytest.raises(CsvValidationError) as exc:
        parse_token_usage_csv(csv_text.encode(), "path.csv")
    assert "model must not be empty" in exc.value.errors[0]


def test_to_usage_event_records_shape():
    content = (FIXTURES / "token-usage-sample.csv").read_bytes()
    rows = parse_token_usage_csv(content, "t/u.csv")
    records = to_usage_event_records(rows, "tenant-uuid")
    assert len(records) == 2
    assert records[0]["tenant_id"] == "tenant-uuid"
    assert records[0]["source"] == "token_csv"
    assert records[0]["unit"] == "tokens"
    assert records[0]["confidence"] == "clean"
    assert "linked_revenue_event_id" not in records[0]
