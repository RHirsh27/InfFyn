// Real PostgreSQL semantics in a disposable database, without hosted credentials.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const tenant = "11111111-1111-4111-8111-111111111111",
  actor = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  workload = "44444444-4444-4444-8444-444444444444";
const tables = [
  "inffyn_workloads",
  "inffyn_monthly_reports",
  "inffyn_monthly_selections",
  "inffyn_selection_events",
  "inffyn_provider_connections",
  "inffyn_provider_imports",
  "inffyn_monthly_drafts",
];
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table tenants(id uuid primary key);create table memberships(tenant_id uuid,user_id uuid,role text);insert into auth.users values('${actor}');insert into tenants values('${tenant}'),('${other}');insert into memberships values('${tenant}','${actor}','owner');grant select on memberships to service_role;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260911015433_standalone_monthly_economics.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(await readFile(new URL("../supabase/migrations/20260911031800_company_monthly_preparation.sql", import.meta.url), "utf8"));
  await check("all financial and credential tables force RLS", async () => {
    const { rows } = await db.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1)",
      [tables],
    );
    assert.equal(rows.length, tables.length);
    assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  });
  await check(
    "browser roles have no financial, credential or privileged RPC access",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const table of tables) {
          const { rows } = await db.query(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",
            [role, table],
          );
          assert.equal(rows[0].allowed, false);
        }
        const { rows } = await db.query(
          "select has_function_privilege($1,'select_inffyn_month(uuid,uuid,uuid,uuid,text)','EXECUTE') as allowed",
          [role],
        );
        assert.equal(rows[0].allowed, false);
      }
    },
  );
  const def = {
    name: "Support",
    kind: "internal",
    mappings: { openai: ["project-1"] },
  };
  await check(
    "workload mappings prevent a project being allocated twice",
    async () => {
      await db.query("select save_inffyn_workload($1,$2,$3,$4)", [
        tenant,
        actor,
        workload,
        def,
      ]);
      await assert.rejects(
        db.query("select save_inffyn_workload($1,$2,gen_random_uuid(),$3)", [
          tenant,
          actor,
          { ...def, name: "Sales" },
        ]),
        /already assigned/,
      );
      await assert.rejects(
        db.query("select save_inffyn_workload($1,$2,$3,$4)", [
          other,
          actor,
          workload,
          def,
        ]),
        /Unauthorized/,
      );
    },
  );
  const report1 = (
    await db.query(
      "insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,payload,result) values($1,$2,'2026-08','one','{}','{}') returning id",
      [tenant, actor],
    )
  ).rows[0].id;
  const report2 = (
    await db.query(
      "insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,payload,result) values($1,$2,'2026-08','two','{}','{}') returning id",
      [tenant, actor],
    )
  ).rows[0].id;
  await check(
    "cross-tenant report selection rejected by RPC and foreign key",
    async () => {
      await assert.rejects(
        db.query("select select_inffyn_month($1,$2,$3,null,'Reviewed')", [
          other,
          actor,
          report1,
        ]),
        /Unauthorized/,
      );
      await assert.rejects(
        db.query(
          "insert into inffyn_monthly_selections(tenant_id,month,report_id,selected_by) values($1,'2026-08',$2,$3)",
          [other, report1, actor],
        ),
        /foreign key/,
      );
    },
  );
  await check(
    "selection retry is idempotent and replacement has optimistic concurrency",
    async () => {
      for (let n = 0; n < 2; n++)
        await db.query("select select_inffyn_month($1,$2,$3,null,'Reviewed')", [
          tenant,
          actor,
          report1,
        ]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from inffyn_selection_events",
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        db.query("select select_inffyn_month($1,$2,$3,null,'Correction')", [
          tenant,
          actor,
          report2,
        ]),
        /Selection changed/,
      );
      await db.query("select select_inffyn_month($1,$2,$3,$4,'Correction')", [
        tenant,
        actor,
        report2,
        report1,
      ]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from inffyn_selection_events",
          )
        ).rows[0].n,
        2,
      );
      assert.equal(
        (await db.query("select report_id from inffyn_monthly_selections"))
          .rows[0].report_id,
        report2,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from inffyn_monthly_reports",
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check("idempotency cannot create duplicate reports", async () => {
    await assert.rejects(
      db.query(
        "insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,result) values($1,$2,'2026-08','one','{}')",
        [tenant, actor],
      ),
      /unique/,
    );
  });
  await check(
    "saved results, inputs and provenance cannot be overwritten",
    async () => {
      for (const field of ["result", "payload"])
        await assert.rejects(
          db.query(
            `update inffyn_monthly_reports set ${field}='{"changed":true}' where id=$1`,
            [report1],
          ),
          /immutable/,
        );
      await assert.rejects(
        db.query("update inffyn_monthly_reports set payload=null where id=$1", [
          report1,
        ]),
        /immutable/,
      );
      await assert.rejects(
        db.query(
          "update inffyn_monthly_reports set month='2026-07' where id=$1",
          [report1],
        ),
        /immutable/,
      );
    },
  );
  await check(
    "90-day source expiry preserves report then 12-month expiry clears selection",
    async () => {
      const retained = (
        await db.query(
          "insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,payload,result,evidence_expires_at) values($1,$2,'2026-06','retained','{}','{}',now()-interval '1 second') returning id",
          [tenant, actor],
        )
      ).rows[0].id;
      const expired = (
        await db.query(
          "insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,payload,result,report_expires_at) values($1,$2,'2026-05','expired','{}','{}',now()-interval '1 second') returning id",
          [tenant, actor],
        )
      ).rows[0].id;
      await db.query(
        "insert into inffyn_monthly_selections(tenant_id,month,report_id,selected_by) values($1,'2026-05',$2,$3)",
        [tenant, expired, actor],
      );
      await db.query("select expire_inffyn_monthly_evidence()");
      const r = (
        await db.query(
          "select payload,result from inffyn_monthly_reports where id=$1",
          [retained],
        )
      ).rows[0];
      assert.equal(r.payload, null);
      assert.deepEqual(r.result, {});
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from inffyn_monthly_selections where month='2026-05'",
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await check("service-role RPC operates with explicit grants", async () => {
    await db.exec("set role service_role");
    await db.query(
      "select select_inffyn_month($1,$2,$3,$4,'Service review')",
      [tenant, actor, report1, report2],
    );
    await db.exec("reset role");
  });
  const draftSQL = "select save_inffyn_monthly_draft($1,$2,'2026-08',$3,$4,'definitions','[]',now()+interval '30 days') as draft";
  let expiry;
  await check("draft creates then rejects stale revisions without replacing content", async () => {
    const row = (await db.query(draftSQL, [tenant, actor, 0, {month:"2026-08",workloads:[]}])).rows[0].draft;
    assert.equal(row.revision, 1);
    expiry = row.evidence_expires_at;
    await assert.rejects(db.query(draftSQL, [tenant, actor, 0, {month:"2026-08",workloads:["stale"]}]), /revision changed/);
    const next = (await db.query(draftSQL, [tenant, actor, 1, {month:"2026-08",workloads:[]}])).rows[0].draft;
    assert.equal(next.revision, 2);
    assert.equal(next.evidence_expires_at, expiry);
  });
  await check("draft RPC checks membership and browser execute privileges", async () => {
    await assert.rejects(db.query(draftSQL, [other, actor, 0, {month:"2026-08"}]), /Unauthorized/);
    for (const role of ["anon","authenticated"]) {
      const row = (await db.query("select has_function_privilege($1,'save_inffyn_monthly_draft(uuid,uuid,text,bigint,jsonb,text,jsonb,timestamptz)','EXECUTE') as allowed",[role])).rows[0];
      assert.equal(row.allowed,false);
    }
    await db.exec("set role service_role");
    assert.equal((await db.query(draftSQL, [tenant, actor, 2, {month:"2026-08",workloads:[]}])).rows[0].draft.revision,3);
    await db.exec("reset role");
  });
  await check("draft retention deletes expired raw evidence", async () => {
    await db.query("update inffyn_monthly_drafts set evidence_expires_at=now()-interval '1 second'");
    await db.query("select expire_inffyn_monthly_evidence()");
    assert.equal((await db.query("select count(*)::int as n from inffyn_monthly_drafts")).rows[0].n,0);
  });
  console.log(`${checks} monthly PostgreSQL checks passed`);
} finally {
  await db.close();
}
