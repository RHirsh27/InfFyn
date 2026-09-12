/**
 * Adversarial: authenticated user with NO membership in tenant B
 * attempts cross-tenant reads against live Supabase — must return zero rows.
 *
 * Run: npm run test:non-member
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireEnv() {
  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function cleanup(admin: SupabaseClient, userId: string, tenantId: string) {
  await admin.from("memberships").delete().eq("tenant_id", tenantId);
  await admin.from("tenants").delete().eq("id", tenantId);
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function main() {
  requireEnv();
  const admin = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ownerEmail = `e1-nonmember-owner-${randomUUID()}@inffyn.test`;
  const intruderEmail = `e1-nonmember-intruder-${randomUUID()}@inffyn.test`;
  const password = `Test-${randomUUID().slice(0, 8)}!aA1`;
  const tenantBId = randomUUID();

  const { data: owner } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
  });
  const { data: intruder } = await admin.auth.admin.createUser({
    email: intruderEmail,
    password,
    email_confirm: true,
  });
  if (!owner?.user || !intruder?.user) throw new Error("seed users failed");

  await admin.from("tenants").insert({ id: tenantBId, name: "Tenant B (secret)" });
  await admin.from("memberships").insert({
    user_id: owner.user.id,
    tenant_id: tenantBId,
    role: "owner",
  });

  try {
    const intruderClient = await signIn(intruderEmail, password);

    const { data: targeted, error: targetedErr } = await intruderClient
      .from("tenants")
      .select("*")
      .eq("id", tenantBId);
    if (targetedErr) throw new Error(`targeted read failed: ${targetedErr.message}`);
    if ((targeted ?? []).length !== 0) {
      throw new Error(`LEAK: non-member targeted tenant read returned ${targeted!.length} rows`);
    }

    const { data: allTenants, error: allErr } = await intruderClient.from("tenants").select("*");
    if (allErr) throw new Error(`list tenants failed: ${allErr.message}`);
    const leaked = (allTenants ?? []).some((t) => t.id === tenantBId);
    if (leaked) {
      throw new Error("LEAK: non-member list tenants included tenant B");
    }

    const { data: foreignMemberships, error: memErr } = await intruderClient
      .from("memberships")
      .select("*")
      .eq("tenant_id", tenantBId);
    if (memErr) throw new Error(`memberships read failed: ${memErr.message}`);
    if ((foreignMemberships ?? []).length !== 0) {
      throw new Error(`LEAK: non-member saw ${foreignMemberships!.length} foreign membership rows`);
    }

    console.log("PASS: authenticated non-member cross-tenant reads returned zero rows");
  } finally {
    await cleanup(admin, owner.user.id, tenantBId);
    await cleanup(admin, intruder.user.id, tenantBId);
    await admin.from("profiles").delete().eq("id", intruder.user.id);
  }
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
