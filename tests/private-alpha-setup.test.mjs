import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const script = resolve('scripts/setup-private-alpha-db.ps1');
function invoke(args = [], env = process.env) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { encoding:'utf8', windowsHide:true, env });
}
test('default setup is offline and does not initialize credentials', { skip:process.platform !== 'win32' }, () => {
  const r = invoke();
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.files_written, false);
  assert.equal(result.database_contacted, false);
  assert.equal(result.sslmode, 'verify-full');
});
test('setup rejects another project, unbound pooler, shared folder and repository', { skip:process.platform !== 'win32' }, () => {
  for (const args of [
    ['-ProjectRef','different'],
    ['-DatabaseHost','example.com'],
    ['-DatabaseHost','aws-0-us-east-1.pooler.supabase.com','-DatabaseUser','postgres'],
    ['-CredentialDirectory',resolve('secrets')],
    ['-CredentialDirectory','C:\\Users\\Example\\OneDrive\\secrets'],
    ['-CredentialDirectory','\\\\server\\share\\secrets'],
  ]) assert.notEqual(invoke(args).status,0);
});
test('setup accepts project-qualified session pooler without contacting it', { skip:process.platform !== 'win32' }, () => {
  const r=invoke(['-DatabaseHost','aws-0-us-east-1.pooler.supabase.com','-DatabaseUser','postgres.jmfzmoqdvweeixxwzlma']);
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).database_contacted,false);
});
test('piped initialization cannot prompt for or accept a password', { skip:process.platform !== 'win32' }, () => {
  assert.notEqual(invoke(['-Initialize']).status,0);
});

test('fresh-machine certificate preparation is offline, repeatable and never overwrites a changed CA', { skip:process.platform !== 'win32' }, t => {
  const dir=mkdtempSync(resolve(tmpdir(),'inffyn-cert-test-'));
  t.after(()=>{ assert.ok(dir.startsWith(resolve(tmpdir(),'inffyn-cert-test-'))); rmSync(dir,{recursive:true,force:true}); });
  const env={...process.env,LOCALAPPDATA:dir};
  const offline=invoke([],env);
  assert.equal(offline.status,0,offline.stderr);
  const cert=resolve(dir,'InfFyn/private-alpha/certificates/supabase-prod-ca-2021.crt');
  assert.equal(existsSync(cert),false);
  for(let i=0;i<2;i++) {
    const prepared=invoke(['-PrepareCertificate'],env);
    assert.equal(prepared.status,0,prepared.stderr);
    const receipt=JSON.parse(prepared.stdout);
    assert.equal(receipt.database_contacted,false);
    assert.equal(receipt.credentials_written,false);
    assert.equal(receipt.status,'PUBLIC_CERTIFICATE_READY');
  }
  assert.equal(createHash('sha256').update(readFileSync(cert)).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  assert.equal(existsSync(resolve(dir,'InfFyn/private-alpha/database-credentials')),false);
  writeFileSync(cert,'changed public CA fixture');
  const rejected=invoke(['-PrepareCertificate'],env);
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/not overwritten/);
  assert.equal(readFileSync(cert,'utf8'),'changed public CA fixture');
});
