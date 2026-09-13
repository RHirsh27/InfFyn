import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const PROJECT_REF = 'jmfzmoqdvweeixxwzlma';
export const DRIVE_FOLDER = '1tYakoV7ywyRpY1GTYEG2R2ocvV1a558O';
const ROOT = resolve(import.meta.dirname, '../..');
const ARCHIVES = ['database.dump.age', 'roles.sql.age', 'manifest.json.age'];
const SAFE_ENV = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'];
const fail = (code) => { throw new Error(code); };
const inside = (child, parent) => { const rel = relative(parent, child); return !rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };

export function validateSource(o) {
  if (o.projectRef !== PROJECT_REF) fail('unexpected_project');
  const direct = o.host === `db.${PROJECT_REF}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(o.host || '');
  if (!direct && !pooler) fail('unexpected_source_host');
  if (String(o.port ?? 5432) !== '5432') fail('session_port_required');
  if (!(direct ? /^[a-z_][a-z0-9_]*$/ : new RegExp(`^[a-z_][a-z0-9_]*\\.${PROJECT_REF}$`)).test(o.user || '')) fail('unexpected_source_user');
  return o;
}

export function validateRestore(o) {
  if (!['127.0.0.1', '::1'].includes(o.host)) fail('restore_requires_literal_loopback');
  if (!/^inffyn_restore_[a-z0-9_]{4,48}$/.test(o.database || '')) fail('restore_database_must_be_disposable');
  if (!/^inffyn_restore_operator_[a-z0-9_]{4,32}$/.test(o.user || '')) fail('restore_requires_dedicated_cluster_operator');
  if (!/^\d{1,5}$/.test(String(o.port)) || Number(o.port) < 1024 || Number(o.port) > 65535) fail('invalid_restore_port');
  if (o.isolatedLocal !== true) fail('isolated_local_attestation_required');
  if (o.sourceBootstrapRole !== undefined && o.sourceBootstrapRole !== 'supabase_admin') fail('unsupported_source_bootstrap_role');
  if (o.sourceDatabaseOwner !== undefined && (o.sourceDatabaseOwner !== 'postgres' || o.sourceBootstrapRole !== 'supabase_admin')) fail('unsupported_source_database_owner');
  return o;
}

// PostgreSQL 16+ retains the original bootstrap grantor in role memberships.
// A distinct bootstrap name cannot reproduce those grants. In this opt-in mode
// the isolated cluster is initialized with the verified source bootstrap name;
// retain every ALTER/GRANT and omit only its already-satisfied CREATE statement.
export function preparedBootstrapRoles(sql, role) {
  if (role !== 'supabase_admin') fail('unsupported_source_bootstrap_role');
  const declaration = /^CREATE ROLE supabase_admin;\r?$/gm;
  if ([...sql.matchAll(declaration)].length !== 1 || !/^ALTER ROLE supabase_admin WITH /m.test(sql)) fail('source_bootstrap_definition_not_unique');
  return sql.replace(declaration, '-- Source bootstrap role already exists at OID 10.');
}

export function childEnvironment(o, source = true, parent = process.env) {
  source ? validateSource(o) : validateRestore(o);
  const env = Object.fromEntries(SAFE_ENV.filter(k => parent[k]).map(k => [k, parent[k]]));
  return { ...env, PGHOST: o.host, PGUSER: o.user, PGDATABASE: source ? 'postgres' : o.database,
    PGPORT: String(o.port || 5432), PGPASSFILE: o.pgpassFile,
    PGSSLMODE: source ? 'verify-full' : 'disable', ...(source ? { PGSSLROOTCERT: o.sslRootCert } : {}),
    PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'inffyn-private-alpha-recovery',
    ...(source ? { PGOPTIONS: '-c default_transaction_read_only=on -c lock_timeout=5000' } : {}) };
}

async function canonicalBoundary(path) {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT' || dirname(absolute) === absolute) fail('support_boundary_unavailable');
    // Output directories may not exist yet; resolve aliases in their existing ancestors.
    return resolve(await canonicalBoundary(dirname(absolute)), basename(absolute));
  }
}

export async function supportFile(file, forbidden = []) {
  if (!file || !isAbsolute(file) || /^\.env(?:\.|$)/i.test(basename(file))) fail('absolute_support_file_required');
  const actual = await realpath(file);
  const boundaries = await Promise.all([ROOT, ...forbidden].map(canonicalBoundary));
  if (/^\.env(?:\.|$)/i.test(basename(actual)) || boundaries.some(p => inside(actual, p)) || /(?:^|[\\/])(?:Google Drive|My Drive|OneDrive|Dropbox)(?:[\\/]|$)/i.test(actual)) fail('support_file_must_be_outside_repository_and_shared_storage');
  const meta = await stat(actual);
  if (!meta.isFile()) fail('support_file_must_be_regular');
  if (process.platform !== 'win32' && (meta.mode & 0o077)) fail('support_file_requires_owner_only_permissions');
  return actual; // Credential/key contents are never read by Node.
}

function executable(o, name) {
  const value = o[name] || name;
  if (value !== name && (!isAbsolute(value) || !new RegExp(`^${name}(?:\\.exe)?$`, 'i').test(basename(value)))) fail('invalid_native_executable');
  return value;
}

function launch(command, args, env, spawnProcess) {
  const child = spawnProcess(command, args, { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {}); // Raw PostgreSQL errors can contain row values or secrets.
  const done = new Promise((yes, no) => {
    child.once('error', () => no(new Error('native_process_start_failed')));
    child.once('close', code => code === 0 ? yes() : no(new Error('native_process_failed')));
  });
  done.catch(() => {});
  return { child, done };
}

/** Each stage is checked independently. No shell, plaintext file, or raw diagnostic output. */
export async function runPipeline(commands, { env = {}, input, output, maxBytes = 16_000_000, timeout = 900_000, spawnProcess = spawn } = {}) {
  const children = commands.map(c => launch(c.command, c.args, env, spawnProcess));
  const timer = setTimeout(() => children.forEach(({ child }) => child.kill()), timeout);
  const jobs = [];
  let collected = Buffer.alloc(0);
  try {
    const first = children[0].child;
    if (input !== undefined) jobs.push(pipeline(typeof input === 'string' || Buffer.isBuffer(input) ? Readable.from([input]) : input, first.stdin));
    else first.stdin.end();
    for (let i = 0; i < children.length - 1; i++) jobs.push(pipeline(children[i].child.stdout, children[i + 1].child.stdin));
    const last = children.at(-1).child.stdout;
    if (output) jobs.push(pipeline(last, createWriteStream(output, { flags: 'wx', mode: 0o600 })));
    else jobs.push((async () => { for await (const chunk of last) { if (collected.length + chunk.length > maxBytes) fail('native_output_limit'); collected = Buffer.concat([collected, chunk]); } })());
    await Promise.all([...children.map(c => c.done), ...jobs]);
    return collected;
  } catch {
    children.forEach(({ child }) => child.kill());
    await Promise.allSettled([...children.map(c => c.done), ...jobs]);
    fail('backup_pipeline_failed_no_receipt');
  } finally { clearTimeout(timer); }
}

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// pg_dump omits default grants. Compare effective ACLs so explicit defaults and
// NULL/default representations remain equivalent after a faithful restore.
const aclInventory = (expression, owner, kind) => `(SELECT json_agg(json_build_array(pg_get_userbyid(q.grantor),CASE WHEN q.grantee=0 THEN 'public' ELSE pg_get_userbyid(q.grantee)::text END,q.privilege_type,q.is_grantable) ORDER BY pg_get_userbyid(q.grantor)::text,CASE WHEN q.grantee=0 THEN 'public' ELSE pg_get_userbyid(q.grantee)::text END,q.privilege_type,q.is_grantable) FROM aclexplode(coalesce(${expression},acldefault('${kind}',${owner}))) q)`;
const INVENTORY_SQL = `BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SELECT json_build_object('tables', coalesce(json_agg(json_build_object(
  'schema', n.nspname, 'name', c.relname, 'owner', pg_get_userbyid(c.relowner),
  'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
  'acl', ${aclInventory('c.relacl','c.relowner','r')},
  'columns', (SELECT json_agg(json_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),${aclInventory('a.attacl','c.relowner','c')}) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints', (SELECT json_agg(json_build_array(x.conname,pg_get_constraintdef(x.oid)) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
  'triggers', (SELECT json_agg(json_build_array(t.tgname,pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
  'indexes', (SELECT json_agg(pg_get_indexdef(i.indexrelid) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
  'policies', (SELECT json_agg(json_build_array(p.polname,p.polcmd,p.polpermissive,(SELECT array_agg(CASE WHEN role_id=0 THEN 'public' ELSE pg_get_userbyid(role_id)::text END ORDER BY role_id=0 DESC,pg_get_userbyid(role_id)::text) FROM unnest(p.polroles) role_id),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)
) ORDER BY n.nspname,c.relname),'[]'::json),
 'schemas',(SELECT json_agg(json_build_array(sn.nspname,pg_get_userbyid(sn.nspowner),${aclInventory('sn.nspacl','sn.nspowner','n')}) ORDER BY sn.nspname) FROM pg_namespace sn WHERE sn.nspname IN ('public','auth','storage','supabase_migrations','inffyn_private')),
 'functions',(SELECT json_agg(json_build_array(fn.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,${aclInventory('f.proacl','f.proowner','f')},md5(pg_get_functiondef(f.oid))) ORDER BY fn.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace fn ON fn.oid=f.pronamespace WHERE fn.nspname IN ('public','auth','storage','supabase_migrations','inffyn_private') AND f.prokind IN ('f','p')))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','storage','supabase_migrations','inffyn_private') AND c.relkind='r';
ROLLBACK;`;
const sqlCommand = o => ({ command: executable(o, 'psql'), args: ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '--file=-'] });

async function inventory(o, env, run) {
  let data;
  try { data = JSON.parse((await run([sqlCommand(o)], { env, input: INVENTORY_SQL })).toString('utf8')); } catch { fail('database_inventory_failed'); }
  if (!Array.isArray(data.tables) || !data.tables.length || !data.tables.some(t => t.schema === 'auth' && t.name === 'users')) fail('identity_schema_not_included');
  for (const t of data.tables) if (!['public','auth','storage','supabase_migrations','inffyn_private'].includes(t.schema) || !/^[a-z_][a-z0-9_]*$/.test(t.name)) fail('unsupported_relation_identifier');
  const countsSQL = `BEGIN READ ONLY; SET LOCAL statement_timeout = '120s';\nSELECT json_object_agg(name, total ORDER BY name) FROM (${data.tables.map(t => `SELECT '${t.schema}.${t.name}' AS name, count(*) AS total FROM "${t.schema}"."${t.name}"`).join(' UNION ALL ')}) counts;\nROLLBACK;`;
  let counts;
  try { counts = JSON.parse((await run([sqlCommand(o)], { env, input: countsSQL })).toString('utf8')); } catch { fail('database_counts_failed'); }
  if (Object.keys(counts).length !== data.tables.length || Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0)) fail('database_counts_incomplete');
  return { schema_sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'), counts };
}

async function saveJson(path, data) { await writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
async function files(o, restore = false) {
  if (o.privateDirectoryConfirmed !== true) fail('operator_private_paths_confirmation_required');
  await supportFile(o.pgpassFile, o.output ? [resolve(o.output)] : []);
  if (restore) await supportFile(o.identityFile, [resolve(o.bundle)]);
  else { await supportFile(o.sslRootCert); await supportFile(o.recipientsFile, o.output ? [resolve(o.output)] : []); }
}

export async function capture(o, { run = runPipeline, now = () => new Date() } = {}) {
  if (!o.execute) return plan();
  validateSource(o);
  if (o.quiesced !== true) fail('pause_writes_before_capture');
  if (!o.output || !isAbsolute(o.output) || inside(resolve(o.output), ROOT)) fail('external_backup_directory_required');
  await files(o);
  await mkdir(o.output, { recursive: true, mode: 0o700 });
  const outputRoot = await realpath(o.output);
  if (inside(outputRoot, ROOT)) fail('external_backup_directory_required');
  const created = now().toISOString();
  const id = `inffyn-${created.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}`;
  const pending = resolve(outputRoot, `${id}.incomplete`);
  await mkdir(pending, { mode: 0o700 });
  const env = childEnvironment(o);
  const before = await inventory(o, env, run);
  const enc = { command: executable(o, 'age'), args: ['--encrypt', '--recipients-file', o.recipientsFile] };
  await run([{ command: executable(o, 'pg_dumpall'), args: ['--roles-only', '--no-role-passwords', '--no-password'] }, enc], { env, output: resolve(pending, ARCHIVES[1]) });
  await run([{ command: executable(o, 'pg_dump'), args: ['--format=custom', '--no-password', '--lock-wait-timeout=10000'] }, enc], { env, output: resolve(pending, ARCHIVES[0]) });
  const after = await inventory(o, env, run);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('source_changed_during_capture');
  const storageCount = before.counts['storage.objects'];
  const manifest = { version: 1, project_ref: PROJECT_REF, created_at: created, scope: 'full_database_and_roles_without_role_passwords',
    writes_paused_by_operator: true, inventory: before, storage_object_bytes: storageCount === 0 ? 'none_in_inventory_operator_must_check_orphans' : 'not_backed_up',
    exclusions: ['storage_object_bytes','database_role_passwords','platform_settings','external_encryption_keys','edge_function_artifacts'] };
  await run([enc], { env, input: JSON.stringify(manifest), output: resolve(pending, ARCHIVES[2]) });
  const hashes = Object.fromEntries(await Promise.all(ARCHIVES.map(async name => [name, await sha256(resolve(pending, name))])));
  const receipt = { version: 1, project_ref: PROJECT_REF, backup_id: id, created_at: created, drive_folder_id: DRIVE_FOLDER,
    status: 'ENCRYPTED_LOCAL_CAPTURE_RECOVERY_PENDING', archives: hashes, storage_status: manifest.storage_object_bytes,
    drive_retrieval_verified: false, restore_verified: false, release_ready: false };
  await saveJson(resolve(pending, 'receipt.json'), receipt);
  const complete = resolve(outputRoot, id);
  await rename(pending, complete);
  return { ...receipt, bundle: complete, upload_only: ARCHIVES };
}

async function readReceipt(path) {
  const r = JSON.parse(await readFile(path, 'utf8'));
  if (r.version !== 1 || r.project_ref !== PROJECT_REF || r.drive_folder_id !== DRIVE_FOLDER || !/^inffyn-[a-zA-Z0-9.-]+$/.test(r.backup_id) || Object.keys(r.archives || {}).sort().join() !== [...ARCHIVES].sort().join() || Object.values(r.archives).some(h => !/^[0-9a-f]{64}$/.test(h))) fail('invalid_backup_receipt');
  return r;
}
export async function verifyArchives(receiptPath, bundle) {
  const receipt = await readReceipt(receiptPath);
  for (const name of ARCHIVES) if (await sha256(resolve(bundle, name)) !== receipt.archives[name]) fail('encrypted_archive_hash_mismatch');
  return receipt;
}
export async function verifyDownload(o) {
  if (!o.execute) return plan();
  if (o.driveFolderId !== DRIVE_FOLDER || o.downloadedFromDrive !== true) fail('designated_drive_download_attestation_required');
  const original = await realpath(dirname(o.receipt));
  const retrieved = await realpath(o.bundle);
  if (original === retrieved) fail('independent_download_directory_required');
  const receipt = await verifyArchives(o.receipt, retrieved);
  const result = { project_ref: PROJECT_REF, backup_id: receipt.backup_id, archives: receipt.archives, status: 'DOWNLOADED_BYTES_MATCH',
    drive_folder_id: DRIVE_FOLDER, remote_origin: 'operator_attested_not_api_verified', verified_at: new Date().toISOString(), restore_verified: false, release_ready: false };
  await saveJson(resolve(retrieved, 'retrieval-verification.json'), result);
  return result;
}

export async function restore(o, { run = runPipeline } = {}) {
  if (!o.execute) return plan();
  validateRestore(o);
  await files(o, true);
  const receipt = await verifyArchives(o.receipt, o.bundle);
  const retrieval = JSON.parse(await readFile(resolve(o.bundle, 'retrieval-verification.json'), 'utf8'));
  if (retrieval.status !== 'DOWNLOADED_BYTES_MATCH' || retrieval.backup_id !== receipt.backup_id || JSON.stringify(retrieval.archives) !== JSON.stringify(receipt.archives)) fail('retrieval_verification_required');
  const env = childEnvironment(o, false);
  const dec = name => ({ command: executable(o, 'age'), args: ['--decrypt', '--identity', o.identityFile, resolve(o.bundle, name)] });
  let manifest;
  try { manifest = JSON.parse((await run([dec(ARCHIVES[2])], { env })).toString('utf8')); } catch { fail('encrypted_manifest_not_readable'); }
  if (manifest.project_ref !== PROJECT_REF || manifest.version !== 1) fail('manifest_target_mismatch');
  const check = `BEGIN READ ONLY; SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','f'); ROLLBACK;`;
  if ((await run([sqlCommand(o)], { env, input: check })).toString('utf8').trim() !== '0') fail('restore_target_must_be_empty');
  // This changes only the separately prepared disposable cluster. Never creates/drops a database.
  const rolesCommand = { command: executable(o, 'psql'), args: ['-X','-q','-w','-v','ON_ERROR_STOP=1','--single-transaction','--file=-'] };
  if (o.sourceBootstrapRole) {
    const bootstrapCheck = `BEGIN READ ONLY; SELECT ((SELECT rolname FROM pg_roles WHERE oid=10)='supabase_admin' AND (SELECT count(*) FROM pg_roles WHERE rolname !~ '^pg_')=2 AND (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND current_user='${o.user}')::text; ROLLBACK;`;
    if ((await run([sqlCommand(o)], {env,input:bootstrapCheck})).toString('utf8').trim() !== 'true') fail('isolated_source_bootstrap_required');
    const roles = (await run([dec(ARCHIVES[1])], {env,maxBytes:1_000_000})).toString('utf8');
    await run([rolesCommand], {env,input:preparedBootstrapRoles(roles,o.sourceBootstrapRole),maxBytes:1_000_000});
  } else {
    await run([dec(ARCHIVES[1]), rolesCommand], { env, maxBytes: 1_000_000 });
  }
  // A dump restored without --create keeps the target database owner. Match the
  // verified source owner so pg_database_owner has the same effective access.
  if (o.sourceDatabaseOwner) await run([sqlCommand(o)], {env,input:`ALTER DATABASE "${o.database}" OWNER TO postgres;`});
  await run([dec(ARCHIVES[0]), { command: executable(o, 'pg_restore'), args: ['--no-password','--exit-on-error','--single-transaction','--dbname',o.database] }], { env, maxBytes: 1_000_000 });
  const restored = await inventory(o, env, run);
  if (JSON.stringify(restored) !== JSON.stringify(manifest.inventory)) fail('restore_inventory_mismatch');
  const result = { project_ref: PROJECT_REF, backup_id: receipt.backup_id, status: 'DATABASE_RESTORE_VERIFIED_STORAGE_AND_HOSTED_ACCEPTANCE_PENDING',
    verified_at: new Date().toISOString(), restored_database: o.database, database_restore_verified: true,
    source_bootstrap_role: o.sourceBootstrapRole || 'not_explicitly_prepared',
    source_database_owner: o.sourceDatabaseOwner || 'not_explicitly_prepared',
    storage_status: manifest.storage_object_bytes, scope: 'schemas_functions_triggers_constraints_indexes_owners_grants_rls_policies_and_row_counts',
    remaining: ['storage_bytes_or_confirmed_empty_object_store','secret_manager_key_recovery','hosted_identity_and_report_acceptance'], release_ready: false };
  await saveJson(resolve(o.bundle, 'restore-verification.json'), result);
  return result;
}

export function retentionCandidates(receipts, now = new Date()) {
  const valid = receipts.filter(r => r.project_ref === PROJECT_REF && r.restore_verified === true && Number.isFinite(Date.parse(r.created_at))).sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return { action: 'REPORT_ONLY_NO_DELETIONS', keep_latest_verified: valid[0]?.backup_id || null,
    candidates: valid.slice(1).filter(r => now - new Date(r.created_at) > 7 * 86400000).map(r => r.backup_id),
    note: 'Unverified and incomplete backups are excluded. Operator verifies Drive copies and latest good recovery before any deletion.' };
}

export function plan() {
  return { mode: 'OFFLINE_PLAN_NO_NETWORK', project_ref: PROJECT_REF, drive_folder_id: DRIVE_FOLDER,
    commands: ['capture','verify-download','restore','retention-report'], dependencies: ['Node.js 22+','trusted native pg_dump, pg_dumpall, pg_restore, psql','age','compatible isolated local PostgreSQL/Supabase restore runtime'],
    required_operator_setup: ['protected external libpq password file and trusted source TLS certificate','external age recipient file and separately protected identity key','private external encrypted archive directory','paused writes during capture','Drive upload/download through authorized account'],
    actual_backup: 'PENDING', actual_restore: 'PENDING', storage_objects: 'SEPARATE_RECOVERY_REQUIRED_UNLESS_CONFIRMED_EMPTY', release_ready: false };
}
