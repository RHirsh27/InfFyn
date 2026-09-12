"""Generate explicitly synthetic evidence and two-client portfolio snapshots."""
import csv
import json
import tempfile
from datetime import datetime
from pathlib import Path

from prototype.ledger import Ledger, METERS

HERE = Path(__file__).parent / "examples"
START = "2026-08-01T00:00:00Z"
END = "2026-09-01T00:00:00Z"


def demo_bundle(tenant="synthetic-outreach-client", multiplier=1):
    rate = {"tenant_id": tenant, "version": "synthetic-standard-2026-08", "provider": "synthetic-provider", "account": "account-shared-id", "model": "synthetic-text-model", "currency": "USD", "effective_start": START, "effective_end": END, "received_at": START, "source_ref": "SYNTHETIC contract; no real provider prices", "per_million": {"input_uncached": "2", "input_cached": "0.5", "cache_write": "3", "output": "10"}}
    def usage(source_id, customer, inp, cached, out, **changes):
        e = {"tenant_id": tenant, "source": "synthetic-request-log", "source_id": source_id, "kind": "usage", "incurred_at": "2026-08-15T12:00:00Z", "received_at": "2026-08-15T12:01:00Z", "currency": "USD", "provider": rate["provider"], "account": rate["account"], "customer_id": customer, "model": rate["model"], "request_id": source_id, "rate_version": rate["version"], "attempt": 1, "outcome": "success", "billable": True, "input_total": (inp + cached) * multiplier, "meters": {"input_uncached": inp * multiplier, "input_cached": cached * multiplier, "cache_write": 0, "output": out * multiplier}}
        e.update(changes)
        return e
    events = [usage("attempt-001", "campaign-owner-a", 400_000_000, 200_000_000, 50_000_000), usage("attempt-002", "campaign-owner-b", 300_000_000, 100_000_000, 40_000_000), usage("retry-001", "campaign-owner-b", 50_000_000, 0, 5_000_000, request_id="logical-retry", outcome="error"), usage("retry-002", "campaign-owner-b", 50_000_000, 0, 5_000_000, request_id="logical-retry", attempt=2), usage("unassigned-001", None, 25_000_000, 0, 5_000_000)]
    events += [{"tenant_id": tenant, "source": "synthetic-recognized-revenue", "source_id": "revenue-001", "kind": "revenue", "incurred_at": "2026-08-31T23:00:00Z", "received_at": "2026-09-01T01:00:00Z", "currency": "USD", "customer_id": "campaign-owner-a", "amount": str(5000 * multiplier), "basis": "recognized"}, {"tenant_id": tenant, "source": "synthetic-recognized-revenue", "source_id": "revenue-002", "kind": "revenue", "incurred_at": "2026-08-31T23:00:00Z", "received_at": "2026-09-01T01:00:00Z", "currency": "USD", "customer_id": "campaign-owner-b", "amount": str(4000 * multiplier), "basis": "recognized"}, {"tenant_id": tenant, "source": "synthetic-provider-invoice", "source_id": "invoice-001", "kind": "invoice", "incurred_at": END, "received_at": "2026-09-02T00:00:00Z", "currency": "USD", "provider": rate["provider"], "account": rate["account"], "amount": str(3200 * multiplier), "service_start": START, "service_end": END}]
    return {"fixture_notice": "ALL DATA SYNTHETIC. No customer/provider evidence or market validation.", "rates": [rate], "events": events}


def main():
    HERE.mkdir(exist_ok=True)
    bundle = demo_bundle()
    (HERE / "synthetic-input.json").write_text(json.dumps(bundle, indent=2) + "\n", encoding="utf8")
    columns = ["tenant_id", "source", "source_id", "incurred_at", "received_at", "currency", "provider", "account", "customer_id", "model", "request_id", "rate_version", "attempt", "outcome", "billable", "input_total", *METERS]
    with (HERE / "synthetic-attempts.csv").open("w", encoding="utf8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for event in bundle["events"]:
            if event["kind"] == "usage":
                flattened = {**event, **event["meters"], "billable": str(event["billable"]).lower()}
                writer.writerow({key: flattened.get(key) for key in columns})
    with tempfile.TemporaryDirectory() as tmp:
        ledger = Ledger(Path(tmp) / "synthetic.sqlite")
        try:
            ledger.import_bundle(bundle)
            first = ledger.create_snapshot("synthetic-outreach-client", "August initial review", START, END, "2026-09-03T00:00:00Z", "USD")
            late = {**bundle["events"][-1], "source_id": "credit-late-001", "amount": "-100", "document_type": "credit", "received_at": "2026-09-05T00:00:00Z"}
            ledger.import_bundle({"events": [late]})
            adjusted = ledger.create_snapshot("synthetic-outreach-client", "August later credit", START, END, "2026-09-06T00:00:00Z", "USD", first["name"])
            ledger.import_bundle(demo_bundle("synthetic-second-client", 2))
            second = ledger.create_snapshot("synthetic-second-client", "August initial review", START, END, "2026-09-03T00:00:00Z", "USD")
            for name, value in (("demo-close.json", first), ("demo-adjustment.json", adjusted), ("portfolio-close.json", {"synthetic": True, "portfolio_isolation_notice": "Client IDs are isolated in the ledger; portfolio access is this local operator only, not partner RBAC.", "clients": [first, second]}), ("synthetic-late-credit.json", {"events": [late]})):
                (HERE / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")
        finally:
            ledger.close()
    native = {"id": "resp_SYNTHETIC_EXAMPLE_ONLY", "object": "response", "created_at": int(datetime.fromisoformat("2026-08-15T12:00:00+00:00").timestamp()), "status": "completed", "model": "synthetic-model-not-a-real-rate", "service_tier": "default", "tools": [], "output": [], "usage": {"input_tokens": 1000, "input_tokens_details": {"cached_tokens": 200}, "output_tokens": 100, "output_tokens_details": {"reasoning_tokens": 0}, "total_tokens": 1100}}
    (HERE / "synthetic-openai-response.json").write_text(json.dumps(native, indent=2) + "\n", encoding="utf8")
    print("Generated synthetic fixture and portfolio JSON under prototype/examples")


if __name__ == "__main__":
    main()
