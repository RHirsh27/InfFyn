ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.memberships NO FORCE ROW LEVEL SECURITY;
GRANT EXECUTE ON FUNCTION public.create_tenant(text) TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
