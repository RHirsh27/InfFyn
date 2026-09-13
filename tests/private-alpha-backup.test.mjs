import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { capture, childEnvironment, DRIVE_FOLDER, plan, preparedBootstrapRoles, PROJECT_REF, restore, retentionCandidates, runPipeline, supportFile, validateRestore, validateSource, verifyArchives, verifyDownload } from '../scripts/backup/core.mjs';

const source = { projectRef: PROJECT_REF, host: `db.${PROJECT_REF}.supabase.co`, user: 'postgres' };
const local = { host: '127.0.0.1', port: 55432, database: 'inffyn_restore_fixture', user: 'inffyn_restore_operator_test', isolatedLocal: true };
const tables = [{ schema: 'auth', name: 'users', owner: 'auth_admin', rls: true }, { schema: 'storage', name: 'objects', owner: 'storage_admin', rls: true }, { schema: 'public', name: 'memberships', owner: 'postgres', rls: true }];
const counts = { 'auth.users': 2, 'public.memberships': 2, 'storage.objects': 0 };

test('source bootstrap preparation retains role attributes and original grantor', () => {
  const input = 'CREATE ROLE supabase_admin;\nALTER ROLE supabase_admin WITH SUPERUSER LOGIN;\nCREATE ROLE anon;\nGRANT anon TO authenticator WITH INHERIT FALSE GRANTED BY supabase_admin;\n';
  const output = preparedBootstrapRoles(input, 'supabase_admin');
  assert.ok(!output.includes('CREATE ROLE supabase_admin;'));
  assert.ok(output.includes('ALTER ROLE supabase_admin WITH SUPERUSER LOGIN;'));
  assert.ok(output.includes('GRANTED BY supabase_admin;'));
  assert.ok(output.includes('CREATE ROLE anon;'));
  for (const bad of [input + 'CREATE ROLE supabase_admin;\n', input.replace('CREATE ROLE supabase_admin;', ''), input.replace('ALTER ROLE supabase_admin WITH SUPERUSER LOGIN;', '')]) assert.throws(() => preparedBootstrapRoles(bad, 'supabase_admin'));
  assert.throws(() => validateRestore({...local,sourceBootstrapRole:'unverified'}));
  assert.throws(() => validateRestore({...local,sourceDatabaseOwner:'postgres'}));
  assert.throws(() => validateRestore({...local,sourceBootstrapRole:'supabase_admin',sourceDatabaseOwner:'other'}));
  validateRestore({...local,sourceBootstrapRole:'supabase_admin',sourceDatabaseOwner:'postgres'});
});

async function fixture(t) {
  const dir = await mkdtemp(resolve(tmpdir(), 'inffyn-backup-tests-'));
  t.after(async () => { // A fixed task-owned temporary root; never remove a computed external backup directory.
    assert.ok(dir.startsWith(resolve(tmpdir(), 'inffyn-backup-tests-')));
    await rm(dir, { recursive: true, force: true });
  });
  const secure = resolve(dir, 'secure');
  await mkdir(secure);
  const o = { ...source, execute: true, quiesced: true, privateDirectoryConfirmed: true, output: resolve(dir, 'encrypted'),
    pgpassFile: resolve(secure, 'fixture.pgpass'), sslRootCert: resolve(secure, 'fixture.crt'), recipientsFile: resolve(secure, 'recipients.txt'), identityFile: resolve(secure, 'identity.txt') };
  for (const file of [o.pgpassFile,o.sslRootCert,o.recipientsFile,o.identityFile]) await writeFile(file, 'SYNTHETIC_SUPPORT_FILE_ONLY', { mode: 0o600 });
  return { dir, o };
}

function fakeRunner({ failAt, changed = false, emptyTarget = true } = {}) {
  const calls = [];
  let inventoryReads = 0;
  const run = async (commands, config = {}) => {
    calls.push({ commands, ...config });
    if (failAt && commands.some(c => c.command === failAt)) throw Error('SENSITIVE_NATIVE_ERROR');
    if (config.output) {
      const payload = config.input ? String(config.input) : `SYNTHETIC_PROCESS_FIXTURE_${commands[0].command}`;
      await writeFile(config.output, payload, { flag: 'wx' });
      return Buffer.alloc(0);
    }
    if (commands.length === 1 && commands[0].command === 'age') return readFile(commands[0].args.at(-1));
    if (typeof config.input === 'string' && config.input.includes("'tables'")) {
      inventoryReads++;
      return Buffer.from(JSON.stringify({ tables }));
    }
    if (typeof config.input === 'string' && config.input.includes('json_object_agg')) return Buffer.from(JSON.stringify({ ...counts, ...(changed && inventoryReads > 1 ? { 'auth.users': 3 } : {}) }));
    if (typeof config.input === 'string' && config.input.includes('c.relkind IN')) return Buffer.from(emptyTarget ? '0\n' : '3\n');
    return Buffer.alloc(0);
  };
  return { run, calls };
}

