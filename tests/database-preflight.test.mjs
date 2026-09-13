import test, { before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { buildManifest } from "../scripts/database-preflight/manifest.mjs";
import {
  PROJECT_REF,
  CATALOG_QUERIES,
  LEDGER_QUERY,
  LEDGER_PROBE,
  readOnlyBatch,
} from "../scripts/database-preflight/catalog.mjs";
import {
  compareInventory,
  compareLedger,
} from "../scripts/database-preflight/compare.mjs";
import {
  validateTarget,
  childEnvironment,
  inspectLive,
} from "../scripts/database-preflight/live.mjs";
import { parseArguments } from "../scripts/database-preflight.mjs";

let manifest;
before(async () => {
  manifest = await buildManifest();
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const inventory = () => ({
  project_ref: PROJECT_REF,
  ...clone(manifest.expected),
});
const exactLedger = () => ({
  rows: manifest.migrations.map((m) => ({
    version: m.version,
    name: m.name,
    statement_count: 1,
    statements_md5: m.statements_md5,
  })),
});
const absolute = (name) =>
  new URL(`../.validation/${name}`, import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
const target = () => ({
  live: true,
  projectRef: PROJECT_REF,
  host: `db.${PROJECT_REF}.supabase.co`,
  user: "postgres",
  pgpassFile: absolute("preflight.pgpass"),
  sslRootCert: absolute("preflight-ca.crt"),
});

test("offline manifest includes reviewed CSV imports and never claims hosted readiness", () => {
  assert.equal(manifest.migration_count, 18);
  assert.ok(manifest.migrations.some((m) => m.version === "20260912190000"));
  assert.equal(
    manifest.expected.tables.filter(
      (t) =>
        t.name.startsWith("inffyn_monthly") ||
        t.name === "inffyn_workloads" ||
        t.name.startsWith("inffyn_provider"),
    ).length,
    6,
  );
  assert.ok(
    manifest.expected.tables.find((t) => t.name === "inffyn_monthly_drafts")
      .force_rls,
  );
  assert.ok(
    manifest.migrations.every(
      (m) => /^[a-f0-9]{64}$/.test(m.sha256) && !Object.hasOwn(m, "sql"),
    ),
  );
  assert.match(manifest.basis, /stubs; not a hosted database/);
});

test("even exact catalog and ledger matches leave backup, restore and tenant acceptance unknown", () => {
  const result = compareInventory(
    manifest,
    inventory(),
    exactLedger(),
    "live-read-only",
  );
  assert.equal(result.status, "CATALOG_MATCH_RELEASE_UNVERIFIED");
  assert.equal(result.release_ready, false);
  assert.equal(result.backup.status, "UNKNOWN");
  assert.equal(result.restore.status, "UNKNOWN");
  assert.equal(result.hosted_tenant_acceptance.status, "UNKNOWN");
});

test("missing catalog coverage and absent ledger are unknown rather than empty or ready", () => {
  const observed = inventory();
  delete observed.policies;
  const result = compareInventory(manifest, observed);
  assert.equal(result.coverage.policies.status, "UNKNOWN");
  assert.equal(result.migration_history.status, "UNKNOWN");
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(result.migration_history.missing, []);
});

test("migration stubs do not prove installed SQL and name similarity does not remap versions", () => {
  const ledger = exactLedger();
  ledger.rows[0].statement_count = 0;
  ledger.rows[0].statements_md5 = null;
  ledger.rows[1].version = "20260911123456";
  const result = compareLedger(manifest.migrations, ledger);
  assert.equal(result.content_unverified[0].version, "0001");
  assert.equal(result.missing[0].version, "0002");
  assert.equal(result.unexpected[0].version, "20260911123456");
  assert.equal(result.status, "REVIEW_REQUIRED");
});

test("same-version wrong names are drift while statement-format differences remain unverified", () => {
  const ledger = exactLedger();
  ledger.rows[0].name = "different_change";
  ledger.rows[1].statements_md5 = "different";
  const result = compareLedger(manifest.migrations, ledger);
  assert.equal(result.drift[0].version, "0001");
  assert.equal(result.content_unverified[0].version, "0002");
});

test("missing tables, unexpected objects and changed function bodies require inspection", () => {
  const observed = inventory();
  observed.tables = observed.tables.filter(
    (t) => t.name !== "inffyn_monthly_drafts",
  );
  observed.tables.push({
    name: "legacy_customer_table",
    kind: "r",
    rls: false,
    force_rls: false,
  });
  observed.functions[0].body_md5 = "different";
  const result = compareInventory(manifest, observed, exactLedger());
  assert.ok(
    result.findings.some(
      (f) => f.kind === "MISSING" && f.object === "inffyn_monthly_drafts",
    ),
  );
  assert.ok(
    result.findings.some(
      (f) => f.kind === "UNEXPECTED" && f.object === "legacy_customer_table",
    ),
  );
  assert.ok(
    result.findings.some(
      (f) => f.section === "functions" && f.kind === "DRIFT",
    ),
  );
});

test("unexpected browser mutations and credential-column reads are blocking findings", () => {
  const observed = inventory();
  observed.table_privileges.find(
    (p) =>
      p.table_name === "inffyn_monthly_reports" && p.role === "authenticated",
  ).can_update = true;
  const credential = observed.column_privileges.find(
    (p) =>
      p.table_name === "inffyn_provider_connections" &&
      p.column_name === "encrypted_credential" &&
      p.role === "authenticated",
  );
  credential.can_select = true;
  const result = compareInventory(manifest, observed, exactLedger());
  assert.ok(
    result.findings.some(
      (f) => f.kind === "UNEXPECTED_BROWSER_MUTATION_PRIVILEGE",
    ),
  );
  assert.ok(
    result.findings.some(
      (f) =>
        f.section === "column_privileges" &&
        f.kind === "DRIFT" &&
        f.fields.includes("can_select"),
    ),
  );
});

test("unexpected browser-executable security-definer functions are blocking", () => {
  const observed = inventory();
  observed.functions.push({
    name: "unsafe_new_rpc",
    arguments: "",
    security_definer: true,
  });
  observed.function_privileges.push({
    name: "unsafe_new_rpc",
    arguments: "",
    role: "anon",
    can_execute: true,
  });
  const result = compareInventory(manifest, observed, exactLedger());
  assert.ok(
    result.findings.some(
      (f) => f.kind === "UNEXPECTED_BROWSER_EXECUTABLE_SECURITY_DEFINER",
    ),
  );
});

test("live target and explicit opt-in rejected before any connection", async () => {
  assert.equal(parseArguments([]).live, false);
  assert.throws(() => parseArguments(["--project-ref", "another-project"]));
  assert.throws(() => parseArguments(["--host", "db.example.com"]));
  assert.throws(() => validateTarget({ ...target(), live: false }));
  assert.throws(() => validateTarget({ ...target(), projectRef: "other" }));
  assert.throws(() =>
    validateTarget({ ...target(), host: "db.other.supabase.co" }),
  );
  let calls = 0;
  await assert.rejects(
    inspectLive({ ...target(), projectRef: "other" }, async () => {
      calls++;
    }),
  );
  assert.equal(calls, 0);
});

test("only pinned direct or session pooler identities and verify-full support files are accepted", () => {
  assert.equal(validateTarget(target()).projectRef, PROJECT_REF);
  assert.equal(
    validateTarget({
      ...target(),
      host: "aws-0-us-east-1.pooler.supabase.com",
      user: `postgres.${PROJECT_REF}`,
    }).projectRef,
    PROJECT_REF,
  );
  for (const patch of [
    { port: "6543" },
    { host: "aws-0-us-east-1.pooler.supabase.com", user: "postgres.other" },
    { host: `db.${PROJECT_REF}.supabase.co.evil.example` },
    { user: "postgres password=secret" },
    { pgpassFile: absolute(".env") },
    { sslRootCert: "" },
  ])
    assert.throws(() => validateTarget({ ...target(), ...patch }));
});

test("child environment cannot inherit passwords, connection redirection or writable session options", () => {
  const env = childEnvironment(target(), {
    PATH: "safe-path",
    PGPASSWORD: "secret-not-forwarded",
    PGHOSTADDR: "attacker",
    PGSERVICE: "wrong-target",
    PGOPTIONS: "-c default_transaction_read_only=off",
    SUPABASE_SERVICE_ROLE_KEY: "secret-not-forwarded",
  });
  assert.equal(env.PGSSLMODE, "verify-full");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(env.PGPASSWORD, undefined);
  assert.equal(env.PGHOSTADDR, undefined);
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
});

test("live SQL is fixed catalog-only, read-only, time-bounded and rejects mutation injection", () => {
  const sql = readOnlyBatch({
    ...CATALOG_QUERIES,
    migration_ledger: LEDGER_QUERY,
  });
  assert.ok(sql.startsWith("BEGIN READ ONLY;"));
  assert.ok(sql.endsWith("ROLLBACK;"));
  assert.match(sql, /statement_timeout='10s'/);
  assert.doesNotMatch(
    sql,
    /(?:^|;)\s*(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|CALL)\s/im,
  );
  for (const injection of [
    "SELECT 1; DELETE FROM public.tenants",
    "SELECT save_inffyn_monthly_draft(null)",
    "SET default_transaction_read_only=off",
    CATALOG_QUERIES.tables + " ",
  ])
    assert.throws(() => readOnlyBatch({ tables: injection }));
  assert.throws(() =>
    readOnlyBatch({
      "tables'); DROP TABLE tenants; --": CATALOG_QUERIES.tables,
    }),
  );
});

test("ledger SQL distinguishes actual records from local replay that has no migration history", async () => {
  const db = new PGlite();
  try {
    assert.equal((await db.query(LEDGER_PROBE)).rows[0].ledger_exists, false);
    await db.exec(
      "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])",
    );
    await db.query(
      "insert into supabase_migrations.schema_migrations values($1,$2,$3)",
      ["0001", "scaffold_healthcheck", null],
    );
    const ledger = (await db.query(LEDGER_QUERY)).rows;
    assert.equal(ledger[0].statement_count, 0);
    assert.equal(ledger[0].statements_md5, null);
    assert.ok(
      compareLedger(manifest.migrations, { rows: ledger }).content_unverified
        .length,
    );
    const batch = await db.exec(
      readOnlyBatch({
        context: CATALOG_QUERIES.context,
        migration_ledger: LEDGER_QUERY,
      }),
    );
    const contextResult = batch
      .flatMap((r) => r.rows || [])
      .map((r) => r.jsonb_build_object)
      .find((r) => r?.section === "context");
    assert.equal(contextResult.rows[0].transaction_read_only, "on");
  } finally {
    await db.close();
  }
});

test("live probe skips unreadable ledger without treating missing coverage as a pass", async () => {
  const calls = [];
  const observed = await inspectLive(target(), async (_options, queries) => {
    calls.push(queries);
    return queries.ledger_probe
      ? { ledger_probe: [{ ledger_exists: true, ledger_readable: false }] }
      : clone(manifest.expected);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].migration_ledger, undefined);
  assert.equal(observed.ledger, null);
  assert.equal(
    compareInventory(manifest, observed.inventory, observed.ledger).status,
    "REVIEW_REQUIRED",
  );
});
