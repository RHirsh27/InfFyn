import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve('scripts/setup-private-alpha-db.ps1');
function invoke(args = []) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { encoding:'utf8', windowsHide:true });
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
