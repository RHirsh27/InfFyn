-- Operator-only proof against the existing InfFyn database. No migrations.
-- Every synthetic insert and retention deletion is rolled back together.
-- Run with psql -X -q -A -t -w -v ON_ERROR_STOP=1 --file=... over verify-full TLS.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
set local search_path=public,pg_temp;
create temporary table inffyn_retention_probe(actor uuid, tenant_a uuid, tenant_b uuid, source_id uuid);
insert into inffyn_retention_probe
select id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from auth.users where lower(email)='ryan@inffyn.xyz' and email_confirmed_at is not null and not is_anonymous;
do $$ begin
  if (select count(*) from inffyn_retention_probe)<>1 then raise exception 'Verified operator required'; end if;
end $$;
insert into tenants(id,name)
select tenant_a,'InfFyn synthetic rollback retention A' from inffyn_retention_probe
union all select tenant_b,'InfFyn synthetic rollback retention B' from inffyn_retention_probe;
insert into memberships(tenant_id,user_id,role) select tenant_a,actor,'owner' from inffyn_retention_probe;
insert into inffyn_monthly_reports(tenant_id,created_by,month,fingerprint,payload,result,evidence_expires_at,report_expires_at)
select tenant_a,actor,'2026-08',label,'{"synthetic":true}', '{"known_cost":"12000.00","synthetic":true}',
  case when label='unexpired' then now()+interval '1 day' else now()-interval '1 second' end,
  case when label='report-expired' then now()-interval '1 second' else now()+interval '1 day' end
from inffyn_retention_probe cross join (values('raw-expired'),('report-expired'),('unexpired')) labels(label);
insert into inffyn_monthly_drafts(tenant_id,month,revision,content,definition_basis,updated_by,evidence_expires_at)
select tenant_a,'2026-08',1,'{"synthetic":true}','synthetic',actor,now()-interval '1 second' from inffyn_retention_probe;
insert into inffyn_import_sources(id,tenant_id,actor,month,kind,account,filename,sha256,original,expires_at)
select source_id,tenant_a,actor,'2026-08','costs_csv','synthetic','fixture.csv',repeat('a',64),decode('0001','hex'),now()-interval '1 second' from inffyn_retention_probe;
insert into inffyn_import_revisions(tenant_id,source_id,revision,rules,decisions,profile,actor)
select tenant_a,source_id,1,'{}','[]','{"synthetic":true}',actor from inffyn_retention_probe;
insert into inffyn_import_confirmations(tenant_id,source_id,revision,canonical_hash,source_hash,rules_hash,actor)
select tenant_a,source_id,1,repeat('b',64),repeat('a',64),repeat('c',64),actor from inffyn_retention_probe;
grant select on inffyn_retention_probe to service_role;
set local role service_role;
do $$ declare p record; t text; denied boolean; begin
  select * into strict p from inffyn_retention_probe;
  foreach t in array array['inffyn_monthly_reports','inffyn_monthly_drafts','inffyn_import_sources','inffyn_import_revisions','inffyn_import_confirmations'] loop
    if has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Unexpected direct browser grant'; end if;
  end loop;
  denied:=false;
  begin
    perform save_inffyn_monthly_draft(p.tenant_b,p.actor,'2026-08',0,'{}','synthetic','[]',now()+interval '1 day');
  exception when raise_exception then
    if sqlerrm<>'Unauthorized' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'Cross-company draft write accepted'; end if;
  denied:=false;
  begin
    update inffyn_monthly_reports set result='{"tampered":true}' where tenant_id=p.tenant_a and fingerprint='unexpired';
  exception when raise_exception then
    if sqlerrm<>'Monthly report versions are immutable' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'Report mutation accepted'; end if;
  perform expire_inffyn_monthly_evidence();
  if (select count(*) from inffyn_monthly_reports where tenant_id=p.tenant_a)<>2 then raise exception 'Wrong report retention count'; end if;
  if exists(select 1 from inffyn_monthly_reports where tenant_id=p.tenant_a and fingerprint='raw-expired' and payload is not null) then raise exception 'Expired raw evidence retained'; end if;
  if not exists(select 1 from inffyn_monthly_reports where tenant_id=p.tenant_a and fingerprint='unexpired' and payload is not null and result->>'known_cost'='12000.00') then raise exception 'Unexpired report changed'; end if;
  if not exists(select 1 from inffyn_monthly_reports where tenant_id=p.tenant_a and fingerprint='raw-expired' and result->>'known_cost'='12000.00') then raise exception 'Immutable summary changed'; end if;
  if exists(select 1 from inffyn_monthly_drafts where tenant_id=p.tenant_a) then raise exception 'Expired draft retained'; end if;
  if exists(select 1 from inffyn_import_sources where tenant_id=p.tenant_a) or exists(select 1 from inffyn_import_revisions where tenant_id=p.tenant_a) then raise exception 'Expired source or revisions retained'; end if;
  if not exists(select 1 from inffyn_import_confirmations where tenant_id=p.tenant_a and source_id=p.source_id) then raise exception 'Unexpired lineage erased'; end if;
  perform expire_inffyn_monthly_evidence();
  if (select count(*) from inffyn_monthly_reports where tenant_id=p.tenant_a)<>2 then raise exception 'Retention retry was not idempotent'; end if;
end $$;
select '{"status":"DATABASE_ASSERTIONS_PASSED","checks":["browser_grants","cross_company_rpc","immutable_reports","expired_raw_evidence","report_expiry","unexpired_evidence","expired_draft","expired_source_and_revisions","retained_lineage","idempotent_sweep"],"authenticated_http_acceptance":false}'::json;
rollback;
