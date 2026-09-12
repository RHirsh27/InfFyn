import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CONFIRMATION, PROJECT_REF } from "../scripts/acceptance/hosted-monthly.mjs";
import { ALPHA_ENGINE_DENIALS, createPrivateAlphaTransport, runPrivateAlphaAcceptance } from "../scripts/acceptance/private-alpha.mjs";

function manifest() {
  return { schema_version: "hosted-monthly-acceptance-1", release_stage: "private_alpha", project_ref: PROJECT_REF,
    app_origin: "https://alpha-app.example", engine_origin: "https://alpha-engine.example", origins_approved: true,
    synthetic_only: true, dedicated_companies: true, writes_approved: true, confirmation: CONFIRMATION, month: "2026-08",
    companies: [0, 1].map(i => ({ tenant_id: randomUUID(), user_id: randomUUID(), cookie_env: `INFFYN_ACCEPTANCE_COOKIE_${i}`, token_env: `INFFYN_ACCEPTANCE_TOKEN_${i}`, approved_import_ids: [] })),
    known_report_id: randomUUID(), publishable_key_env: "INFFYN_ACCEPTANCE_PUBLIC_KEY",
    non_allowlisted_user: { user_id: randomUUID(), cookie_env: "INFFYN_ACCEPTANCE_COOKIE_EXCLUDED", token_env: "INFFYN_ACCEPTANCE_TOKEN_EXCLUDED" } };
}

function simulated(m, defect) {
  const calls = [];
  const ok = data => ({ status: 200, data });
  return { live: false, calls,
    async request(q) {
      calls.push(q);
      if (defect === "private_exception") throw new Error("PRIVATE_SESSION and financial balance 99999.22");
      if (q.excluded) return { status: defect === "outsider_open" ? 200 : 403, data: {} };
      if (ALPHA_ENGINE_DENIALS.some(([method, path]) => q.method === method && q.path.replace(/^\/api/, "") === path)) return { status: defect === "route_open" ? 200 : 403, data: {} };
      if (q.path.endsWith("/status")) return ok({ release_stage: defect === "stage_wrong" ? "standard" : "private_alpha", available: true, monthly_available: true, billing_available: false });
      if (q.path.endsWith("/billing")) return ok({ release_stage: "private_alpha", entitled: true, access_source: defect === "fake_entitlement" ? "preview" : "complimentary", billing_available: false });
      if (q.path === "/tenant/verify") return ok({ user_id: m.companies[q.company].user_id, tenant_id: m.companies[q.company].tenant_id });
      if (q.path.endsWith("/connections")) return ok({ connections: ["openai", "anthropic", "stripe"].map(provider => ({ provider, available: defect === "connector_open", status: "unavailable" })) });
      if (q.path.endsWith(m.known_report_id)) return ok({ id: m.known_report_id, result: { release_context: { stage: defect === "old_report" ? "standard" : "private_alpha" } } });
      throw new Error("Unexpected request");
    },
    async verifyExcludedIdentity() { return ok({ id: m.non_allowlisted_user.user_id, email_confirmed_at: "2026-09-01", is_anonymous: false }); },
    async verifyAllowedIdentity() { return defect === "invalid_public_key" ? { status: 401, data: {} } : ok({ id: m.companies[0].user_id, email_confirmed_at: "2026-09-01", is_anonymous: false }); },
    async probeDatabase(q) { calls.push({ database: true, ...q }); return defect === "database_unavailable" ? { status: 404, data: {} } : ok(defect === "database_leak" ? [{ id: m.known_report_id }] : []); },
  };
}

test("private alpha dry-run and CLI make no requests or readiness claims", async () => {
  const result = await runPrivateAlphaAcceptance({ transport: { request() { throw new Error("must not request"); } } });
  assert.equal(result.mode, "dry-run"); assert.equal(result.release_ready, false);
  assert.ok(result.checks.every(c => c.status === "pending"));
  const run = spawnSync(process.execPath, ["scripts/acceptance/run-private-alpha.mjs"], { encoding: "utf8", env: {} });
  assert.equal(run.status, 0); assert.equal(JSON.parse(run.stdout).mode, "dry-run");
});

test("alpha probes remain offline when simulated and preserve all broader gates", async () => {
  const m = manifest(), transport = simulated(m);
  const result = await runPrivateAlphaAcceptance({ manifest: m, execute: true, transport });
  assert.equal(result.outcome, "alpha_probes_passed_remaining_acceptance_pending");
  assert.equal(result.mode, "offline-transport-test"); assert.equal(result.release_ready, false);
  assert.equal(result.checks.filter(c => c.status === "passed").length, 8);
  for (const id of ["csv_draft_report_hosted_acceptance", "browser_sign_out_and_return", "direct_database_all_tables_and_functions", "retention_monitoring_and_encrypted_restore"]) assert.equal(result.checks.find(c => c.id === id).status, "pending");
});

for (const [defect, stage] of Object.entries({ stage_wrong: "private_alpha_status_and_real_access", fake_entitlement: "private_alpha_status_and_real_access", connector_open: "disabled_connection_metadata", route_open: "engine_closed_operations", outsider_open: "excluded_real_user_denied", old_report: "known_report_alpha_context", database_leak: "anonymous_direct_database_denied", database_unavailable: "anonymous_direct_database_denied", invalid_public_key: "anonymous_direct_database_denied" })) {
  test(`alpha probe fails ${defect}`, async () => {
    const m = manifest(), r = await runPrivateAlphaAcceptance({ manifest: m, execute: true, transport: simulated(m, defect) });
    assert.equal(r.outcome, "failed"); assert.equal(r.checks.find(c => c.id === stage).status, "failed"); assert.equal(r.release_ready, false);
  });
}

