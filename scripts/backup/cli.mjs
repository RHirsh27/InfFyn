#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { capture, plan, restore, retentionCandidates, verifyDownload } from './core.mjs';

const args = process.argv.slice(2);
const command = args[0]?.startsWith('--') ? 'plan' : args.shift() || 'plan';
const booleans = new Set(['execute','quiesced','isolated-local','private-directory-confirmed','downloaded-from-drive']);
const values = new Set(['project-ref','host','port','user','database','pgpass-file','ssl-root-cert','recipients-file','identity-file','output','receipt','bundle','drive-folder-id','age','pg_dump','pg_dumpall','pg_restore','psql','receipts','source-bootstrap-role','source-database-owner']);
const options = {};
try {
  if (args.includes('--help') || command === 'help') {
    console.log('InfFyn operator recovery: node scripts/backup/cli.mjs [plan|capture|verify-download|restore|retention-report]\nDefault is offline. Mutating commands require --execute. See docs/PRIVATE-ALPHA-BACKUP.md for all required flags and secure setup.');
  } else {
    while (args.length) {
      const flag = args.shift();
      if (!flag?.startsWith('--')) throw new Error('named_arguments_only');
      const key = flag.slice(2);
      const property = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (Object.hasOwn(options, property)) throw new Error('duplicate_argument');
      if (booleans.has(key)) options[property] = true;
      else if (values.has(key) && args.length && !args[0].startsWith('--')) options[property] = args.shift();
      else throw new Error('unsupported_argument');
    }
    let result;
    if (command === 'plan') result = plan();
    else if (command === 'capture') result = await capture(options);
    else if (command === 'verify-download') result = await verifyDownload(options);
    else if (command === 'restore') result = await restore(options);
    else if (command === 'retention-report') result = options.receipts ? retentionCandidates(JSON.parse(await readFile(options.receipts, 'utf8'))) : retentionCandidates([]);
    else throw new Error('unsupported_command');
    console.log(JSON.stringify(result, null, 2));
  }
} catch (e) {
  // Fixed application error codes only; never emit subprocess stderr or arbitrary file contents.
  const code = /^[a-z_]+$/.test(e?.message || '') ? e.message : 'recovery_operation_failed';
  console.error(JSON.stringify({ status: 'BLOCKED', code, release_ready: false }));
  process.exitCode = 1;
}
