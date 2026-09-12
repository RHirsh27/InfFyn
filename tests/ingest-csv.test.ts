/**
 * E3.1 CSV ingest integration gate (live Supabase + engine).
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, ENGINE_URL
 * Run: npm run test:ingest
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const engineUrl = (process.env.ENGINE_URL ?? process.env.NEXT_PUBLIC_ENGINE_URL)?.replace(
  /\/$/,
  ""
);

const BUCKET = "ingest";
const FIXTURES = join(process.cwd(), "fixtures");

function assertEnv() {
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!engineUrl) missing.push("ENGINE_URL");
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}

async function seedTenant(admin: SupabaseClient) {
  const email = `e3-ingest-${randomUUID()}@inffyn.test`;
  const password = `Test-${randomUUID().slice(0, 8)}!aA1`;
  const { data: userData } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!userData?.user) throw new Error("createUser failed");

  const tenantId = randomUUID();
  await admin.from("tenants").insert({ id: tenantId, name: "Ingest Test" });
  await admin.from("memberships").insert({
    user_id: userData.user.id,
    tenant_id: tenantId,
    role: "owner",
  });

  const client = createClient(url!, anonKey!);
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(signErr.message);
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("no session");

  return { userId: userData.user.id, tenantId, token: session.access_token, client };
}

async function uploadCsv(admin: SupabaseClient, tenantId: string, filename: string) {
  const content = readFileSync(join(FIXTURES, filename));
  const path = `${tenantId}/uploads/${randomUUID()}.csv`;
  const { error } = await admin.storage.from(BUCKET).upload(path, content, {
    contentType: "text/csv",
    upsert: false,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return { path, content };
}

async function callIngest(token: string, tenantId: string, storagePath: string) {
  const res = await fetch(`${engineUrl}/ingest/csv`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ storage_path: storagePath }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function pollJob(token: string, tenantId: string, jobId: string) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${engineUrl}/ingest/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": tenantId,
      },
    });
    const body = await res.json();
    if (body.status === "completed" || body.status === "failed") return body;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("job poll timeout");
}

async function cleanup(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
  storagePaths: string[]
) {
  await admin.from("usage_events").delete().eq("tenant_id", tenantId);
  await admin.from("ingest_jobs").delete().eq("tenant_id", tenantId);
  if (storagePaths.length) {
    await admin.storage.from(BUCKET).remove(storagePaths);
  }
  await admin.from("memberships").delete().eq("tenant_id", tenantId);
  await admin.from("tenants").delete().eq("id", tenantId);
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  assertEnv();
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("E3.1 CSV ingest integration test\n");

  const { userId, tenantId, token, client } = await seedTenant(admin);
  const paths: string[] = [];

  try {
    const bad = await uploadCsv(admin, tenantId, "token-usage-missing-input-tokens.csv");
    paths.push(bad.path);

    const badResult = await callIngest(token, tenantId, bad.path);
    if (badResult.status !== 400) {
      throw new Error(`expected 400 for missing column, got ${badResult.status}`);
    }
    const errMsg = JSON.stringify(badResult.body.detail?.errors ?? badResult.body);
    if (!errMsg.includes("missing required column: input_tokens")) {
      throw new Error(`unexpected error body: ${errMsg}`);
    }

    const { count: afterBad } = await admin
      .from("usage_events")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if ((afterBad ?? 0) !== 0) {
      throw new Error("LEAK: bad CSV wrote usage_events rows");
    }
    console.log("  fail-closed: PASS — 400 + zero rows");

    const good = await uploadCsv(admin, tenantId, "token-usage-sample.csv");
    paths.push(good.path);

    const first = await callIngest(token, tenantId, good.path);
    if (first.status !== 200) {
      throw new Error(`first ingest failed: ${first.status} ${JSON.stringify(first.body)}`);
    }

    let job = first.body;
    if (job.status === "pending") {
      job = await pollJob(token, tenantId, job.job_id);
    }
    if (job.status !== "completed" || job.rows_ingested !== 2) {
      throw new Error(`first ingest job failed: ${JSON.stringify(job)}`);
    }

    const { data: events } = await admin
      .from("usage_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("occurred_at");
    if ((events ?? []).length !== 2) {
      throw new Error(`expected 2 usage_events, got ${events?.length}`);
    }
    for (const row of events ?? []) {
      if (!row.raw_ref?.startsWith("storage://")) throw new Error("raw_ref missing");
      if (row.linked_revenue_event_id !== null) throw new Error("linked_revenue_event_id should be null");
      if (row.source !== "token_csv") throw new Error("wrong source");
    }
    console.log("  clean ingest: PASS — 2 rows with raw_ref, linked_revenue_event_id null");

    const second = await callIngest(token, tenantId, good.path);
    if (second.status !== 200 || second.body.status !== "completed") {
      throw new Error(`idempotent re-upload failed: ${JSON.stringify(second.body)}`);
    }
    const { count: afterDup } = await admin
      .from("usage_events")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if ((afterDup ?? 0) !== 2) {
      throw new Error(`idempotency failed: expected 2 rows, got ${afterDup}`);
    }
    console.log("  idempotency: PASS — row count unchanged on re-upload");

    const foreignPath = `${randomUUID()}/uploads/foreign.csv`;
    const foreignResult = await callIngest(token, tenantId, foreignPath);
    if (foreignResult.status !== 403) {
      throw new Error(`expected 403 for foreign storage path, got ${foreignResult.status}`);
    }
    console.log("  storage path guard: PASS — 403 for other tenant prefix");

    const otherTenant = randomUUID();
    const memberResult = await callIngest(token, otherTenant, `${otherTenant}/uploads/x.csv`);
    if (memberResult.status !== 403) {
      throw new Error(`expected 403 for non-member tenant, got ${memberResult.status}`);
    }
    console.log("  non-member tenant: PASS — 403");

    const { data: foreignRead, error: foreignErr } = await client.storage
      .from(BUCKET)
      .download(`${randomUUID()}/uploads/nope.csv`);
    if (!foreignErr && foreignRead) {
      throw new Error("LEAK: cross-tenant storage read succeeded");
    }
    console.log("  storage isolation: PASS — cross-tenant read denied");

    console.log("\n✓ All E3.1 ingest assertions passed");
  } finally {
    await cleanup(admin, userId, tenantId, paths);
    console.log("Cleanup complete");
  }
}

main().catch((err) => {
  console.error("\n✗", err.message ?? err);
  process.exit(1);
});
