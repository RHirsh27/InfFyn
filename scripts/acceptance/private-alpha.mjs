/** Private-alpha read/negative probes. No secrets, customer rows or response text in receipts. */
import { randomUUID } from "node:crypto";
import { PROJECT_REF, loadProtectionCredentials, loadSessions, validateManifest } from "./hosted-monthly.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENV = /^INFFYN_ACCEPTANCE_[A-Z0-9_]+$/;
export const ALPHA_ENGINE_DENIALS = [
  ["POST", "/v2/preview"], ["POST", "/v2/previews/claim"],
  ["POST", "/v2/review/calculate"], ["POST", "/ingest/csv"],
  ["POST", "/audit/run"], ["GET", "/audit/result"], ["POST", "/board-report"],
  ["GET", "/v2/audits"], ["POST", "/v2/audits"], ["POST", "/v2/monthly/adopt"],
  ["POST", "/stripe/connect/start"], ["GET", "/stripe/connect/callback"],
  ["POST", "/stripe/disconnect"], ["POST", "/stripe/sync"],
  ["POST", "/v2/stripe/evidence"], ["POST", "/v2/billing/checkout"],
  ["POST", "/v2/billing/portal"], ["POST", "/v2/billing-webhook"],
  ...["openai", "anthropic", "stripe"].flatMap(provider => [
    ["POST", `/v2/monthly/connections/${provider}`],
    ["DELETE", `/v2/monthly/connections/${provider}`],
    ["POST", `/v2/monthly/imports/${provider}`],
  ]),
];
const CHECKS = ["private_alpha_status_and_real_access", "disabled_connection_metadata", "engine_closed_operations", "app_closed_operations", "excluded_real_user_denied", "known_report_alpha_context", "anonymous_direct_database_denied", "excluded_user_direct_database_denied", "csv_draft_report_hosted_acceptance", "browser_sign_out_and_return", "direct_database_all_tables_and_functions", "retention_monitoring_and_encrypted_restore"];

class ProbeError extends Error { constructor(code) { super(code); this.code = code; } }
function demand(value, code) { if (!value) throw new ProbeError(code); }

export function validateAlphaManifest(m) {
  validateManifest(m);
  demand(m.release_stage === "private_alpha", "private_alpha_manifest_required");
  demand(m.companies.every(c => c.approved_import_ids.length === 0), "csv_only_alpha_fixtures_required");
  if (m.known_report_id) demand(UUID.test(m.known_report_id), "synthetic_report_identity_required");
  if (m.publishable_key_env) demand(ENV.test(m.publishable_key_env), "publishable_key_environment_reference_required");
  if (m.non_allowlisted_user) {
    const u = m.non_allowlisted_user;
    demand(UUID.test(u.user_id || "") && !m.companies.some(c => c.user_id === u.user_id), "distinct_excluded_user_required");
    demand(ENV.test(u.cookie_env || "") && ENV.test(u.token_env || ""), "excluded_session_references_required");
    demand(!("token" in u) && !("cookie" in u), "inline_credentials_forbidden");
  }
  return m;
}

function publishableKey(env, reference) {
  const value = env[reference];
  demand(typeof value === "string", "publishable_key_environment_missing");
  if (value.startsWith("sb_publishable_")) return value;
  // Legacy anonymous keys are public. Never allow a service-role or secret key
  // to invalidate an anonymous/RLS test by granting elevated database access.
  try {
    const claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url"));
    demand(claims.role === "anon" && claims.ref === PROJECT_REF, "public_key_required");
    return value;
  } catch { throw new ProbeError("public_key_required"); }
}

