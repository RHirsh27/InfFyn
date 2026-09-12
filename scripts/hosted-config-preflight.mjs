// Configuration-name inventory only. Never pulls .env files, reads values, changes
// settings, calls the database, or deploys. Presence is not configuration acceptance.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TARGETS = Object.freeze({
  app: {
    projectId: "prj_jZDPzOm2PZRiwYK43GJ5FTOmZ54c",
    orgId: "team_sP2wD4MBHG6ACAEpv5pm8rb9",
    projectName: "inffyn-preview",
    directory: ROOT,
  },
  engine: {
    projectId: "prj_YkyoXtOXd8AtPRdiW8jxcN3JqnIv",
    orgId: "team_sP2wD4MBHG6ACAEpv5pm8rb9",
    projectName: "inffyn-preview-engine",
    directory: path.join(ROOT, "engine"),
  },
});
const GROUPS = {
  core_csv_app: {
    service: "app",
    names: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "ENGINE_URL",
      "AUDIT_PROXY_SECRET",
    ],
  },
  core_csv_engine: {
    service: "engine",
    names: [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "APP_BASE_URL",
      "AUDIT_PROXY_SECRET",
      "AUDIT_V2_ENABLED",
      "AUDIT_RETENTION_APPROVED",
      "MONTHLY_ENABLED",
    ],
  },
  operations_app: {
    service: "app",
    names: ["CRON_SECRET", "MAINTENANCE_SECRET"],
    alternatives: [["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]],
  },
  operations_engine: {
    service: "engine",
    names: ["MAINTENANCE_SECRET", "SENTRY_DSN"],
  },
  openai_import: {
    service: "engine",
    names: ["PROVIDER_TOKEN_ENC_KEY", "OPENAI_IMPORT_ENABLED"],
  },
  anthropic_import: {
    service: "engine",
    names: ["PROVIDER_TOKEN_ENC_KEY", "ANTHROPIC_IMPORT_ENABLED"],
  },
  stripe_import: {
    service: "engine",
    names: [
      "STRIPE_SECRET_KEY",
      "STRIPE_APP_CLIENT_ID",
      "STRIPE_OAUTH_REDIRECT_URI",
      "OAUTH_STATE_SECRET",
      "STRIPE_TOKEN_ENC_KEY",
      "STRIPE_IMPORT_ENABLED",
    ],
  },
  subscription_billing: {
    service: "engine",
    names: [
      "STRIPE_BILLING_KEY",
      "STRIPE_BILLING_WEBHOOK_SECRET",
      "STRIPE_BILLING_PRICE_ID",
      "BILLING_PRICE_APPROVED",
      "BILLING_ENABLED",
      "BILLING_LIVE_APPROVED",
    ],
  },
};
const FLAG_NAMES = ["INFFYN_PREVIEW_MODE", "INFFYN_PREVIEW_STORAGE"];

export function validateProjectLink(link, target) {
  if (
    !link ||
    ["projectId", "orgId", "projectName"].some(
      (key) => link[key] !== target[key],
    )
  )
    throw new Error("unexpected_vercel_project");
}

export function parseEnvironmentNames(output, projectName) {
  // Vercel env ls is the names/type/environment table, never env pull or get.
  // Discard every other column and all diagnostics before constructing a receipt.
  if (
    typeof output !== "string" ||
    output.length > 256000 ||
    output.includes("\u001b")
  )
    throw new Error("unrecognized_environment_inventory");
  if (!output.includes(`/` + projectName + " ["))
    throw new Error("environment_project_unverified");
  const lines = output.split(/\r?\n/);
  const at = lines.findIndex((line) =>
    /^\s*name\s+value\s+environments\s+created\s*$/i.test(line),
  );
  if (at < 0) {
    if (/No Environment Variables found/i.test(output)) return [];
    throw new Error("environment_inventory_unavailable");
  }
  const names = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) continue;
    const columns = line.trim().split(/\s{2,}/);
    if (
      columns.length !== 4 ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(columns[0]) ||
      !/^(?:Production)(?:, (?:Preview|Development))*$/.test(columns[2])
    )
      throw new Error("unrecognized_environment_inventory");
    names.push(columns[0]);
  }
  if (new Set(names).size !== names.length)
    throw new Error("duplicate_environment_names");
  return names.sort();
}

