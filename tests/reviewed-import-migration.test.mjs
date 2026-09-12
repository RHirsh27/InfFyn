import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const tenant = "11111111-1111-4111-8111-111111111111",
  actor = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
async function write(op, id, expected, data, t = tenant) {
  return (
    await db.query("select write_inffyn_import($1,$2,$3,$4,$5,$6) as result", [
      t,
      actor,
      op,
      id,
      expected,
      JSON.stringify(data),
    ])
  ).rows[0].result;
}
try {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table tenants(id uuid primary key); create table memberships(tenant_id uuid,user_id uuid,role text); insert into auth.users values('${actor}'); insert into tenants values('${tenant}'),('${other}'); insert into memberships values('${tenant}','${actor}','owner'); grant select on memberships to service_role;`,
  );
  for (const filename of [
    "20260911015433_standalone_monthly_economics.sql",
    "20260911031800_company_monthly_preparation.sql",
    "20260912190000_reviewed_csv_imports.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${filename}`, import.meta.url),
        "utf8",
      ),
    );
  const fields = ["sources", "revisions", "confirmations", "recipes"].map(
    (s) => "inffyn_import_" + s,
  );
  await check(
    "tables force RLS and browser roles have no direct access",
    async () => {
      const rows = (
        await db.query(
          "select relrowsecurity,relforcerowsecurity from pg_class where relname=any($1)",
          [fields],
        )
      ).rows;
      assert.equal(rows.length, 4);
      assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
      for (const t of fields)
        for (const role of ["anon", "authenticated"])
          assert.equal(
            (
              await db.query(
                "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",
                [role, t],
              )
            ).rows[0].allowed,
            false,
          );
    },
  );
  const data = {
    month: "2026-08",
    kind: "costs_csv",
    account: "synthetic",
    filename: "test.csv",
    sha256: "a".repeat(64),
    original: Buffer.from("id,amount\n1,15\n").toString("base64"),
    rules: {},
    decisions: [],
    profile: {
      ready: false,
      canonical_hash: "b".repeat(64),
      canonical_csv: "cost_id,amount\n1,15\n",
      schema_hash: "c".repeat(64),
    },
  };
  await db.exec("set role service_role");
  let source, confirmation;
  await check("original capture retry is idempotent", async () => {
    source = await write("create", null, 0, data);
    assert.equal((await write("create", null, 0, data)).id, source.id);
    assert.equal(source.original, undefined);
  });
  await check(
    "other-company writes denied even through service RPC",
    async () => {
      await assert.rejects(
        write("create", null, 0, data, other),
        /Unauthorized/,
      );
    },
  );
  await check("unready confirmation blocked", async () => {
    await assert.rejects(
      write("confirm", source.id, 1, {
        canonical_hash: data.profile.canonical_hash,
      }),
      /not ready/,
    );
  });
  await check(
    "revision checks preserve historical interpretation",
    async () => {
      source = await write("revise", source.id, 1, {
        ...data,
        profile: { ...data.profile, ready: true },
      });
      assert.equal(source.revision, 2);
      await assert.rejects(
        write("revise", source.id, 1, data),
        /revision changed/,
      );
      assert.equal(
        (await db.query("select count(*)::int n from inffyn_import_revisions"))
          .rows[0].n,
        2,
      );
    },
  );
  await check(
    "confirmation retry returns same immutable confirmation",
    async () => {
      const input = {
        canonical_hash: data.profile.canonical_hash,
        rules_hash: "d".repeat(64),
      };
      confirmation = await write("confirm", source.id, 2, input);
      assert.equal(
        (await write("confirm", source.id, 2, input)).id,
        confirmation.id,
      );
      await assert.rejects(
        db.query(
          "update inffyn_import_confirmations set canonical_hash='changed' where id=$1",
          [confirmation.id],
        ),
        /permission denied/,
      );
    },
  );
  await check(
    "recipe requires confirmed revision and retry is safe",
    async () => {
      const input = {
        name: "Synthetic cost ledger",
        rules_hash: "d".repeat(64),
      };
      const recipe = await write("recipe", source.id, 2, input);
      assert.equal((await write("recipe", source.id, 2, input)).id, recipe.id);
    },
  );
  const content = {
    month: "2026-08",
    workloads: [
      {
        workload_id: actor,
        audit: { costs_csv: data.profile.canonical_csv },
        reviewed_imports: { costs_csv: confirmation.id },
      },
    ],
  };
  await check("attachment and draft revision change are atomic", async () => {
    const input = {
      confirmation_id: confirmation.id,
      draft_revision: 0,
      content,
      definition_basis: "fixture",
      invalidations: [],
      evidence_expiry: "2026-12-01T00:00:00Z",
    };
    const draft = await write("attach", source.id, 2, input);
    assert.equal(draft.revision, 1);
    await assert.rejects(
      write("attach", source.id, 2, input),
      /Draft revision changed/,
    );
    assert.equal(
      (await db.query("select revision from inffyn_monthly_drafts")).rows[0]
        .revision,
      1,
    );
  });
  await check(
    "expiry removes original and transformation rows, retaining report-safe confirmations",
    async () => {
      await db.exec(
        "reset role; update inffyn_import_sources set expires_at=now()-interval '1 second'; set role service_role; select expire_inffyn_monthly_evidence();",
      );
      assert.equal(
        (await db.query("select count(*)::int n from inffyn_import_sources"))
          .rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("select count(*)::int n from inffyn_import_revisions"))
          .rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from inffyn_import_confirmations",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  console.log(
    `${checks} disposable PostgreSQL checks passed; hosted recovery and acceptance NOT executed.`,
  );
} finally {
  await db.close();
}
