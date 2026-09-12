export type TenantRole = "owner" | "member" | "internal";

export type TenantTier = "free" | "starter" | "growth" | "scale";

export interface Profile {
  id: string;
  email: string | null;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
  tier: TenantTier;
}

export interface Membership {
  id: string;
  user_id: string;
  tenant_id: string;
  role: TenantRole;
  created_at: string;
}

export interface TenantContext {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
}