export function createPrivateAlphaTransport(manifest, env = process.env, fetchImpl = fetch) {
  validateAlphaManifest(manifest);
  const protection = loadProtectionCredentials(manifest, env);
  const identities = [...manifest.companies];
  if (manifest.non_allowlisted_user) identities.push({ ...manifest.non_allowlisted_user, tenant_id: identities[0].tenant_id });
  const sessions = loadSessions({ companies: identities }, env);
  const key = manifest.publishable_key_env ? publishableKey(env, manifest.publishable_key_env) : null;
  async function fetchSafe(url, options) {
    try {
      const r = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
      demand(!r.redirected, "redirected_probe_forbidden");
      const reader = r.body?.getReader(); let bytes = 0; const chunks = [];
      if (reader) while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4_000_000) { await reader.cancel(); throw new ProbeError("response_too_large"); } chunks.push(Buffer.from(part.value)); }
      let data; try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ProbeError("json_probe_response_required"); }
      return { status: r.status, data };
    } catch (error) { throw error instanceof ProbeError ? error : new ProbeError("probe_transport_failed"); }
  }
  return {
    live: true,
    async request({ surface = "engine", method = "GET", path, company = 0, excluded = false, anonymous = false }) {
      const identity = excluded ? 2 : company;
      const session = sessions[identity];
      demand(session || anonymous, "session_missing");
      const allowed = new Set([...ALPHA_ENGINE_DENIALS.map(([m, p]) => `${m} ${p}`),
        "GET /v2/status", "GET /v2/billing", "GET /tenant/verify", "GET /v2/monthly/connections", "GET /v2/monthly/reports",
        ...(manifest.known_report_id ? [`GET /v2/monthly/reports/${manifest.known_report_id}`] : [])]);
      const enginePath = path.replace(/^\/api(?=\/v2\/)/, "");
      demand(allowed.has(`${method} ${enginePath}`) && ["engine", "app"].includes(surface), "unapproved_probe_route");
      demand(surface !== "app" || path.startsWith("/api/v2/"), "unapproved_app_probe_route");
      const headers = { "Content-Type": "application/json", Origin: manifest.app_origin };
      if (protection[surface]) headers["x-vercel-protection-bypass"] = protection[surface];
      if (!anonymous) {
        if (surface === "app") headers.Cookie = session.cookie;
        else { headers.Authorization = `Bearer ${session.token}`; headers["X-Tenant-Id"] = manifest.companies[company].tenant_id; }
      }
      return fetchSafe((surface === "app" ? manifest.app_origin : manifest.engine_origin) + path,
        { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
    },
    async verifyExcludedIdentity() {
      demand(key && sessions[2], "excluded_user_verification_unavailable");
      return fetchSafe(`https://${PROJECT_REF}.supabase.co/auth/v1/user`, {
        method: "GET", headers: { apikey: key, Authorization: `Bearer ${sessions[2].token}` },
      });
    },
    async verifyAllowedIdentity() {
      demand(key && sessions[0], "allowed_user_verification_unavailable");
      return fetchSafe(`https://${PROJECT_REF}.supabase.co/auth/v1/user`, {
        method: "GET", headers: { apikey: key, Authorization: `Bearer ${sessions[0].token}` },
      });
    },
    async probeDatabase({ excluded = false }) {
      demand(key && manifest.known_report_id, "known_synthetic_database_fixture_required");
      const headers = { apikey: key };
      if (excluded) { demand(sessions[2], "excluded_session_missing"); headers.Authorization = `Bearer ${sessions[2].token}`; }
      const path = `/rest/v1/inffyn_monthly_reports?select=id&id=eq.${manifest.known_report_id}&limit=1`;
      return fetchSafe(`https://${PROJECT_REF}.supabase.co${path}`, { method: "GET", headers });
    },
  };
}

export async function runPrivateAlphaAcceptance({ manifest, execute = false, transport } = {}) {
  const mode = !execute ? "dry-run" : transport?.live ? "hosted" : "offline-transport-test";
  const result = { schema_version: "private-alpha-acceptance-result-1", run_id: randomUUID(), project_ref: PROJECT_REF,
    mode, release_ready: false, outcome: "pending", checks: CHECKS.map(id => ({ id, status: "pending", reason: "not_executed" })) };
  if (!execute) return result;
  let stage = CHECKS[0];
  const check = async (id, fn) => { stage = id; await fn(); Object.assign(result.checks.find(c => c.id === id), { status: "passed", reason: mode === "hosted" ? "hosted_assertions_satisfied" : "offline_transport_assertions_only" }); };
  const get = async (path, extras = {}) => { const r = await transport.request({ path, method: "GET", ...extras }); demand(r.status === 200, "expected_authenticated_response"); return r.data; };
  try {
    validateAlphaManifest(manifest);
    demand(transport?.request, "transport_required");
    await check(CHECKS[0], async () => {
      for (const surface of ["engine", "app"]) {
        const prefix = surface === "app" ? "/api" : "";
        const status = await get(`${prefix}/v2/status`, { surface });
        demand(status.release_stage === "private_alpha" && status.available === true && status.monthly_available === true && status.billing_available === false, "private_alpha_stage_required");
        for (const company of [0, 1]) {
          const access = await get(`${prefix}/v2/billing`, { surface, company });
          demand(access.release_stage === "private_alpha" && access.entitled === true && access.access_source === "complimentary" && access.billing_available === false, "real_complimentary_alpha_access_required");
        }
      }
      for (const company of [0, 1]) {
        const who = await get("/tenant/verify", { company });
        demand(who.user_id === manifest.companies[company].user_id && who.tenant_id === manifest.companies[company].tenant_id, "verified_alpha_identity_mismatch");
      }
    });
    await check("disabled_connection_metadata", async () => {
      const data = await get("/v2/monthly/connections");
      demand(Array.isArray(data.connections) && ["openai", "anthropic", "stripe"].every(p => data.connections.some(c => c.provider === p && c.available === false && c.status === "unavailable")), "connector_must_be_unavailable");
    });
    for (const surface of ["engine", "app"]) await check(`${surface}_closed_operations`, async () => {
      for (const [method, path] of ALPHA_ENGINE_DENIALS) {
        if (surface === "app" && !path.startsWith("/v2/")) continue;
        const r = await transport.request({ surface, method, path: (surface === "app" ? "/api" : "") + path });
        demand(r.status === 403, "disabled_operation_not_denied");
      }
    });
    if (manifest.non_allowlisted_user && manifest.publishable_key_env && transport.verifyExcludedIdentity) await check("excluded_real_user_denied", async () => {
      const who = await transport.verifyExcludedIdentity();
      demand(who.status === 200 && who.data?.id === manifest.non_allowlisted_user.user_id && who.data?.email_confirmed_at && who.data?.is_anonymous !== true, "excluded_verified_real_session_required");
      for (const surface of ["app", "engine"]) {
        const r = await transport.request({ surface, path: `${surface === "app" ? "/api" : ""}/v2/monthly/reports`, excluded: true });
        demand(r.status === 403, "excluded_user_not_denied");
      }
    });
    if (manifest.known_report_id) await check("known_report_alpha_context", async () => {
      const r = await get(`/v2/monthly/reports/${manifest.known_report_id}`);
      demand(r.id === manifest.known_report_id && r.result?.release_context?.stage === "private_alpha", "known_alpha_fixture_report_required");
    });
    if (manifest.known_report_id && manifest.publishable_key_env && transport.probeDatabase && transport.verifyAllowedIdentity) {
      const probes = [["anonymous_direct_database_denied", false]];
      if (result.checks.find(c => c.id === "excluded_real_user_denied").status === "passed") probes.push(["excluded_user_direct_database_denied", true]);
      for (const [id, excluded] of probes) await check(id, async () => {
        const control = await transport.verifyAllowedIdentity();
        demand(control.status === 200 && control.data?.id === manifest.companies[0].user_id && control.data?.email_confirmed_at && control.data?.is_anonymous !== true, "public_key_positive_control_required");
        const r = await transport.probeDatabase({ excluded });
        demand([401, 403].includes(r.status) || r.status === 200 && Array.isArray(r.data) && r.data.length === 0, "direct_database_disclosed_fixture_or_unavailable");
      });
    }
    result.outcome = "alpha_probes_passed_remaining_acceptance_pending";
  } catch (error) {
    Object.assign(result.checks.find(c => c.id === stage), { status: "failed", reason: error instanceof ProbeError ? error.code : "alpha_probe_transport_or_contract_failed" });
    result.outcome = "failed";
  }
  return result;
}
