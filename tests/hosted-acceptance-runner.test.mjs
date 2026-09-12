import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { CONFIRMATION, PROJECT_REF, createHostedTransport, loadSessions, runAcceptance, validateManifest } from "../scripts/acceptance/hosted-monthly.mjs";

function manifest(withImport = false) {
  return { schema_version: "hosted-monthly-acceptance-1", project_ref: PROJECT_REF, app_origin: "https://inffyn-acceptance.example", engine_origin: "https://engine-acceptance.example", origins_approved: true, synthetic_only: true, dedicated_companies: true, writes_approved: true, confirmation: CONFIRMATION, month: "2026-08", companies: [0, 1].map(i => ({ tenant_id: randomUUID(), user_id: randomUUID(), cookie_env: `INFFYN_ACCEPTANCE_COOKIE_${i}`, token_env: `INFFYN_ACCEPTANCE_TOKEN_${i}`, approved_import_ids: i === 0 && withImport ? [randomUUID()] : [] })) };
}

/** A deliberately small simulated server, exclusively for testing runner assertions. */
function simulated(m, defect) {
  const companies = [{ workloads: [], draft: null, reports: [], selected: null }, { workloads: [], draft: null, reports: [], selected: null }];
  const calls = [];
  const transport = { live: false, calls, async request(q) {
    calls.push(q);
    if (defect === "transport_secret") throw new Error("Authorization Bearer PRIVATE_SESSION; invoice balance 987654.32");
    const index = q.company || 0, own = companies[index];
    const ok = data => ({ status: 200, data: structuredClone(data) });
    const status = n => ({ status: n, data: { detail: "Private diagnostic value never belongs in the receipt" } });
    if (q.anonymous || q.tampered) return status(defect === "auth_open" ? 200 : 401);
    if (q.surface === "engine" && q.tenant && q.tenant !== m.companies[index].tenant_id) return status(defect === "tenant_open" ? 200 : 403);
    if (q.path === "/tenant/verify") return ok({ tenant_id: m.companies[index].tenant_id, user_id: m.companies[index].user_id, role: "owner" });
    if (q.path === "/api/v2/status") return ok({ available: true, monthly_available: true });
    if (q.path === "/api/v2/billing") return ok({ entitled: true, access_source: defect === "preview_entitlement" ? "preview" : "complimentary" });
    if (q.path === "/api/tenant/switch") return ok({ ok: true });
    const path = q.path.replace(/^\/api\/v2\//, "").replace(/^\/v2\//, "");
    if (path === "monthly/workloads" && q.method === "GET") return ok({ workloads: defect === "real_workspace" ? [{ id: randomUUID(), name: "Private existing company" }] : own.workloads });
    if (path.startsWith("monthly/workloads/") && q.method === "POST") { own.workloads.push({ ...q.body, id: path.split("/")[2] }); return ok(own.workloads.at(-1)); }
    if (path === "monthly/imports") return ok({ imports: m.companies[index].approved_import_ids.map(id => ({ id })) });
    if (path.startsWith("monthly/imports/") && path.endsWith("/evidence")) {
      const id = path.split("/")[2];
      if (!m.companies[index].approved_import_ids.includes(id) && defect !== "import_leak") return status(404);
      return ok({ id, provider: "stripe", month: m.month, state: "complete", evidence: { costs: [], usage: [], revenue: [{ revenue_id: "in_synthetic", date: m.month + "-02", amount: "60000.00", currency: "USD", customer_id: "synthetic-customer" }] } });
    }
    if (path.startsWith("monthly/drafts/")) {
      if (q.method === "GET") return ok({ draft: defect === "draft_leak" && index === 1 ? companies[0].draft : own.draft });
      if (q.method === "PUT") {
        if (q.body.expected_revision !== (own.draft?.revision || 0) && defect !== "draft_no_cas") return status(409);
        own.draft = { revision: (own.draft?.revision || 0) + 1, content: q.body.content };
        return ok({ draft: own.draft });
      }
    }
    if (path === "monthly/reports") {
      if (q.method === "GET") return ok({ reports: own.reports, selections: [] });
      const body = q.body;
      const sourced = body.workloads[0].audit.revenue_source === "stripe_reviewed";
      if (sourced && (!body.invoice_allocations?.length || body.workloads[0].audit.revenue_csv.includes("altered"))) return status(defect === "lineage_open" ? 200 : 422);
      const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      const prior = own.reports.find(r => r.fingerprint === hash);
      if (prior && defect !== "duplicate_reports") return ok(prior);
      const cost = body.workloads[0].audit.usage_csv.split("\n")[1].split(",").at(-2);
      const report = { id: randomUUID(), fingerprint: hash, payload: structuredClone(body), result: { summary: { known_cost: defect === "bad_total" ? "1.00" : cost } } };
      if (sourced) report.result.invoice_allocations = [{ import_id: body.import_ids[0], revenue_id: "in_synthetic", account_id: "acct_synthetic", date: m.month + "-02", currency: "USD", customer_id: "synthetic-customer", original_amount: "60000.00", allocated_amount: "45000.00", remainder: "15000.00", source_verified: true, basis: "Modeled allocation", revenue_basis: "collections", allocations: body.invoice_allocations[0].allocations.map((p, i) => ({ ...p, revenue_id: `stripe-allocation:synthetic-${i}` })) }];
      if (sourced && defect === "snapshot_lineage") report.result.invoice_allocations[0].original_amount = "60001.00";
      if (sourced && defect === "snapshot_remainder") report.result.invoice_allocations[0].remainder = "0";
      if (sourced && defect === "snapshot_account") report.result.invoice_allocations[0].account_id = "acct_other";
      if (defect === "mutates_history" && own.reports.length) own.reports[0].result = report.result;
      own.reports.push(report); return ok(report);
    }
    if (path.startsWith("monthly/reports/")) {
      const id = path.split("/")[2];
      const row = own.reports.find(r => r.id === id) || (defect === "report_leak" ? companies[0].reports.find(r => r.id === id) : null);
      return row ? ok(path.endsWith("/evidence") ? { payload: defect === "export_lineage" && row.result.invoice_allocations ? { invoice_allocations: [] } : row.payload } : row) : status(404);
    }
    if (path === "monthly/selection") {
      if (q.body.expected_report_id !== own.selected && defect !== "selection_no_cas") return status(409);
      own.selected = q.body.report_id; return ok({ report_id: own.selected });
    }
    if (path === "monthly/prepare") {
      const portions = q.body.invoice_allocations[0].allocations;
      const allocated = portions.reduce((n, p) => n + Number(p.amount), 0);
      if (allocated > 60000) return status(defect === "overallocate" ? 200 : 422);
      return ok({ revenue_allocations: [{ original_amount: "60000.00", remainder: String(60000 - allocated), account_id: "acct_synthetic" }], workloads: portions.map(p => ({ workload_id: p.workload_id, audit: { revenue_csv: p.explanation } })) });
    }
    return status(404);
  } };
  return transport;
}

test("default dry run performs no requests and leaves every acceptance gate pending", async () => {
  let requested = false;
  const receipt = await runAcceptance({ transport: { request: () => { requested = true; throw new Error("must not run"); } } });
  assert.equal(requested, false);
  assert.equal(receipt.mode, "dry-run");
  assert.equal(receipt.release_ready, false);
  assert.ok(receipt.checks.every(c => c.status === "pending"));
});

test("authorization or project mismatch stops before any authenticated request", async () => {
  for (const change of [m => { m.project_ref = "other-project"; }, m => { m.confirmation = "sure"; }, m => { m.synthetic_only = false; }, m => { m.app_origin += "/api"; }, m => { m.companies[1].tenant_id = m.companies[0].tenant_id; }]) {
    const m = manifest(); change(m); const t = simulated(m);
    const r = await runAcceptance({ manifest: m, execute: true, transport: t });
    assert.equal(r.outcome, "failed"); assert.equal(t.calls.length, 0); assert.equal(r.release_ready, false);
  }
});

test("positive offline transport flow remains explicitly unverified for hosted release", async () => {
  const m = manifest(true), t = simulated(m);
  const r = await runAcceptance({ manifest: m, execute: true, transport: t, hasResume: true });
  assert.equal(r.outcome, "core_checks_passed_remaining_acceptance_pending");
  assert.equal(r.mode, "offline-transport-test"); assert.equal(r.release_ready, false);
  assert.ok(r.checks.filter(c => !["browser_sign_out_and_return", "provider_authorization_known_total_and_pagination", "provider_retry_revocation_and_reconnect", "membership_revocation", "expired_source_rejection", "expired_session_rejection", "billing_lifecycle", "monitoring_retention_and_restore"].includes(c.id)).every(c => c.status === "passed"));
  assert.equal(r.checks.find(c => c.id === "browser_sign_out_and_return").status, "pending");
});

test("missing imports and second sessions do not produce invented passing evidence", async () => {
  const m = manifest(), r = await runAcceptance({ manifest: m, execute: true, transport: simulated(m) });
  for (const id of ["import_isolation", "source_backed_allocated_report", "invoice_overallocation_rejected", "independent_session_resume"]) assert.equal(r.checks.find(c => c.id === id).status, "pending");
});

for (const [defect, expected] of Object.entries({ auth_open: "unauthenticated_denied", tenant_open: "cross_company_membership_denied", preview_entitlement: "session_and_target", real_workspace: "empty_fixture_workspaces", draft_no_cas: "stale_draft_rejected", draft_leak: "cross_company_draft_denied", bad_total: "report_calculated", duplicate_reports: "report_retry_deduplicated", report_leak: "cross_company_report_denied", lineage_open: "invalid_allocation_lineage_denied", mutates_history: "immutable_report_versions", selection_no_cas: "selection_conflict_rejected", import_leak: "import_isolation", snapshot_lineage: "source_backed_allocated_report", snapshot_remainder: "source_backed_allocated_report", snapshot_account: "source_backed_allocated_report", export_lineage: "source_backed_allocated_report", overallocate: "invoice_overallocation_rejected" })) {
  test(`runner fails the ${defect} regression`, async () => {
    const m = manifest(true), t = simulated(m, defect);
    const r = await runAcceptance({ manifest: m, execute: true, transport: t });
    assert.equal(r.outcome, "failed");
    assert.equal(r.checks.find(c => c.id === expected).status, "failed");
    assert.equal(r.release_ready, false);
    if (defect === "real_workspace") assert.equal(t.calls.some(c => c.path.includes("monthly/workloads/") && c.method === "POST"), false);
  });
}

test("exception messages, financial records and sessions cannot reach the receipt", async () => {
  const m = manifest();
  const r = await runAcceptance({ manifest: m, execute: true, transport: simulated(m, "transport_secret") });
  const serialized = JSON.stringify(r);
  for (const value of ["PRIVATE_SESSION", "987654.32", "Authorization", m.companies[0].tenant_id, m.companies[0].user_id]) assert.ok(!serialized.includes(value));
  assert.equal(r.checks[0].reason, "acceptance_transport_or_contract_failed");
});

function token(c, changes = {}) {
  const encode = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  return `${encode({ alg: "ES256" })}.${encode({ iss: `https://${PROJECT_REF}.supabase.co/auth/v1`, sub: c.user_id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID(), ...changes })}.offline_signature_not_valid_for_live_authentication`;
}
function sessionEnvironment(m, changes = {}) {
  const env = {};
  for (const c of m.companies) {
    const jwt = token(c, changes);
    env[c.token_env] = jwt;
    env[c.cookie_env] = `sb-${PROJECT_REF}-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: "OFFLINE_ONLY" })).toString("base64url")}`;
  }
  return env;
}

test("session metadata preflight rejects service role, anonymous, expired, wrong-project and mismatched cookies", () => {
  const m = manifest(); validateManifest(m);
  for (const changes of [{ role: "service_role" }, { role: "anon" }, { is_anonymous: true }, { exp: 0 }, { iss: "https://other.supabase.co/auth/v1" }]) assert.throws(() => loadSessions(m, sessionEnvironment(m, changes)));
  const env = sessionEnvironment(m); env[m.companies[0].token_env] = token(m.companies[0]);
  assert.throws(() => loadSessions(m, env), /cookie_and_token_session_mismatch/);
});

test("hosted transport stays on configured origin and never forwards credentials on redirects", async () => {
  const m = manifest(), sessions = loadSessions(m, sessionEnvironment(m));
  const t = createHostedTransport(m, sessions, async (url, options) => {
    assert.equal(url, m.app_origin + "/api/v2/monthly/workloads");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Origin, m.app_origin);
    assert.ok(options.headers.Cookie.includes(`active_tenant_id=${m.companies[0].tenant_id}`));
    assert.equal(options.headers.Authorization, undefined);
    throw new Error("Redirect carried PRIVATE_SESSION");
  });
  await assert.rejects(t.request({ path: "/api/v2/monthly/workloads" }), error => error.message === "transport_failed");
});

