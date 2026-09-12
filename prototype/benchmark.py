"""Bounded local synthetic benchmark; never connects to a provider.

Run from the repository root: python -B -m prototype.benchmark
The ledger source is read and loaded exactly once, then fingerprinted in output.
"""
from __future__ import annotations

import _thread
import hashlib
import json
import os
import platform
import sys
import tempfile
import threading
import time
import types
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path


START = "2026-08-01T00:00:00Z"
END = "2026-09-01T00:00:00Z"
ASOF = "2026-09-03T00:00:00Z"
TENANT = "synthetic-performance-client"


def bundle(count, with_workflows=False):
    rates = []
    for index in range(2):
        rates.append(dict(tenant_id=TENANT, version=f"rate-{index}",
            provider="synthetic-provider", account="synthetic-account",
            model=f"synthetic-model-{index}", currency="USD",
            effective_start=START, effective_end=END, received_at=START,
            source_ref="synthetic-price-contract",
            per_million={"input_uncached": str(2 + index),
                         "input_cached": "0.5", "cache_write": "3", "output": str(6 + index)}))
    events, total, token_total = [], Decimal("0"), 0
    for index in range(count):
        input_total = 256 + (index * 137) % 7937
        cached = input_total // 2 if index % 3 == 0 else 0
        output = 64 + (index * 41) % 961
        meters = dict(input_uncached=input_total - cached, input_cached=cached,
                      cache_write=0, output=output)
        billable = index % 40 != 0
        moment = datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(seconds=index * 120)
        retry = index % 20 == 1
        events.append(dict(tenant_id=TENANT, source="synthetic-attempt-export",
            source_id=f"attempt-{index}", kind="usage", incurred_at=moment.isoformat(),
            received_at=(moment + timedelta(seconds=2)).isoformat(), currency="USD",
            provider="synthetic-provider", account="synthetic-account",
            customer_id=f"customer-{index % 10}", model=f"synthetic-model-{index % 2}",
            request_id=f"request-{index - 1 if retry else index}",
            rate_version=f"rate-{index % 2}", attempt=2 if retry else 1,
            outcome="success" if billable else "error", billable=billable,
            input_total=input_total, meters=meters))
        if with_workflows:
            events[-1].update(workflow_id="synthetic-workflow", run_id=f"run-{index // 2}",
                             customer_id=f"customer-{(index // 2) % 10}")
        if billable:
            total += sum(Decimal(quantity) * Decimal(rates[index % 2]["per_million"][meter])
                         / Decimal("1000000") for meter, quantity in meters.items())
        token_total += input_total + output
    events.append(dict(tenant_id=TENANT, source="synthetic-invoice",
        source_id="monthly-invoice", kind="invoice", incurred_at=END, received_at=ASOF,
        currency="USD", provider="synthetic-provider", account="synthetic-account",
        service_start=START, service_end=END, amount=str(total), document_type="invoice"))
    for index in range(10):
        events.append(dict(tenant_id=TENANT, source="synthetic-recognized-revenue",
            source_id=f"revenue-{index}", kind="revenue", incurred_at="2026-08-31T00:00:00Z",
            received_at=ASOF, currency="USD", customer_id=f"customer-{index}",
            amount="100", basis="recognized"))
    if with_workflows:
        for index in range(count // 2):
            moment = datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(seconds=(2 * index + 1) * 120 + 3)
            events.append(dict(tenant_id=TENANT, source="synthetic-business-review",
                source_id=f"outcome-{index}", kind="outcome", incurred_at=moment.isoformat(),
                received_at=(moment + timedelta(seconds=1)).isoformat(), currency="USD",
                customer_id=f"customer-{index % 10}", workflow_id="synthetic-workflow",
                run_id=f"run-{index}", metric="accepted_result", status="accepted",
                quantity=1, cohort_complete=True, evidence_ref=f"synthetic-review-{index}"))
    return {"rates": rates, "events": events}, total, token_total


def main():
    started = time.perf_counter()
    # Interrupt normal Python work first; a hard fallback bounds even a stuck call.
    soft = threading.Timer(40, _thread.interrupt_main)
    hard = threading.Timer(45, lambda: os._exit(124))
    soft.daemon = hard.daemon = True
    soft.start(); hard.start()
    path = Path(__file__).with_name("ledger.py")
    code = path.read_bytes()
    module = types.ModuleType("inffyn_bench_loaded_ledger")
    module.__file__ = str(path)
    sys.modules[module.__name__] = module
    exec(compile(code, str(path), "exec"), module.__dict__)
    result = {"python": platform.python_version(), "platform": platform.platform(),
              "ledger_sha256": hashlib.sha256(code).hexdigest(), "runs": [],
              "status": "complete", "deadline_seconds": 45}
    try:
        with tempfile.TemporaryDirectory(prefix="inffyn-local-bench-") as folder:
            for count, with_workflows in ((100, False), (500, False), (1000, False), (10000, False), (1000, True)):
                data, expected, tokens = bundle(count, with_workflows)
                ledger = module.Ledger(Path(folder) / f"attempts-{count}-workflows-{with_workflows}.sqlite")
                try:
                    before = time.perf_counter()
                    imported = ledger.import_bundle(data)
                    import_seconds = time.perf_counter() - before
                    before = time.perf_counter()
                    snapshot = ledger.create_snapshot(TENANT, "august", START, END, ASOF, "USD")
                    snapshot_seconds = time.perf_counter() - before
                    assert Decimal(snapshot["totals"]["cost_total"]) == expected
                    assert len(snapshot["rated_usage"]) == count
                    assert imported["inserted_events"] == len(data["events"])
                    assert snapshot["totals"]["cost_conservation"]
                    if with_workflows:
                        workflow = snapshot["workflow_economics"][0]
                        assert workflow["accepted_outcomes"] == count // 2
                        assert Decimal(workflow["cost_per_accepted_outcome"]) == expected / Decimal(count // 2)
                    result["runs"].append(dict(attempts=count, workflow_runs=count // 2 if with_workflows else 0,
                        event_rows=len(data["events"]),
                        tokens=tokens, cost_usd=str(expected), import_seconds=round(import_seconds, 6),
                        snapshot_seconds=round(snapshot_seconds, 6),
                        snapshot_bytes=len(module.canonical(snapshot).encode()),
                        baseline_quadratic_prior_rows=count * (count - 1) // 2))
                finally:
                    ledger.close()
    except KeyboardInterrupt:
        result["status"] = "stopped_at_soft_deadline"
    finally:
        result["elapsed_seconds"] = round(time.perf_counter() - started, 6)
        soft.cancel(); hard.cancel()
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "complete" else 124


if __name__ == "__main__":
    raise SystemExit(main())
