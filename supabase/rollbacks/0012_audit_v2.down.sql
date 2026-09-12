-- Destructive rollback: export retained v2 audits before Ryan applies.
begin;
drop function if exists public.unlock_inffyn_billing(uuid,text);
drop function if exists public.lock_inffyn_billing(uuid,text);
drop function if exists public.expire_economic_evidence();
drop function if exists public.apply_inffyn_subscription(text,bigint,uuid,jsonb);
drop function if exists public.claim_economic_preview(text,uuid,uuid);
drop function if exists public.consume_audit_preview_limit(text);
drop table if exists public.inffyn_billing_events;
drop table if exists public.inffyn_subscriptions;
drop table if exists public.audit_preview_limits;
drop table if exists public.audit_previews;
drop table if exists public.economic_audits;
commit;
