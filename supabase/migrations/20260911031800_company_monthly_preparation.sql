-- Monthly preparation is tenant-owned, durable, revision-checked and expires with evidence.
create table public.inffyn_monthly_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  revision bigint not null check(revision > 0),
  content jsonb not null check(octet_length(content::text) <= 4000000),
  definition_basis text not null,
  invalidations jsonb not null default '[]',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  evidence_expires_at timestamptz not null default now()+interval '90 days',
  unique(tenant_id,month)
);
alter table public.inffyn_monthly_drafts enable row level security;
alter table public.inffyn_monthly_drafts force row level security;
revoke all on public.inffyn_monthly_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.inffyn_monthly_drafts to service_role;

create function public.save_inffyn_monthly_draft(
  p_tenant uuid,p_actor uuid,p_month text,p_expected bigint,p_content jsonb,
  p_definition_basis text,p_invalidations jsonb,p_evidence_expiry timestamptz
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous public.inffyn_monthly_drafts; result public.inffyn_monthly_drafts; expiry timestamptz;
begin
  if not exists(select 1 from memberships where tenant_id=p_tenant and user_id=p_actor) then raise exception 'Unauthorized'; end if;
  if p_expected < 0 or p_content->>'month' is distinct from p_month or p_evidence_expiry <= now() then raise exception 'Invalid draft'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_month||'draft',0));
  delete from inffyn_monthly_drafts where tenant_id=p_tenant and month=p_month and evidence_expires_at<=now();
  select * into previous from inffyn_monthly_drafts where tenant_id=p_tenant and month=p_month;
  if coalesce(previous.revision,0) <> p_expected then raise exception 'Draft revision changed'; end if;
  expiry := least(p_evidence_expiry,coalesce(previous.evidence_expires_at,now()+interval '90 days'),now()+interval '90 days');
  insert into inffyn_monthly_drafts(tenant_id,month,revision,content,definition_basis,invalidations,updated_by,evidence_expires_at)
    values(p_tenant,p_month,p_expected+1,p_content,p_definition_basis,p_invalidations,p_actor,expiry)
    on conflict(tenant_id,month) do update set revision=excluded.revision,content=excluded.content,
      definition_basis=excluded.definition_basis,invalidations=excluded.invalidations,updated_by=excluded.updated_by,
      evidence_expires_at=excluded.evidence_expires_at,updated_at=now()
    returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.save_inffyn_monthly_draft(uuid,uuid,text,bigint,jsonb,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_inffyn_monthly_draft(uuid,uuid,text,bigint,jsonb,text,jsonb,timestamptz) to service_role;

create or replace function public.expire_inffyn_monthly_evidence() returns void
language sql security invoker set search_path=public,pg_temp as $$
  update inffyn_monthly_reports set payload=null where evidence_expires_at<=now() and payload is not null;
  delete from inffyn_monthly_reports where report_expires_at<=now();
  delete from inffyn_provider_imports where evidence_expires_at<=now();
  delete from inffyn_monthly_drafts where evidence_expires_at<=now();
$$;
revoke all on function public.expire_inffyn_monthly_evidence() from public,anon,authenticated;
grant execute on function public.expire_inffyn_monthly_evidence() to service_role;
