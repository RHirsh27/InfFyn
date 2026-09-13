import test, { before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  localMigrations,
  buildManifest,
} from "../scripts/database-preflight/manifest.mjs";
import { buildActivationPlan } from "../scripts/database-preflight/activation.mjs";
import { parseActivationArguments } from "../scripts/database-preflight-activation.mjs";
import { PROJECT_REF } from "../scripts/database-preflight/catalog.mjs";
import { compareLedger } from "../scripts/database-preflight/compare.mjs";

let migrations, convergence;
const now = new Date("2026-09-11T15:00:00Z");
before(async () => {
  migrations = await localMigrations();
  convergence = migrations.find(
    (m) => m.name === "reconcile_stripe_oauth_legacy_history",
  );
});
const clone = (x) => JSON.parse(JSON.stringify(x));
const tableNames = [
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
];
function receipts() {
  const metadata = {
    checked_at_utc: now.toISOString(),
    project_ref: PROJECT_REF,
    migrations_access: "succeeded",
    tables_access: "succeeded",
    migrations: migrations
      .filter((m) => m.version <= "0011")
      .map((m) => ({
        version: m.version,
        name: m.version === "0009" ? "drop_scaffold_healthcheck" : m.name,
      })),
    tables: tableNames.map((name) => ({
      name: `public.${name}`,
      rls_enabled: true,
    })),
  };
  const columns = {
    checked_at_utc: now.toISOString(),
    project_ref: PROJECT_REF,
    tables: tableNames.map((name) => ({ name: `public.${name}`, columns: [] })),
  };
  columns.tables.find((t) => t.name === "public.stripe_connections").columns = [
    ["id", "uuid", false],
    ["tenant_id", "uuid", false],
    ["stripe_account_id", "text", false],
    ["scope", "text", false],
    ["status", "text", false],
    ["last_sync_at", "timestamptz", true],
    ["last_cursor", "text", true],
    ["last_error", "text", true],
    ["created_at", "timestamptz", false],
  ].map(([name, format, nullable]) => ({ name, format, nullable }));
  return [metadata, columns];
}

test("observed legacy baseline includes alpha admission and reviewed CSV imports, never executable or release ready", () => {
  const result = buildActivationPlan(migrations, ...receipts(), now);
  assert.equal(result.metadata_baseline_matches, true);
  assert.equal(result.executable, false);
  assert.equal(result.release_ready, false);
  assert.equal(result.database_mutations, false);
  assert.deepEqual(
    result.candidate_migrations.map((m) => m.version),
    ["0012", "0013", "20260911015433", "20260911031800", convergence.version, "20260911155306", "20260912190000"],
  );
  assert.ok(
    result.candidate_migrations.every(
      (m) => /^[a-f0-9]{64}$/.test(m.sha256) && !m.sql,
    ),
  );
  assert.ok(
    result.blockers.includes(
      "FULL_CATALOG_AND_LEDGER_FINGERPRINT_REVIEW_REQUIRED",
    ),
  );
  assert.ok(
    result.blockers.includes(
      "RECOVERABLE_BACKUP_AND_RESTORE_EVIDENCE_REQUIRED",
    ),
  );
  const ledger = compareLedger(migrations, { rows: receipts()[0].migrations });
  assert.ok(ledger.drift.some((m) => m.version === "0009"));
  assert.equal(ledger.status, "REVIEW_REQUIRED");
});

test("activation cannot silently omit the reviewed-import migration", () => {
  const result = buildActivationPlan(
    migrations.filter((m) => m.version !== "20260912190000"),
    ...receipts(),
    now,
  );
  assert.equal(result.metadata_baseline_matches, false);
  assert.deepEqual(result.candidate_migrations, []);
  assert.ok(result.blockers.includes("LOCAL_MIGRATION_SET_CHANGED"));
});

test("unexpected project, incomplete/changed baselines and stale receipts cannot propose candidates", () => {
  for (const index of [0, 1]) {
    const data = receipts();
    data[index].project_ref = "another-project";
    assert.throws(() => buildActivationPlan(migrations, ...data, now));
  }
  for (const patch of [
    (m) => {
      m.migrations[8].name = "another_0009";
    },
    (m) => {
      m.migrations.push(clone(m.migrations[0]));
    },
    (m) => {
      m.tables[0].rls_enabled = false;
    },
    (m) => {
      m.tables.pop();
    },
    (m) => {
      m.checked_at_utc = "2026-09-01T00:00:00Z";
    },
    (m) => {
      m.checked_at_utc = "2026-09-12T00:00:00Z";
    },
    (_m, c) => {
      c.tables = [];
    },
    (_m, c) => {
      c.tables
        .find((t) => t.name === "public.stripe_connections")
        .columns.push({
          name: "refresh_token_encrypted",
          format: "text",
          nullable: true,
        });
    },
  ]) {
    const data = receipts();
    patch(...data);
    const result = buildActivationPlan(migrations, ...data, now);
    assert.equal(result.metadata_baseline_matches, false);
    assert.deepEqual(result.candidate_migrations, []);
    assert.equal(result.executable, false);
  }
  assert.equal(
    buildActivationPlan(migrations.slice(1), ...receipts(), now)
      .metadata_baseline_matches,
    false,
  );
});

