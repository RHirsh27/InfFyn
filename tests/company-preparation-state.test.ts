import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePreparedEvidence,
  readEvidenceCsv,
} from "../app/components/monthly/preparation-state";
import { headers } from "../app/lib/audit-v2";
import { evidenceFor, type Workload, type WorkloadEvidence } from "../app/lib/monthly";

const month = "2026-08";
const definition: Workload = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Document intelligence",
  kind: "product",
  purpose: "Extract reviewed customer documents",
  responsible_team: "Product",
  cost_scope: "Inference and supporting review costs",
  acceptance_definition: "Reviewer accepts complete extracted fields",
  outcome_unit: "accepted document",
  unallocated: false,
  mappings: {},
};
const costsHeader = "cost_id,date,category,amount,currency,source";
const usage = `${headers.usage_csv}\nevent-1,2026-08-01,openai,fixture-model,1000,200,1,customer-1,Enterprise,Document intelligence,Document intelligence,Product,run-1,10,Fixture usage,0,USD\n`;
const outcomes = "run_id,status,accepted_quantity\nrun-1,accepted,40\n";
const manualCost = "review-1,2026-08-01,human_review,500,USD,Reviewed time ledger\n";
const oldProviderCost = "provider-old,2026-08-01,inference,18000,USD,Provider export\n";
const providerCost = "provider-new,2026-08-01,inference,22000,USD,Provider export\n";
const revenueHeader = "revenue_id,date,amount,currency,customer_id,feature,method,allocation_note";
const invoicePortion = "stripe-allocation:part-a,2026-08-01,35000,USD,customer-1,Document intelligence,allocated,Reviewed invoice split\n";

function evidence(): WorkloadEvidence {
  const result = evidenceFor(definition, month);
  result.audit.cost_basis = "expenses";
  result.audit.costs_csv = costsHeader + "\n" + manualCost;
  result.audit.outcomes_csv = outcomes;
  result.review.source_note = "Reviewed supporting expense ledger.";
  return result;
}

function prepared(options: { costs?: string; revenue?: string } = {}): WorkloadEvidence {
  const result = evidenceFor(definition, month);
  result.audit.cost_basis = "provider_totals";
  result.audit.costs_csv = options.costs === undefined ? costsHeader + "\n" + providerCost : options.costs;
  result.audit.revenue_csv = options.revenue || "";
  result.import_ids = ["import-current"];
  result.review.source_note = "Prepared from retained provider imports.";
  return result;
}

function merge(old: WorkloadEvidence[], incoming: WorkloadEvidence[], ids = new Set<string>()) {
  return mergePreparedEvidence(old, incoming, [definition], month, ids, ["import-current"]);
}

test("quoted descriptions, embedded newlines, escaped quotes and CRLF preserve evidence", () => {
  const records = readEvidenceCsv('\uFEFFcost_id,source,amount\r\nc1,"Reviewed, \"\"approved\"\"\r\nby finance",12000.25\r\n');
  assert.deepEqual(records, [{ cost_id: "c1", source: 'Reviewed, "approved"\r\nby finance', amount: "12000.25" }]);
});

test("malformed CSV fails before preparation can rewrite the user's evidence", () => {
  for (const csv of [
    'cost_id,amount\nc1,"12',
    "cost_id,amount\nc1,12,extra",
    "cost_id,amount,amount\nc1,12,12000",
    'cost_id,amount\nc"1",12',
    'cost_id,amount\n"c1"ignored,12',
  ]) {
    assert.throws(() => readEvidenceCsv(csv), Error, `CSV should fail without a lossy rewrite: ${csv}`);
  }
});

test("an empty-valued row remains visible for validation instead of disappearing", () => {
  assert.deepEqual(readEvidenceCsv("cost_id,amount\n,\n"), [{ cost_id: "", amount: "" }]);
});

test("revenue-only preparation preserves event costs, outcome cohorts and manual supporting costs", () => {
  const old = evidence();
  old.audit.cost_basis = "events";
  old.audit.usage_csv = usage;
  const before = structuredClone(old);
  const [next] = merge([old], [prepared({ costs: "", revenue: revenueHeader + "\n" + invoicePortion })]);
  assert.equal(next.audit.usage_csv, usage);
  assert.equal(next.audit.cost_basis, "events");
  assert.equal(next.audit.outcomes_csv, outcomes);
  assert.deepEqual(readEvidenceCsv(next.audit.costs_csv).map(r => [r.cost_id, r.amount]), [["review-1", "500"]]);
  assert.equal(readEvidenceCsv(next.audit.revenue_csv)[0].amount, "35000");
  assert.equal(next.audit.revenue_reviewed, false);
  assert.equal(next.review.method_reviewed, false);
  assert.deepEqual(old, before, "Preparation must not mutate the existing draft in place");
});

test("replacing retained provider evidence keeps independently uploaded expenses and outcomes", () => {
  const old = evidence();
  old.audit.cost_basis = "provider_totals";
  old.audit.costs_csv = costsHeader + "\n" + manualCost + oldProviderCost;
  old.import_ids = ["import-old"];
  const [next] = merge([old], [prepared()], new Set(["provider-old"]));
  assert.deepEqual(readEvidenceCsv(next.audit.costs_csv).map(r => [r.cost_id, r.amount]), [["review-1", "500"], ["provider-new", "22000"]]);
  assert.equal(next.audit.outcomes_csv, outcomes);
  assert.deepEqual(next.import_ids, ["import-current"]);
  assert.equal(next.audit.cost_scope_complete, false);
});

test("preparing the same imports twice does not duplicate financial rows or review notes", () => {
  const incoming = prepared({ revenue: revenueHeader + "\n" + invoicePortion });
  const first = merge([evidence()], [incoming]);
  const repeated = merge(first, [incoming], new Set(["provider-new"]));
  assert.deepEqual(repeated, first);
});

test("aggregate provider costs cannot be added over an existing event-cost basis", () => {
  const old = evidence();
  old.audit.cost_basis = "events";
  old.audit.usage_csv = usage;
  assert.throws(() => merge([old], [prepared()]), /event costs|cost basis|overlap/i);
  assert.equal(old.audit.usage_csv, usage);
  assert.equal(old.audit.outcomes_csv, outcomes);
});

test("a duplicate unrecognized cost identity cannot silently overwrite a manual record", () => {
  const old = evidence();
  assert.throws(() => merge([old], [prepared({ costs: costsHeader + "\n" + manualCost })]), /duplicate|same identity/i);
});

test("Stripe preparation rejects mixing separately supplied collections under provider-verified provenance", () => {
  const old = evidence();
  old.audit.revenue_csv = revenueHeader + "\nmanual-revenue,2026-08-01,9000,USD,customer-1,Document intelligence,direct,\n";
  old.audit.revenue_source = "reviewed_file";
  old.audit.revenue_basis = "collections";
  assert.throws(() => merge([old], [prepared({ costs: "", revenue: revenueHeader + "\n" + invoicePortion })]), /revenue|Stripe|source|collections/i);
});

test("a previously supplied recognized-revenue basis cannot silently become invoice collections", () => {
  const old = evidence();
  old.audit.revenue_csv = revenueHeader + "\nmanual-revenue,2026-08-01,9000,USD,customer-1,Document intelligence,direct,\n";
  old.audit.revenue_source = "reviewed_file";
  old.audit.revenue_basis = "recognized";
  assert.throws(() => merge([old], [prepared({ costs: "", revenue: revenueHeader + "\n" + invoicePortion })]), /revenue basis|collections/i);
});
