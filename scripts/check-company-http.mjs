// Real loopback HTTP checks. Fixtures never target a customer workspace or provider.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.argv[2] || "http://127.0.0.1:3012";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Loopback only");
let count = 0;
async function check(label, fn) { await fn(); count++; console.log(`PASS ${label}`); }
async function request(path, method = "GET", body, origin = base) {
  return fetch(base + "/api/validation/monthly/" + path, {
    method, headers: { Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(path, method, body) {
  const r = await request(path, method, body); const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d)); return d;
}
await check("public company demonstration renders without database credentials", async () => {
  const r = await fetch(base + "/demo/monthly");
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("InfFyn"));
});
await check("six company months reconcile through the real engine", async () => {
  const r = await fetch(base + "/api/demo/company");
  assert.equal(r.status, 200); const d = await r.json();
  assert.equal(d.synthetic, true); assert.equal(d.reports.length, 6);
  const last = d.reports.find(r => r.month === "2026-08").result;
  assert.equal(Number(last.summary.known_cost), 43400);
  assert.equal(Number(last.summary.unallocated_cost), 1900);
  assert.equal(Number(last.workloads.find(w => w.workload.name === "Document intelligence").summary.contribution), -1200);
  assert.equal(d.connections.filter(c => c.available).length, 0);
});
const month = "2026-05";
let saved, content = { month, workloads: [], step: "assign" };
await check("incomplete monthly preparation persists across HTTP requests", async () => {
  const before = await json(`drafts/${month}`);
  const first = await json(`drafts/${month}`, "PUT", { expected_revision: before.draft?.revision || 0, content });
  saved = first.draft;
  const resumed = (await json(`drafts/${month}`)).draft;
  assert.equal(resumed.revision, saved.revision);
  // The server can move an outdated definition back to reconciliation. Resume
  // its canonical saved content, not a now-invalid client confirmation.
  assert.deepEqual(resumed.content, saved.content);
  assert.ok(resumed.evidence_expires_at);
});
await check("stale editor writes cannot overwrite a saved draft", async () => {
  const r = await request(`drafts/${month}`, "PUT", { expected_revision: saved.revision - 1, content });
  assert.equal(r.status, 409);
  assert.equal((await json(`drafts/${month}`)).draft.revision, saved.revision);
});
await check("draft PUT keeps the same origin protection as report writes", async () => {
  assert.equal((await request(`drafts/${month}`, "PUT", { expected_revision: saved.revision, content }, "https://untrusted.invalid")).status, 403);
});
await check("credentials cannot be smuggled into durable preparation", async () => {
  const r = await request(`drafts/${month}`, "PUT", {
    expected_revision: saved.revision, content: { ...content, credential: "synthetic-forbidden-field" },
  });
  assert.equal(r.status, 422);
});
await check("unretained or foreign imports cannot prepare provider-origin evidence", async () => {
  const r = await request("prepare", "POST", { month, import_ids: [randomUUID()] });
  assert.equal(r.status, 422);
});
await check("an unfinished empty draft cannot become a plausible report", async () => {
  assert.equal((await request("reports", "POST", { month, workloads: [] })).status, 422);
});
await check("monthly draft cannot cross the local tenant boundary", async () => {
  const r = await fetch(`http://127.0.0.1:8012/v2/monthly/drafts/${month}`, {
    headers: { "X-Tenant-Id": randomUUID() },
  });
  assert.equal(r.status, 403);
});
console.log(`${count} company HTTP checks passed`);
