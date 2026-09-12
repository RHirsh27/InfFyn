import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { localMigrations } from '../scripts/database-preflight/manifest.mjs';
import { CATALOG_QUERIES, PROJECT_REF } from '../scripts/database-preflight/catalog.mjs';
import { compareInventory } from '../scripts/database-preflight/compare.mjs';

const ALLOWED='11111111-1111-4111-8111-111111111111';
const EXCLUDED='22222222-2222-4222-8222-222222222222';
const ADMIN='33333333-3333-4333-8333-333333333333';
const UNCONFIRMED='44444444-4444-4444-8444-444444444444';
const ANONYMOUS='55555555-5555-4555-8555-555555555555';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OLD_OBJECT='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function database(t) {
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key,name text,bucket_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for(const m of await localMigrations()) await db.exec(m.sql);
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
    ('${ALLOWED}','allowed@fixture.invalid',now(),false),('${EXCLUDED}','excluded@fixture.invalid',now(),false),
    ('${ADMIN}','admin@fixture.invalid',now(),false),('${UNCONFIRMED}','unconfirmed@fixture.invalid',null,false),
    ('${ANONYMOUS}','anonymous@fixture.invalid',now(),true);
    insert into public.tenants(id,name) values ('${A}','Fixture A'),('${B}','Fixture B');
    insert into public.memberships(user_id,tenant_id,role) values('${ALLOWED}','${A}','owner'),('${EXCLUDED}','${B}','owner');
    insert into public.inffyn_access_admins(user_id) values('${ADMIN}');
    insert into storage.objects(id,name,bucket_id) values('${OLD_OBJECT}','${A}/existing.csv','ingest');`);
  return db;
}

async function asUser(db,id,query,parameters=[]) {
  await db.exec('begin; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
    const result=await db.query(query,parameters);
    await db.exec('commit');
    return result;
  } catch(e) { await db.exec('rollback'); throw e; }
}
async function enable(db,ids=[ALLOWED]) {
  for(const id of ids) await db.query('insert into inffyn_private.alpha_users(user_id) values($1)',[id]);
  await db.exec('update inffyn_private.alpha_configuration set enabled=true,updated_at=now()');
}

test('migration installs explicit disabled state and preserves ordinary provisioning/storage behavior',async t=>{
  const db=await database(t);
  assert.equal((await db.query('select enabled from inffyn_private.alpha_configuration')).rows[0].enabled,false);
  const ensured=await asUser(db,EXCLUDED,"select public.ensure_inffyn_workspace('ignored') id");
  assert.equal(ensured.rows[0].id,B);
  const created=await asUser(db,ADMIN,"select public.create_tenant('standard fixture') id");
  assert.ok(created.rows[0].id);
  await asUser(db,EXCLUDED,"insert into storage.objects(id,name,bucket_id) values($1,$2,'ingest')",['dddddddd-dddd-4ddd-8ddd-dddddddddddd',`${B}/standard.csv`]);
  assert.equal((await asUser(db,EXCLUDED,"select id from storage.objects where name=$1",[`${B}/standard.csv`])).rows.length,1);
});

test('enabled alpha rejects excluded direct RPC calls without creating tenants or memberships',async t=>{
  const db=await database(t); await enable(db);
  const before=await db.query('select (select count(*) from public.tenants) tenants,(select count(*) from public.memberships) memberships');
  for(const user of [EXCLUDED,ADMIN]) for(const rpc of ['create_tenant','ensure_inffyn_workspace']) await assert.rejects(asUser(db,user,`select public.${rpc}('forbidden')`),e=>e.code==='42501');
  assert.deepEqual((await db.query('select (select count(*) from public.tenants) tenants,(select count(*) from public.memberships) memberships')).rows,before.rows);
});

test('allowlisted verified owner can provision and ensure remains idempotent',async t=>{
  const db=await database(t); await enable(db,[ALLOWED,ADMIN]);
  assert.equal((await asUser(db,ALLOWED,"select public.ensure_inffyn_workspace('existing') id")).rows[0].id,A);
  const first=(await asUser(db,ADMIN,"select public.ensure_inffyn_workspace('new alpha company') id")).rows[0].id;
  const second=(await asUser(db,ADMIN,"select public.ensure_inffyn_workspace('different name') id")).rows[0].id;
  assert.equal(first,second);
  assert.equal((await db.query('select count(*) n from public.memberships where user_id=$1',[ADMIN])).rows[0].n,1);
});

test('database allowlist does not confer membership or administrator access to another company',async t=>{
  const db=await database(t); await enable(db,[ALLOWED,ADMIN]);
  assert.equal((await asUser(db,ADMIN,'select * from public.tenants where id=$1',[A])).rows.length,0);
  assert.equal((await asUser(db,ADMIN,'select * from storage.objects where id=$1',[OLD_OBJECT])).rows.length,0);
  assert.equal((await asUser(db,ALLOWED,'select * from public.tenants where id=$1',[B])).rows.length,0);
  assert.equal((await asUser(db,ALLOWED,'select * from storage.objects where id=$1',[OLD_OBJECT])).rows.length,1);
});

test('empty list, missing singleton, unconfirmed and anonymous identities fail closed',async t=>{
  const db=await database(t); await enable(db,[]);
  await assert.rejects(asUser(db,ALLOWED,"select public.create_tenant('blocked')"),e=>e.code==='42501');
  await db.exec(`insert into inffyn_private.alpha_users(user_id) values('${UNCONFIRMED}'),('${ANONYMOUS}'),('${ALLOWED}')`);
  for(const id of [UNCONFIRMED,ANONYMOUS]) await assert.rejects(asUser(db,id,"select public.ensure_inffyn_workspace('blocked')"),e=>e.code==='42501');
  await db.exec('delete from inffyn_private.alpha_configuration');
  await assert.rejects(asUser(db,ALLOWED,"select public.ensure_inffyn_workspace('blocked')"),e=>e.code==='42501');
  assert.equal((await asUser(db,ALLOWED,'select * from storage.objects')).rows.length,0);
});

test('alpha blocks all legacy ingest writes and hides existing objects from excluded users',async t=>{
  const db=await database(t);
  // A permissive delete policy demonstrates restrictive alpha deny remains decisive.
  await db.exec("create policy fixture_delete on storage.objects for delete to authenticated using(true)");
  await enable(db);
  for(const [user,tenant] of [[ALLOWED,A],[EXCLUDED,B]]) {
    await assert.rejects(asUser(db,user,"insert into storage.objects(id,name,bucket_id) values($1,$2,'ingest')",['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',`${tenant}/blocked.csv`]),e=>e.code==='42501');
    assert.equal((await asUser(db,user,"update storage.objects set name=$1 where id=$2 returning id",[`${tenant}/changed.csv`,OLD_OBJECT])).rows.length,0);
    assert.equal((await asUser(db,user,'delete from storage.objects where id=$1 returning id',[OLD_OBJECT])).rows.length,0);
  }
  assert.equal((await asUser(db,EXCLUDED,'select * from storage.objects')).rows.length,0);
  assert.equal((await db.query('select name from storage.objects where id=$1',[OLD_OBJECT])).rows[0].name,`${A}/existing.csv`);
});

test('private configuration cannot be enumerated, changed or bypassed with another identity argument',async t=>{
  const db=await database(t); await enable(db);
  for(const sql of ['select * from inffyn_private.alpha_users','select * from inffyn_private.alpha_configuration','update inffyn_private.alpha_configuration set enabled=false']) await assert.rejects(asUser(db,EXCLUDED,sql),e=>e.code==='42501');
  await assert.rejects(asUser(db,EXCLUDED,'select public.inffyn_alpha_user_admitted($1::uuid)',[ALLOWED]),e=>e.code==='42883');
  assert.equal((await asUser(db,EXCLUDED,'select public.inffyn_alpha_user_admitted() ok')).rows[0].ok,false);
  assert.equal((await asUser(db,ALLOWED,'select public.inffyn_alpha_user_admitted() ok')).rows[0].ok,true);
  await db.exec('begin; set local role service_role;');
  try {
    assert.equal((await db.query('select count(*) n from inffyn_private.alpha_users')).rows[0].n,1);
    await db.exec('update inffyn_private.alpha_configuration set updated_at=now(); commit;');
  } catch(e) { await db.exec('rollback'); throw e; }
  await db.exec('begin; set local role anon;');
  try { await assert.rejects(db.query('select public.inffyn_alpha_user_admitted()'),e=>e.code==='42501'); } finally { await db.exec('rollback'); }
});

test('other buckets remain governed by their original policies',async t=>{
  const db=await database(t); await enable(db);
  await db.exec("create policy fixture_other_bucket on storage.objects for all to authenticated using(bucket_id='other') with check(bucket_id='other')");
  await asUser(db,EXCLUDED,"insert into storage.objects(id,name,bucket_id) values('ffffffff-ffff-4fff-8fff-ffffffffffff','fixture.csv','other')");
  assert.equal((await asUser(db,EXCLUDED,"select id from storage.objects where bucket_id='other'")).rows.length,1);
});

test('preflight inventories private admission metadata without reading identities or configuration values',async t=>{
  const db=await database(t); await enable(db);
  const before=(await db.query(CATALOG_QUERIES.alpha_catalog)).rows;
  const printable=JSON.stringify(before);
  assert.equal(before[0].name,'inffyn_private');
  assert.deepEqual(before[0].tables.map(x=>x.name),['alpha_configuration','alpha_users']);
  assert.ok(!printable.includes(ALLOWED) && !printable.includes('allowed@fixture'));
  await db.exec('update inffyn_private.alpha_configuration set enabled=false; delete from inffyn_private.alpha_users;');
  assert.deepEqual((await db.query(CATALOG_QUERIES.alpha_catalog)).rows,before);
  const expected={};
  for(const [section,query] of Object.entries(CATALOG_QUERIES)) expected[section]=(await db.query(query)).rows;
  const manifest={project_ref:PROJECT_REF,expected,migrations:[]};
  const observed={project_ref:PROJECT_REF,...structuredClone(expected)};
  observed.alpha_catalog[0].tables[0].rls=false;
  assert.ok(compareInventory(manifest,observed).findings.some(x=>x.section==='alpha_catalog' && x.kind==='DRIFT'));
  delete observed.alpha_catalog;
  assert.equal(compareInventory(manifest,observed).coverage.alpha_catalog.status,'UNKNOWN');
});
