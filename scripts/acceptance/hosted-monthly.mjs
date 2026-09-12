/** Opt-in acceptance using existing authenticated interfaces; no fixture/auth bypass. */
import { randomUUID } from "node:crypto";

export const PROJECT_REF = "jmfzmoqdvweeixxwzlma";
export const CONFIRMATION = "These two companies and all referenced imports are dedicated synthetic acceptance fixtures; I authorize this run's writes.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENV = /^INFFYN_ACCEPTANCE_[A-Z0-9_]+$/;
const PROTECTION_REFS = ["app_protection_env", "engine_protection_env"];
const CORE = ["session_and_target", "unauthenticated_denied", "cross_company_membership_denied", "empty_fixture_workspaces", "app_context_binding", "draft_saved", "stale_draft_rejected", "draft_readback", "independent_session_resume", "cross_company_draft_denied", "report_calculated", "report_retry_deduplicated", "cross_company_report_denied", "invalid_allocation_lineage_denied", "immutable_report_versions", "selection_conflict_rejected", "import_isolation", "source_backed_allocated_report", "invoice_overallocation_rejected"];
const MANUAL = ["browser_sign_out_and_return", "provider_authorization_known_total_and_pagination", "provider_retry_revocation_and_reconnect", "membership_revocation", "expired_source_rejection", "expired_session_rejection", "billing_lifecycle", "monitoring_retention_and_restore"];
class AcceptanceError extends Error { constructor(code) { super(code); this.code = code; } }
function demand(value, code) { if (!value) throw new AcceptanceError(code); }
function origin(value) {
  try {
    const url = new URL(value);
    demand(url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash, "approved_https_origin_required");
    demand(!["localhost", "127.0.0.1", "::1"].includes(url.hostname), "hosted_origin_required");
    return url.origin;
  } catch { throw new AcceptanceError("approved_https_origin_required"); }
}

function validateProtectionReferences(manifest) {
  const inspect = (value, root = false) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (/protection|bypass/i.test(key))
        demand(root && PROTECTION_REFS.includes(key), "inline_protection_credentials_forbidden");
      inspect(item);
    }
  };
  inspect(manifest, true);
  for (const field of PROTECTION_REFS) {
    if (Object.hasOwn(manifest, field))
      demand(typeof manifest[field] === "string" && ENV.test(manifest[field]), "protection_environment_reference_required");
  }
}

/** Operator-populated environment only; these values never enter a manifest or receipt. */
export function loadProtectionCredentials(manifest, env = process.env) {
  validateProtectionReferences(manifest);
  return Object.fromEntries(["app", "engine"].map(surface => {
    const reference = manifest[surface + "_protection_env"];
    if (!reference) return [surface, null];
    const value = env[reference];
    demand(typeof value === "string" && /^[\x21-\x7e]{1,4096}$/.test(value), "protection_environment_missing_or_invalid");
    return [surface, value];
  }));
}

