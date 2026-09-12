-- E2: Canonical event tables + anonymized audit substrate (hardened from birth)

-- ── revenue_events (first — usage_events FK depends on this) ────────────────

CREATE TABLE public.revenue_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,
  occurred_at             TIMESTAMPTZ NOT NULL,
  recognized_at           TIMESTAMPTZ,
  amount                  NUMERIC,
  currency                TEXT NOT NULL DEFAULT 'USD',
  customer_ref            TEXT,
  raw_ref                 TEXT NOT NULL,
  confidence              TEXT NOT NULL DEFAULT 'clean'
                          CHECK (confidence IN ('clean', 'needs_review')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  product                 TEXT,
  is_deferred             BOOLEAN NOT NULL DEFAULT false,
  recognition_schedule_id UUID
);

CREATE INDEX revenue_events_tenant_occurred_idx
  ON public.revenue_events (tenant_id, occurred_at);

-- ── cost_events ───────────────────────────────────────────────────────────

CREATE TABLE public.cost_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  source           TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  recognized_at    TIMESTAMPTZ,
  amount           NUMERIC,
  currency         TEXT NOT NULL DEFAULT 'USD',
  customer_ref     TEXT,
  raw_ref          TEXT NOT NULL,
  confidence       TEXT NOT NULL DEFAULT 'clean'
                   CHECK (confidence IN ('clean', 'needs_review')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  cost_category    TEXT CHECK (cost_category IN ('cogs', 'opex', 'fees', 'payroll', 'inference')),
  model            TEXT,
  is_capitalized   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX cost_events_tenant_occurred_idx
  ON public.cost_events (tenant_id, occurred_at);

-- ── usage_events ────────────────────────────────────────────────────────────

CREATE TABLE public.usage_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  source                   TEXT NOT NULL,
  occurred_at              TIMESTAMPTZ NOT NULL,
  recognized_at            TIMESTAMPTZ,
  amount                   NUMERIC,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  customer_ref             TEXT,
  raw_ref                  TEXT NOT NULL,
  confidence               TEXT NOT NULL DEFAULT 'clean'
                           CHECK (confidence IN ('clean', 'needs_review')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  model                    TEXT,
  feature                  TEXT,
  unit                     TEXT,
  input_tokens             BIGINT,
  output_tokens            BIGINT,
  quantity                 NUMERIC,
  linked_revenue_event_id  UUID REFERENCES public.revenue_events (id)
);

CREATE INDEX usage_events_tenant_occurred_idx
  ON public.usage_events (tenant_id, occurred_at);

CREATE INDEX usage_events_tenant_model_idx
  ON public.usage_events (tenant_id, model);

-- ── audit_aggregates (substrate — no tenant_id, coarse buckets only) ────────

CREATE TABLE public.audit_aggregates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  gpp1m_by_model  JSONB,
  segment_mix     JSONB,
  model_mix       JSONB,
  spend_bucket    TEXT,
  volume_bucket   TEXT,
  company_stage   TEXT
);

-- ── RLS + hardening: event tables (membership-scoped SELECT) ────────────────

ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_events FORCE ROW LEVEL SECURITY;

CREATE POLICY revenue_events_select_member ON public.revenue_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_events FORCE ROW LEVEL SECURITY;

CREATE POLICY cost_events_select_member ON public.cost_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events FORCE ROW LEVEL SECURITY;

CREATE POLICY usage_events_select_member ON public.usage_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

-- ── RLS + hardening: audit_aggregates (deny-all to app roles) ───────────────

ALTER TABLE public.audit_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_aggregates FORCE ROW LEVEL SECURITY;
-- Intentionally no policy: deny-by-default for all non–service-role access.

-- ── Grants: tight by default ────────────────────────────────────────────────

REVOKE ALL ON public.revenue_events FROM anon, public, authenticated;
REVOKE ALL ON public.cost_events FROM anon, public, authenticated;
REVOKE ALL ON public.usage_events FROM anon, public, authenticated;
REVOKE ALL ON public.audit_aggregates FROM anon, authenticated, public;

GRANT SELECT ON public.revenue_events TO authenticated;
GRANT SELECT ON public.cost_events TO authenticated;
GRANT SELECT ON public.usage_events TO authenticated;
