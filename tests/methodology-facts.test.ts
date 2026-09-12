import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  loadMethodologyFacts,
  readMethodologyFacts,
} from "../app/components/methodology/facts";

// Use the actual deterministic Python engine fixture, not duplicated display values.
const encoded = execFileSync(
  resolve("engine/.venv/Scripts/python.exe"),
  [
    "-c",
    "import sys,json;sys.path.insert(0,'engine');from app.company_demo import build_company_demo;print(json.dumps(build_company_demo()))",
  ],
  { encoding: "utf8", maxBuffer: 4_000_000 },
);
const fixture = () => JSON.parse(encoded);

test("worked examples map the real Northstar engine amounts and reporting basis", () => {
  const facts = readMethodologyFacts(fixture());
  assert.ok(facts);
  assert.equal(facts.month, "2026-08");
  assert.equal(facts.total, "43400.00");
  assert.equal(facts.inference, "28685.00");
  assert.equal(facts.humanReview, "12815.00");
  assert.equal(facts.unallocated, "1900");
  assert.equal(facts.invoice.original, "64000");
  assert.equal(facts.invoice.remainder, "0");
  assert.deepEqual(
    facts.invoice.portions.map((p) => [p.name, p.amount]),
    [
      ["Research briefs", "46000"],
      ["Document intelligence", "18000"],
    ],
  );
  assert.equal(
    facts.workloads.find((w) => w.name === "Document intelligence")
      ?.contribution,
    "-1200.00",
  );
  const finance = facts.workloads.find(
    (w) => w.name === "Finance document review",
  )!;
  assert.equal(finance.confidence.cost.score, 80);
  assert.equal(finance.variance, "-220.00");
  assert.equal(finance.confidence.revenue.score, null);
  assert.equal(facts.supportComparison.baselineDifference, "860.00");
  const support = facts.workloads.find((w) => w.name === "Support resolution")!;
  assert.equal(support.accepted, "7200");
  assert.equal(support.runs, 45);
  assert.notEqual(
    Number(support.acceptanceRate),
    (Number(support.accepted) / support.runs) * 100,
  );
});

test("no missing, non-synthetic or unexpected-company response becomes a worked example", () => {
  for (const value of [null, {}, [], { synthetic: true }, fixture()]) {
    if (value && typeof value === "object" && "company" in value)
      value.synthetic = false;
    assert.equal(readMethodologyFacts(value), null);
  }
  const wrong = fixture();
  wrong.company.name = "Customer company";
  assert.equal(readMethodologyFacts(wrong), null);
  const next = fixture();
  next.scenario_version = "northstar-2.0";
  assert.equal(readMethodologyFacts(next), null);
});

test("invoice over-allocation, duplicate portions and a provenance upgrade fail closed", () => {
  for (const change of [
    (r: any) => {
      r.invoice_allocations[0].original_amount = "60000";
    },
    (r: any) => {
      r.invoice_allocations[0].allocations[1] = {
        ...r.invoice_allocations[0].allocations[0],
      };
    },
    (r: any) => {
      r.invoice_allocations[0].source_verified = true;
    },
  ]) {
    const data = fixture();
    change(data.reports.find((r: any) => r.month === "2026-08").result);
    assert.equal(readMethodologyFacts(data), null);
  }
});

test("unreconciled total, missing costs, invalid numbers and a false confidence score are unavailable", () => {
  for (const change of [
    (r: any) => {
      r.summary.known_cost = "43401";
    },
    (r: any) => {
      delete r.cost_components.inference;
    },
    (r: any) => {
      r.summary.known_cost = "Infinity";
    },
    (r: any) => {
      r.workloads.find(
        (w: any) => w.workload.name === "Finance document review",
      ).confidence.cost.score = 100;
    },
  ]) {
    const data = fixture();
    change(data.reports.find((r: any) => r.month === "2026-08").result);
    assert.equal(readMethodologyFacts(data), null);
  }
});

test("missing comparable period and unsupported comparison do not generate baseline savings", () => {
  const missing = fixture();
  missing.reports = missing.reports.filter((r: any) => r.month !== "2026-07");
  assert.equal(readMethodologyFacts(missing), null);
  const unsupported = fixture();
  unsupported.performance.at(-1).comparison.eligible = false;
  assert.equal(readMethodologyFacts(unsupported), null);
  const changed = fixture();
  changed.performance
    .at(-1)
    .comparison.workloads.find(
      (w: any) => w.name === "Support resolution",
    ).volume_adjusted_cost_difference = "99999";
  assert.equal(readMethodologyFacts(changed), null);
  const percentage = fixture();
  percentage.performance
    .at(-1)
    .comparison.workloads.find(
      (w: any) => w.name === "Support resolution",
    ).unit_cost.percent = "-99";
  assert.equal(readMethodologyFacts(percentage), null);
});

test("failed requests and malformed responses return an honest unavailable state", async () => {
  const statuses = [
    new Response("unavailable", { status: 503 }),
    new Response("{broken json"),
    new Response(JSON.stringify({ synthetic: false })),
  ];
  for (const response of statuses)
    assert.equal(
      await loadMethodologyFacts((async () => response) as typeof fetch),
      null,
    );
  assert.equal(
    await loadMethodologyFacts((async () => {
      throw new Error("network unavailable");
    }) as typeof fetch),
    null,
  );
});

test("public example loader calls only the existing fixed endpoint without credentials", async () => {
  let calls = 0;
  const result = await loadMethodologyFacts((async (url, options) => {
    calls++;
    assert.equal(url, "/api/demo/company");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal);
    return new Response(encoded, {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.equal(result?.company, "Northstar Intelligence");
});