test("planner excludes unknown receipt payloads and accepts no execution or credentials options", () => {
  const data = receipts();
  data[0].extra = { secret: "DO_NOT_ECHO" };
  data[1].tables[0].comment = "DO_NOT_ECHO";
  assert.doesNotMatch(
    JSON.stringify(buildActivationPlan(migrations, ...data, now)),
    /DO_NOT_ECHO/,
  );
  assert.deepEqual(
    parseActivationArguments([
      "--metadata",
      "safe.json",
      "--columns",
      "columns.json",
    ]),
    { metadata: "safe.json", columns: "columns.json" },
  );
  for (const args of [
    [],
    ["--live"],
    ["--execute"],
    ["--metadata", ".env", "--columns", "safe.json"],
    ["--metadata", "a.json", "--metadata", "b.json", "--columns", "c.json"],
  ])
    assert.throws(() => parseActivationArguments(args));
});

test("simulated legacy history reaches monthly schema while preserving its retired scaffold difference", async () => {
  // This DROP models the observed schema only. It is not recovered remote SQL,
  // verified remote fingerprint evidence or a proposed production mutation.
  const legacy = migrations.map((m) =>
    m.version === "0009"
      ? {
          ...m,
          name: "drop_scaffold_healthcheck",
          sql: "DROP TABLE public.scaffold_healthcheck;",
        }
      : m,
  );
  const result = await buildManifest(legacy);
  assert.equal(
    result.expected.tables.some((t) => t.name === "scaffold_healthcheck"),
    false,
  );
  assert.ok(
    result.expected.columns.some(
      (c) =>
        c.table_name === "stripe_connections" &&
        c.name === "refresh_token_encrypted" &&
        c.type === "text" &&
        c.not_null === false,
    ),
  );
  assert.ok(
    result.expected.tables.find((t) => t.name === "inffyn_monthly_drafts")
      .force_rls,
  );
  const secret = result.expected.column_privileges.filter(
    (c) =>
      c.table_name === "stripe_connections" &&
      c.column_name === "refresh_token_encrypted",
  );
  assert.equal(secret.length, 2);
  assert.ok(
    secret.every(
      (c) =>
        !c.can_select && !c.can_insert && !c.can_update && !c.can_reference,
    ),
  );
});

async function stripeFixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stripe_connections(id uuid, tenant_id uuid, stripe_account_id text,
      scope text,status text,last_sync_at timestamptz,last_cursor text,last_error text,created_at timestamptz);
    alter table public.stripe_connections enable row level security;
    alter table public.stripe_connections force row level security;`);
  return db;
}

test("convergence preserves existing ciphertext and removes both inherited table and explicit column exposure", async () => {
  const db = await stripeFixture();
  try {
    await db.exec(convergence.sql);
    await db.query(
      "insert into stripe_connections(refresh_token_encrypted) values($1)",
      ["synthetic-encrypted-fixture"],
    );
    await db.exec(`grant select on stripe_connections to authenticated;
      grant select,insert,update,references(refresh_token_encrypted) on stripe_connections to public,anon,authenticated;`);
    await db.exec(convergence.sql);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from stripe_connections where refresh_token_encrypted=$1",
          ["synthetic-encrypted-fixture"],
        )
      ).rows[0].n,
      1,
    );
    for (const role of ["anon", "authenticated"])
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"])
        assert.equal(
          (
            await db.query(
              "select has_column_privilege($1,'public.stripe_connections','refresh_token_encrypted',$2) allowed",
              [role, privilege],
            )
          ).rows[0].allowed,
          false,
        );
    assert.equal(
      (
        await db.query(
          "select has_column_privilege('authenticated','public.stripe_connections','status','SELECT') allowed",
        )
      ).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});

test("unexpected existing token type or default fails without conversion or data changes", async () => {
  const db = await stripeFixture();
  try {
    await db.exec(
      "alter table stripe_connections add column refresh_token_encrypted integer",
    );
    await assert.rejects(
      db.exec(convergence.sql),
      /Unexpected refresh token column shape/,
    );
    await db.exec(
      "alter table stripe_connections drop column refresh_token_encrypted; alter table stripe_connections add column refresh_token_encrypted text default 'synthetic'",
    );
    await assert.rejects(
      db.exec(convergence.sql),
      /Unexpected refresh token column shape/,
    );
  } finally {
    await db.close();
  }
});
