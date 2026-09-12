-- Independent company reporting. Browser roles cannot access financial evidence or credentials.
create table public.inffyn_workloads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  unique(tenant_id,id)
);
create table public.inffyn_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fingerprint text not null,
  payload jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  evidence_expires_at timestamptz not null default now()+interval '90 days',
  report_expires_at timestamptz not null default now()+interval '12 months',
  unique(tenant_id,fingerprint), unique(tenant_id,id,month)
);
create table public.inffyn_monthly_selections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month text not null,
  report_id uuid not null,
  selected_by uuid not null references auth.users(id),
  selected_at timestamptz not null default now(),
  unique(tenant_id,month),
  foreign key(tenant_id,report_id,month) references public.inffyn_monthly_reports(tenant_id,id,month) on delete cascade
);
create table public.inffyn_selection_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month text not null, report_id uuid not null, previous_report_id uuid,
  actor uuid not null references auth.users(id), reason text not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,report_id,month) references public.inffyn_monthly_reports(tenant_id,id,month) on delete cascade
);
create table public.inffyn_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check(provider in ('openai','anthropic')),
  label text not null, encrypted_credential text not null,
  generation uuid not null default gen_random_uuid(),
  status text not null default 'unverified' check(status in ('unverified','connected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,provider)
);
create table public.inffyn_provider_imports (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check(provider in ('openai','anthropic','stripe')),
  month text not null,
  request_id uuid not null,
  source_identity text not null,
  state text not null default 'pending' check(state in ('pending','complete','failed')),
  step integer not null default 0,
  cursor jsonb not null default '{}',
  evidence jsonb,
  counts jsonb not null default '{"costs":0,"usage":0,"revenue":0}',
  error text,
  created_at timestamptz not null default now(),
  evidence_expires_at timestamptz not null default now()+interval '90 days',
  unique(tenant_id,request_id)
);
create index inffyn_monthly_history on public.inffyn_monthly_reports(tenant_id,month,created_at desc);
create index inffyn_import_history on public.inffyn_provider_imports(tenant_id,created_at desc);

-- Restatements create new rows. The only permitted update erases expired raw inputs.
create function public.preserve_inffyn_monthly_report() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if (to_jsonb(new)-'payload') is distinct from (to_jsonb(old)-'payload')
    or (new.payload is distinct from old.payload and (new.payload is not null or old.evidence_expires_at>now())) then
    raise exception 'Monthly report versions are immutable';
  end if;
  return new;
end $$;
revoke all on function public.preserve_inffyn_monthly_report() from public,anon,authenticated;
create trigger preserve_inffyn_monthly_report before update on public.inffyn_monthly_reports
for each row execute function public.preserve_inffyn_monthly_report();

do $$ declare t text; begin
  foreach t in array array['inffyn_workloads','inffyn_monthly_reports','inffyn_monthly_selections','inffyn_selection_events','inffyn_provider_connections','inffyn_provider_imports'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.select_inffyn_month(p_tenant uuid,p_actor uuid,p_report uuid,p_expected uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.inffyn_monthly_reports; old_id uuid; selected public.inffyn_monthly_selections;
begin
  if not exists(select 1 from memberships where tenant_id=p_tenant and user_id=p_actor) then raise exception 'Unauthorized'; end if;
  select * into r from inffyn_monthly_reports where id=p_report and tenant_id=p_tenant and report_expires_at>now();
  if not found then raise exception 'Report unavailable'; end if;
  if length(trim(p_reason))<3 or length(p_reason)>500 then raise exception 'Selection reason required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||r.month,0));
  select report_id into old_id from inffyn_monthly_selections where tenant_id=p_tenant and month=r.month;
  if old_id=p_report then
    select * into selected from inffyn_monthly_selections where tenant_id=p_tenant and month=r.month;
    return to_jsonb(selected);
  end if;
  if old_id is distinct from p_expected then raise exception 'Selection changed; refresh and review again'; end if;
  insert into inffyn_monthly_selections(tenant_id,month,report_id,selected_by) values(p_tenant,r.month,p_report,p_actor)
    on conflict(tenant_id,month) do update set report_id=excluded.report_id,selected_by=excluded.selected_by,selected_at=now()
    returning * into selected;
  insert into inffyn_selection_events(tenant_id,month,report_id,previous_report_id,actor,reason) values(p_tenant,r.month,p_report,old_id,p_actor,p_reason);
  return to_jsonb(selected);
end $$;
revoke all on function public.select_inffyn_month(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.select_inffyn_month(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.save_inffyn_workload(p_tenant uuid,p_actor uuid,p_id uuid,p_definition jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare other record; provider text; project text; result public.inffyn_workloads;
begin
  if not exists(select 1 from memberships where tenant_id=p_tenant and user_id=p_actor) then raise exception 'Unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||'workloads',0));
  if exists(select 1 from inffyn_workloads where id=p_id and tenant_id<>p_tenant) then raise exception 'Unauthorized'; end if;
  for other in select definition from inffyn_workloads where tenant_id=p_tenant and id<>p_id loop
    if lower(other.definition->>'name')=lower(p_definition->>'name') then raise exception 'Workload name already exists'; end if;
    for provider in select jsonb_object_keys(coalesce(p_definition->'mappings','{}')) loop
      for project in select jsonb_array_elements_text(p_definition->'mappings'->provider) loop
        if coalesce(other.definition->'mappings'->provider,'[]') ? project then raise exception 'Provider project already assigned to another workload'; end if;
      end loop;
    end loop;
  end loop;
  insert into inffyn_workloads(id,tenant_id,definition) values(p_id,p_tenant,p_definition)
    on conflict(id) do update set definition=excluded.definition returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.save_inffyn_workload(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_inffyn_workload(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.expire_inffyn_monthly_evidence() returns void
language sql security invoker set search_path=public,pg_temp as $$
  update inffyn_monthly_reports set payload=null where evidence_expires_at<=now() and payload is not null;
  delete from inffyn_monthly_reports where report_expires_at<=now();
  delete from inffyn_provider_imports where evidence_expires_at<=now();
$$;
revoke all on function public.expire_inffyn_monthly_evidence() from public,anon,authenticated;
grant execute on function public.expire_inffyn_monthly_evidence() to service_role;
