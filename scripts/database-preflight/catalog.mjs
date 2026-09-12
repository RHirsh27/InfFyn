// Fixed metadata-only queries. Never accept SQL from command-line input.
export const PROJECT_REF = "jmfzmoqdvweeixxwzlma";
const publicRelations =
  "n.nspname='public' and c.relkind in ('r','p','v','m') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')";
const publicFunctions =
  "n.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')";

export const CATALOG_QUERIES = Object.freeze({
  context:
    "select current_database() as database,current_setting('server_version_num') as server_version_num,current_setting('transaction_read_only') as transaction_read_only",
  roles:
    "select rolname as name,rolbypassrls as bypass_rls,rolsuper as superuser from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname",
  // Metadata only: admission UUIDs/configuration row contents never enter receipts.
  alpha_catalog: `select n.nspname as name,
    (select jsonb_agg(jsonb_build_object('role',r.rolname,'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),'create',has_schema_privilege(r.oid,n.oid,'CREATE')) order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated','service_role')) as schema_privileges,
    (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default_md5',md5(coalesce(pg_get_expr(d.adbin,d.adrelid),'')),'privileges',(select jsonb_agg(jsonb_build_object('role',r.rolname,'select',has_column_privilege(r.oid,c.oid,a.attnum,'SELECT'),'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE')) order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated'))) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(jsonb_build_array(k.conname,md5(pg_get_constraintdef(k.oid))) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
      'privileges',(select jsonb_agg(jsonb_build_object('role',r.rolname,'select',has_table_privilege(r.oid,c.oid,'SELECT'),'insert',has_table_privilege(r.oid,c.oid,'INSERT'),'update',has_table_privilege(r.oid,c.oid,'UPDATE'),'delete',has_table_privilege(r.oid,c.oid,'DELETE'),'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE')) order by r.rolname) from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
    ) order by c.relname) from pg_class c where c.relnamespace=n.oid and c.relkind in ('r','p')) as tables
    from pg_namespace n where n.nspname='inffyn_private'`,
  tables: `select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${publicRelations} order by c.relname`,
  columns: `select c.relname as table_name,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,md5(coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) as default_md5 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum where ${publicRelations} and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,
  table_privileges: `select c.relname as table_name,r.rolname as role,has_table_privilege(r.oid,c.oid,'SELECT') as can_select,has_table_privilege(r.oid,c.oid,'INSERT') as can_insert,has_table_privilege(r.oid,c.oid,'UPDATE') as can_update,has_table_privilege(r.oid,c.oid,'DELETE') as can_delete,has_table_privilege(r.oid,c.oid,'TRUNCATE') as can_truncate,has_table_privilege(r.oid,c.oid,'REFERENCES') as can_reference,has_table_privilege(r.oid,c.oid,'TRIGGER') as can_trigger from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where ${publicRelations} and r.rolname in ('anon','authenticated','service_role') order by c.relname,r.rolname`,
  column_privileges: `select c.relname as table_name,a.attname as column_name,r.rolname as role,has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') as can_select,has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') as can_insert,has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') as can_update,has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') as can_reference from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid cross join pg_roles r where ${publicRelations} and a.attnum>0 and not a.attisdropped and r.rolname in ('anon','authenticated') order by c.relname,a.attnum,r.rolname`,
  functions: `select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result,p.prosecdef as security_definer,p.provolatile as volatility,array(select split_part(s,'=',1) from unnest(coalesce(p.proconfig,array[]::text[])) s order by 1) as setting_names,md5(coalesce(p.proconfig::text,'')) as settings_md5,md5(p.prosrc) as body_md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${publicFunctions} order by p.proname,arguments`,
  function_privileges: `select p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,r.rolname as role,has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where ${publicFunctions} and r.rolname in ('anon','authenticated','service_role') order by p.proname,arguments,r.rolname`,
  policies:
    "select schemaname,tablename,policyname,permissive,roles,cmd,md5(coalesce(qual,'')) as using_md5,md5(coalesce(with_check,'')) as check_md5 from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname",
  constraints: `select c.relname as table_name,con.conname as name,con.contype as type,md5(pg_get_constraintdef(con.oid)) as definition_md5 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where ${publicRelations} order by c.relname,con.conname`,
  indexes:
    "select tablename as table_name,indexname as name,md5(indexdef) as definition_md5 from pg_indexes where schemaname='public' order by tablename,indexname",
  triggers:
    "select n.nspname as schema_name,c.relname as table_name,t.tgname as name,t.tgenabled as enabled,md5(pg_get_triggerdef(t.oid)) as definition_md5 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and t.tgname='on_auth_user_created')) order by n.nspname,c.relname,t.tgname",
  sequences:
    "select c.relname as name,r.rolname as role,has_sequence_privilege(r.oid,c.oid,'SELECT') as can_select,has_sequence_privilege(r.oid,c.oid,'USAGE') as can_use,has_sequence_privilege(r.oid,c.oid,'UPDATE') as can_update from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where n.nspname='public' and c.relkind='S' and r.rolname in ('anon','authenticated','service_role') order by c.relname,r.rolname",
});

export const LEDGER_PROBE =
  "select to_regclass('supabase_migrations.schema_migrations') is not null as ledger_exists,coalesce((select relkind='r' from pg_class where oid=to_regclass('supabase_migrations.schema_migrations')),false) as ledger_base_table,case when to_regclass('supabase_migrations.schema_migrations') is not null then has_table_privilege(current_user,to_regclass('supabase_migrations.schema_migrations'),'SELECT') else false end as ledger_readable";
// Inspect only version/name and SQL fingerprints. Never return migration SQL,
// customer rows, stored credentials, function bodies, or policy expressions.
export const LEDGER_QUERY =
  "select to_jsonb(m)->>'version' as version,to_jsonb(m)->>'name' as name,case when jsonb_typeof(to_jsonb(m)->'statements')='array' then jsonb_array_length(to_jsonb(m)->'statements') else 0 end as statement_count,case when jsonb_typeof(to_jsonb(m)->'statements')='array' then (select md5(string_agg(value,E'\\n' order by ordinality)) from jsonb_array_elements_text(to_jsonb(m)->'statements') with ordinality) else null end as statements_md5 from supabase_migrations.schema_migrations m order by to_jsonb(m)->>'version'";

const ALLOWED = new Set([
  ...Object.values(CATALOG_QUERIES),
  LEDGER_PROBE,
  LEDGER_QUERY,
]);
export function readOnlyBatch(queries) {
  for (const [section, sql] of Object.entries(queries)) {
    if (!/^[a-z_]+$/.test(section) || !ALLOWED.has(sql))
      throw new Error("Only fixed catalog queries are allowed.");
  }
  return [
    "BEGIN READ ONLY;",
    "SET LOCAL search_path=pg_catalog;",
    "SET LOCAL statement_timeout='10s';",
    "SET LOCAL lock_timeout='2s';",
    "SET LOCAL idle_in_transaction_session_timeout='15s';",
    ...Object.entries(queries).map(
      ([section, sql]) =>
        `SELECT jsonb_build_object('section','${section}','rows',coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb)) FROM (${sql}) q;`,
    ),
    "ROLLBACK;",
  ].join("\n");
}
