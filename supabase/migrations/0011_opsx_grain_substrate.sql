-- 0011 (PROPOSED — do NOT db push without Ryan's go-ahead): keep the v3 OpsX/Opex
-- option open at near-zero cost. Schema/substrate ONLY — this does NOT build OpsX,
-- add any product surface, or capture any opex data. It only ensures the shared
-- substrate can hold team/workflow/environment grain and opex-grain benchmark
-- aggregates WITHOUT a painful ALTER + backfill once OpsX ships and the event tables
-- are large.
--
-- Everything here is NULLABLE and ignored by every v1 code path. RLS and the
-- zero-PII discipline are unchanged (adding a column alters neither).

-- ── Task 1: flexible grain on the canonical events ──────────────────────────
-- Today dimensions are FIXED columns (usage_events: model, feature, customer_ref;
-- cost_events: model, cost_category, customer_ref). There is no tag/JSONB bag, so
-- team/workflow/environment have nowhere to land. A single nullable JSONB carries
-- arbitrary grain (and any future dimension) with no per-dimension columns.
ALTER TABLE public.usage_events ADD COLUMN dimensions JSONB;
ALTER TABLE public.cost_events  ADD COLUMN dimensions JSONB;

-- ── Task 2: opex-grain benchmark aggregates on the zero-PII substrate ────────
-- audit_aggregates today holds profit-oriented JSONB only (gpp1m_by_model,
-- segment_mix, model_mix). A nullable JSONB lets anonymized opex-grain aggregates
-- (spend by team/workflow/environment, cost-per-outcome shape) accumulate under the
-- SAME zero-PII rule: no tenant_id, no customer_ref, coarse/anonymized aggregates only.
ALTER TABLE public.audit_aggregates ADD COLUMN opex_aggregates JSONB;

COMMENT ON COLUMN public.usage_events.dimensions IS
  'OpsX (v3) grain tags: {team, workflow, environment, ...}. Nullable; unused in v1.';
COMMENT ON COLUMN public.cost_events.dimensions IS
  'OpsX (v3) grain tags for opex spend: {team, workflow, environment, ...}. Nullable; unused in v1.';
COMMENT ON COLUMN public.audit_aggregates.opex_aggregates IS
  'OpsX (v3) anonymized opex-grain benchmark aggregates. Zero-PII; nullable; unused in v1.';