test('default capture, download, and restore are offline with every operation pending', async () => {
  const run = () => { throw Error('must not execute'); };
  for (const result of [plan(), await capture({}, {run}), await restore({}, {run}), await verifyDownload({})]) {
    assert.equal(result.mode, 'OFFLINE_PLAN_NO_NETWORK');
    assert.equal(result.release_ready, false);
    assert.equal(result.actual_backup, 'PENDING');
  }
});

test('source pinned to project, direct host or project-qualified session pooler', () => {
  assert.equal(validateSource(source), source);
  validateSource({ ...source, host: 'aws-0-us-east-1.pooler.supabase.com', user: `postgres.${PROJECT_REF}` });
  for (const bad of [{projectRef:'wrong'}, {host:'evil.example'}, {host:`db.${PROJECT_REF}.supabase.com.evil`}, {port:6543}, {user:'postgres password=secret'}, {host:'aws-0-us-east-1.pooler.supabase.com',user:'postgres.wrong'}]) assert.throws(() => validateSource({...source,...bad}));
});

test('restore rejects hosted destinations, default DBs, ordinary roles, and missing attestation', () => {
  validateRestore(local);
  for (const bad of [{host:'localhost'}, {host:source.host}, {host:'127.0.0.1.evil'}, {database:'postgres'}, {database:'inffyn_restore_x;drop'}, {user:'postgres'}, {isolatedLocal:false}, {port:65536}]) assert.throws(() => validateRestore({...local,...bad}));
});

test('libpq environment is sanitized and read-only source uses verify-full', () => {
  const env = childEnvironment({...source,pgpassFile:'outside',sslRootCert:'trusted'}, true, {PATH:'tools',PGPASSWORD:'must not escape',PGHOSTADDR:'evil',PGSERVICE:'evil',AGE_PLUGIN_PATH:'evil',PGOPTIONS:'evil',HOME:'secret-home'});
  assert.equal(env.PGSSLMODE,'verify-full');
  assert.match(env.PGOPTIONS,/read_only=on/);
  assert.equal(env.PGDATABASE,'postgres');
  for (const k of ['PGPASSWORD','PGHOSTADDR','PGSERVICE','AGE_PLUGIN_PATH','HOME']) assert.equal(env[k],undefined);
  assert.equal(childEnvironment(local,false,{}).PGSSLMODE,'disable');
});

test('support files cannot live inside repo, backup output, or shared paths', async t => {
  const {o,dir}=await fixture(t);
  await supportFile(o.pgpassFile);
  await assert.rejects(supportFile(resolve('package.json')),/outside_repository/);
  await assert.rejects(supportFile(o.pgpassFile,[resolve(dir,'secure')]),/outside_repository/);
  await assert.rejects(supportFile('relative.pgpass'),/absolute_support/);
});