export function validateManifest(m) {
  demand(m?.schema_version === "hosted-monthly-acceptance-1", "manifest_required");
  validateProtectionReferences(m);
  demand(m.project_ref === PROJECT_REF, "wrong_supabase_project");
  demand(m.synthetic_only === true && m.dedicated_companies === true && m.writes_approved === true && m.confirmation === CONFIRMATION, "explicit_synthetic_fixture_authorization_required");
  demand(m.origins_approved === true, "approved_origins_required");
  demand(origin(m.app_origin) === m.app_origin && origin(m.engine_origin) === m.engine_origin, "canonical_origins_required");
  demand(m.app_origin !== m.engine_origin, "distinct_app_engine_origins_required");
  for (const value of [m.app_origin, m.engine_origin])
    demand(!/(^|\.)supabase\.(co|com|in)$/.test(new URL(value).hostname), "app_engine_must_not_target_supabase");
  demand(/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month || ""), "completed_month_required");
  const date = new Date(`${m.month}-01T00:00:00Z`);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  demand(Number.isFinite(date.valueOf()) && next <= new Date(), "completed_month_required");
  demand(Array.isArray(m.companies) && m.companies.length === 2, "two_fixture_companies_required");
  for (const c of m.companies) {
    demand(UUID.test(c.tenant_id || "") && UUID.test(c.user_id || ""), "explicit_fixture_identifiers_required");
    demand(ENV.test(c.cookie_env || "") && ENV.test(c.token_env || ""), "session_environment_references_required");
    demand(!("cookie" in c) && !("token" in c) && !("service_role_key" in c), "inline_credentials_forbidden");
    demand(!c.resume_cookie_env || (ENV.test(c.resume_cookie_env) && ENV.test(c.resume_token_env || "")), "resume_session_references_required");
    demand(Array.isArray(c.approved_import_ids) && c.approved_import_ids.every(x => UUID.test(x)), "explicit_import_allowlist_required");
  }
  demand(m.companies[0].tenant_id !== m.companies[1].tenant_id && m.companies[0].user_id !== m.companies[1].user_id, "distinct_company_and_user_identities_required");
  return m;
}

function claims(token, user, now) {
  try {
    const parts = token.split(".");
    demand(parts.length === 3 && parts[2].length > 10, "real_user_session_required");
    const head = JSON.parse(Buffer.from(parts[0], "base64url"));
    const body = JSON.parse(Buffer.from(parts[1], "base64url"));
    demand(["ES256", "RS256", "HS256"].includes(head.alg), "real_user_session_required");
    demand(body.iss === `https://${PROJECT_REF}.supabase.co/auth/v1`, "session_project_mismatch");
    demand(body.role === "authenticated" && (body.aud === "authenticated" || Array.isArray(body.aud) && body.aud.includes("authenticated")), "service_or_anonymous_session_forbidden");
    demand(body.sub === user && body.exp > now + 300 && body.is_anonymous !== true, "fresh_named_user_session_required");
    return body;
  } catch (error) { throw error instanceof AcceptanceError ? error : new AcceptanceError("real_user_session_required"); }
}

function cookieSession(raw) {
  demand(typeof raw === "string" && raw.length > 20 && raw.length < 40000 && !/[\r\n]/.test(raw), "browser_session_cookie_required");
  const name = `sb-${PROJECT_REF}-auth-token`;
  const parts = raw.split(";").map(piece => { const at = piece.indexOf("="); return [piece.slice(0, at).trim(), piece.slice(at + 1)]; });
  const full = parts.find(([key]) => key === name);
  const chunks = parts.filter(([key]) => key.startsWith(name + ".")).sort((a, b) => Number(a[0].slice(name.length + 1)) - Number(b[0].slice(name.length + 1)));
  demand(Boolean(full) !== Boolean(chunks.length), "browser_session_cookie_required");
  demand(!chunks.length || chunks.every(([key], i) => key === `${name}.${i}`), "browser_session_cookie_required");
  const selected = full ? [full] : chunks;
  try {
    const encoded = decodeURIComponent(selected.map(([, value]) => value).join(""));
    const session = JSON.parse(encoded.startsWith("base64-") ? Buffer.from(encoded.slice(7), "base64url").toString("utf8") : encoded);
    demand(typeof session.access_token === "string", "browser_session_cookie_required");
    return { token: session.access_token, cookie: selected.map(([key, value]) => `${key}=${value}`).join("; ") };
  } catch { throw new AcceptanceError("browser_session_cookie_required"); }
}

