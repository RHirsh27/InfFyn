import { PROJECT_REF } from "./catalog.mjs";

const KEYS = {
  alpha_catalog: ["name"],
  roles: ["name"],
  tables: ["name"],
  columns: ["table_name", "name"],
  table_privileges: ["table_name", "role"],
  column_privileges: ["table_name", "column_name", "role"],
  functions: ["name", "arguments"],
  function_privileges: ["name", "arguments", "role"],
  policies: ["schemaname", "tablename", "policyname"],
  constraints: ["table_name", "name"],
  indexes: ["table_name", "name"],
  triggers: ["schema_name", "table_name", "name"],
  sequences: ["name", "role"],
};
const keyFor = (section, row) => KEYS[section].map((k) => row[k]).join(" / ");
const canonical = (x) =>
  JSON.stringify(
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
const unknown = (detail) => ({ status: "UNKNOWN", detail });

export function compareLedger(migrations, ledger) {
  if (!ledger || !Array.isArray(ledger.rows))
    return {
      status: "UNKNOWN",
      missing: [],
      unexpected: [],
      drift: [],
      content_unverified: [],
      detail:
        "Migration ledger is absent or not readable. Do not treat this as an empty database.",
    };
  const rows = new Map(ledger.rows.map((row) => [row.version, row]));
  const local = new Set(migrations.map((m) => m.version));
  const result = {
    status: "MATCHED_VERSIONS",
    missing: [],
    unexpected: [],
    drift: [],
    content_unverified: [],
    exact_content_matches: [],
  };
  if (rows.size !== ledger.rows.length)
    result.drift.push({
      version: "ledger",
      reason: "Duplicate migration versions",
    });
  for (const expected of migrations) {
    const actual = rows.get(expected.version);
    if (!actual) {
      result.missing.push({ version: expected.version, file: expected.file });
      continue;
    }
    // Never map a timestamped remote migration to an old numeric local file by
    // similar names alone. A repair operation needs a separately reviewed mapping.
    if (
      actual.name &&
      actual.name !== expected.name &&
      actual.name !== expected.file.replace(/\.sql$/, "")
    )
      result.drift.push({
        version: expected.version,
        reason: "Recorded migration name differs",
        expected_name: expected.name,
        actual_name: actual.name,
      });
    if (
      actual.statements_md5 === expected.statements_md5 &&
      actual.statement_count > 0
    )
      result.exact_content_matches.push(expected.version);
    else
      result.content_unverified.push({
        version: expected.version,
        reason: actual.statement_count
          ? "Retained statement fingerprint differs; CLI statement splitting or SQL drift requires inspection."
          : "Ledger contains a version stub without SQL statements.",
      });
  }
  for (const actual of ledger.rows)
    if (!local.has(actual.version))
      result.unexpected.push({
        version: actual.version,
        name: actual.name || null,
      });
  if (result.missing.length || result.unexpected.length || result.drift.length)
    result.status = "REVIEW_REQUIRED";
  return result;
}

export function compareInventory(
  manifest,
  inventory,
  ledger = null,
  source = "provided-snapshot",
) {
  if (
    manifest.project_ref !== PROJECT_REF ||
    inventory.project_ref !== PROJECT_REF
  )
    throw new Error(
      "Database preflight is restricted to the existing InfFyn project.",
    );
  const findings = [],
    coverage = {};
  for (const [section, fields] of Object.entries(KEYS)) {
    const expected = manifest.expected[section],
      actual = inventory[section];
    if (!Array.isArray(actual)) {
      coverage[section] = unknown("Catalog section was not observed.");
      continue;
    }
    coverage[section] = {
      status: "OBSERVED",
      expected: expected.length,
      observed: actual.length,
    };
    const byKey = new Map(actual.map((row) => [keyFor(section, row), row]));
    const expectedKeys = new Set(expected.map((row) => keyFor(section, row)));
    for (const row of expected) {
      const key = keyFor(section, row),
        observed = byKey.get(key);
      if (!observed) {
        findings.push({
          severity: "BLOCKER",
          section,
          object: key,
          kind: "MISSING",
        });
        continue;
      }
      const differences = Object.keys(row).filter(
        (field) =>
          !fields.includes(field) &&
          canonical(row[field]) !== canonical(observed[field]),
      );
      // Supabase default grants can give the privileged service role more access
      // than a bare PostgreSQL replay. Browser-role excess is always reported.
      const meaningful =
        (row.role === "service_role" && section.endsWith("privileges")) ||
        (row.role === "service_role" && section === "sequences")
          ? differences.filter(
              (field) => row[field] === true && observed[field] !== true,
            )
          : differences;
      if (meaningful.length)
        findings.push({
          severity: "BLOCKER",
          section,
          object: key,
          kind: "DRIFT",
          fields: meaningful,
          expected: Object.fromEntries(meaningful.map((f) => [f, row[f]])),
          observed: Object.fromEntries(meaningful.map((f) => [f, observed[f]])),
        });
    }
    for (const row of actual)
      if (!expectedKeys.has(keyFor(section, row)))
        findings.push({
          severity: "REVIEW",
          section,
          object: keyFor(section, row),
          kind: "UNEXPECTED",
        });
  }
  for (const row of inventory.table_privileges || []) {
    if (!["anon", "authenticated"].includes(row.role)) continue;
    const expected = manifest.expected.table_privileges.find(
      (p) => p.table_name === row.table_name && p.role === row.role,
    );
    const excess = [
      "can_insert",
      "can_update",
      "can_delete",
      "can_truncate",
      "can_trigger",
    ].filter((p) => row[p] && !expected?.[p]);
    if (excess.length)
      findings.push({
        severity: "BLOCKER",
        section: "table_privileges",
        object: `${row.table_name} / ${row.role}`,
        kind: "UNEXPECTED_BROWSER_MUTATION_PRIVILEGE",
        privileges: excess,
      });
  }
  for (const row of inventory.functions || []) {
    if (!row.security_definer) continue;
    const known = manifest.expected.functions.some(
      (f) =>
        f.name === row.name &&
        f.arguments === row.arguments &&
        f.security_definer,
    );
    const publicExecutors = (inventory.function_privileges || []).filter(
      (p) =>
        p.name === row.name &&
        p.arguments === row.arguments &&
        ["anon", "authenticated"].includes(p.role) &&
        p.can_execute,
    );
    if (!known && publicExecutors.length)
      findings.push({
        severity: "BLOCKER",
        section: "functions",
        object: row.name,
        kind: "UNEXPECTED_BROWSER_EXECUTABLE_SECURITY_DEFINER",
        roles: publicExecutors.map((p) => p.role),
      });
  }
  const history = compareLedger(manifest.migrations, ledger);
  const context = inventory.context?.[0];
  if (
    source === "live-read-only" &&
    (!context ||
      context.transaction_read_only !== "on" ||
      context.database !== "postgres")
  )
    findings.push({
      severity: "BLOCKER",
      section: "context",
      kind: "READ_ONLY_CONTEXT_NOT_VERIFIED",
    });
  const unresolved =
    findings.length > 0 ||
    Object.values(coverage).some((c) => c.status === "UNKNOWN") ||
    history.status !== "MATCHED_VERSIONS" ||
    history.content_unverified.length > 0;
  return {
    format: manifest.format,
    project_ref: PROJECT_REF,
    source,
    inspected_at: new Date().toISOString(),
    release_ready: false,
    status: unresolved ? "REVIEW_REQUIRED" : "CATALOG_MATCH_RELEASE_UNVERIFIED",
    local_migration_count: manifest.migration_count,
    coverage,
    migration_history: history,
    findings,
    backup: unknown(
      "Confirm a recoverable backup and retention with the owning Supabase account; SQL catalogs do not prove this.",
    ),
    restore: unknown(
      "A restore into an isolated destination and verification of reports, grants and credential-key availability must be witnessed.",
    ),
    hosted_tenant_acceptance: unknown(
      "Catalog checks do not replace two-company real-JWT API isolation and save/return tests.",
    ),
    limits: [
      "No database records were created or changed by this preflight.",
      "Unexpected objects may belong to existing production work. Inspect; do not automatically delete or repair history.",
      "Schema-expression hashes can vary across PostgreSQL versions. A difference requires review, not automatic replacement.",
      "Migration statements can be reformatted by the CLI. Only matching exact fingerprints prove exact retained SQL; stubs and differences remain unverified.",
    ],
  };
}