test("restricted hosted transport uses only each surface's external protection credential, including negative auth probes", async () => {
  const m = manifest(), env = sessionEnvironment(m), calls = [];
  m.app_protection_env = "INFFYN_ACCEPTANCE_APP_PROTECTION";
  m.engine_protection_env = "INFFYN_ACCEPTANCE_ENGINE_PROTECTION";
  env[m.app_protection_env] = "SYNTHETIC_APP_PROTECTION";
  env[m.engine_protection_env] = "SYNTHETIC_ENGINE_PROTECTION";
  const transport = createHostedTransport(m, loadSessions(m, env), async (url, options) => {
    calls.push({ url, options }); return Response.json({});
  }, env);
  await transport.request({ path: "/api/v2/status" });
  await transport.request({ surface: "engine", path: "/tenant/verify", anonymous: true });
  assert.equal(calls[0].options.headers["x-vercel-protection-bypass"], env[m.app_protection_env]);
  assert.equal(calls[1].options.headers["x-vercel-protection-bypass"], env[m.engine_protection_env]);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  for (const call of calls) {
    assert.equal(call.options.redirect, "error");
    assert.ok(!call.url.includes("SYNTHETIC"));
  }
  await assert.rejects(transport.request({ surface: "supabase", path: "/tenant/verify" }), /invalid_acceptance_surface/);
  assert.equal(calls.length, 2);
});

