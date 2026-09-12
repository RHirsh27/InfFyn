import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const admin = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
async function sql(file) {
  await db.exec(
    await readFile(new URL("../supabase/" + file, import.meta.url), "utf8"),
  );
}
async function issue(hash, email = "recipient@example.test") {
  return (
    await db.query("select issue_inffyn_invitation($1,$2,$3,$4) as id", [
      admin,
      email,
      "Example company",
      hash,
    ])
  ).rows[0].id;
}
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`,
  );
  await sql("migrations/0002_tenancy.sql");
  await sql("migrations/0012_audit_v2.sql");
  await sql("migrations/0013_release_access.sql");
  await db.query(
    "insert into auth.users values($1,'admin@example.test',now()),($2,'recipient@example.test',now()),($3,'other@example.test',null)",
    [admin, user, other],
  );
  await db.query("insert into inffyn_access_admins(user_id) values($1)", [
    admin,
  ]);
  await check(
    "browser roles cannot read access tables or invoke privileged functions",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const table of [
          "inffyn_access_admins",
          "inffyn_invitations",
          "inffyn_access_grants",
          "inffyn_access_events",
        ]) {
          assert.equal(
            (
              await db.query(
                "select has_table_privilege($1,$2,'SELECT') as allowed",
                [role, table],
              )
            ).rows[0].allowed,
            false,
          );
        }
        for (const fn of [
          "issue_inffyn_invitation(uuid,text,text,text)",
          "redeem_inffyn_invitation(uuid,text)",
          "revoke_inffyn_invitation(uuid,uuid)",
          "consume_inffyn_quota(text,integer)",
        ]) {
          assert.equal(
            (
              await db.query(
                "select has_function_privilege($1,$2,'EXECUTE') as allowed",
                [role, fn],
              )
            ).rows[0].allowed,
            false,
          );
        }
      }
    },
  );
  await check("all access tables force row level security", async () => {
    const rows = (
      await db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where relname in ('inffyn_access_admins','inffyn_invitations','inffyn_access_grants','inffyn_access_events')",
      )
    ).rows;
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  });
  await check("non-administrators cannot issue invitations", async () => {
    await assert.rejects(
      db.query(
        "select issue_inffyn_invitation($1,'x@example.test','X','bad')",
        [user],
      ),
      /administrator/,
    );
  });
  const invitation = await issue("valid");
  await check(
    "unverified and wrong-email users cannot consume a link",
    async () => {
      await assert.rejects(
        db.query("select redeem_inffyn_invitation($1,'valid')", [other]),
        /Verified email/,
      );
      await db.query(
        "update auth.users set email_confirmed_at=now() where id=$1",
        [other],
      );
      await assert.rejects(
        db.query("select redeem_inffyn_invitation($1,'valid')", [other]),
        /unavailable/,
      );
      assert.equal(
        (await db.query("select count(*)::int n from tenants")).rows[0].n,
        0,
      );
    },
  );
  let tenant;
  await check(
    "verified recipient gets one isolated workspace and retries are idempotent",
    async () => {
      tenant = (
        await db.query("select redeem_inffyn_invitation($1,'valid') as id", [
          user,
        ])
      ).rows[0].id;
      assert.equal(
        (
          await db.query("select redeem_inffyn_invitation($1,'valid') as id", [
            user,
          ])
        ).rows[0].id,
        tenant,
      );
      const members = (
        await db.query(
          "select user_id,role from memberships where tenant_id=$1",
          [tenant],
        )
      ).rows;
      assert.deepEqual(members, [{ user_id: user, role: "owner" }]);
      assert.equal(
        (await db.query("select count(*)::int n from tenants")).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from inffyn_access_events where action='redeemed'",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "expired and revoked pending links fail without creating companies",
    async () => {
      const expired = await issue("expired");
      await db.query(
        "update inffyn_invitations set expires_at=now()-interval '1 second' where id=$1",
        [expired],
      );
      await assert.rejects(
        db.query("select redeem_inffyn_invitation($1,'expired')", [user]),
        /unavailable/,
      );
      const revoked = await issue("revoked");
      await db.query("select revoke_inffyn_invitation($1,$2)", [
        admin,
        revoked,
      ]);
      await assert.rejects(
        db.query("select redeem_inffyn_invitation($1,'revoked')", [user]),
        /unavailable/,
      );
    },
  );
  await check(
    "revocation preserves the company and billing records",
    async () => {
      await assert.rejects(
        db.query("select revoke_inffyn_invitation($1,$2)", [other, invitation]),
        /administrator/,
      );
      await db.query(
        "insert into inffyn_subscriptions(tenant_id,status) values($1,'active')",
        [tenant],
      );
      await db.query("select revoke_inffyn_invitation($1,$2)", [
        admin,
        invitation,
      ]);
      assert.ok(
        (
          await db.query(
            "select revoked_at from inffyn_access_grants where tenant_id=$1",
            [tenant],
          )
        ).rows[0].revoked_at,
      );
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
        (await db.query("select count(*)::int n from tenants")).rows[0].n,
        1,
      );
      await assert.rejects(
        db.query("select redeem_inffyn_invitation($1,'valid')", [user]),
        /unavailable/,
      );
    },
  );
  await check(
    "first sign-in reuses membership and creates only one new workspace",
    async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      assert.equal(
        (await db.query("select ensure_inffyn_workspace('Existing') as id"))
          .rows[0].id,
        tenant,
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        other,
      ]);
      const a = (await db.query("select ensure_inffyn_workspace('New') as id"))
        .rows[0].id;
      assert.equal(
        (await db.query("select ensure_inffyn_workspace('Retry') as id"))
          .rows[0].id,
        a,
      );
    },
  );
  await check(
    "durable quota denies excess and resets after expiry",
    async () => {
      for (const expected of [true, true, false])
        assert.equal(
          (await db.query("select consume_inffyn_quota('test',2) as ok"))
            .rows[0].ok,
          expected,
        );
      await db.query(
        "update audit_preview_limits set expires_at=now()-interval '1 second' where bucket='test'",
      );
      assert.equal(
        (await db.query("select consume_inffyn_quota('test',2) as ok")).rows[0]
          .ok,
        true,
      );
    },
  );
  await check("inverse removes only release access objects", async () => {
    await sql("rollbacks/0013_release_access.down.sql");
    assert.equal(
      (await db.query("select to_regclass('public.inffyn_invitations') as t"))
        .rows[0].t,
      null,
    );
    assert.ok(
      (await db.query("select to_regclass('public.economic_audits') as t"))
        .rows[0].t,
    );
  });
  console.log(`${checks} release access checks passed`);
} finally {
  await db.close();
}
