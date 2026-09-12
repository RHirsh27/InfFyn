import { cookies } from "next/headers";
import type { Membership, Tenant, TenantContext } from "@inffyn/types";
import { createClient } from "./supabase/server";
import { requireAlphaUser } from "./private-alpha";

export const ACTIVE_TENANT_COOKIE = "active_tenant_id";

export type ActiveTenantResult = {
  userId: string;
  tenant: Tenant;
  membership: Membership;
  memberships: Membership[];
};

/** Default workspace name from email (editable later). */
export function defaultTenantNameFromEmail(email: string | undefined): string {
  if (!email) return "My workspace";
  const local = email.split("@")[0]?.trim();
  if (!local) return "My workspace";
  const pretty = local
    .replace(/[._+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return pretty || "My workspace";
}

export async function setActiveTenantCookie(tenantId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

/**
 * Provision a tenant via the atomic ensure_inffyn_workspace() RPC and set the
 * active-tenant cookie. Runs as the authenticated user so SECURITY DEFINER
 * + authenticated EXECUTE grant path is honored (0013 grants).
 */
export async function provisionTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantName: string,
): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");
  requireAlphaUser(user);
  const { data: tenantId, error } = await supabase.rpc(
    "ensure_inffyn_workspace",
    {
      tenant_name: tenantName,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("ensure_inffyn_workspace did not return a tenant id");
  }

  await setActiveTenantCookie(tenantId);
  return tenantId;
}

/**
 * Tenant-resolver seam (app). Single choke point for active tenant context.
 * Later: dedicated-DB-per-tenant routing plugs in here (D13).
 */
export async function getActiveTenant(): Promise<ActiveTenantResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }
  requireAlphaUser(user);

  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id);

  if (membershipError) {
    throw new Error(`Failed to load memberships: ${membershipError.message}`);
  }

  if (!memberships?.length) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const memberTenantIds = new Set(memberships.map((m) => m.tenant_id));

  let activeTenantId = cookieTenantId;
  if (!activeTenantId || !memberTenantIds.has(activeTenantId)) {
    activeTenantId = memberships[0].tenant_id;
  }

  const membership = memberships.find((m) => m.tenant_id === activeTenantId)!;

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", activeTenantId)
    .single();

  if (tenantError || !tenant) {
    throw new Error(
      `Failed to load tenant: ${tenantError?.message ?? "not found"}`,
    );
  }

  return {
    userId: user.id,
    tenant,
    membership,
    memberships,
  };
}

/**
 * E6: auto-provision on first audit-path action. If the signed-in user has no
 * tenant, create one transparently via create_tenant() (default name from email).
 */
export async function ensureActiveTenant(): Promise<ActiveTenantResult> {
  const existing = await getActiveTenant();
  if (existing) {
    return existing;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }
  requireAlphaUser(user);

  await provisionTenant(
    supabase,
    defaultTenantNameFromEmail(user.email ?? undefined),
  );

  const active = await getActiveTenant();
  if (!active) {
    throw new Error("Failed to provision tenant");
  }
  return active;
}

/** Derived state (Q4): does this tenant have any retained audit_runs? */
export async function tenantHasAuditRuns(tenantId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check audit history: ${error.message}`);
  }
  return data != null;
}

export type AppLandingState =
  | { phase: "onboarding"; userEmail: string; tenant: Tenant | null }
  | { phase: "memory"; active: ActiveTenantResult };

/**
 * E6 state-aware /app landing: onboarding vs retained Memory (has audit_runs).
 * Does not auto-provision — provisioning happens on first audit-path API call.
 */
export async function resolveAppLandingState(): Promise<AppLandingState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const active = await getActiveTenant();
  if (!active) {
    return { phase: "onboarding", userEmail: user.email ?? "", tenant: null };
  }

  const hasRuns = await tenantHasAuditRuns(active.tenant.id);
  if (!hasRuns) {
    return {
      phase: "onboarding",
      userEmail: user.email ?? "",
      tenant: active.tenant,
    };
  }

  return { phase: "memory", active };
}

export function toTenantContext(result: ActiveTenantResult): TenantContext {
  return {
    tenant_id: result.tenant.id,
    user_id: result.userId,
    role: result.membership.role,
  };
}