export function loadSessions(manifest, env = process.env, now = Math.floor(Date.now() / 1000)) {
  return manifest.companies.map(c => {
    const token = env[c.token_env];
    demand(typeof token === "string", "session_environment_missing");
    const primary = claims(token, c.user_id, now);
    const cookie = cookieSession(env[c.cookie_env]);
    demand(cookie.token === token, "cookie_and_token_session_mismatch");
    let resume = null;
    if (c.resume_cookie_env) {
      const resumedToken = env[c.resume_token_env];
      demand(typeof resumedToken === "string", "session_environment_missing");
      const resumedClaims = claims(resumedToken, c.user_id, now);
      const resumedCookie = cookieSession(env[c.resume_cookie_env]);
      demand(resumedCookie.token === resumedToken && resumedToken !== token && resumedClaims.session_id && resumedClaims.session_id !== primary.session_id, "independent_resume_session_required");
      resume = { token: resumedToken, cookie: `${resumedCookie.cookie}; active_tenant_id=${c.tenant_id}` };
    }
    return { token, cookie: `${cookie.cookie}; active_tenant_id=${c.tenant_id}`, resume };
  });
}

export function createHostedTransport(m, sessions, fetchImpl = fetch, env = process.env) {
  validateManifest(m);
  const protection = loadProtectionCredentials(m, env);
  return {
    live: true,
    async request({ surface = "app", company = 0, path, method = "GET", body, tenant, anonymous = false, tampered = false, resume = false }) {
      demand(surface === "app" || surface === "engine", "invalid_acceptance_surface");
      demand(/^\/(?:api\/v2\/|api\/tenant\/switch$|v2\/|tenant\/verify$)/.test(path) && !path.includes("..") && !/[?#]/.test(path), "invalid_acceptance_route");
      const session = resume ? sessions[company].resume : sessions[company];
      demand(anonymous || session, "session_environment_missing");
      const headers = { "Content-Type": "application/json", Origin: m.app_origin };
      if (protection[surface]) headers["x-vercel-protection-bypass"] = protection[surface];
      if (!anonymous) {
        if (surface === "app") headers.Cookie = session.cookie;
        else {
          let token = session.token;
          if (tampered) { const p = token.split("."); p[2] = (p[2][0] === "A" ? "B" : "A") + p[2].slice(1); token = p.join("."); }
          headers.Authorization = `Bearer ${token}`;
        }
      }
      if (surface === "engine") headers["X-Tenant-Id"] = tenant || m.companies[company].tenant_id;
      try {
        const response = await fetchImpl((surface === "app" ? m.app_origin : m.engine_origin) + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(20000) });
        demand(!response.redirected, "redirected_acceptance_request");
        const reader = response.body?.getReader();
        const chunks = []; let length = 0;
        if (reader) while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 4_000_000) { await reader.cancel(); throw new AcceptanceError("acceptance_response_too_large"); } chunks.push(Buffer.from(part.value)); }
        const raw = Buffer.concat(chunks).toString("utf8");
        let data; try { data = JSON.parse(raw); } catch { throw new AcceptanceError("non_json_acceptance_response"); }
        return { status: response.status, data };
      } catch (error) { throw error instanceof AcceptanceError ? error : new AcceptanceError("transport_failed"); }
    },
  };
}

function receipt(mode) {
  return { schema_version: "hosted-monthly-acceptance-result-1", run_id: randomUUID(), project_ref: PROJECT_REF, mode, release_ready: false, outcome: "pending", checks: [...CORE, ...MANUAL].map(id => ({ id, status: "pending", reason: "not_executed" })) };
}
function cents(value) { const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value)); demand(match, "unexpected_amount_format"); return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"))); }
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value; }
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function payload(month, wid, label, cost = "24000.00") {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { month, company_scope_complete: true, workloads: [{ workload_id: wid, audit: { title: label, kind: "product", period_start: month + "-01", period_end: end, cost_basis: "events", usage_csv: `event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,feature,run_id,billed_cost,cost_source\n${wid}-usage,${month}-02,synthetic,synthetic-model,10000,2000,12,synthetic-customer,documents,synthetic-run,${cost},Synthetic hosted acceptance source`, outcomes_csv: "run_id,status,accepted_quantity\nsynthetic-run,accepted,12000", revenue_csv: `revenue_id,date,amount,currency,customer_id,feature,method\n${wid}-revenue,${month}-02,36000.00,USD,synthetic-customer,documents,direct`, revenue_source: "reviewed_file", revenue_basis: "collections", revenue_reviewed: true, cost_scope_complete: true, outcome_cohort_complete: true }, review: { source_note: "Synthetic hosted acceptance only", method_reviewed: true, revenue_scope_complete: true, outcome_method_reviewed: true, control_cost: cost, control_source: "Synthetic independent control", control_revenue: "36000.00", revenue_control_source: "Synthetic collection control", expected_runs: 1 } }] };
}

