/** Explicit operator actions. Never enables intake, creates users, or reads secrets from disk. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export const PROJECT = "jmfzmoqdvweeixxwzlma";
export const APP =
  "https://inffyn-preview-git-codex-p-8fa386-ryanmhirsh-gmailcoms-projects.vercel.app";
export const ENGINE = "https://inffyn-engine-alpha.onrender.com";
const ENV_REF = /^INFFYN_OPERATIONS_[A-Z0-9_]+$/;
const ID = /^[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
class OperationError extends Error {}
function demand(test, reason) {
  if (!test) throw new OperationError(reason);
}

export function validateConfig(config) {
  demand(
    config?.project_ref === PROJECT &&
      config.app_origin === APP &&
      config.engine_origin === ENGINE,
    "unexpected_deployment",
  );
  demand(
    config.retention_policy_approved === true,
    "retention_policy_approval_required",
  );
  const fields = new Set([
    "project_ref",
    "app_origin",
    "engine_origin",
    "retention_policy_approved",
    "cron_secret_env",
    "app_protection_env",
  ]);
  demand(
    Object.keys(config).every((k) => fields.has(k)),
    "unexpected_configuration_field",
  );
  demand(
    ENV_REF.test(config.cron_secret_env || ""),
    "secret_environment_reference_required",
  );
  if (config.app_protection_env)
    demand(
      ENV_REF.test(config.app_protection_env),
      "protection_environment_reference_required",
    );
  return config;
}

function credential(env, reference) {
  const value = env[reference];
  demand(
    typeof value === "string" && /^[\x21-\x7e]{32,4096}$/.test(value),
    "operator_credential_unavailable",
  );
  return value;
}

/** Latest failed attempt overrides older success. An event emission is never delivery proof. */
export function retentionReadiness(receipts, now = Date.now()) {
  const ordered = receipts
    .filter(
      (r) =>
        r?.schema_version === "inffyn-operations-1" &&
        r.mode === "hosted" &&
        r.project_ref === PROJECT,
    )
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const latest = ordered[0];
  if (!latest) return { ready: false, reason: "no_hosted_sweep" };
  const completed = Date.parse(latest.retention?.completed_at);
  const started = Date.parse(latest.started_at);
  if (latest.retention?.status !== "passed")
    return { ready: false, reason: "latest_sweep_failed_or_missing" };
  if (
    !Number.isFinite(completed) ||
    !Number.isFinite(started) ||
    completed > now ||
    started > now ||
    completed < started - 60000
  )
    return { ready: false, reason: "invalid_sweep_timestamp" };
  if (now - completed > 24 * 3600 * 1000)
    return { ready: false, reason: "sweep_overdue" };
  return { ready: true, reason: "recent_hosted_sweep_only" };
}

export async function runOperations({
  execute = false,
  config,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const receipt = {
    schema_version: "inffyn-operations-1",
    run_id: randomUUID(),
    project_ref: PROJECT,
    started_at: new Date().toISOString(),
    mode: execute ? "hosted" : "dry-run",
    outcome: "pending",
    release_ready: false,
    retention: { status: "pending" },
    monitoring: { status: "pending", delivery_verified: false },
    pending: [
      "independent_recovery_key_custody",
      "external_error_delivery",
      "two_company_authenticated_workflow",
    ],
  };
  if (!execute) return receipt;
  let stage = "configuration";
  try {
    validateConfig(config);
    const headers = {
      Authorization: "Bearer " + credential(env, config.cron_secret_env),
    };
    if (config.app_protection_env)
      headers["x-vercel-protection-bypass"] = credential(
        env,
        config.app_protection_env,
      );
    async function request(url, options = {}) {
      const response = await fetchImpl(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(65000),
      });
      demand(
        !response.redirected && response.status === 200,
        "unexpected_service_response",
      );
      // Only bounded structured operational receipts are allowed out of the runner.
      const reader = response.body.getReader();
      let bytes = 0;
      const chunks = [];
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 16384) {
          await reader.cancel();
          throw new OperationError("operational_response_too_large");
        }
        chunks.push(Buffer.from(part.value));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    stage = "status";
    const status = await request(ENGINE + "/v2/status");
    demand(
      status.release_stage === "private_alpha" &&
        status.billing_available === false,
      "private_alpha_required",
    );
    receipt.intake_enabled = status.monthly_available === true;
    stage = "retention";
    const retained = await request(APP + "/api/maintenance", {
      method: "POST",
      headers: { ...headers, "x-inffyn-maintenance-action": "retention" },
    });
    demand(
      retained.monthly_included === true &&
        UUID.test(retained.run_id || "") &&
        Number.isFinite(Date.parse(retained.completed_at)),
      "incomplete_retention_receipt",
    );
    receipt.retention = {
      status: "passed",
      run_id: retained.run_id,
      completed_at: retained.completed_at,
      monthly_included: true,
    };
    stage = "monitoring";
    const monitored = await request(APP + "/api/maintenance", {
      method: "POST",
      headers: { ...headers, "x-inffyn-maintenance-action": "monitoring" },
    });
    for (const surface of ["app", "engine"]) {
      const event = monitored[surface];
      demand(
        ID.test(event?.event_id || "") &&
          event.check === "synthetic_scrubbed_error" &&
          event.platform_log_emitted === true &&
          event.external_delivery_verified === false,
        "incomplete_monitoring_receipt",
      );
    }
    receipt.monitoring = {
      status: "emitted_unverified",
      delivery_verified: false,
      app_event_id: monitored.app.event_id,
      engine_event_id: monitored.engine.event_id,
      app_external_configured:
        monitored.app.external_monitor_configured === true,
      engine_external_configured:
        monitored.engine.external_monitor_configured === true,
    };
    receipt.outcome = "operations_executed_acceptance_pending";
  } catch (error) {
    receipt.outcome = "failed";
    receipt.failure = {
      stage,
      code:
        error instanceof OperationError ? error.message : "operation_failed",
    };
    if (stage === "retention") receipt.retention = { status: "failed" };
  }
  return receipt;
}

async function cli() {
  let result;
  try {
    const args = process.argv.slice(2),
      values = {};
    for (let i = 0; i < args.length; i++) {
      demand(
        ["--execute", "--config", "--report", "--check-receipts"].includes(
          args[i],
        ),
        "unknown_argument",
      );
      demand(!(args[i] in values), "duplicate_argument");
      const key = args[i];
      values[key] = key === "--execute" ? true : args[++i];
      demand(
        values[key] && !String(values[key]).startsWith("--"),
        "argument_required",
      );
    }
    if (values["--check-receipts"]) {
      demand(
        !values["--execute"] && !values["--config"],
        "check_does_not_execute",
      );
      result = retentionReadiness(
        JSON.parse(await readFile(values["--check-receipts"], "utf8")),
      );
      process.exitCode = result.ready ? 0 : 2;
    } else {
      result = await runOperations({
        execute: values["--execute"] === true,
        config: values["--config"]
          ? JSON.parse(await readFile(values["--config"], "utf8"))
          : undefined,
      });
      process.exitCode = result.outcome === "failed" ? 1 : 0;
    }
    if (values["--report"])
      await writeFile(
        values["--report"],
        JSON.stringify(result, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
  } catch {
    result = {
      outcome: "pending",
      release_ready: false,
      reason: "operator_configuration_or_receipt_unavailable",
    };
    process.exitCode = 2;
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await cli();
