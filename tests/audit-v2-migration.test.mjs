// Disposable embedded PostgreSQL. No hosted connection or project credentials.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const tenant = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.tenants(id uuid primary key);create table public.memberships(tenant_id uuid,user_id uuid,role text);insert into auth.users values('${user}');insert into tenants values('${tenant}'),('${other}');insert into memberships values('${tenant}','${user}','owner');`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/0012_audit_v2.sql", import.meta.url),
      "utf8",
    ),
  );
  await check("all five tables enable and force RLS", async () => {
    const r = await db.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1)",
      [
        [
          "economic_audits",
          "audit_previews",
          "audit_preview_limits",
          "inffyn_subscriptions",
          "inffyn_billing_events",
        ],
      ],
    );
    assert.equal(r.rows.length, 5);
    assert.ok(r.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  });
  await check(
    "anon and authenticated cannot read results or invoke privileged functions",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        const r = await db.query(
          "select has_table_privilege($1,'public.economic_audits','SELECT') as reads,has_function_privilege($1,'public.claim_economic_preview(text,uuid,uuid)','EXECUTE') as claim",
          [role],
        );
        assert.equal(r.rows[0].reads, false);
        assert.equal(r.rows[0].claim, false);
      }
    },
  );
  const payload = { title: "Synthetic audit", kind: "product" },
    result = { fingerprint: "synthetic-v2-hash" };
  await db.query(
    "insert into audit_previews(secret_hash,payload,result) values($1,$2,$3)",
    ["secret-hash", payload, result],
  );
  let id;
  await check(
    "claim validates membership without consuming preview",
    async () => {
      await assert.rejects(
        db.query("select claim_economic_preview($1,$2,$3)", [
          "secret-hash",
          other,
          user,
        ]),
        /Unauthorized/,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from audit_previews"))
          .rows[0].n,
        1,
      );
    },
  );
  await check(
    "claim saves exactly one immutable preview and consumes ownership token",
    async () => {
      id = (
        await db.query("select claim_economic_preview($1,$2,$3) as id", [
          "secret-hash",
          tenant,
          user,
        ])
      ).rows[0].id;
      assert.ok(id);
      assert.equal(
        (
          await db.query("select claim_economic_preview($1,$2,$3) as id", [
            "secret-hash",
            tenant,
            user,
          ])
        ).rows[0].id,
        null,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from economic_audits"))
          .rows[0].n,
        1,
      );
    },
  );
  await check("expired claims cannot be recovered", async () => {
    await db.query(
      "insert into audit_previews(secret_hash,payload,result,expires_at) values($1,$2,$3,now()-interval '1 second')",
      ["expired", payload, result],
    );
    assert.equal(
      (
        await db.query("select claim_economic_preview($1,$2,$3) as id", [
          "expired",
          tenant,
          user,
        ])
      ).rows[0].id,
      null,
    );
  });
  await check("durable public quota caps attempts", async () => {
    for (let i = 1; i <= 11; i++)
      assert.equal(
        (await db.query("select consume_audit_preview_limit('test') as ok"))
          .rows[0].ok,
        i <= 10,
      );
  });
  await check(
    "billing lease excludes concurrent operations and wrong-owner unlock",
    async () => {
      assert.equal(
        (
          await db.query("select lock_inffyn_billing($1,$2) as ok", [
            tenant,
            "op1",
          ])
        ).rows[0].ok,
        true,
      );
      assert.equal(
        (
          await db.query("select lock_inffyn_billing($1,$2) as ok", [
            tenant,
            "op2",
          ])
        ).rows[0].ok,
        false,
      );
      await db.query("select unlock_inffyn_billing($1,$2)", [tenant, "wrong"]);
      assert.equal(
        (
          await db.query("select lock_inffyn_billing($1,$2) as ok", [
            tenant,
            "op2",
          ])
        ).rows[0].ok,
        false,
      );
      await db.query("select unlock_inffyn_billing($1,$2)", [tenant, "op1"]);
    },
  );
  const state = {
    customer_id: "cus_synthetic",
    subscription_id: "sub_synthetic",
    status: "active",
    price_id: "price_synthetic",
    current_period_end: "2026-10-01T00:00:00Z",
    cancel_at_period_end: false,
  };
  await check(
    "webhook transactions dedupe and ignore out-of-order state",
    async () => {
      await db.query("select apply_inffyn_subscription($1,$2,$3,$4)", [
        "evt2",
        200,
        tenant,
        state,
      ]);
      await db.query("select apply_inffyn_subscription($1,$2,$3,$4)", [
        "evt1",
        100,
        tenant,
        { ...state, status: "canceled" },
      ]);
      assert.equal(
        (
          await db.query(
            "select status from inffyn_subscriptions where tenant_id=$1",
            [tenant],
          )
        ).rows[0].status,
        "active",
      );
      assert.equal(
        (
          await db.query(
            "select apply_inffyn_subscription($1,$2,$3,$4) as applied",
            ["evt2", 200, tenant, { ...state, status: "canceled" }],
          )
        ).rows[0].applied,
        false,
      );
    },
  );
  await check("retention erases evidence then reports", async () => {
    await db.query(
      "update economic_audits set evidence_expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await db.query("select expire_economic_evidence()");
    assert.equal(
      (await db.query("select payload from economic_audits where id=$1", [id]))
        .rows[0].payload,
      null,
    );
    assert.equal(
      (await db.query("select count(*)::int as n from audit_previews")).rows[0]
        .n,
      0,
    );
    await db.query(
      "update economic_audits set report_expires_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await db.query("select expire_economic_evidence()");
    assert.equal(
      (await db.query("select count(*)::int as n from economic_audits")).rows[0]
        .n,
      0,
    );
  });
  await check(
    "rollback actually reverses 0012 without touching tenancy",
    async () => {
      await db.exec(
        await readFile(
          new URL(
            "../supabase/rollbacks/0012_audit_v2.down.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(
        (await db.query("select to_regclass('public.economic_audits') as tab"))
          .rows[0].tab,
        null,
      );
      assert.equal(
        (await db.query("select count(*)::int as n from tenants")).rows[0].n,
        2,
      );
    },
  );
  console.log(
    `${checks} migration checks passed. Embedded PostgreSQL only; hosted acceptance remains separate.`,
  );
} finally {
  await db.close();
}
