-- Converge the legacy InfFyn deployment without rewriting migration history.
-- Remote 0009 is drop_scaffold_healthcheck; local 0009 added the encrypted
-- Stripe refresh token. Preserve both old files/ledgers and record this change
-- under its own version. Fresh databases already have the nullable text column.
-- This migration must be applied in a transaction after catalog/recovery review.
-- It neither reads token values nor restores the retired scaffold table.

DO $$
BEGIN
  IF to_regclass('public.stripe_connections') IS NULL THEN
    RAISE EXCEPTION 'Expected stripe_connections table is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.stripe_connections'::regclass
      AND attname = 'refresh_token_encrypted' AND NOT attisdropped
      AND (atttypid <> 'text'::regtype OR attnotnull OR attgenerated <> ''
           OR atthasdef)
  ) THEN
    RAISE EXCEPTION 'Unexpected refresh token column shape; inspect before migration';
  END IF;
END $$;

ALTER TABLE public.stripe_connections
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;

-- Table-level revocation does not remove separately granted column privileges.
-- Cover both, then restore only the original non-secret browser read contract.
REVOKE ALL ON public.stripe_connections FROM anon, public, authenticated;
REVOKE ALL (refresh_token_encrypted) ON public.stripe_connections
  FROM anon, public, authenticated;
GRANT SELECT (
  id, tenant_id, stripe_account_id, scope, status, last_sync_at,
  last_cursor, last_error, created_at
) ON public.stripe_connections TO authenticated;
