-- E1: Tenancy, profiles, memberships + deny-by-default RLS

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner', 'member', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX memberships_user_id_idx ON public.memberships (user_id);
CREATE INDEX memberships_tenant_id_idx ON public.memberships (tenant_id);

-- ── RLS (deny-by-default) ─────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY tenants_select_member ON public.tenants
  FOR SELECT
  USING (
    id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

-- Reference auth.uid() directly — never subquery memberships from within memberships.
CREATE POLICY memberships_select_own ON public.memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- ── New user → profile ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── Sanctioned tenant creation path ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_tenant(tenant_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  caller_id     UUID;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.tenants (name)
  VALUES (tenant_name)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.memberships (user_id, tenant_id, role)
  VALUES (caller_id, new_tenant_id, 'owner');

  RETURN new_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant(TEXT) TO authenticated;
