import assert from "node:assert/strict";
import test from "node:test";
import {
  APP,
  ENGINE,
  PROJECT,
  retentionReadiness,
  runOperations,
  validateConfig,
} from "../scripts/operations/run.mjs";

const config = {
  project_ref: PROJECT,
  app_origin: APP,
  engine_origin: ENGINE,
  retention_policy_approved: true,
  cron_secret_env: "INFFYN_OPERATIONS_CRON_SECRET",
  app_protection_env: "INFFYN_OPERATIONS_APP_PROTECTION",
};
const env = {
  INFFYN_OPERATIONS_CRON_SECRET: "a".repeat(40),
  INFFYN_OPERATIONS_APP_PROTECTION: "b".repeat(40),
};
const retained = {
  run_id: "11111111-1111-4111-8111-111111111111",
  completed_at: new Date().toISOString(),
  monthly_included: true,
};
const event = {
  event_id: "a".repeat(32),
  check: "synthetic_scrubbed_error",
  platform_log_emitted: true,
  external_monitor_configured: false,
  external_delivery_verified: false,
};
function response(url, options) {
  if (url === ENGINE + "/v2/status")
    return Response.json({
      release_stage: "private_alpha",
      billing_available: false,
      monthly_available: false,
    });
  return Response.json(
    options.headers["x-inffyn-maintenance-action"] === "retention"
      ? retained
      : { app: event, engine: event },
  );
}

test("operations defaults to pending with no credential access or network", async () => {
  let calls = 0;
  const r = await runOperations({
    fetchImpl() {
      calls++;
    },
    env: new Proxy(
      {},
      {
        get() {
          throw new Error("no credentials");
        },
      },
    ),
  });
  assert.equal(calls, 0);
  assert.equal(r.mode, "dry-run");
  assert.equal(r.release_ready, false);
});

test("operations pins both hosts and Supabase project and accepts references only", () => {
  assert.equal(validateConfig(config), config);
  for (const change of [
    { project_ref: "other" },
    { app_origin: "https://other.example" },
    { engine_origin: ENGINE + "/other" },
    { retention_policy_approved: false },
    { cron_secret_env: "actual-secret" },
    { service_role_key: "forbidden" },
    { token: "forbidden" },
  ])
    assert.throws(() => validateConfig({ ...config, ...change }));
});

test("operator credentials go only to the protected app and results retain no unexpected fields", async () => {
  const calls = [];
  const r = await runOperations({
    execute: true,
    config,
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const r = response(url, options);
      const data = await r.json();
      return Response.json({ ...data, secret: "must-not-escape" });
    },
  });
  assert.equal(r.outcome, "operations_executed_acceptance_pending");
  assert.equal(r.retention.status, "passed");
  assert.equal(r.monitoring.status, "emitted_unverified");
  assert.equal(r.monitoring.delivery_verified, false);
  assert.equal(r.release_ready, false);
  assert.equal(calls[0].options.headers, undefined);
  assert.ok(
    calls
      .slice(1)
      .every(
        (c) =>
          c.url === APP + "/api/maintenance" &&
          c.options.headers.Authorization ===
            "Bearer " + env.INFFYN_OPERATIONS_CRON_SECRET &&
          c.options.redirect === "error",
      ),
  );
  assert.doesNotMatch(
    JSON.stringify(r),
    /must-not-escape|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/,
  );
});

test("failed or malformed retention never records success or proceeds to monitoring", async () => {
  for (const failure of [
    new Response("private error", { status: 503 }),
    Response.json({ completed_at: retained.completed_at }),
    Response.json({ ...retained, monthly_included: false }),
  ]) {
    let calls = 0;
    const r = await runOperations({
      execute: true,
      config,
      env,
      fetchImpl: async (url, options) => {
        calls++;
        return calls === 1 ? response(url, options) : failure;
      },
    });
    assert.equal(calls, 2);
    assert.equal(r.retention.status, "failed");
    assert.equal(r.outcome, "failed");
    assert.equal(r.release_ready, false);
  }
});

test("service redirects and HTML protection pages fail safely", async () => {
  for (const r of [
    new Response(null, {
      status: 302,
      headers: { Location: "https://other.example" },
    }),
    new Response("sign in"),
  ]) {
    const result = await runOperations({
      execute: true,
      config,
      env,
      fetchImpl: async () => r,
    });
    assert.equal(result.outcome, "failed");
    assert.equal(result.retention.status, "pending");
  }
});

test("retention readiness rejects absent, failed, overdue and future receipts", () => {
  const now = Date.parse("2026-09-13T12:00:00Z");
  const successful = {
    schema_version: "inffyn-operations-1",
    project_ref: PROJECT,
    mode: "hosted",
    started_at: "2026-09-13T11:00:00Z",
    retention: { status: "passed", completed_at: "2026-09-13T11:00:05Z" },
  };
  assert.equal(retentionReadiness([successful], now).ready, true);
  assert.equal(retentionReadiness([], now).reason, "no_hosted_sweep");
  assert.equal(
    retentionReadiness([{ ...successful, mode: "dry-run" }], now).ready,
    false,
  );
  assert.equal(
    retentionReadiness(
      [
        successful,
        {
          ...successful,
          started_at: "2026-09-13T11:30:00Z",
          retention: { status: "failed" },
        },
      ],
      now,
    ).ready,
    false,
  );
  assert.equal(
    retentionReadiness([successful], now + 25 * 3600000).reason,
    "sweep_overdue",
  );
  assert.equal(
    retentionReadiness([successful], now - 2 * 3600000).reason,
    "invalid_sweep_timestamp",
  );
});
