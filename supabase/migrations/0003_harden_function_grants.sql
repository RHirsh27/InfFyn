-- E1 hardening: close SECURITY DEFINER RPC surface + force RLS on tenancy tables

-- 1. Close the SECURITY DEFINER function surface
REVOKE EXECUTE ON FUNCTION public.create_tenant(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
-- authenticated keeps EXECUTE on create_tenant (app tenant-creation flow)
GRANT EXECUTE ON FUNCTION public.create_tenant(text) TO authenticated;

-- 2. Force RLS so even the table owner is subject to policies
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;
