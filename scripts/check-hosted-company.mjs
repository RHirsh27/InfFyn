// Public, synthetic-only smoke checks. No authentication or customer data writes.
import assert from "node:assert/strict";
const base = process.argv[2] || "https://inffyn-preview.vercel.app";
if (new URL(base).hostname !== "inffyn-preview.vercel.app") throw new Error("Authorized review host only");
let count = 0;
async function check(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
let bundle;
await check("company walkthrough is publicly available", async () => {
  const r = await fetch(base + "/demo/monthly");
  assert.equal(r.status, 200); assert.match(await r.text(), /Company demonstration/);
});
await check("fixed demonstration has six synthetic read-only months", async () => {
  const r = await fetch(base + "/api/demo/company");
  assert.equal(r.status, 200); bundle = await r.json();
  assert.equal(bundle.synthetic, true); assert.equal(bundle.read_only, true);
  assert.equal(bundle.reports.length, 6); assert.equal(bundle.workloads.length, 5);
});
await check("all monthly financial totals and allocations reconcile", async () => {
  for (const report of bundle.reports) {
    const result = report.result;
    assert.equal(result.synthetic, true);
    const total = result.workloads.reduce((sum, item) => sum + Math.round(Number(item.summary.known_cost) * 100), 0);
    assert.equal(total, Math.round(Number(result.summary.known_cost) * 100));
    for (const invoice of result.invoice_allocations) {
      const parts = invoice.allocations.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
      assert.equal(parts + Math.round(Number(invoice.remainder) * 100), Math.round(Number(invoice.original_amount) * 100));
      assert.equal(invoice.source_verified, false);
    }
  }
});
await check("August demonstrates material loss, unallocated cost and control variance", async () => {
  const r = bundle.reports.find(x => x.month === "2026-08").result;
  assert.equal(Number(r.summary.known_cost), 43400);
  assert.equal(Number(r.summary.unallocated_cost), 1900);
  assert.equal(Number(r.workloads.find(x => x.workload.name === "Document intelligence").summary.contribution), -1200);
  assert.equal(Number(r.workloads.find(x => x.workload.name === "Finance document review").control_variance), -220);
});
await check("demo connections do not claim real provider access", async () => {
  assert.ok(bundle.connections.every(x => !x.available));
});
await check("repeated public reads preserve historical report fingerprints", async () => {
  const other = await (await fetch(base + "/api/demo/company")).json();
  assert.deepEqual(other.reports.map(x => x.fingerprint), bundle.reports.map(x => x.fingerprint));
});
await check("the demo endpoint rejects writes", async () => {
  assert.equal((await fetch(base + "/api/demo/company", { method: "POST", headers: { Origin: base } })).status, 405);
});
await check("private drafts and local validation stay inaccessible on the review host", async () => {
  for (const path of ["/api/v2/monthly/drafts/2026-08", "/validation/monthly", "/api/validation/monthly/drafts/2026-08"]) {
    const r = await fetch(base + path, { redirect: "manual" });
    assert.equal(r.status, 307); assert.equal(r.headers.get("location"), "/review");
  }
});
console.log(`${count} hosted company checks passed. This does not verify customer auth, persistence or provider imports.`);
