-- E3.2: Stripe Connect connection tracking + revenue idempotency key

-- ── stripe_connections (one per tenant, hardened from birth) ───────────────

CREATE TABLE public.stripe_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL,
  scope             TEXT NOT NULL DEFAULT 'read_only',
  status            TEXT NOT NULL DEFAULT 'connected'
                    CHECK (status IN ('connected', 'needs_reauth', 'error', 'disconnected')),
  last_sync_at      TIMESTAMPTZ,
  last_cursor       TEXT,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE INDEX stripe_connections_tenant_id_idx ON public.stripe_connections (tenant_id);

ALTER TABLE public.stripe_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY stripe_connections_select_member ON public.stripe_connections
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.stripe_connections FROM anon, public, authenticated;
GRANT SELECT ON public.stripe_connections TO authenticated;

-- ── Idempotent revenue upsert (tenant + Stripe raw_ref) ─────────────────────

CREATE UNIQUE INDEX revenue_events_tenant_raw_ref_uidx
  ON public.revenue_events (tenant_id, raw_ref);
