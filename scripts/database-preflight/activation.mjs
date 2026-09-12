import { PROJECT_REF } from "./catalog.mjs";

const BASELINE = [
  ["0001", "scaffold_healthcheck"],
  ["0002", "tenancy"],
  ["0003", "harden_function_grants"],
  ["0004", "canonical_model"],
  ["0005", "ingest_storage"],
  ["0006", "stripe_connection"],
  ["0007", "reference_pricing_audit_runs"],
  ["0008", "tenant_tier"],
  ["0009", "drop_scaffold_healthcheck"],
  ["0010", "tenancy_grants_hardening"],
  ["0011", "opsx_grain_substrate"],
];
const CANDIDATES = [
  "0012_audit_v2.sql",
  "0013_release_access.sql",
  "20260911015433_standalone_monthly_economics.sql",
  "20260911031800_company_monthly_preparation.sql",
  "20260911141814_reconcile_stripe_oauth_legacy_history.sql",
  "20260911155306_private_alpha_database_admission.sql",
  "20260912190000_reviewed_csv_imports.sql",
];
const STRIPE_COLUMNS = [
  ["id", "uuid", false],
  ["tenant_id", "uuid", false],
  ["stripe_account_id", "text", false],
  ["scope", "text", false],
  ["status", "text", false],
  ["last_sync_at", "timestamptz", true],
  ["last_cursor", "text", true],
  ["last_error", "text", true],
  ["created_at", "timestamptz", false],
];
const BASE_TABLES = [
  "profiles",
  "tenants",
  "memberships",
  "revenue_events",
  "cost_events",
  "usage_events",
  "audit_aggregates",
  "ingest_jobs",
  "stripe_connections",
  "reference_pricing",
  "audit_runs",
]
  .map((name) => `public.${name}`)
  .sort();
const sameNames = (rows, expected) =>
  Array.isArray(rows) &&
  JSON.stringify(rows.map((r) => r.name).sort()) === JSON.stringify(expected);

// Consumes only sanitized metadata receipts. No transport, SQL, environment,
// credentials, approvals, deployment or ledger-repair implementation lives here.
// Even an exact observed baseline never makes a migration executable/approved.
export function buildActivationPlan(
  migrations,
  metadata,
  columns,
  now = new Date(),
) {
  if (
    metadata?.project_ref !== PROJECT_REF ||
    columns?.project_ref !== PROJECT_REF
  )
    throw new Error("Only the existing InfFyn project is permitted.");
  const blockers = [];
  const checked = [metadata.checked_at_utc, columns.checked_at_utc];
  const fresh = checked.every(
    (value) =>
      typeof value === "string" &&
      Number.isFinite(Date.parse(value)) &&
      now - Date.parse(value) <= 86400000 &&
      Date.parse(value) - now <= 300000,
  );
  if (!fresh) blockers.push("METADATA_STALE_OR_UNDATED");
  const ledgerMatches =
    metadata.migrations_access === "succeeded" &&
    Array.isArray(metadata.migrations) &&
    metadata.migrations.length === BASELINE.length &&
    BASELINE.every(
      ([version, name]) =>
        metadata.migrations.filter(
          (m) => m.version === version && m.name === name,
        ).length === 1,
    );
  if (!ledgerMatches) blockers.push("OBSERVED_LEGACY_LEDGER_CHANGED");
  const tablesMatch =
    metadata.tables_access === "succeeded" &&
    sameNames(metadata.tables, BASE_TABLES) &&
    sameNames(columns.tables, BASE_TABLES) &&
    metadata.tables.every((table) => table.rls_enabled === true);
  if (!tablesMatch) blockers.push("OBSERVED_TABLE_BASELINE_CHANGED");
  const stripe = columns.tables?.find(
    (t) => t.name === "public.stripe_connections",
  );
  const stripeMatches =
    Array.isArray(stripe?.columns) &&
    stripe.columns.length === STRIPE_COLUMNS.length &&
    STRIPE_COLUMNS.every(
      ([name, format, nullable]) =>
        stripe.columns.filter(
          (column) =>
            column.name === name &&
            column.format === format &&
            column.nullable === nullable,
        ).length === 1,
    );
  if (!stripeMatches) blockers.push("OBSERVED_STRIPE_COLUMN_BASELINE_CHANGED");
  const candidates = CANDIDATES.map((file) =>
    migrations.find((m) => m.file === file),
  );
  const expectedLocalBaseline = BASELINE.map(([version, name]) => [
    version,
    version === "0009" ? "stripe_app_oauth_refresh_token" : name,
  ]);
  if (
    migrations.length !== BASELINE.length + CANDIDATES.length ||
    expectedLocalBaseline.some(
      ([version, name]) =>
        migrations.filter((m) => m.version === version && m.name === name)
          .length !== 1,
    ) ||
    candidates.some((m) => !m || !/^[a-f0-9]{64}$/.test(m.sha256))
  )
    blockers.push("LOCAL_MIGRATION_SET_CHANGED");
  const baselineMatches = blockers.length === 0;
  blockers.push(
    "FULL_CATALOG_AND_LEDGER_FINGERPRINT_REVIEW_REQUIRED",
    "RECOVERABLE_BACKUP_AND_RESTORE_EVIDENCE_REQUIRED",
    "APPROVED_MIGRATION_EXECUTION_CHANNEL_REQUIRED",
  );
  return {
    format: "inffyn-database-activation-plan-1.0",
    project_ref: PROJECT_REF,
    status: "PREPARED_HOSTED_VERIFICATION_REQUIRED",
    executable: false,
    release_ready: false,
    database_mutations: false,
    private_alpha_database_configuration: "Install all seven candidates in order, including alpha admission and reviewed CSV imports, before configuring the private UUID list and enabling alpha through reviewed service administration. This planner performs neither operation.",
    metadata_baseline_matches: baselineMatches,
    evidence_checked_at_utc: checked.map((v) =>
      typeof v === "string" && Number.isFinite(Date.parse(v))
        ? new Date(v).toISOString()
        : null,
    ),
    known_history_divergence: {
      version: "0009",
      local_name: "stripe_app_oauth_refresh_token",
      observed_name: "drop_scaffold_healthcheck",
      resolution:
        "Preserve historical files and ledger; add the separately versioned convergence migration after review. Do not replay or mark local 0009 applied.",
      scaffold:
        "Absent in the observed legacy database; do not recreate it. The strict fresh-database preflight must continue reporting this historical difference.",
    },
    candidate_migrations: baselineMatches
      ? candidates.map(({ file, version, name, sha256 }) => ({
          file,
          version,
          name,
          sha256,
        }))
      : [],
    blockers,
    execution_constraints: [
      "This file is a review plan, never an executable migration runner or authorization receipt.",
      "Re-read live metadata immediately before deployment; saved receipts can be stale.",
      "Review grants, policies, functions, constraints, indexes and retained migration fingerprints before applying any candidate.",
      "Use an individually reviewed migration transaction through an approved channel, preserving each original version and recording the new convergence version separately. Do not use blanket db push or automatic ledger repair.",
      "Apply candidates in listed order only after all blockers are resolved. Keep the company launch closed until hosted acceptance passes.",
      "After deployment, use the full catalog preflight; this legacy-baseline planner is expected to reject the changed database.",
      "Restoration of a backup, real-JWT tenant isolation and provider imports remain separate witnessed checks.",
    ],
  };
}
