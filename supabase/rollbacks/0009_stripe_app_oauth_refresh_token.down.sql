-- Rollback 0009: restore the table-level authenticated SELECT grant and drop the
-- encrypted refresh token column. RLS/FORCE RLS and the tenant-scoped policy are
-- untouched by this migration, so nothing to restore there.

REVOKE SELECT ON public.stripe_connections FROM authenticated;
GRANT SELECT ON public.stripe_connections TO authenticated;

ALTER TABLE public.stripe_connections
  DROP COLUMN IF EXISTS refresh_token_encrypted;
