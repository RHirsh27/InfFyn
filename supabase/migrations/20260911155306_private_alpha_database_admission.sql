-- Private-alpha database admission. Existing records and standard behavior remain intact.
-- Installs DISABLED; reviewed service-role configuration enables it before alpha intake.
begin;

create schema inffyn_private;
revoke all on schema inffyn_private from public, anon, authenticated;
grant usage on schema inffyn_private to service_role;

create table inffyn_private.alpha_configuration (
 singleton boolean primary key default true check (singleton),
 project_ref text not null default 'jmfzmoqdvweeixxwzlma'
   check (project_ref = 'jmfzmoqdvweeixxwzlma'),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into inffyn_private.alpha_configuration(singleton, enabled) values (true, false);

create table inffyn_private.alpha_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 added_at timestamptz not null default now()
);

alter table inffyn_private.alpha_configuration enable row level security;
alter table inffyn_private.alpha_configuration force row level security;
alter table inffyn_private.alpha_users enable row level security;
alter table inffyn_private.alpha_users force row level security;
revoke all on inffyn_private.alpha_configuration, inffyn_private.alpha_users from public, anon, authenticated;
grant select, insert, update, delete on inffyn_private.alpha_configuration, inffyn_private.alpha_users to service_role;

-- This no-argument predicate discloses only the verified caller's admission, never
-- configuration or another user's status. It does not grant company membership.
create function public.inffyn_alpha_user_admitted() returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((
   select case when not c.enabled then true else exists (
     select 1 from inffyn_private.alpha_users a
     join auth.users u on u.id = a.user_id
     where a.user_id = auth.uid()
       and u.email_confirmed_at is not null
       and nullif(trim(u.email), '') is not null
       and coalesce(to_jsonb(u)->>'is_anonymous', 'false') = 'false'
   ) end
   from inffyn_private.alpha_configuration c
   where c.singleton and c.project_ref = 'jmfzmoqdvweeixxwzlma'
 ), false)
$$;

-- The alpha monthly CSV flow does not use the legacy Storage bucket. A missing
-- singleton fails closed, just like enabled alpha mode, for all browser writes.
create function public.inffyn_legacy_ingest_write_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((
   select not c.enabled from inffyn_private.alpha_configuration c
   where c.singleton and c.project_ref = 'jmfzmoqdvweeixxwzlma'
 ), false)
$$;
revoke all on function public.inffyn_alpha_user_admitted(), public.inffyn_legacy_ingest_write_allowed() from public, anon, authenticated;
grant execute on function public.inffyn_alpha_user_admitted(), public.inffyn_legacy_ingest_write_allowed() to authenticated, service_role;

-- Preserve the old function signature, return value and tenant/member writes.
-- The only behavioral change is admission before any mutation in alpha mode.
create or replace function public.create_tenant(tenant_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_tenant_id uuid; caller_id uuid;
begin
 caller_id := auth.uid();
 if caller_id is null then raise exception 'Not authenticated'; end if;
 if not public.inffyn_alpha_user_admitted() then
   raise exception 'Private alpha access required' using errcode = '42501';
 end if;
 insert into public.tenants(name) values (tenant_name) returning id into new_tenant_id;
 insert into public.memberships(user_id, tenant_id, role) values(caller_id, new_tenant_id, 'owner');
 return new_tenant_id;
end
$$;

create or replace function public.ensure_inffyn_workspace(tenant_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if not public.inffyn_alpha_user_admitted() then
   raise exception 'Private alpha access required' using errcode = '42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 select tenant_id into t from public.memberships where user_id=u order by created_at,id limit 1;
 if t is not null then return t; end if;
 insert into public.tenants(name) values(left(coalesce(nullif(trim(tenant_name),''),'My workspace'),120)) returning id into t;
 insert into public.memberships(tenant_id,user_id,role) values(t,u,'owner');
 return t;
end
$$;
revoke all on function public.create_tenant(text), public.ensure_inffyn_workspace(text) from public, anon;
grant execute on function public.create_tenant(text), public.ensure_inffyn_workspace(text) to authenticated;

-- Restrictive policies AND with every existing permissive membership policy.
-- Other buckets remain governed by their own existing policies and grants.
create policy inffyn_alpha_ingest_admission on storage.objects
as restrictive for all to authenticated
using (bucket_id <> 'ingest' or (select public.inffyn_alpha_user_admitted()))
with check (bucket_id <> 'ingest' or (select public.inffyn_alpha_user_admitted()));

create policy inffyn_alpha_ingest_no_insert on storage.objects
as restrictive for insert to authenticated
with check (bucket_id <> 'ingest' or (select public.inffyn_legacy_ingest_write_allowed()));

create policy inffyn_alpha_ingest_no_update on storage.objects
as restrictive for update to authenticated
using (bucket_id <> 'ingest' or (select public.inffyn_legacy_ingest_write_allowed()))
with check (bucket_id <> 'ingest' or (select public.inffyn_legacy_ingest_write_allowed()));

create policy inffyn_alpha_ingest_no_delete on storage.objects
as restrictive for delete to authenticated
using (bucket_id <> 'ingest' or (select public.inffyn_legacy_ingest_write_allowed()));

commit;
