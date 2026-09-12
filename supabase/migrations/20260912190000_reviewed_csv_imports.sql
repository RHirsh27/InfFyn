-- Bounded originals are included in the existing encrypted database backup.
create table public.inffyn_import_sources (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 actor uuid not null references auth.users(id), month text not null, kind text not null check(kind in ('usage_csv','costs_csv','revenue_csv')),
 account text not null check(length(account) between 1 and 200), filename text not null check(length(filename)<=200),
 sha256 text not null, original bytea not null check(octet_length(original)<=2000000),
 revision bigint not null default 1, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '90 days',
 unique(tenant_id,month,kind,account,sha256), unique(tenant_id,id)
);
create table public.inffyn_import_revisions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 source_id uuid not null, revision bigint not null, rules jsonb not null, decisions jsonb not null,
 profile jsonb not null check(octet_length(profile::text)<=3500000), actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,source_id) references public.inffyn_import_sources(tenant_id,id) on delete cascade,
 unique(tenant_id,source_id,revision)
);
create table public.inffyn_import_confirmations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 source_id uuid not null, revision bigint not null, canonical_hash text not null, source_hash text not null,
 rules_hash text not null, actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '12 months',
 unique(tenant_id,source_id,revision)
);
create table public.inffyn_import_recipes (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), account text not null, kind text not null,
 schema_hash text not null, rules jsonb not null, rules_hash text not null,
 actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '12 months',
 unique(tenant_id,account,kind,rules_hash)
);
do $$ declare t text; begin
 foreach t in array array['inffyn_import_sources','inffyn_import_revisions','inffyn_import_confirmations','inffyn_import_recipes'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,delete on public.%I to service_role',t);
 end loop;
end $$;
grant update(revision) on public.inffyn_import_sources to service_role;

create function public.write_inffyn_import(p_tenant uuid,p_actor uuid,p_operation text,p_id uuid,p_expected bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s inffyn_import_sources; r inffyn_import_revisions; c inffyn_import_confirmations; recipe inffyn_import_recipes;
begin
 if not exists(select 1 from memberships where tenant_id=p_tenant and user_id=p_actor) then raise exception 'Unauthorized'; end if;
 if p_operation='create' then
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||(p_data->>'sha256'),0));
  select * into s from inffyn_import_sources where tenant_id=p_tenant and month=p_data->>'month' and kind=p_data->>'kind' and account=p_data->>'account' and sha256=p_data->>'sha256';
  if found then
   if s.expires_at<=now() then raise exception 'Source expired'; end if;
   return to_jsonb(s)-'original';
  end if;
  insert into inffyn_import_sources(tenant_id,actor,month,kind,account,filename,sha256,original)
  values(p_tenant,p_actor,p_data->>'month',p_data->>'kind',p_data->>'account',p_data->>'filename',p_data->>'sha256',decode(p_data->>'original','base64')) returning * into s;
 else
  select * into s from inffyn_import_sources where tenant_id=p_tenant and id=p_id and expires_at>now() for update;
  if not found then raise exception 'Source unavailable'; end if;
  if s.revision<>p_expected then raise exception 'Import revision changed'; end if;
 end if;
 if p_operation in ('create','revise') then
  if p_operation='revise' then update inffyn_import_sources set revision=revision+1 where tenant_id=p_tenant and id=s.id returning * into s; end if;
  insert into inffyn_import_revisions(tenant_id,source_id,revision,rules,decisions,profile,actor)
  values(p_tenant,s.id,s.revision,p_data->'rules',p_data->'decisions',p_data->'profile',p_actor);
  return to_jsonb(s)-'original';
 end if;
 select * into r from inffyn_import_revisions where tenant_id=p_tenant and source_id=s.id and revision=s.revision;
 if p_operation='confirm' then
  if (r.profile->>'ready')::boolean is distinct from true or r.profile->>'canonical_hash' is distinct from p_data->>'canonical_hash' then raise exception 'Review not ready'; end if;
  insert into inffyn_import_confirmations(tenant_id,source_id,revision,canonical_hash,source_hash,rules_hash,actor)
  values(p_tenant,s.id,s.revision,r.profile->>'canonical_hash',s.sha256,p_data->>'rules_hash',p_actor)
  on conflict(tenant_id,source_id,revision) do nothing;
  select * into c from inffyn_import_confirmations where tenant_id=p_tenant and source_id=s.id and revision=s.revision;
  return to_jsonb(c);
 elsif p_operation='recipe' then
  if not exists(select 1 from inffyn_import_confirmations where tenant_id=p_tenant and source_id=s.id and revision=s.revision) then raise exception 'Confirmation required'; end if;
  insert into inffyn_import_recipes(tenant_id,name,account,kind,schema_hash,rules,rules_hash,actor)
  values(p_tenant,p_data->>'name',s.account,s.kind,r.profile->>'schema_hash',r.rules,p_data->>'rules_hash',p_actor)
  on conflict(tenant_id,account,kind,rules_hash) do nothing;
  select * into recipe from inffyn_import_recipes where tenant_id=p_tenant and account=s.account and kind=s.kind and rules_hash=p_data->>'rules_hash';
  return to_jsonb(recipe);
 elsif p_operation='attach' then
  select * into c from inffyn_import_confirmations where tenant_id=p_tenant and id=(p_data->>'confirmation_id')::uuid and source_id=s.id and revision=s.revision;
  if not found then raise exception 'Confirmation required'; end if;
  if not exists(select 1 from jsonb_array_elements(p_data->'content'->'workloads') w where w->'reviewed_imports'->>s.kind=c.id::text and w->'audit'->>s.kind=r.profile->>'canonical_csv') then raise exception 'Confirmation mismatch'; end if;
  return save_inffyn_monthly_draft(p_tenant,p_actor,s.month,(p_data->>'draft_revision')::bigint,p_data->'content',p_data->>'definition_basis',p_data->'invalidations',least(s.expires_at,(p_data->>'evidence_expiry')::timestamptz));
 end if;
 raise exception 'Unknown import operation';
end $$;
revoke all on function public.write_inffyn_import(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.write_inffyn_import(uuid,uuid,text,uuid,bigint,jsonb) to service_role;

create or replace function public.expire_inffyn_monthly_evidence() returns void
language sql security invoker set search_path=public,pg_temp as $$
 update inffyn_monthly_reports set payload=null where evidence_expires_at<=now() and payload is not null;
 delete from inffyn_monthly_reports where report_expires_at<=now();
 delete from inffyn_provider_imports where evidence_expires_at<=now();
 delete from inffyn_monthly_drafts where evidence_expires_at<=now();
 delete from inffyn_import_sources where expires_at<=now();
 delete from inffyn_import_recipes where expires_at<=now();
 delete from inffyn_import_confirmations where expires_at<=now();
$$;
