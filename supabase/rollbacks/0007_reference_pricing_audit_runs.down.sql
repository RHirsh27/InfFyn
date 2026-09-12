-- Rollback E4 reference data + audit runs. Allocation is computed, not
-- destructive: dropping these tables removes only reference prices and the
-- retained run history; no canonical event data is mutated.

DROP TABLE IF EXISTS public.audit_runs;
DROP TABLE IF EXISTS public.reference_pricing;
