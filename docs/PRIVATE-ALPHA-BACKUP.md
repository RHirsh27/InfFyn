# InfFyn private-alpha manual recovery

This operator-run procedure replaces a managed-backup requirement during the private alpha. It does not certify recovery merely because a file was created. The only source project is **`jmfzmoqdvweeixxwzlma`**. Ryan operates it before schema changes and after each active day; resolve a failed backup before the next real-data session. Keep seven days and the most recent verified recovery copy.

The destination is the existing private [inffyn data backup folder](https://drive.google.com/drive/folders/1tYakoV7ywyRpY1GTYEG2R2ocvV1a558O), owned by `ryan@inffyn.xyz`. Preserve its sharing state. No Drive API connection is assumed: upload and retrieve using that signed-in account. The other connected Drive account cannot access this folder.

## Current evidence and dependencies

```powershell
node scripts/backup/cli.mjs
node scripts/backup/cli.mjs --help
node --test tests/private-alpha-backup.test.mjs
```

The default is offline and opens no network connection. The 14 unit/process tests exercise target guards, subprocess streaming and failure propagation, capture/retrieval/restore orchestration with synthetic process fakes, and retention reporting. Separately, the opt-in native integration check passed on PostgreSQL **18.6** and age **1.3.1**: full synthetic dump plus roles, native encryption/decryption, byte-matching local retrieval simulation, restoration into a distinct local cluster, schema/permission comparison and a restored report amount/fingerprint check. This does **not** demonstrate live Supabase capture, managed-extension recovery or Drive retrieval.

```powershell
node scripts/backup/synthetic-check.mjs --execute --pg-bin 'C:\Users\rhblu\scoop\apps\postgresql\current\bin' --age-bin 'C:\Users\rhblu\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.age_Microsoft.Winget.Source_8wekyb3d8bbwe\age'
```

The synthetic check creates two temporary loopback-only clusters and fixture-only keys, uses distinct bootstrap roles to avoid role-restore conflicts, and stops both clusters before removing its checked temporary root. It does not start or use Scoop's default PostgreSQL cluster. It cannot accept a customer source host or credential. The capture transport is redirected to the local fixture inside this harness only; the operator command retains its fixed InfFyn target validation. Its simulated download is explicitly recorded as a local copy.

Install trusted native PostgreSQL clients (`psql`, `pg_dump`, `pg_dumpall`, `pg_restore`) compatible with the source server, plus [age](https://github.com/FiloSottile/age). Match the source PostgreSQL major version for the restore rehearsal, and provide all required extension binaries in the isolated runtime. Inspect the installed programs' `--version` and `--help` before execution. Explicit executable paths can be supplied using `--psql`, `--pg_dump`, `--pg_dumpall`, `--pg_restore`, and `--age`; each must be an absolute native executable path with the corresponding filename. The tooling installs nothing and does not launch Docker or create a database automatically.

## Secure operator setup

1. Obtain the correct direct host or session-pooler host from Supabase's connection metadata. Direct: `db.jmfzmoqdvweeixxwzlma.supabase.co`, user `postgres`. A session pooler must use the actual confirmed host and `postgres.jmfzmoqdvweeixxwzlma`; port **5432** only. Never use a transaction pooler or password-bearing URL.
2. Place the database password in a dedicated access-restricted [libpq password file](https://www.postgresql.org/docs/current/libpq-pgpass.html) outside the repository and shared/synced folders. Supply a trusted database root certificate. Node checks file metadata only; libpq reads the password. Source connections enforce `sslmode=verify-full` and read-only transactions. No password prompts, service files or inherited `PGPASSWORD` values are used.
3. Generate an age identity through the trusted native `age-keygen` tool. Keep the private identity outside the repository, chat and Drive folder, with an independently recoverable copy in the operator's private secret-management system. Supply an external **public recipient file** to encryption; never put the identity in the backup directory. See the official [age command documentation](https://github.com/FiloSottile/age#usage). Do not paste keys or passwords into chat.
4. Prepare a private external working directory for ciphertext and receipts. On Windows, apply owner-only ACLs to password, certificate/recipient/identity files and private directories using the normal account administration tools. `--private-directory-confirmed` records this operator check; the script cannot establish Windows ACL or cloud-sync safety from a filename. Unix support files must also have no group/other mode bits. Use full absolute paths; placeholders below are not installed files.
5. Pause application writes, imports and retention jobs during capture. Keep them paused until capture completes. The tool compares schema/permissions and exact row counts before/after, but counts cannot prove that values stayed unchanged. `--quiesced` is an operator attestation, not automatic traffic control.

Do not reset a database password, weaken TLS, reveal a key or bypass an approval control to make these commands work. Obtain an authorized direct PostgreSQL execution route independently of the blocked MCP SQL route.

## Capture and verify an off-site copy

```powershell
node scripts/backup/cli.mjs capture --execute --quiesced --private-directory-confirmed --project-ref jmfzmoqdvweeixxwzlma --host db.jmfzmoqdvweeixxwzlma.supabase.co --user postgres --pgpass-file 'C:\secure\inffyn-backup.pgpass' --ssl-root-cert 'C:\secure\inffyn-root.crt' --recipients-file 'C:\secure\inffyn-age-recipients.txt' --output 'C:\private-inffyn-backups'
```

The command streams a **full custom-format `pg_dump`**, without schema filters or removal of ownership/ACLs, through age into `database.dump.age`. It also streams `pg_dumpall --roles-only --no-role-passwords` into `roles.sql.age`. This preserves role definitions/memberships without database-role password hashes. Auth identities and auth credential records are included in the encrypted full database dump. An encrypted `manifest.json.age` records scope, metadata signature, exact table row counts and limitations. No plaintext SQL dump is written to disk or printed, and subprocess stderr is suppressed because PostgreSQL errors can contain sensitive values. All pipeline exit codes must pass independently.

A timestamped bundle is finalized only after all captures succeed. Its **local-only** `receipt.json` holds the encrypted archive SHA-256 values and remains `ENCRYPTED_LOCAL_CAPTURE_RECOVERY_PENDING`. On failure, the `.incomplete` directory is retained for private inspection without a success receipt; the last good copy is never overwritten or deleted. Do not upload incomplete files. The tool never prints native stderr for diagnosis; an authorized operator must diagnose privately.

In the designated Drive account, create a child folder named for the returned backup ID. Upload **only** these three files:

- `database.dump.age`
- `roles.sql.age`
- `manifest.json.age`

Do not upload the local receipt, identity, password file, application environment files or a decrypted archive. Download all three from Drive into a **different private directory**, then compare them with the locally retained trusted receipt:

```powershell
node scripts/backup/cli.mjs verify-download --execute --receipt 'C:\private-inffyn-backups\ACTUAL_BACKUP_ID\receipt.json' --bundle 'C:\private-inffyn-retrieved\ACTUAL_BACKUP_ID' --drive-folder-id 1tYakoV7ywyRpY1GTYEG2R2ocvV1a558O --downloaded-from-drive
```

This records `DOWNLOADED_BYTES_MATCH` only when every downloaded archive matches. It explicitly labels Drive origin **operator-attested, not API-verified**; it does not change permissions or claim server-side verification. Preserve the trusted receipt independently so a substituted download and substituted receipt cannot validate one another.

## Rehearse restoration locally

The operator prepares a new isolated PostgreSQL cluster with the same major version and the required Supabase extension binaries, with outbound traffic denied. Initialize it with a unique superuser such as `inffyn_restore_operator_20260911`, and create a blank database such as `inffyn_restore_20260911`. Both must be dedicated to this rehearsal; source roles including `postgres` must not already exist. Roles are restored cluster-wide, so a merely new database inside a shared cluster is insufficient. Do not use a cluster running an application, webhook worker or other service. If the native dump cannot restore into the prepared compatible runtime, the rehearsal stays failed; do not omit objects or ignore errors to obtain a pass.

Use literal loopback `127.0.0.1` or `::1` and a dedicated local port. `localhost`, hosted destinations, ordinary usernames, default database names and nonempty targets are rejected. Verify that the port belongs to the isolated cluster and is not an SSH tunnel or forwarded remote database. The command itself never creates, drops or cleans a database.

```powershell
node scripts/backup/cli.mjs restore --execute --isolated-local --private-directory-confirmed --host 127.0.0.1 --port 55432 --user inffyn_restore_operator_20260911 --database inffyn_restore_20260911 --pgpass-file 'C:\secure\inffyn-local-restore.pgpass' --identity-file 'C:\secure\inffyn-age-identity.txt' --receipt 'C:\private-inffyn-backups\ACTUAL_BACKUP_ID\receipt.json' --bundle 'C:\private-inffyn-retrieved\ACTUAL_BACKUP_ID'
```

The command verifies retrieval evidence and hashes, decrypts the manifest in memory, confirms an empty database, streams decrypted roles into `psql --single-transaction --set ON_ERROR_STOP=1`, then streams the custom dump into `pg_restore --exit-on-error --single-transaction`. Local loopback connections use no TLS; hosted source connections always require verified TLS. Roles and database restore are separate transactions: a failed rehearsal may leave roles in the disposable cluster. Preserve diagnostic evidence privately, then discard/recreate only that explicitly verified disposable cluster through the operator's normal tools.

Success requires restored table/column/default metadata, owners, table/column/schema ACLs, RLS/policies and their role names, function definitions/configuration/grants, triggers, constraints, indexes and exact table row counts to match the captured inventory. This is a logical-database recovery check, not an authentication-email or application acceptance test. It records `DATABASE_RESTORE_VERIFIED_STORAGE_AND_HOSTED_ACCEPTANCE_PENDING`, never production readiness. Test restored memberships, immutable report fingerprints, reports and actual auth behavior through the separate application acceptance procedure.

## Storage, encryption keys and seven-day retention

Supabase database dumps contain Storage metadata, **not Storage object bytes**. [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) treats objects, migration history, managed schemas and project settings separately. The full database dump includes `auth`, `storage`, `supabase_migrations` and `inffyn_private` where accessible; permission failure aborts capture. Recovery inventory includes private admission configuration/allowlist schema and row counts without printing identity values. SQL extension definitions do not include extension binaries. Vault/column encryption and InfFyn's provider credentials can additionally depend on separately retained encryption keys. Role passwords, external configuration and deployed Edge Function source are also outside these archives.

Before marking recovery usable, inventory actual Storage buckets/object bytes, including potential orphaned files not represented by `storage.objects`. When object storage is verified empty, record that evidence. When any retained object exists, this tooling remains an **incomplete recovery path** until the operator exports those bytes through authorized storage access, encrypts them before upload, verifies every downloaded object's checksum and rehearses restoration with matching bucket/policy/metadata settings. Do not treat a zero metadata count alone as proof of an empty object store. This tool does not implement a storage API credential flow or silently claim object recovery.

After database, Storage and key recovery are witnessed, maintain a private recovery index with `project_ref`, `backup_id`, `created_at` and `restore_verified: true`. Do not change the original capture receipt to turn a pending run into a completed one. Report seven-day expiry candidates with:

```powershell
node scripts/backup/cli.mjs retention-report --receipts 'C:\private-inffyn-backups\verified-recovery-index.json'
```

The command only reports candidates; it has no deletion implementation. It retains the latest verified backup even when older than seven days, and excludes incomplete/unverified runs from automatic eligibility. The operator reviews incomplete runs separately and verifies the surviving off-site recovery copy before using normal Drive controls to delete older ciphertext. No cleanup command enumerates arbitrary paths or deletes backups recursively. Record any recovery gaps, active-day backup failure and restoration outcome in the activation checklist before real-data intake.
