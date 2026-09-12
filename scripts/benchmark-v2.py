"""Synthetic maximum-usage-row audit; no provider requests or credentials."""

import json
import sys
from pathlib import Path
from time import perf_counter

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "engine"))
from app.v2.contract import AuditInput
from app.v2.economics import calculate, sensitivity

count = 20000
usage = (
    "event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,customer_segment,feature,run_id,billed_cost,cost_source\n"
    + "\n".join(
        f"u{i},2026-08-01,synthetic,m,100,30,1,c{i % 100},growth,f{i % 5},r{i},0.01,synthetic export"
        for i in range(count)
    )
)
revenue = "revenue_id,date,amount,currency,customer_id,feature,method\n" + "\n".join(
    f"rev{i},2026-08-01,10,USD,c{i % 100},,direct" for i in range(5000)
)
body = AuditInput(
    kind="product",
    period_start="2026-08-01",
    period_end="2026-08-31",
    usage_csv=usage,
    revenue_csv=revenue,
    revenue_source="reviewed_file",
    revenue_basis="recognized",
    revenue_reviewed=True,
    feature_allocation="requests",
)
start = perf_counter()
result = calculate(body)
comparison = sensitivity(body, result)
elapsed = perf_counter() - start
assert (
    result["summary"]["known_cost"] == "200.00"
    and result["summary"]["revenue"] == "50000"
)
print(
    json.dumps(
        {
            "synthetic": True,
            "usage_rows": count,
            "revenue_rows": 5000,
            "calculation_and_sensitivity_seconds": round(elapsed, 3),
            "known_cost": result["summary"]["known_cost"],
            "revenue": result["summary"]["revenue"],
            "calculation_version": result["calculation_version"],
        }
    )
)