test("absent real excluded-user or known-row evidence stays pending", async () => {
  const m = manifest(); delete m.known_report_id; delete m.non_allowlisted_user;
  const r = await runPrivateAlphaAcceptance({ manifest: m, execute: true, transport: simulated(m) });
  for (const id of ["excluded_real_user_denied", "known_report_alpha_context", "anonymous_direct_database_denied", "excluded_user_direct_database_denied"]) assert.equal(r.checks.find(c => c.id === id).status, "pending");
});

test("wrong project or imports cannot trigger an alpha acceptance request", async () => {
  for (const mutate of [m => m.project_ref = "other-project", m => m.companies[0].approved_import_ids = [randomUUID()], m => m.release_stage = "standard"]) {
    const m = manifest(); mutate(m); const t = simulated(m);
    const r = await runPrivateAlphaAcceptance({ manifest: m, execute: true, transport: t });
    assert.equal(r.outcome, "failed"); assert.equal(t.calls.length, 0);
  }
});

test("receipts cannot retain private exception text, identity or report data", async () => {
  const m = manifest(), r = await runPrivateAlphaAcceptance({ manifest: m, execute: true, transport: simulated(m, "private_exception") });
  const output = JSON.stringify(r);
  for (const forbidden of ["PRIVATE_SESSION", "99999.22", m.known_report_id, m.companies[0].tenant_id, m.non_allowlisted_user.user_id]) assert.ok(!output.includes(forbidden));
  assert.equal(r.outcome, "failed");
});

function environment(m) {
  const env = { INFFYN_ACCEPTANCE_PUBLIC_KEY: "sb_publishable_OFFLINE_SYNTHETIC_TEST" };
  for (const c of [...m.companies, m.non_allowlisted_user]) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "ES256" })}.${encode({ iss: `https://${PROJECT_REF}.supabase.co/auth/v1`, sub: c.user_id, aud: "authenticated", role: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.offline_signature_not_valid_for_live_authentication`;
    env[c.token_env] = token;
    env[c.cookie_env] = `sb-${PROJECT_REF}-auth-token=base64-${encode({ access_token: token })}`;
  }
  return env;
}

test("hosted transport pins routes/project and does not follow redirects or reveal responses", async () => {
  const m = manifest(), env = environment(m), calls = [];
  const t = createPrivateAlphaTransport(m, env, async (url, options) => { calls.push({ url, options }); throw new Error("Redirect PRIVATE_SESSION"); });
  await assert.rejects(t.request({ path: "https://attacker.example" }), /unapproved_probe_route/);
  assert.equal(calls.length, 0);
  await assert.rejects(t.request({ path: "/v2/status" }), /probe_transport_failed/);
  assert.equal(calls[0].url, m.engine_origin + "/v2/status"); assert.equal(calls[0].options.redirect, "error");
  await assert.rejects(t.probeDatabase({}), /probe_transport_failed/);
  assert.ok(calls[1].url.startsWith(`https://${PROJECT_REF}.supabase.co/rest/v1/inffyn_monthly_reports?select=id&`));
  assert.equal(calls[1].options.headers.Authorization, undefined);
  env.INFFYN_ACCEPTANCE_PUBLIC_KEY = "sb_secret_NEVER_ALLOWED";
  assert.throws(() => createPrivateAlphaTransport(m, env), /public_key_required/);
});

test("alpha deployment credentials remain on their approved app/engine origins and never reach Supabase probes", async () => {
  const m = manifest(), env = environment(m), calls = [];
  m.app_protection_env = "INFFYN_ACCEPTANCE_APP_PROTECTION";
  m.engine_protection_env = "INFFYN_ACCEPTANCE_ENGINE_PROTECTION";
  env[m.app_protection_env] = "SYNTHETIC_APP_ONLY";
  env[m.engine_protection_env] = "SYNTHETIC_ENGINE_ONLY";
  const transport = createPrivateAlphaTransport(m, env, async (url, options) => {
    calls.push({ url, options }); return Response.json({});
  });
  await transport.request({ surface: "app", path: "/api/v2/status" });
  await transport.request({ surface: "engine", path: "/v2/status", anonymous: true });
  await transport.verifyAllowedIdentity();
  await transport.verifyExcludedIdentity();
  await transport.probeDatabase({});
  await transport.probeDatabase({ excluded: true });
  assert.equal(calls[0].options.headers["x-vercel-protection-bypass"], env[m.app_protection_env]);
  assert.equal(calls[1].options.headers["x-vercel-protection-bypass"], env[m.engine_protection_env]);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  for (const call of calls.slice(2)) {
    assert.equal(new URL(call.url).origin, `https://${PROJECT_REF}.supabase.co`);
    assert.equal(call.options.headers["x-vercel-protection-bypass"], undefined);
  }
  for (const call of calls) {
    assert.equal(call.options.redirect, "error");
    assert.ok(!call.url.includes("SYNTHETIC"));
  }
});

test("alpha transport rejects inline or unresolved protection configuration before any request", () => {
  const m = manifest(), env = environment(m);
  m.engine_protection_env = "INFFYN_ACCEPTANCE_ENGINE_PROTECTION";
  assert.throws(() => createPrivateAlphaTransport(m, env), /protection_environment_missing_or_invalid/);
  env[m.engine_protection_env] = "SYNTHETIC_HEADER\nINVALID";
  assert.throws(() => createPrivateAlphaTransport(m, env), /protection_environment_missing_or_invalid/);
  env[m.engine_protection_env] = "SYNTHETIC_HEADER_VALID";
  m.engine_protection = "SYNTHETIC_INLINE_FORBIDDEN";
  assert.throws(() => createPrivateAlphaTransport(m, env), /inline_protection_credentials_forbidden/);
});
