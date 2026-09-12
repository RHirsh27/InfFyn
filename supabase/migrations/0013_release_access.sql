-- Reviewed additive release: invitation access, atomic provisioning and quotas.
begin;
create table public.inffyn_access_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.inffyn_invitations (
 id uuid primary key default gen_random_uuid(),
 email text not null check(email=lower(trim(email))),
 company_name text not null check(length(trim(company_name)) between 1 and 120),
 token_hash text not null unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 redeemed_at timestamptz,
 redeemed_by uuid references auth.users(id),
 revoked_at timestamptz,
 tenant_id uuid references public.tenants(id) on delete cascade
);
create table public.inffyn_access_grants (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 invitation_id uuid not null unique references public.inffyn_invitations(id),
 granted_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id)
);
create table public.inffyn_access_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 invitation_id uuid references public.inffyn_invitations(id) on delete set null,
 action text not null check(action in ('issued','redeemed','revoked')),
 created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['inffyn_access_admins','inffyn_invitations','inffyn_access_grants','inffyn_access_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.inffyn_access_events_id_seq to service_role;

create function public.issue_inffyn_invitation(p_actor uuid,p_email text,p_company text,p_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if not exists(select 1 from public.inffyn_access_admins where user_id=p_actor) then raise exception 'Access administrator required'; end if;
 insert into public.inffyn_invitations(email,company_name,token_hash,created_by)
 values(lower(trim(p_email)),trim(p_company),p_hash,p_actor) returning id into i;
 insert into public.inffyn_access_events(actor_id,invitation_id,action) values(p_actor,i,'issued');
 return i;
end $$;

create function public.redeem_inffyn_invitation(p_user uuid,p_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.inffyn_invitations; t uuid; user_email text;
begin
 select lower(email) into user_email from auth.users where id=p_user and email_confirmed_at is not null;
 if user_email is null then raise exception 'Verified email required'; end if;
 select * into i from public.inffyn_invitations where token_hash=p_hash for update;
 if not found or i.revoked_at is not null or i.expires_at<=now() or i.email<>user_email then
  raise exception 'Invitation unavailable';
 end if;
 if i.redeemed_at is not null then
  if i.redeemed_by=p_user then return i.tenant_id; end if;
  raise exception 'Invitation unavailable';
 end if;
 -- Same lock as first-sign-in provisioning prevents overlapping workspace creation.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 insert into public.tenants(name) values(i.company_name) returning id into t;
 insert into public.memberships(tenant_id,user_id,role) values(t,p_user,'owner');
 insert into public.inffyn_access_grants(tenant_id,invitation_id,granted_by) values(t,i.id,i.created_by);
 update public.inffyn_invitations set redeemed_at=now(),redeemed_by=p_user,tenant_id=t where id=i.id;
 insert into public.inffyn_access_events(actor_id,invitation_id,action) values(p_user,i.id,'redeemed');
 return t;
end $$;

create function public.revoke_inffyn_invitation(p_actor uuid,p_invitation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.inffyn_access_admins where user_id=p_actor) then raise exception 'Access administrator required'; end if;
 update public.inffyn_invitations set revoked_at=now() where id=p_invitation and revoked_at is null;
 if not found then return false; end if;
 update public.inffyn_access_grants set revoked_at=now(),revoked_by=p_actor where invitation_id=p_invitation and revoked_at is null;
 insert into public.inffyn_access_events(actor_id,invitation_id,action) values(p_actor,p_invitation,'revoked');
 return true;
end $$;

create function public.ensure_inffyn_workspace(tenant_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select tenant_id into t from public.memberships where user_id=u order by created_at,id limit 1;
 if t is not null then return t; end if;
 insert into public.tenants(name) values(left(coalesce(nullif(trim(tenant_name),''),'My workspace'),120)) returning id into t;
 insert into public.memberships(tenant_id,user_id,role) values(t,u,'owner');
 return t;
end $$;

create function public.consume_inffyn_quota(p_bucket text,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_limit<1 or p_limit>10000 or length(p_bucket)>200 then raise exception 'Invalid quota'; end if;
 insert into public.audit_preview_limits(bucket,requests,expires_at) values(p_bucket,1,now()+interval '1 hour')
 on conflict(bucket) do update set
 requests=case when audit_preview_limits.expires_at<=now() then 1 else audit_preview_limits.requests+1 end,
 expires_at=case when audit_preview_limits.expires_at<=now() then now()+interval '1 hour' else audit_preview_limits.expires_at end
 returning requests into n;
 return n<=p_limit;
end $$;
revoke all on function public.issue_inffyn_invitation(uuid,text,text,text),public.redeem_inffyn_invitation(uuid,text),public.revoke_inffyn_invitation(uuid,uuid),public.consume_inffyn_quota(text,integer) from public,anon,authenticated;
grant execute on function public.issue_inffyn_invitation(uuid,text,text,text),public.redeem_inffyn_invitation(uuid,text),public.revoke_inffyn_invitation(uuid,uuid),public.consume_inffyn_quota(text,integer) to service_role;
revoke all on function public.ensure_inffyn_workspace(text) from public,anon;
grant execute on function public.ensure_inffyn_workspace(text) to authenticated;
commit;
