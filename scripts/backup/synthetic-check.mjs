#!/usr/bin/env node
// Explicit opt-in local integration check. Never accepts a source host or real credential.
import { mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';
import { capture, restore, verifyDownload, runPipeline, PROJECT_REF, DRIVE_FOLDER } from './core.mjs';

const args = process.argv.slice(2);
const option = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
if (!args.includes('--execute')) {
  console.log(JSON.stringify({ mode:'OFFLINE', command:'node scripts/backup/synthetic-check.mjs --execute --pg-bin ABSOLUTE_NATIVE_BIN --age-bin ABSOLUTE_AGE_BIN', actual_hosted_backup:'PENDING' }));
} else {
  const pgBin=option('--pg-bin'), ageBin=option('--age-bin');
  if (!pgBin || !ageBin || !isAbsolute(pgBin) || !isAbsolute(ageBin)) throw Error('absolute_tool_directories_required');
  const suffix=process.platform==='win32'?'.exe':'';
  const exe=name=>resolve(name.startsWith('age')?ageBin:pgBin, name+suffix);
  const directory=await mkdtemp(resolve(tmpdir(),'inffyn-synthetic-backup-'));
  const secure=resolve(directory,'secure');
  await mkdir(secure);
  const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const sourceRole='inffyn_source_operator_fixture', targetRole='inffyn_restore_operator_fixture';
  const freePort=()=>new Promise((yes,no)=>{const s=createServer();s.on('error',no);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>yes(port));});});
  const sourcePort=await freePort(),targetPort=await freePort();
  const clusters=[{data:resolve(directory,'source'),role:sourceRole,port:sourcePort},{data:resolve(directory,'target'),role:targetRole,port:targetPort}];
  const native=(name,a,config={})=>{
    // A daemon launcher must not give the server inherited pipes that keep its launcher open.
    if(name==='pg_ctl') {
      const child=spawnSync(exe(name),a,{env,shell:false,windowsHide:true,stdio:'ignore',timeout:40_000});
      if(child.error || child.status!==0) throw Error('synthetic_cluster_control_failed');
      return Promise.resolve(Buffer.alloc(0));
    }
    return runPipeline([{command:exe(name),args:a}],{env,...config});
  };
  const started=[];
  let result;
  try {
    for (const c of clusters) {
      await native('initdb',['--pgdata',c.data,'--username',c.role,'--auth=trust','--encoding=UTF8','--locale=C']);
      await native('pg_ctl',['start','--pgdata',c.data,'--log',c.data+'.log','--wait','--timeout=30','--options',`-h 127.0.0.1 -p ${c.port} -c max_connections=10 -c shared_buffers=32MB`]);
      started.push(c);
    }
    const sql=(role,port,query)=>native('psql',['-X','-q','-w','-v','ON_ERROR_STOP=1','--file=-'],{input:query,env:{...env,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:role,PGDATABASE:'postgres',PGSSLMODE:'disable'}});
    await sql(sourceRole,sourcePort,`CREATE ROLE inffyn_fixture_viewer NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA supabase_migrations; CREATE SCHEMA inffyn_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE storage.objects(id uuid PRIMARY KEY);
CREATE TABLE public.memberships(id uuid PRIMARY KEY, owner_id uuid REFERENCES auth.users(id));
CREATE TABLE public.reports(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, amount numeric NOT NULL, fingerprint text NOT NULL);
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
CREATE TABLE inffyn_private.alpha_configuration(singleton boolean PRIMARY KEY,enabled boolean NOT NULL);
CREATE TABLE inffyn_private.alpha_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
ALTER TABLE inffyn_private.alpha_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE inffyn_private.alpha_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA inffyn_private FROM PUBLIC;
CREATE FUNCTION public.fixture_increment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS 'BEGIN RETURN NEW; END';
CREATE TRIGGER fixture_trigger BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.fixture_increment();
REVOKE ALL ON FUNCTION public.fixture_increment() FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO inffyn_fixture_viewer;
GRANT SELECT ON public.reports TO inffyn_fixture_viewer;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.reports FOR SELECT TO inffyn_fixture_viewer USING (amount >= 0);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO public.memberships VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
INSERT INTO public.reports(amount,fingerprint) VALUES (25000.50,'SYNTHETIC_IMMUTABLE_REPORT');
INSERT INTO supabase_migrations.schema_migrations VALUES ('fixture_only');`);
    await sql(sourceRole,sourcePort,"INSERT INTO inffyn_private.alpha_configuration VALUES(true,true); INSERT INTO inffyn_private.alpha_users VALUES('00000000-0000-4000-8000-000000000001');");
    await sql(targetRole,targetPort,'CREATE DATABASE inffyn_restore_fixture;');
    const identity=resolve(secure,'identity.txt'),recipients=resolve(secure,'recipients.txt');
    await native('age-keygen',['--output',identity]);
    await native('age-keygen',['-y',identity],{output:recipients});
    const pgpass=resolve(secure,'dummy.pgpass'),cert=resolve(secure,'dummy.crt');
    await writeFile(pgpass,'SYNTHETIC_ONLY_NOT_A_CREDENTIAL',{mode:0o600});
    await writeFile(cert,'SYNTHETIC_ONLY_NOT_A_CERTIFICATE',{mode:0o600});
    const o={execute:true,projectRef:PROJECT_REF,host:`db.${PROJECT_REF}.supabase.co`,user:'postgres',quiesced:true,privateDirectoryConfirmed:true,
      pgpassFile:pgpass,sslRootCert:cert,recipientsFile:recipients,output:resolve(directory,'encrypted'),age:exe('age'),psql:exe('psql'),pg_dump:exe('pg_dump'),pg_dumpall:exe('pg_dumpall'),pg_restore:exe('pg_restore')};
    // Redirection exists only in this synthetic integration harness, never in the operator CLI.
    const syntheticTransport=(commands,settings)=>runPipeline(commands,{...settings,env:{...settings.env,PGHOST:'127.0.0.1',PGPORT:String(sourcePort),PGUSER:sourceRole,PGSSLMODE:'disable'}});
    const receipt=await capture(o,{run:syntheticTransport});
    const retrieved=resolve(directory,'download-fixture');
    await cp(receipt.bundle,retrieved,{recursive:true});
    await verifyDownload({execute:true,receipt:resolve(receipt.bundle,'receipt.json'),bundle:retrieved,driveFolderId:DRIVE_FOLDER,downloadedFromDrive:true});
    const restored=await restore({...o,host:'127.0.0.1',port:targetPort,user:targetRole,database:'inffyn_restore_fixture',isolatedLocal:true,identityFile:identity,receipt:resolve(receipt.bundle,'receipt.json'),bundle:retrieved});
    const evidence=await native('psql',['-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','--file=-'],{input:"SELECT amount::text || ':' || fingerprint FROM public.reports;",env:{...env,PGHOST:'127.0.0.1',PGPORT:String(targetPort),PGUSER:targetRole,PGDATABASE:'inffyn_restore_fixture',PGSSLMODE:'disable'}});
    if(evidence.toString('utf8').trim()!=='25000.50:SYNTHETIC_IMMUTABLE_REPORT') throw Error('synthetic_restored_values_differ');
    result={status:'SYNTHETIC_NATIVE_ENCRYPTION_AND_DATABASE_RESTORE_PASSED',database_restore_verified:restored.database_restore_verified,
      schema_roles_grants_rls_functions_triggers_and_rows_verified:true,private_admission_schema_and_counts_verified:true,age_roundtrip_verified:true,download_test:'LOCAL_COPY_ONLY_NOT_DRIVE',
      supabase_managed_extensions_verified:false,actual_hosted_backup:'PENDING',actual_drive_retrieval:'PENDING',release_ready:false};
  } catch(e) {
    result={status:'SYNTHETIC_INTEGRATION_FAILED',code:/^[a-z_]+$/.test(e.message)?e.message:'local_test_failed',release_ready:false};
    process.exitCode=1;
  } finally {
    let stopped=true;
    for(const c of started.reverse()) try { await native('pg_ctl',['stop','--pgdata',c.data,'--mode=fast','--wait','--timeout=30']); } catch { stopped=false; }
    if(stopped && directory.startsWith(resolve(tmpdir(),'inffyn-synthetic-backup-'))) await rm(directory,{recursive:true,force:true});
    else { result.cleanup='LOCAL_CLUSTER_STOP_FAILED_OPERATOR_REVIEW_REQUIRED'; process.exitCode=1; }
  }
  console.log(JSON.stringify(result,null,2));
}