export function configurationReceipt(inventory = {}, mode = "offline") {
  const services = Object.fromEntries(
    Object.entries(TARGETS).map(([service, target]) => [
      service,
      {
        project_id: target.projectId,
        project_name: target.projectName,
        team_id: target.orgId,
        inventory_status: Array.isArray(inventory[service])
          ? "names_observed"
          : "pending",
        configured_names: Array.isArray(inventory[service])
          ? inventory[service]
          : [],
      },
    ]),
  );
  const groups = Object.fromEntries(
    Object.entries(GROUPS).map(([name, group]) => {
      const observed = Array.isArray(inventory[group.service]);
      const names = new Set(inventory[group.service] || []);
      const missing = observed
        ? group.names.filter((item) => !names.has(item))
        : [];
      const missingAlternatives = observed
        ? (group.alternatives || []).filter(
            (options) => !options.some((item) => names.has(item)),
          )
        : [];
      return [
        name,
        {
          service: group.service,
          status: !observed
            ? "pending"
            : missing.length || missingAlternatives.length
              ? "missing_configuration_names"
              : "names_present_values_unverified",
          required_names: group.names,
          missing_names: missing,
          missing_alternatives: missingAlternatives,
        },
      ];
    }),
  );
  return {
    schema_version: "inffyn-hosted-config-preflight-1",
    project_ref: "jmfzmoqdvweeixxwzlma",
    mode,
    status:
      mode === "offline"
        ? "OFFLINE_PREPARED_HOSTED_UNVERIFIED"
        : "HOSTED_CONFIGURATION_REVIEW_REQUIRED",
    release_ready: false,
    mutations_performed: false,
    secret_values_read: false,
    services,
    groups,
    preview_switches: Object.fromEntries(
      Object.entries(services).map(([service, entry]) => [
        service,
        FLAG_NAMES.map((name) => ({
          name,
          presence:
            entry.inventory_status === "pending"
              ? "unknown"
              : entry.configured_names.includes(name)
                ? "present"
                : "absent",
          value_verified: false,
        })),
      ]),
    ),
    pending_checks: [
      "exact_supabase_target_and_migration_acceptance",
      "backup_and_restore",
      "app_and_engine_origins_match",
      "matching_proxy_secret",
      "preview_disabled_only_after_foundation_acceptance",
      "release_flags_and_retention_approval",
      "magic_link_delivery_and_callback_allowlist",
      "two_verified_company_owners_and_entitlements",
      "authenticated_csv_save_return_and_company_isolation",
      "provider_known_totals_and_revocation",
      "monitoring_retention_and_recovery",
    ],
    scope_note:
      "Core CSV configuration is separate from provider imports and paid billing. Names alone do not prove values, authorization, flags, deployment behavior, or readiness. This command cannot activate the workspace.",
  };
}

export function runConfigurationPreflight({
  live = false,
  readLink = (target) =>
    JSON.parse(
      readFileSync(
        path.join(target.directory, ".vercel", "project.json"),
        "utf8",
      ),
    ),
  listNames = (target) => {
    if (process.platform !== "win32")
      throw new Error("windows_metadata_runner_required");
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "vercel env ls production --no-color",
      ],
      {
        cwd: target.directory,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 256000,
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0)
      throw new Error("environment_inventory_unavailable");
    return parseEnvironmentNames(
      `${result.stderr || ""}\n${result.stdout || ""}`,
      target.projectName,
    );
  },
} = {}) {
  if (!live) return configurationReceipt();
  // Check both links before the first authenticated metadata request.
  for (const target of Object.values(TARGETS))
    validateProjectLink(readLink(target), target);
  const inventory = Object.fromEntries(
    Object.entries(TARGETS).map(([service, target]) => [
      service,
      listNames(target),
    ]),
  );
  return configurationReceipt(inventory, "live_metadata_only");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((value) => value !== "--live"))
      throw new Error("invalid_argument");
    const result = runConfigurationPreflight({ live: args.includes("--live") });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = args.includes("--live") ? 2 : 0;
  } catch {
    console.log(
      JSON.stringify(
        {
          schema_version: "inffyn-hosted-config-preflight-1",
          status: "INSPECTION_UNAVAILABLE",
          release_ready: false,
          mutations_performed: false,
          reason:
            "Exact project links or a recognized names-only Vercel inventory were unavailable. No configuration was changed.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
