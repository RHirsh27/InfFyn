-- Down migration: E1 tenancy rollback

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.create_tenant(TEXT);

DROP TABLE IF EXISTS public.memberships;
DROP TABLE IF EXISTS public.tenants;
DROP TABLE IF EXISTS public.profiles;