test("protection references reject inline secrets, missing values, invalid headers and Supabase origins before network access", () => {
  const original = manifest(), sessions = loadSessions(original, sessionEnvironment(original));
  for (const mutation of [
    m => m.app_protection_env = "INLINE_SYNTHETIC_CREDENTIAL",
    m => m.engine_protection_env = null,
    m => m.app_protection_bypass = "INLINE_SYNTHETIC_CREDENTIAL",
    m => m.headers = { "x-vercel-protection-bypass": "INLINE_SYNTHETIC_CREDENTIAL" },
    m => m.engine_origin = `https://${PROJECT_REF}.supabase.co`,
    m => m.app_origin = "https://api.supabase.com",
  ]) {
    const m = structuredClone(original); mutation(m);
    assert.throws(() => createHostedTransport(m, sessions, () => { throw new Error("Network must not run"); }, {}));
  }
  const m = { ...original, app_protection_env: "INFFYN_ACCEPTANCE_APP_PROTECTION" };
  for (const value of [undefined, "", "line\r\nbreak", " padded ", 42])
    assert.throws(() => createHostedTransport(m, sessions, () => { throw new Error("Network must not run"); }, { [m.app_protection_env]: value }), /protection_environment_missing_or_invalid/);
});

test("protection credentials are optional and never appear in transport errors", async () => {
  const m = manifest(), env = sessionEnvironment(m), sessions = loadSessions(m, env);
  const ordinary = createHostedTransport(m, sessions, async (_url, options) => {
    assert.equal(options.headers["x-vercel-protection-bypass"], undefined);
    return Response.json({});
  }, { ...env, INFFYN_ACCEPTANCE_APP_PROTECTION: "UNREFERENCED_SYNTHETIC" });
  await ordinary.request({ path: "/api/v2/status" });
  m.app_protection_env = "INFFYN_ACCEPTANCE_APP_PROTECTION";
  const protectedTransport = createHostedTransport(m, sessions, async () => { throw new Error("SYNTHETIC_PRIVATE_VALUE"); }, { ...env, [m.app_protection_env]: "SYNTHETIC_PRIVATE_VALUE" });
  await assert.rejects(protectedTransport.request({ path: "/api/v2/status" }), error => error.message === "transport_failed");
});
