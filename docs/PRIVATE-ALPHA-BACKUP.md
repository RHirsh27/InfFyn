# InfFyn private-alpha manual recovery

This operator-run procedure replaces a managed-backup requirement during the private alpha. It does not certify recovery merely because a file was created. The only source project is **`jmfzmoqdvweeixxwzlma`**. Ryan operates it before schema changes and after each active day; resolve a failed backup before the next real-data session. Keep seven days and the most recent verified recovery copy.

The destination is the existing private [inffyn data backup folder](https://drive.google.com/drive/folders/1tYakoV7ywyRpY1GTYEG2R2ocvV1a558O), owned by `ryan@inffyn.xyz`. Preserve its sharing state. No Drive API connection is assumed: upload and retrieve using that signed-in account. The other connected Drive account cannot access this folder.

## Current evidence and dependencies

September 12 evening: the encrypted database, roles and manifest archives were uploaded to the authorized private Drive folder, downloaded and hash-verified. The downloaded database restored into isolated PostgreSQL 17.11 with Vault 0.3.1. Schema, functions, owners, grants, policies, indexes, triggers and row counts matched the source inventory. Seven API-visible Storage objects were separately encrypted, uploaded, downloaded and restored with matching hashes. A fresh full database backup was uploaded immediately before the seven live migrations. A separate password-manager copy of the recovery key remains outstanding before real-data intake.

The restore used a dedicated Ubuntu WSL distribution named `InfFyn-Recovery`, without Docker. PostgreSQL ran in a network namespace containing only loopback and no external route. Rehearsal servers were stopped afterward. Supautils 3.4.3 was added for the migration rehearsal, reproducing the source's verified policy-management permission for `postgres` on `storage.objects`. The local namespace and library configuration do not change hosted permissions or establish application acceptance.

For this capture, an independent native transaction briefly held SHARE locks on application-writable tables and rolled back afterward. Platform-owned tables without sufficient locking privileges were not altered or granted new privileges; ordinary application writes cannot modify those tables. The first broad lock attempt failed and rolled back before capture. The successful capture used only existing privileges, and left no locks or data changes behind. The startup read-only setting was not preserved by the session pooler; explicit `BEGIN READ ONLY` in inventory queries remains mandatory.

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

Prepare a new isolated PostgreSQL cluster with the source major version and required extension binaries, with outbound traffic denied. Use a dedicated `inffyn_restore_operator_*` superuser and blank `inffyn_restore_*` database. Roles restore cluster-wide; an ordinary database inside a shared cluster is insufficient. Never omit database objects or ignore restore errors to obtain a pass.

For InfFyn, read-only queries verified source bootstrap role `supabase_admin` (`pg_roles.oid=10`) and database owner `postgres`. Initialize the isolated cluster as `supabase_admin`, then create the dedicated operator. Before restoration it must have exactly those two non-system roles. Supply `--source-bootstrap-role supabase_admin --source-database-owner postgres`. The tool checks the target bootstrap identity, accepts exactly one matching bootstrap creation in the trusted roles dump, and retains every attribute and original-grantor statement. Only creation of the already-existing bootstrap role is replaced by a comment. It also restores the disposable database owner, so `pg_database_owner` has the intended meaning. This handles the documented [PostgreSQL bootstrap-grantor issue](https://www.postgresql.org/message-id/CA%2BC_kKWHMP4c56jx1BPvP1jmjp2pmBu0Cw07fPVECUmkJSnT4w%40mail.gmail.com). The older unique-bootstrap mode remains suitable for synthetic fixtures that do not depend on source bootstrap grants.

Use literal loopback `127.0.0.1` or `::1` and a dedicated local port. `localhost`, hosted destinations, ordinary usernames, default database names and nonempty targets are rejected. Verify that the port belongs to the isolated cluster and is not an SSH tunnel or forwarded remote database. The command itself never creates, drops or cleans a database.

```powershell
node scripts/backup/cli.mjs restore --execute --isolated-local --private-directory-confirmed --host 127.0.0.1 --port 55432 --user inffyn_restore_operator_20260911 --database inffyn_restore_20260911 --source-bootstrap-role supabase_admin --source-database-owner postgres --pgpass-file 'C:\secure\inffyn-local-restore.pgpass' --identity-file 'C:\secure\inffyn-age-identity.txt' --receipt 'C:\private-inffyn-backups\ACTUAL_BACKUP_ID\receipt.json' --bundle 'C:\private-inffyn-retrieved\ACTUAL_BACKUP_ID'
```

The command verifies retrieval evidence and hashes, decrypts the manifest in memory, confirms an empty database, streams decrypted roles into `psql --single-transaction --set ON_ERROR_STOP=1`, then streams the custom dump into `pg_restore --exit-on-error --single-transaction`. Local loopback connections use no TLS; hosted source connections always require verified TLS. Roles and database restore are separate transactions: a failed rehearsal may leave roles in the disposable cluster. Preserve diagnostic evidence privately, then discard/recreate only that explicitly verified disposable cluster through the operator's normal tools.

Success requires restored table/column/default metadata, owners, table/column/schema ACLs, RLS/policies and their role names, function definitions/configuration/grants, triggers, constraints, indexes and exact table row counts to match the captured inventory. This is a logical-database recovery check, not an authentication-email or application acceptance test. It records `DATABASE_RESTORE_VERIFIED_STORAGE_AND_HOSTED_ACCEPTANCE_PENDING`, never production readiness. Test restored memberships, immutable report fingerprints, reports and actual auth behavior through the separate application acceptance procedure.

## Storage, encryption keys and seven-day retention

Supabase database dumps contain Storage metadata, **not Storage object bytes**. [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) treats objects, migration history, managed schemas and project settings separately. The full database dump includes `auth`, `storage`, `supabase_migrations` and `inffyn_private` where accessible; permission failure aborts capture. Recovery inventory includes private admission configuration/allowlist schema and row counts without printing identity values. SQL extension definitions do not include extension binaries. Vault/column encryption and InfFyn's provider credentials can additionally depend on separately retained encryption keys. Role passwords, external configuration and deployed Edge Function source are also outside these archives.

The companion `scripts/backup/storage.py` performs bounded Storage capture and local byte restoration. Run `engine\.venv\Scripts\python.exe scripts/backup/storage.py --help`. It stays offline without `--execute`; live commands additionally require `--private-directory-confirmed` and absolute external support paths. Credentials must be in a private file with exactly the pinned Supabase URL and service key. Credentials and key files must be outside the archive directory.

For `capture`, provide `--age`, `--key-file` (public recipients), `--credentials-file`, `--archive` (new `.age` file), and `--expected-count` from a separate read-only database inventory. It enumerates buckets and paginated folders, checks object sizes, captures SHA-256 hashes and compares metadata before/after. Limits are 10,000 entries, 25 MB per object and 100 MB total. It fails rather than truncates. Only encrypted content is written; receipt output contains counts and hashes.

Upload only the ciphertext archive to the designated Drive folder. Download to a separate private directory and compare against the trusted capture hash. For `restore`, provide `--age`, `--key-file` (private identity), `--archive` (downloaded ciphertext), `--expected-sha256` (trusted capture hash), and `--restore-directory` (new private directory). It validates all paths, sizes and hashes before writing, restores bytes under opaque filenames and retains a private object map. It performs no hosted Storage writes. The separate database restore preserves object records and policies.

Physical objects absent from Storage API metadata cannot be enumerated by this tool. Do not claim orphan coverage, a hosted Storage-service restore, or that zero metadata rows prove an empty physical object store. The tested result covers the seven API-visible retained objects and their exact bytes.

After database, Storage and key recovery are witnessed, maintain a private recovery index with `project_ref`, `backup_id`, `created_at` and `restore_verified: true`. Do not change the original capture receipt to turn a pending run into a completed one. Report seven-day expiry candidates with:

```powershell
node scripts/backup/cli.mjs retention-report --receipts 'C:\private-inffyn-backups\verified-recovery-index.json'
```

The command only reports candidates; it has no deletion implementation. It retains the latest verified backup even when older than seven days, and excludes incomplete/unverified runs from automatic eligibility. The operator reviews incomplete runs separately and verifies the surviving off-site recovery copy before using normal Drive controls to delete older ciphertext. No cleanup command enumerates arbitrary paths or deletes backups recursively. Record any recovery gaps, active-day backup failure and restoration outcome in the activation checklist before real-data intake.