test('support exclusion resolves directory aliases and not-yet-created output boundaries', async t => {
  const {o,dir}=await fixture(t);
  const alias=resolve(dir,'secure-alias');
  await symlink(resolve(dir,'secure'),alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(supportFile(o.pgpassFile,[alias]),/outside_repository/);
  await assert.rejects(supportFile(resolve(alias,'fixture.pgpass'),[resolve(dir,'secure')]),/outside_repository/);
  await supportFile(o.pgpassFile,[resolve(alias,'future-output')]);
});

test('capture emits only three encrypted-archive slots, preserves roles/owners and keeps recovery pending', async t => {
  const {o}=await fixture(t);
  const f=fakeRunner();
  const receipt=await capture(o,{run:f.run,now:()=>new Date('2026-09-11T01:00:00Z')});
  assert.equal(receipt.status,'ENCRYPTED_LOCAL_CAPTURE_RECOVERY_PENDING');
  assert.equal(receipt.restore_verified,false);
  assert.equal(receipt.drive_retrieval_verified,false);
  assert.equal(Object.keys(receipt.archives).length,3);
  assert.ok(receipt.upload_only.every(n=>n.endsWith('.age')));
  assert.equal((await readdir(receipt.bundle)).filter(n=>!n.endsWith('.age')).join(),'receipt.json');
  const dump=f.calls.find(c=>c.commands[0].command==='pg_dump');
  assert.deepEqual(dump.commands[0].args,['--format=custom','--no-password','--lock-wait-timeout=10000']);
  assert.ok(!dump.commands[0].args.some(a=>/no-owner|no-acl|exclude|schema=/.test(a)));
  assert.ok(f.calls.find(c=>c.commands[0].command==='pg_dumpall').commands[0].args.includes('--no-role-passwords'));
  await verifyArchives(resolve(receipt.bundle,'receipt.json'),receipt.bundle);
});

test('failed capture retains last good bundle and incomplete ciphertext, never creates success receipt', async t => {
  const {o}=await fixture(t);
  const good=await capture(o,{run:fakeRunner().run});
  await assert.rejects(capture(o,{run:fakeRunner({failAt:'pg_dump'}).run}));
  assert.equal((await readdir(good.bundle)).length,4);
  const incomplete=(await readdir(o.output)).find(n=>n.endsWith('.incomplete'));
  assert.ok(incomplete);
  assert.ok(!(await readdir(resolve(o.output,incomplete))).includes('receipt.json'));
});

test('capture fails if source changes, and requires explicitly paused writes', async t => {
  const {o}=await fixture(t);
  await assert.rejects(capture({...o,quiesced:false}),/pause_writes/);
  await assert.rejects(capture(o,{run:fakeRunner({changed:true}).run}),/source_changed/);
});

test('download verification requires separate folder, target attestation, and all matching hashes', async t => {
  const {o,dir}=await fixture(t);
  const good=await capture(o,{run:fakeRunner().run});
  const options={execute:true,receipt:resolve(good.bundle,'receipt.json'),bundle:good.bundle,driveFolderId:DRIVE_FOLDER,downloadedFromDrive:true};
  await assert.rejects(verifyDownload(options),/independent_download/);
  const retrieved=resolve(dir,'retrieved');
  await cp(good.bundle,retrieved,{recursive:true});
  await assert.rejects(verifyDownload({...options,bundle:retrieved,driveFolderId:'wrong'}),/designated_drive/);
  const result=await verifyDownload({...options,bundle:retrieved});
  assert.equal(result.remote_origin,'operator_attested_not_api_verified');
  await writeFile(resolve(retrieved,'database.dump.age'),'CORRUPTED');
  await assert.rejects(verifyArchives(options.receipt,retrieved),/hash_mismatch/);
});

test('restore requires empty loopback DB and retrieval evidence; preserves ACL and owners', async t => {
  const {o,dir}=await fixture(t);
  const good=await capture(o,{run:fakeRunner().run});
  const retrieved=resolve(dir,'retrieved');
  await cp(good.bundle,retrieved,{recursive:true});
  const options={...o,...local,bundle:retrieved,receipt:resolve(good.bundle,'receipt.json')};
  await assert.rejects(restore(options,{run:fakeRunner().run}));
  await verifyDownload({...options,driveFolderId:DRIVE_FOLDER,downloadedFromDrive:true});
  await assert.rejects(restore(options,{run:fakeRunner({emptyTarget:false}).run}),/must_be_empty/);
  const f=fakeRunner();
  const result=await restore(options,{run:f.run});
  assert.equal(result.database_restore_verified,true);
  assert.equal(result.release_ready,false);
  const args=f.calls.find(c=>c.commands.some(x=>x.command==='pg_restore')).commands[1].args;
  assert.ok(args.includes('--exit-on-error')&&args.includes('--single-transaction'));
  assert.ok(!args.some(a=>/clean|no-owner|no-acl/.test(a)));
});

test('retention only reports older verified backups and always retains latest good copy', () => {
  const receipt=(id,created,verified=true)=>({project_ref:PROJECT_REF,backup_id:id,created_at:created,restore_verified:verified});
  const r=retentionCandidates([receipt('latest','2026-08-30'),receipt('old','2026-08-29'),receipt('unverified','2026-08-01',false),{...receipt('wrong','2026-08-01'),project_ref:'wrong'}],new Date('2026-09-11'));
  assert.equal(r.action,'REPORT_ONLY_NO_DELETIONS');
  assert.equal(r.keep_latest_verified,'latest');
  assert.deepEqual(r.candidates,['old']);
});

test('native pipeline propagates upstream failure even if downstream succeeds, and suppresses stderr', async t => {
  const {dir}=await fixture(t);
  const commands=[{command:process.execPath,args:['-e','process.stdout.write("partial");process.stderr.write("SECRET_NATIVE_ERROR");process.exitCode=9']},
    {command:process.execPath,args:['-e','process.stdin.pipe(process.stdout)']}];
  await assert.rejects(runPipeline(commands,{output:resolve(dir,'partial.age')}),e=>e.message==='backup_pipeline_failed_no_receipt'&&!e.message.includes('SECRET'));
});

test('native pipeline streams binary bytes exactly and does not overwrite existing output', async t => {
  const {dir}=await fixture(t);
  const commands=[{command:process.execPath,args:['-e','process.stdin.pipe(process.stdout)']}];
  const output=resolve(dir,'fixture.age');
  const payload=Buffer.from([0,255,1,128,13,10]);
  await runPipeline(commands,{input:payload,output});
  assert.deepEqual(await readFile(output),payload);
  await assert.rejects(runPipeline(commands,{input:'overwrite',output}),/pipeline_failed/);
  assert.deepEqual(await readFile(output),payload);
});

test('native spawn options never invoke a shell and child errors become fixed codes', async () => {
  let settings;
  const spawnProcess=(_command,_args,opts)=>{
    settings=opts;
    const child=new EventEmitter();
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.kill=()=>{child.stdout.end();child.emit('close',1);};
    queueMicrotask(()=>child.emit('error',new Error('SECRET')));
    return child;
  };
  await assert.rejects(runPipeline([{command:'missing',args:[]}],{spawnProcess}),/pipeline_failed/);
  assert.equal(settings.shell,false);
  assert.equal(settings.windowsHide,true);
});
