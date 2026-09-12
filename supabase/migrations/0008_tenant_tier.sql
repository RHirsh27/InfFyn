-- E5: Tenant billing tier (read by E5 presentation gating; E8 billing sets it)

ALTER TABLE public.tenants
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'starter', 'growth', 'scale'));

-- Hardening: tier is readable by members via the existing tenants_select_member
-- RLS policy. There is no UPDATE policy for app roles, so authenticated users
-- cannot change tier — writes are service-role only (E8 drives it).
