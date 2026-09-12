-- InfFyn v1 revision. Independent of proposed 0011. Ryan applies after review.
-- Customer payloads are served by the authenticated engine, never direct SELECT.
begin;
create table public.economic_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  fingerprint text not null,
  title text not null,
  kind text not null check (kind in ('product','internal')),
  access_level text not null check (access_level in ('preview','full')),
  payload jsonb,
  result jsonb not null,
  report jsonb,
  evidence_expires_at timestamptz not null default now() + interval '90 days',
  report_expires_at timestamptz not null default now() + interval '12 months',
  unique (tenant_id,fingerprint,access_level)
);
create index economic_audits_tenant_created on public.economic_audits(tenant_id,created_at desc);
create table public.audit_previews (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour'
);
create index audit_previews_expiry on public.audit_previews(expires_at);
create table public.audit_preview_limits (
  bucket text primary key,
  requests integer not null,
  expires_at timestamptz not null
);
create table public.inffyn_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  customer_id text unique,
  subscription_id text unique,
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  last_event_created bigint not null default 0,
  billing_operation text,
  billing_lock_until timestamptz
);
create table public.inffyn_billing_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);
do $$ declare tab text; begin
  foreach tab in array array['economic_audits','audit_previews','audit_preview_limits','inffyn_subscriptions','inffyn_billing_events'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('alter table public.%I force row level security',tab);
    execute format('revoke all on public.%I from anon, authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $$;

create function public.consume_audit_preview_limit(p_bucket text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.audit_preview_limits(bucket,requests,expires_at)
  values(p_bucket,1,now()+interval '1 hour')
  on conflict(bucket) do update set
    requests=case when audit_preview_limits.expires_at < now() then 1 else audit_preview_limits.requests+1 end,
    expires_at=case when audit_preview_limits.expires_at < now() then now()+interval '1 hour' else audit_preview_limits.expires_at end
  returning requests into n;
  return n <= 10;
end $$;

create function public.claim_economic_preview(p_hash text,p_tenant uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.audit_previews; audit_id uuid;
begin
  if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=p_user) then
    raise exception 'Unauthorized';
  end if;
  delete from public.audit_previews where secret_hash=p_hash and expires_at>now() returning * into p;
  if not found then return null; end if;
  insert into public.economic_audits(tenant_id,created_by,fingerprint,title,kind,access_level,payload,result)
  values(p_tenant,p_user,p.result->>'fingerprint',p.payload->>'title',p.payload->>'kind','preview',p.payload,p.result)
  on conflict(tenant_id,fingerprint,access_level) do nothing returning id into audit_id;
  if audit_id is null then
    select id into audit_id from public.economic_audits where tenant_id=p_tenant and fingerprint=p.result->>'fingerprint' and access_level='preview';
  end if;
  return audit_id;
end $$;

create function public.apply_inffyn_subscription(p_event text,p_created bigint,p_tenant uuid,p_state jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inffyn_billing_events(event_id) values(p_event) on conflict do nothing;
  if not found then return false; end if;
  insert into public.inffyn_subscriptions(tenant_id,customer_id,subscription_id,status,price_id,current_period_end,cancel_at_period_end,last_event_created)
  values(p_tenant,p_state->>'customer_id',p_state->>'subscription_id',p_state->>'status',p_state->>'price_id',(p_state->>'current_period_end')::timestamptz,coalesce((p_state->>'cancel_at_period_end')::boolean,false),p_created)
  on conflict(tenant_id) do update set customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,updated_at=now()
  where inffyn_subscriptions.last_event_created <= p_created;
  return true;
end $$;

create function public.expire_economic_evidence() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.audit_previews where expires_at <= now();
  delete from public.audit_preview_limits where expires_at <= now();
  update public.economic_audits set payload=null where evidence_expires_at <= now() and payload is not null;
  delete from public.economic_audits where report_expires_at <= now();
  delete from public.inffyn_billing_events where created_at < now()-interval '12 months';
end $$;
create function public.lock_inffyn_billing(p_tenant uuid,p_operation text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inffyn_subscriptions(tenant_id) values(p_tenant) on conflict do nothing;
  update public.inffyn_subscriptions set billing_operation=p_operation,billing_lock_until=now()+interval '2 minutes'
  where tenant_id=p_tenant and (billing_lock_until is null or billing_lock_until<now());
  return found;
end $$;
create function public.unlock_inffyn_billing(p_tenant uuid,p_operation text) returns void
language sql security definer set search_path = '' as $$
  update public.inffyn_subscriptions set billing_operation=null,billing_lock_until=null where tenant_id=p_tenant and billing_operation=p_operation;
$$;
revoke all on function public.lock_inffyn_billing(uuid,text),public.unlock_inffyn_billing(uuid,text) from public,anon,authenticated;
grant execute on function public.lock_inffyn_billing(uuid,text),public.unlock_inffyn_billing(uuid,text) to service_role;
revoke all on function public.consume_audit_preview_limit(text),public.claim_economic_preview(text,uuid,uuid),public.apply_inffyn_subscription(text,bigint,uuid,jsonb),public.expire_economic_evidence() from public,anon,authenticated;
grant execute on function public.consume_audit_preview_limit(text),public.claim_economic_preview(text,uuid,uuid),public.apply_inffyn_subscription(text,bigint,uuid,jsonb),public.expire_economic_evidence() to service_role;
commit;
