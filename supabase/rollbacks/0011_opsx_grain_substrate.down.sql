-- Rollback 0011 (PROPOSED). Fully reversible — the columns are nullable and unused
-- in v1, so dropping them removes nothing v1 depends on.

ALTER TABLE public.usage_events     DROP COLUMN IF EXISTS dimensions;
ALTER TABLE public.cost_events      DROP COLUMN IF EXISTS dimensions;
ALTER TABLE public.audit_aggregates DROP COLUMN IF EXISTS opex_aggregates;