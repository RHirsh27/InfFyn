// Exercises the real local application proxy and engine with disposable synthetic evidence.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.argv[2] || "http://127.0.0.1:3012";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("This synthetic validation script is loopback-only.");
let checks = 0;
async function request(path, method = "GET", body) {
  return fetch(`${base}/api/validation/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: base },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(path, method = "GET", body) {
  const r = await request(path, method, body);
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return d;
}
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
const workload = randomUUID(),
  suffix = workload.slice(0, 8);
await check(
  "scheduled maintenance requires its own server credential",
  async () => {
    const r = await fetch(base + "/api/maintenance");
    assert.equal(r.status, 401);
  },
);
await check(
  "monthly app renders with private-workspace navigation",
  async () => {
    const r = await fetch(base + "/validation/monthly");
    assert.equal(r.status, 200);
    const h = await r.text();
    for (const text of ["Overview", "Workloads", "Reports", "Settings"])
      assert.ok(h.includes(text));
  },
);
await check(
  "cross-origin mutations rejected by application proxy",
  async () => {
    const r = await fetch(
      `${base}/api/validation/monthly/workloads/${workload}`,
      {
        method: "POST",
        headers: {
          Origin: "https://untrusted.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(r.status, 403);
  },
);
await json(`monthly/workloads/${workload}`, "POST", {
  name: `Synthetic HTTP support ${suffix}`,
  kind: "internal",
  outcome_unit: "accepted resolution",
  cost_scope: "Usage, retries, and review labor",
  acceptance_definition: "Operator accepts resolved case",
  mappings: {},
});
function payload(month, cost, accepted) {
  return {
    month,
    company_scope_complete: true,
    workloads: [
      {
        workload_id: workload,
        audit: {
          kind: "internal",
          period_start: month + "-01",
          period_end: month + "-31",
          cost_basis: "events",
          usage_csv: `event_id,date,provider,model,input_tokens,output_tokens,requests,run_id,billed_cost,cost_source\n${suffix}-u1,${month}-02,synthetic,test,100,20,1,r1,${cost},synthetic HTTP fixture\n${suffix}-u2,${month}-02,synthetic,test,100,20,1,r2,0,synthetic failed run`,
          outcomes_csv: `run_id,status,accepted_quantity\nr1,accepted,${accepted}\nr2,failed,0`,
          cost_scope_complete: true,
          outcome_cohort_complete: true,
        },
        review: {
          source_note: "Synthetic local validation only",
          method_reviewed: true,
          outcome_method_reviewed: true,
          expected_runs: 2,
          control_cost: String(cost),
          control_source: "Synthetic independent control",
        },
      },
    ],
  };
}
const july = await json("monthly/reports", "POST", payload("2026-07", 20, 2));
const august = await json("monthly/reports", "POST", payload("2026-08", 30, 6));
await check("report retries deduplicate through the HTTP stack", async () => {
  assert.equal(
    (await json("monthly/reports", "POST", payload("2026-08", 30, 6))).id,
    august.id,
  );
});
await check(
  "selecting versions creates comparable monthly history",
  async () => {
    const selections = (await json("monthly/reports")).selections;
    for (const r of [july, august])
      await json("monthly/selection", "POST", {
        report_id: r.id,
        expected_report_id:
          selections.find((s) => s.month === r.month)?.report_id || null,
        reason: "Synthetic HTTP acceptance",
      });
    const p = await json("monthly/performance");
    const comparison = p.months.find(
      (m) => m.report.id === august.id,
    ).comparison;
    assert.equal(comparison.eligible, true);
    assert.equal(Number(comparison.spend.percent), 50);
    assert.equal(Number(comparison.workloads[0].unit_cost.percent), -50);
    assert.equal(
      Number(comparison.workloads[0].volume_adjusted_cost_difference),
      30,
    );
  },
);
await check("saved report and source evidence remain retrievable", async () => {
  const r = await json(`monthly/reports/${august.id}`);
  assert.equal(r.fingerprint, august.fingerprint);
  const e = await json(`monthly/reports/${august.id}/evidence`);
  assert.ok(
    e.payload.workloads[0].audit.usage_csv.includes("synthetic HTTP fixture"),
  );
});
await check("invalid evidence cannot become a plausible report", async () => {
  const p = payload("2026-08", 30, 6);
  p.workloads[0].audit.usage_csv = "invalid";
  assert.equal((await request("monthly/reports", "POST", p)).status, 422);
});
await check(
  "provider operations remain disabled in local validation",
  async () => {
    const r = await json("monthly/connections");
    assert.ok(r.connections.every((c) => !c.available));
    assert.equal(
      (
        await request("monthly/imports/openai", "POST", {
          month: "2026-08",
          request_id: randomUUID(),
        })
      ).status,
      404,
    );
  },
);
console.log(
  `${checks} local monthly HTTP checks passed. Synthetic evidence only; no hosted auth, billing, or provider verification implied.`,
);
