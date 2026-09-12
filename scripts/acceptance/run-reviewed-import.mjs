/** Explicitly invoked synthetic-company acceptance; no requests in default mode. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const cases = [
  "authenticated import and confirmation",
  "cross-company source denial",
  "source retries",
  "revision conflicts",
  "approved export",
  "recipe reuse",
  "draft attachment",
  "fresh-session persistence",
];
if (!process.argv.includes("--execute")) {
  console.log(
    JSON.stringify(
      {
        status: "PENDING_HOSTED_ACCEPTANCE",
        mutated: false,
        cases,
        prerequisites: [
          "Verified recovery and additive migration",
          "INFFYN_ACCEPTANCE_ENGINE_URL",
          "INFFYN_ACCEPTANCE_TOKEN_A and TOKEN_B",
          "INFFYN_ACCEPTANCE_TENANT_A and TENANT_B: dedicated empty synthetic companies",
          "--execute --synthetic-companies-only",
        ],
        separate_checks: [
          "Actual source backup/restore",
          "Browser login/session return",
          "Direct database denial",
          "Retention job",
          "Provider imports remain deferred",
        ],
      },
      null,
      2,
    ),
  );
} else {
  assert.ok(
    process.argv.includes("--synthetic-companies-only"),
    "Explicit synthetic-company attestation required",
  );
  const env = process.env,
    base = new URL(env.INFFYN_ACCEPTANCE_ENGINE_URL);
  assert.equal(base.protocol, "https:");
  assert.equal(base.username + base.password + base.search + base.hash, "");
  const ids = [env.INFFYN_ACCEPTANCE_TENANT_A, env.INFFYN_ACCEPTANCE_TENANT_B];
  assert.ok(
    ids.every((id) => /^[0-9a-f-]{36}$/i.test(id || "")) && ids[0] !== ids[1],
  );
  assert.ok(
    env.INFFYN_ACCEPTANCE_TOKEN_A && env.INFFYN_ACCEPTANCE_TOKEN_B,
    "Both authenticated sessions required",
  );
  async function call(
    path,
    method = "GET",
    data,
    second = false,
    expected = 200,
  ) {
    const response = await fetch(new URL("/v2/monthly/" + path, base), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${second ? env.INFFYN_ACCEPTANCE_TOKEN_B : env.INFFYN_ACCEPTANCE_TOKEN_A}`,
        "X-Tenant-Id": ids[second ? 1 : 0],
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    assert.equal(
      response.status,
      expected,
      `${method} acceptance route status mismatch; raw response withheld`,
    );
    return response.json();
  }
  const month = "2026-08",
    workload = randomUUID();
  assert.equal(
    (await call(`drafts/${month}`)).draft,
    null,
    "Designated test company already contains preparation; do not replace it",
  );
  await call(`workloads/${workload}`, "POST", {
    name: `Synthetic import acceptance ${workload.slice(0, 8)}`,
    kind: "internal",
    cost_scope: "Synthetic expenses only",
    mappings: {},
  });
  await call(`drafts/${month}`, "PUT", {
    expected_revision: 0,
    content: {
      month,
      workloads: [
        {
          workload_id: workload,
          audit: {
            kind: "internal",
            period_start: "2026-08-01",
            period_end: "2026-08-31",
            cost_basis: "expenses",
            usage_csv: "",
          },
        },
      ],
    },
  });
  const raw =
    "id,date,category,amount,currency,source\nsynthetic-1,2026-08-01,other,12000,USD,synthetic\n";
  const rules = {
    mapping: {
      cost_id: "id",
      date: "date",
      category: "category",
      amount: "amount",
      currency: "currency",
      source: "source",
    },
  };
  const request = {
    month,
    kind: "costs_csv",
    account: "synthetic-acceptance",
    filename: "synthetic.csv",
    original_base64: Buffer.from(raw).toString("base64"),
    rules,
  };
  const original = await call("import-reviews", "POST", request),
    id = original.source.id;
  assert.equal((await call("import-reviews", "POST", request)).source.id, id);
  await call(`import-reviews/${id}`, "GET", undefined, true, 404);
  const revised = await call(`import-reviews/${id}/revision`, "PUT", {
    expected_revision: 1,
    rules,
    decisions: [],
  });
  await call(
    `import-reviews/${id}/revision`,
    "PUT",
    { expected_revision: 1, rules, decisions: [] },
    false,
    409,
  );
  const confirmation = await call(`import-reviews/${id}/confirm`, "POST", {
    expected_revision: 2,
    canonical_hash: revised.profile.canonical_hash,
    accepted_limitations: true,
  });
  const exported = await call(
    `import-reviews/${id}/export?confirmation_id=${confirmation.id}`,
  );
  assert.ok(exported.canonical_csv.includes("12000"));
  await call("import-recipes", "POST", {
    source_id: id,
    expected_revision: 2,
    name: "Synthetic recurring source",
  });
  await call(`drafts/${month}/attach-reviewed-import`, "POST", {
    confirmation_id: confirmation.id,
    workload_id: workload,
    expected_revision: 1,
  });
  const fresh = await call(`drafts/${month}`);
  assert.equal(
    fresh.draft.content.workloads[0].reviewed_imports.costs_csv,
    confirmation.id,
  );
  const reportInput = {
    month,
    company_scope_complete: false,
    workloads: fresh.draft.content.workloads,
  };
  const report = await call("reports", "POST", reportInput);
  assert.equal(Number(report.result.summary.known_cost), 12000);
  assert.equal(
    report.result.reviewed_imports[0].confirmation_id,
    confirmation.id,
  );
  assert.equal((await call("reports", "POST", reportInput)).id, report.id);
  const changed = structuredClone(reportInput);
  changed.workloads[0].audit.costs_csv += "\n";
  await call("reports", "POST", changed, false, 409);
  await call(`import-reviews/${id}/revision`, "PUT", {
    expected_revision: 2,
    rules,
    decisions: [
      {
        row: 2,
        action: "amend",
        field: "amount",
        value: "12500",
        reason: "Synthetic correction for immutable history check",
      },
    ],
  });
  assert.equal(
    (await call(`reports/${report.id}`)).result.fingerprint,
    report.result.fingerprint,
  );
  assert.equal(
    (
      await call(
        `import-reviews/${id}/export?confirmation_id=${confirmation.id}`,
      )
    ).canonical_csv,
    exported.canonical_csv,
  );
  console.log(
    JSON.stringify({
      status: "HOSTED_API_SLICE_PASSED",
      retained_synthetic_records: true,
      browser_session_reauthentication: "pending",
      recovery: "not_proven_by_this_runner",
      provider_acceptance: "deferred",
    }),
  );
}
