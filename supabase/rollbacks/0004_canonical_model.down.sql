-- E2 rollback: drop event tables + substrate (usage first for FK)

DROP TABLE IF EXISTS public.usage_events;
DROP TABLE IF EXISTS public.revenue_events;
DROP TABLE IF EXISTS public.cost_events;
DROP TABLE IF EXISTS public.audit_aggregates;
