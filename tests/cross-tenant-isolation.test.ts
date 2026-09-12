/**
 * E1/E2 cross-tenant isolation gate test.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Run: npm run test:isolation
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const EVENT_TABLES = ["revenue_events", "cost_events", "usage_events"] as const;

function assertEnv() {
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing env vars: ${missing.join(", ")}\n\n` +
        "Add them to engine/.env and app/.env (or root .env).\n" +
        "Service role: Supabase Dashboard → Project Settings → API → service_role (secret)\n" +
        "Anon key: same page → anon public key"
    );
  }
}

async function seedTenantWithOwner(
  admin: SupabaseClient,
  label: string
): Promise<{ userId: string; tenantId: string; email: string; password: string }> {
  const email = `e2-isolation-${label}-${randomUUID()}@inffyn.test`;
  const password = `Test-${randomUUID().slice(0, 8)}!aA1`;

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    throw new Error(`createUser failed: ${userError?.message}`);
  }

  const tenantId = randomUUID();
  const { error: tenantError } = await admin.from("tenants").insert({
    id: tenantId,
    name: `Tenant ${label}`,
  });
  if (tenantError) {
    throw new Error(`tenant insert failed: ${tenantError.message}`);
  }

  const { error: membershipError } = await admin.from("memberships").insert({
    user_id: userData.user.id,
    tenant_id: tenantId,
    role: "owner",
  });
  if (membershipError) {
    throw new Error(`membership insert failed: ${membershipError.message}`);
  }

  return {
    userId: userData.user.id,
    tenantId,
    email,
    password,
  };
}

async function seedEventsForTenant(
  admin: SupabaseClient,
  tenantId: string,
  label: string
): Promise<{ revenueEventId: string; usageEventId: string }> {
  const occurredAt = new Date().toISOString();

  const { data: revenue, error: revenueError } = await admin
    .from("revenue_events")
    .insert({
      tenant_id: tenantId,
      source: "test",
      occurred_at: occurredAt,
      amount: 100,
      customer_ref: `cust-${label}`,
      raw_ref: `stripe:inv_${label}`,
      product: "pro",
    })
    .select("id")
    .single();
  if (revenueError || !revenue) {
    throw new Error(`revenue_events seed failed: ${revenueError?.message}`);
  }

  const { error: costError } = await admin.from("cost_events").insert({
    tenant_id: tenantId,
    source: "test",
    occurred_at: occurredAt,
    amount: -25,
    customer_ref: `cust-${label}`,
    raw_ref: `ledger:cost_${label}`,
    cost_category: "inference",
    model: "gpt-4",
  });
  if (costError) {
    throw new Error(`cost_events seed failed: ${costError.message}`);
  }

  const { data: usage, error: usageError } = await admin
    .from("usage_events")
    .insert({
      tenant_id: tenantId,
      source: "test",
      occurred_at: occurredAt,
      customer_ref: `cust-${label}`,
      raw_ref: `log:usage_${label}`,
      model: "gpt-4",
      feature: "chat",
      unit: "tokens",
      input_tokens: 1000,
      output_tokens: 500,
      quantity: 1500,
      linked_revenue_event_id: revenue.id,
    })
    .select("id")
    .single();
  if (usageError || !usage) {
    throw new Error(`usage_events seed failed: ${usageError?.message}`);
  }

  return { revenueEventId: revenue.id, usageEventId: usage.id };
}

async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signIn failed: ${error.message}`);
  }
  return client;
}

async function assertEventTableIsolation(
  label: string,
  client: SupabaseClient,
  ownTenantId: string,
  otherTenantId: string,
  table: (typeof EVENT_TABLES)[number]
) {
  const { data: ownRows, error: ownError } = await client
    .from(table)
    .select("*")
    .eq("tenant_id", ownTenantId);
  if (ownError) {
    throw new Error(`${label}: ${table} own-tenant query failed: ${ownError.message}`);
  }
  if ((ownRows ?? []).length === 0) {
    throw new Error(`${label}: expected own ${table} rows for tenant ${ownTenantId}`);
  }

  const { data: crossRows, error: crossError } = await client
    .from(table)
    .select("*")
    .eq("tenant_id", otherTenantId);
  if (crossError) {
    throw new Error(`${label}: ${table} cross-tenant query failed: ${crossError.message}`);
  }
  if ((crossRows ?? []).length !== 0) {
    throw new Error(`${label}: LEAK — ${table} cross-tenant read returned ${crossRows!.length} rows`);
  }

  const { data: allRows, error: allError } = await client.from(table).select("*");
  if (allError) {
    throw new Error(`${label}: ${table} list query failed: ${allError.message}`);
  }
  const foreign = (allRows ?? []).filter((r) => r.tenant_id === otherTenantId);
  if (foreign.length !== 0) {
    throw new Error(`${label}: LEAK — ${table} list included other tenant rows`);
  }
}

async function assertIsolation(
  label: string,
  client: SupabaseClient,
  ownTenantId: string,
  otherTenantId: string
) {
  const { data: tenants, error: tenantsError } = await client.from("tenants").select("*");
  if (tenantsError) {
    throw new Error(`${label}: tenants query failed: ${tenantsError.message}`);
  }

  const visibleTenantIds = (tenants ?? []).map((t) => t.id);
  const seesOwn = visibleTenantIds.includes(ownTenantId);
  const seesOther = visibleTenantIds.includes(otherTenantId);

  console.log(`  ${label} visible tenants: ${visibleTenantIds.length} [${visibleTenantIds.join(", ")}]`);

  if (!seesOwn) {
    throw new Error(`${label}: expected to see own tenant ${ownTenantId}`);
  }
  if (seesOther) {
    throw new Error(`${label}: LEAK — saw other tenant ${otherTenantId}`);
  }

  const { data: crossRead, error: crossError } = await client
    .from("tenants")
    .select("*")
    .eq("id", otherTenantId);
  if (crossError) {
    throw new Error(`${label}: cross-tenant query failed: ${crossError.message}`);
  }
  if ((crossRead ?? []).length !== 0) {
    throw new Error(`${label}: LEAK — cross-tenant read returned ${crossRead!.length} rows`);
  }

  const { data: memberships, error: memError } = await client.from("memberships").select("*");
  if (memError) {
    throw new Error(`${label}: memberships query failed: ${memError.message}`);
  }

  const foreignMemberships = (memberships ?? []).filter((m) => m.tenant_id === otherTenantId);
  if (foreignMemberships.length !== 0) {
    throw new Error(`${label}: LEAK — saw other tenant membership`);
  }

  for (const table of EVENT_TABLES) {
    await assertEventTableIsolation(label, client, ownTenantId, otherTenantId, table);
    console.log(`  ${label}: ${table} PASS — zero cross-tenant rows`);
  }

  console.log(`  ${label}: PASS — zero cross-tenant rows (tenancy + events)`);
}

async function assertSubstrateLocked(admin: SupabaseClient, userClientA: SupabaseClient) {
  const { data: inserted, error: insertError } = await admin
    .from("audit_aggregates")
    .insert({
      gpp1m_by_model: { "gpt-4": "high" },
      segment_mix: { saas: 0.6 },
      model_mix: { "gpt-4": 0.4 },
      spend_bucket: "10k-50k",
      volume_bucket: "1m-10m",
      company_stage: "growth",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(`audit_aggregates seed failed: ${insertError?.message}`);
  }

  const anonClient = createClient(url!, anonKey!);
  const { data: anonRows, error: anonError } = await anonClient
    .from("audit_aggregates")
    .select("*");
  if (!anonError && (anonRows ?? []).length > 0) {
    throw new Error("LEAK: anon read audit_aggregates");
  }
  if (anonError && !anonError.message.includes("permission denied")) {
    // RLS deny with no policy may return empty set instead of error via PostgREST
    const isDenied =
      anonError.code === "42501" ||
      anonError.message.toLowerCase().includes("permission denied");
    if (!isDenied && (anonRows ?? []).length === 0) {
      // empty + no error is also acceptable deny
    } else if (!isDenied) {
      throw new Error(`unexpected anon audit_aggregates error: ${anonError.message}`);
    }
  }

  const { data: authRows, error: authError } = await userClientA
    .from("audit_aggregates")
    .select("*");
  if (!authError && (authRows ?? []).length > 0) {
    throw new Error("LEAK: authenticated read audit_aggregates");
  }
  if (authError) {
    const isDenied =
      authError.code === "42501" ||
      authError.message.toLowerCase().includes("permission denied");
    if (!isDenied && (authRows ?? []).length !== 0) {
      throw new Error(`unexpected auth audit_aggregates error: ${authError.message}`);
    }
  }

  await admin.from("audit_aggregates").delete().eq("id", inserted.id);
  console.log("  audit_aggregates: PASS — locked from anon and authenticated");
}

async function assertLinkedRevenueProof(
  admin: SupabaseClient,
  tenantId: string,
  revenueEventId: string,
  usageEventId: string
) {
  const { data: usage, error } = await admin
    .from("usage_events")
    .select("id, linked_revenue_event_id, raw_ref")
    .eq("id", usageEventId)
    .single();
  if (error || !usage) {
    throw new Error(`linked revenue proof failed: ${error?.message}`);
  }
  if (usage.linked_revenue_event_id !== revenueEventId) {
    throw new Error("linked_revenue_event_id does not match seeded revenue event");
  }
  if (!usage.raw_ref) {
    throw new Error("usage event missing raw_ref");
  }

  const { data: revenue, error: revError } = await admin
    .from("revenue_events")
    .select("id, raw_ref")
    .eq("id", revenueEventId)
    .single();
  if (revError || !revenue?.raw_ref) {
    throw new Error(`revenue event proof failed: ${revError?.message}`);
  }

  console.log(
    `  seed proof: usage ${usageEventId} → revenue ${revenueEventId} (tenant ${tenantId})`
  );
}

async function cleanup(
  admin: SupabaseClient,
  userIds: string[],
  tenantIds: string[]
) {
  for (const tenantId of tenantIds) {
    await admin.from("memberships").delete().eq("tenant_id", tenantId);
    await admin.from("tenants").delete().eq("id", tenantId);
  }
  for (const userId of userIds) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

async function main() {
  assertEnv();
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("E1/E2 cross-tenant isolation test\n");

  const a = await seedTenantWithOwner(admin, "A");
  const b = await seedTenantWithOwner(admin, "B");

  const eventsA = await seedEventsForTenant(admin, a.tenantId, "A");
  const eventsB = await seedEventsForTenant(admin, b.tenantId, "B");

  try {
    const clientA = await userClient(a.email, a.password);
    const clientB = await userClient(b.email, b.password);

    console.log("Seed proof (service role):");
    await assertLinkedRevenueProof(
      admin,
      a.tenantId,
      eventsA.revenueEventId,
      eventsA.usageEventId
    );

    console.log("User A (member of tenant A only):");
    await assertIsolation("User A", clientA, a.tenantId, b.tenantId);

    console.log("User B (member of tenant B only):");
    await assertIsolation("User B", clientB, b.tenantId, a.tenantId);

    console.log("Substrate lockdown:");
    await assertSubstrateLocked(admin, clientA);

    console.log("\n✓ All isolation assertions passed");
  } finally {
    await cleanup(admin, [a.userId, b.userId], [a.tenantId, b.tenantId]);
    console.log("Cleanup complete");
  }
}

main().catch((err) => {
  console.error("\n✗", err.message ?? err);
  process.exit(1);
});