export async function runAcceptance({ manifest, execute = false, transport, hasResume = false }) {
  const result = receipt(!execute ? "dry-run" : transport?.live ? "hosted" : "offline-transport-test");
  if (!execute) return result;
  let stage = "session_and_target";
  const passed = id => { const c = result.checks.find(x => x.id === id); c.status = "passed"; c.reason = result.mode === "hosted" ? "hosted_assertions_satisfied" : "offline_transport_assertions_only"; };
  const req = async (path, method = "GET", body, extras = {}) => transport.request({ path, method, body, ...extras });
  const expect = async (path, status = 200, method = "GET", body, extras = {}) => { const r = await req(path, method, body, extras); demand(r.status === status, "unexpected_http_status"); return r.data; };
  const check = async (id, fn) => { stage = id; await fn(); passed(id); };
  try {
    validateManifest(manifest);
    demand(transport?.request, "transport_required");
    const [a, b] = manifest.companies;
    await check("session_and_target", async () => {
      for (const [company, c] of manifest.companies.entries()) {
        const who = await expect("/tenant/verify", 200, "GET", undefined, { surface: "engine", company });
        demand(who.tenant_id === c.tenant_id && who.user_id === c.user_id && who.role === "owner", "verified_session_identity_mismatch");
      }
      const status = await expect("/api/v2/status");
      demand(status.available === true && status.monthly_available === true, "customer_monthly_release_unavailable");
      for (const company of [0, 1]) {
        const billing = await expect("/api/v2/billing", 200, "GET", undefined, { company });
        demand(billing.entitled === true && ["subscription", "complimentary"].includes(billing.access_source), "real_company_entitlement_required");
      }
    });
    await check("unauthenticated_denied", async () => {
      await expect("/tenant/verify", 401, "GET", undefined, { surface: "engine", anonymous: true });
      await expect("/tenant/verify", 401, "GET", undefined, { surface: "engine", tampered: true });
    });
    await check("cross_company_membership_denied", async () => {
      await expect("/tenant/verify", 403, "GET", undefined, { surface: "engine", company: 0, tenant: b.tenant_id });
      await expect("/tenant/verify", 403, "GET", undefined, { surface: "engine", company: 1, tenant: a.tenant_id });
    });
    await check("empty_fixture_workspaces", async () => {
      for (const company of [0, 1]) {
        const switchTo = await expect("/api/tenant/switch", 200, "POST", { tenantId: manifest.companies[company].tenant_id }, { company });
        demand(switchTo.ok === true, "app_fixture_membership_unverified");
        const w = await expect("/api/v2/monthly/workloads", 200, "GET", undefined, { company });
        const r = await expect("/api/v2/monthly/reports", 200, "GET", undefined, { company });
        const d = await expect(`/api/v2/monthly/drafts/${manifest.month}`, 200, "GET", undefined, { company });
        const i = await expect("/api/v2/monthly/imports", 200, "GET", undefined, { company });
        demand(Array.isArray(w.workloads) && w.workloads.length === 0 && Array.isArray(r.reports) && r.reports.length === 0 && d.draft === null, "fixture_workspace_not_empty");
        demand(Array.isArray(i.imports) && i.imports.every(row => manifest.companies[company].approved_import_ids.includes(row.id)), "unapproved_import_present");
      }
    });
    const wid = randomUUID(), otherWid = randomUUID();
    const label = `Synthetic acceptance ${result.run_id.slice(0, 8)}`;
    const definition = { name: label, kind: "product", purpose: "Dedicated synthetic acceptance fixture", responsible_team: "Engineering acceptance", outcome_unit: "accepted document", cost_scope: "Synthetic inference and reviewed outcomes", acceptance_definition: "Synthetic accepted document cohort", mappings: {} };
    await check("app_context_binding", async () => {
      for (const [company, id] of [[0, wid], [1, otherWid]]) {
        await expect(`/api/v2/monthly/workloads/${id}`, 200, "POST", { ...definition, name: `${label} ${company}` }, { company });
        const known = await expect("/v2/monthly/workloads", 200, "GET", undefined, { surface: "engine", company });
        demand(known.workloads.length === 1 && known.workloads[0].id === id, "app_engine_company_binding_mismatch");
      }
    });
    const input = payload(manifest.month, wid, label);
    const content = { ...input, import_ids: [], invoice_allocations: [], cost_assignments: [], step: "reconcile" };
    let draft;
    await check("draft_saved", async () => {
      draft = (await expect(`/api/v2/monthly/drafts/${manifest.month}`, 200, "PUT", { expected_revision: 0, content })).draft;
      demand(draft?.revision === 1 && draft.content.workloads[0].audit.usage_csv === input.workloads[0].audit.usage_csv, "draft_content_not_persisted");
    });
    await check("stale_draft_rejected", async () => { await expect(`/api/v2/monthly/drafts/${manifest.month}`, 409, "PUT", { expected_revision: 0, content }); });
    await check("draft_readback", async () => {
      const saved = (await expect(`/api/v2/monthly/drafts/${manifest.month}`)).draft;
      demand(saved?.revision === 1 && same(saved.content, draft.content), "draft_readback_changed");
    });
    if (hasResume) await check("independent_session_resume", async () => {
      const who = await expect("/tenant/verify", 200, "GET", undefined, { surface: "engine", resume: true });
      demand(who.user_id === a.user_id && who.tenant_id === a.tenant_id, "resumed_session_identity_mismatch");
      const saved = (await expect(`/api/v2/monthly/drafts/${manifest.month}`, 200, "GET", undefined, { resume: true })).draft;
      demand(saved?.revision === 1 && same(saved.content, draft.content), "independent_session_draft_changed");
    });
    await check("cross_company_draft_denied", async () => {
      demand((await expect(`/api/v2/monthly/drafts/${manifest.month}`, 200, "GET", undefined, { company: 1 })).draft === null, "other_company_draft_disclosed");
      for (const method of ["GET", "PUT"]) await expect(`/v2/monthly/drafts/${manifest.month}`, 403, method, method === "PUT" ? { expected_revision: 1, content } : undefined, { surface: "engine", company: 1, tenant: a.tenant_id });
    });
    let first, second;
    await check("report_calculated", async () => {
      first = await expect("/api/v2/monthly/reports", 200, "POST", input);
      demand(UUID.test(first.id || "") && /^[a-f0-9]{64}$/.test(first.fingerprint || "") && cents(first.result?.summary?.known_cost) === 2400000n, "report_total_or_identity_incorrect");
    });
    await check("report_retry_deduplicated", async () => { demand((await expect("/api/v2/monthly/reports", 200, "POST", input)).id === first.id, "duplicate_report_created"); });
    await check("cross_company_report_denied", async () => {
      for (const suffix of ["", "/evidence"]) {
        await expect(`/api/v2/monthly/reports/${first.id}${suffix}`, 404, "GET", undefined, { company: 1 });
        await expect(`/v2/monthly/reports/${first.id}${suffix}`, 403, "GET", undefined, { surface: "engine", company: 1, tenant: a.tenant_id });
      }
    });
    await check("invalid_allocation_lineage_denied", async () => {
      const invalid = structuredClone(input), audit = invalid.workloads[0].audit;
      audit.revenue_source = "stripe_reviewed";
      audit.revenue_csv = `revenue_id,date,amount,currency,customer_id,feature,method,allocation_note\nstripe-allocation:missing-source,${manifest.month}-02,36000.00,USD,synthetic-customer,documents,allocated,Synthetic missing invoice source`;
      await expect("/api/v2/monthly/reports", 422, "POST", invalid);
    });
    await check("immutable_report_versions", async () => {
      second = await expect("/api/v2/monthly/reports", 200, "POST", payload(manifest.month, wid, label, "24010.00"));
      demand(second.id !== first.id && second.fingerprint !== first.fingerprint, "correction_overwrote_report_identity");
      const old = await expect(`/api/v2/monthly/reports/${first.id}`);
      demand(same(old.result, first.result) && old.fingerprint === first.fingerprint, "historical_report_changed");
    });
    await check("selection_conflict_rejected", async () => {
      await expect("/api/v2/monthly/selection", 200, "POST", { report_id: first.id, expected_report_id: null, reason: "Synthetic hosted acceptance" });
      await expect("/api/v2/monthly/selection", 409, "POST", { report_id: second.id, expected_report_id: null, reason: "Synthetic stale selection" });
      await expect("/api/v2/monthly/selection", 200, "POST", { report_id: second.id, expected_report_id: first.id, reason: "Synthetic corrected version" });
    });
    const imports = [];
    if (a.approved_import_ids.length) await check("import_isolation", async () => {
      for (const id of a.approved_import_ids) {
        const own = await expect(`/api/v2/monthly/imports/${id}/evidence`);
        demand(own.id === id && own.month === manifest.month && own.state === "complete", "approved_import_unavailable");
        imports.push(own);
        await expect(`/api/v2/monthly/imports/${id}/evidence`, 404, "GET", undefined, { company: 1 });
        await expect(`/v2/monthly/imports/${id}/evidence`, 403, "GET", undefined, { surface: "engine", company: 1, tenant: a.tenant_id });
        await expect(`/v2/monthly/imports/${id}/advance`, 403, "POST", {}, { surface: "engine", company: 1, tenant: a.tenant_id });
      }
    });
    const stripe = imports.find(i => i.provider === "stripe" && i.evidence?.revenue?.some(r => cents(r.amount) >= 4n));
    if (stripe) {
      const invoice = stripe.evidence.revenue.find(r => cents(r.amount) >= 4n);
      const secondProduct = randomUUID();
      const formatCents = value => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
      const half = cents(invoice.amount) / 2n;
      const quarter = cents(invoice.amount) / 4n;
      const remainder = cents(invoice.amount) - half - quarter;
      const portions = [{ workload_id: wid, amount: formatCents(half), explanation: "Synthetic allocation source proof A" }, { workload_id: secondProduct, amount: formatCents(quarter), explanation: "Synthetic allocation source proof B" }];
      const valid = { month: manifest.month, import_ids: [stripe.id], invoice_allocations: [{ import_id: stripe.id, revenue_id: invoice.revenue_id, reviewed: true, allocations: portions }] };
      let sourceInput;
      await check("source_backed_allocated_report", async () => {
        await expect(`/api/v2/monthly/workloads/${secondProduct}`, 200, "POST", { ...definition, name: `${label} bundled product` });
        const prepared = await expect("/api/v2/monthly/prepare", 200, "POST", valid);
        demand(prepared.revenue_allocations?.length === 1 && cents(prepared.revenue_allocations[0].original_amount) === cents(invoice.amount) && cents(prepared.revenue_allocations[0].remainder) === remainder && prepared.workloads?.length === 2, "invoice_source_preparation_mismatch");
        sourceInput = structuredClone(input);
        sourceInput.import_ids = [stripe.id]; sourceInput.invoice_allocations = valid.invoice_allocations;
        sourceInput.workloads.push(payload(manifest.month, secondProduct, `${label} bundled product`, "6000.00").workloads[0]);
        for (const item of sourceInput.workloads) {
          const imported = prepared.workloads.find(w => w.workload_id === item.workload_id);
          const portion = portions.find(p => p.workload_id === item.workload_id);
          demand(imported && portion, "prepared_invoice_workload_missing");
          item.audit.revenue_source = "stripe_reviewed";
          item.audit.revenue_csv = imported.audit.revenue_csv;
          item.review.control_revenue = portion.amount;
        }
        const saved = await expect("/api/v2/monthly/reports", 200, "POST", sourceInput);
        const snapshot = saved.result?.invoice_allocations?.[0];
        demand(saved.result?.invoice_allocations?.length === 1 && snapshot.import_id === stripe.id && snapshot.revenue_id === invoice.revenue_id && cents(snapshot.original_amount) === cents(invoice.amount) && cents(snapshot.allocated_amount) === half + quarter && cents(snapshot.remainder) === remainder && snapshot.source_verified === true && snapshot.basis === "Modeled allocation" && snapshot.revenue_basis === "collections", "saved_invoice_lineage_incorrect");
        demand(typeof snapshot.account_id === "string" && snapshot.account_id.length > 0 && snapshot.account_id === prepared.revenue_allocations[0].account_id && snapshot.date === invoice.date && snapshot.currency === invoice.currency && snapshot.customer_id === (invoice.customer_id || ""), "saved_invoice_source_identity_changed");
        demand(snapshot.allocations?.length === 2, "saved_invoice_portion_incorrect");
        for (const expected of portions) {
          const portion = snapshot.allocations.find(p => p.workload_id === expected.workload_id);
          demand(portion && cents(portion.amount) === cents(expected.amount) && portion.explanation === expected.explanation && portion.revenue_id?.startsWith("stripe-allocation:"), "saved_invoice_portion_incorrect");
        }
        const reloaded = await expect(`/api/v2/monthly/reports/${saved.id}`);
        demand(reloaded.fingerprint === saved.fingerprint && same(reloaded.result.invoice_allocations, saved.result.invoice_allocations), "saved_invoice_snapshot_changed");
        const exported = await expect(`/api/v2/monthly/reports/${saved.id}/evidence`);
        demand(same(exported.payload?.invoice_allocations, sourceInput.invoice_allocations) && sourceInput.workloads.every(item => exported.payload?.workloads?.find(w => w.workload_id === item.workload_id)?.audit?.revenue_csv === item.audit.revenue_csv), "exported_invoice_lineage_changed");
        await expect(`/api/v2/monthly/reports/${saved.id}`, 404, "GET", undefined, { company: 1 });
      });
      await check("invoice_overallocation_rejected", async () => {
        const over = cents(invoice.amount) + 1n;
        const amount = `${over / 100n}.${String(over % 100n).padStart(2, "0")}`;
        await expect("/api/v2/monthly/prepare", 422, "POST", { month: manifest.month, import_ids: [stripe.id], invoice_allocations: [{ import_id: stripe.id, revenue_id: invoice.revenue_id, reviewed: true, allocations: [{ workload_id: wid, amount, explanation: "Synthetic over-allocation rejection check" }] }] });
        const altered = structuredClone(sourceInput);
        altered.workloads[0].audit.revenue_csv = altered.workloads[0].audit.revenue_csv.replace("Synthetic allocation source proof", "Synthetic altered source proof");
        demand(altered.workloads[0].audit.revenue_csv.includes("Synthetic altered source proof"), "prepared_allocation_explanation_missing");
        await expect("/api/v2/monthly/reports", 422, "POST", altered);
      });
    }
    result.outcome = "core_checks_passed_remaining_acceptance_pending";
  } catch (error) {
    const check = result.checks.find(x => x.id === stage);
    check.status = "failed";
    check.reason = error instanceof AcceptanceError ? error.code : "acceptance_transport_or_contract_failed";
    result.outcome = "failed";
  }
  return result;
}
