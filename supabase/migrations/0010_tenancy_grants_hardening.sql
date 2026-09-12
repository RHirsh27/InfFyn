-- E1 grant hygiene: tighten tenancy tables to match E2 canonical pattern (Fix #3).
--
-- profiles, tenants, and memberships were created in 0002 before the
-- "hardened from birth" REVOKE/GRANT pattern used from 0004 onward.
-- FORCE RLS already contained access; this makes the grant story uniform.

REVOKE ALL ON public.profiles FROM anon, public, authenticated;
REVOKE ALL ON public.tenants FROM anon, public, authenticated;
REVOKE ALL ON public.memberships FROM anon, public, authenticated;
-- Minimum authenticated grants (RLS still filters rows):
-- profiles: read + update own row (profiles_select_own / profiles_update_own)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
-- tenants: read only (writes via create_tenant SECURITY DEFINER in 0002/0003)
GRANT SELECT ON public.tenants TO authenticated;
-- memberships: read only (writes via create_tenant SECURITY DEFINER)
GRANT SELECT ON public.memberships TO authenticated;