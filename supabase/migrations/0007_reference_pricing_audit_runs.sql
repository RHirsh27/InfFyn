-- E4: Allocation engine reference data + retained audit runs (hardened from birth)

-- ── reference_pricing (global reference data — public model prices) ─────────

CREATE TABLE public.reference_pricing (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model          TEXT NOT NULL,
  input_per_1m   NUMERIC NOT NULL,
  output_per_1m  NUMERIC NOT NULL,
  source         TEXT,
  captured_at    DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX reference_pricing_model_uidx ON public.reference_pricing (model);

ALTER TABLE public.reference_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_pricing FORCE ROW LEVEL SECURITY;

-- Public reference prices: any authenticated user may read; writes are
-- service-role only (bypasses RLS). No write policy is defined for app roles.
CREATE POLICY reference_pricing_select_authenticated ON public.reference_pricing
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.reference_pricing FROM anon, public, authenticated;
GRANT SELECT ON public.reference_pricing TO authenticated;

-- ── audit_runs (tenant-scoped, retained "Memory" of each allocation run) ────

CREATE TABLE public.audit_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  result         JSONB,
  default_method TEXT,
  coverage       JSONB
);

CREATE INDEX audit_runs_tenant_created_idx ON public.audit_runs (tenant_id, created_at DESC);

ALTER TABLE public.audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_runs_select_member ON public.audit_runs
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON public.audit_runs FROM anon, public, authenticated;
GRANT SELECT ON public.audit_runs TO authenticated;

-- ── Seed reference prices (public list prices, dated + labeled) ─────────────
-- Prices are per 1M tokens (USD). Captured 2026-07-08 from public pricing pages.

INSERT INTO public.reference_pricing (model, input_per_1m, output_per_1m, source, captured_at) VALUES
  ('gpt-4',              30.00, 60.00, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('gpt-4-turbo',        10.00, 30.00, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('gpt-4o',              2.50, 10.00, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('gpt-4o-mini',         0.15,  0.60, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('o1',                 15.00, 60.00, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('o1-mini',             1.10,  4.40, 'OpenAI public pricing (captured 2026-07-08)',    '2026-07-08'),
  ('claude-3-opus',      15.00, 75.00, 'Anthropic public pricing (captured 2026-07-08)', '2026-07-08'),
  ('claude-3-sonnet',     3.00, 15.00, 'Anthropic public pricing (captured 2026-07-08)', '2026-07-08'),
  ('claude-3-5-sonnet',   3.00, 15.00, 'Anthropic public pricing (captured 2026-07-08)', '2026-07-08'),
  ('claude-3-haiku',      0.25,  1.25, 'Anthropic public pricing (captured 2026-07-08)', '2026-07-08'),
  ('claude-3-5-haiku',    0.80,  4.00, 'Anthropic public pricing (captured 2026-07-08)', '2026-07-08')
ON CONFLICT (model) DO NOTHING;
