-- 0009: Stripe App OAuth migration — store the encrypted read-only refresh token.
--
-- The Stripe App grant issues a long-lived refresh token (read-only: invoice_read +
-- charge_read). It is encrypted at rest by the engine (Fernet, key in the Render env
-- STRIPE_TOKEN_ENC_KEY — never in repo or DB) and written to the column below.
--
-- Isolation is preserved: RLS/FORCE RLS and the tenant-scoped SELECT policy are
-- unchanged. anon/public remain fully revoked. The encrypted token must never be
-- readable by the client role, so the `authenticated` SELECT grant is narrowed to the
-- non-secret columns only (the engine reads the token via the service-role key, which
-- bypasses RLS/column grants).

ALTER TABLE public.stripe_connections
  ADD COLUMN refresh_token_encrypted TEXT;

-- Narrow the authenticated read grant so it cannot include the encrypted token column.
REVOKE SELECT ON public.stripe_connections FROM authenticated;
GRANT SELECT (
  id,
  tenant_id,
  stripe_account_id,
  scope,
  status,
  last_sync_at,
  last_cursor,
  last_error,
  created_at
) ON public.stripe_connections TO authenticated;
