# Existing InfFyn database: preflight and activation handoff

The only authorized database target is **`jmfzmoqdvweeixxwzlma`**. This workflow does not create a database, change organizations, apply migrations, repair migration history, alter grants, or touch customer records. The tool inspects; the release operator reviews the result before a separate deployment step.

September 11 access update: the authenticated metadata inspection now reaches the existing project. Its `0009` differs from this repository's `0009`; the missing refresh-token column requires the separate additive convergence migration. The project is Free with no managed backups. See [the current activation plan](ACTIVATION-PLAN.md) for evidence, the exact candidate sequence and outstanding recovery/configuration steps. The full live catalog comparison remains pending.

The repository now contains sixteen migrations. The two monthly additions create seven company-scoped tables, including immutable reports, provider imports and credentials, and revision-checked monthly drafts. The latest migration reconciles the legacy Stripe credential schema without rewriting history. Local replay proves the migration chain and expected catalog can be constructed. It does **not** show which migrations already exist in the hosted database.

## What can run before account access

From the repository root:

```powershell
node scripts/database-preflight.mjs
node --test tests/database-preflight.test.mjs
```

The default command uses the existing PGlite development dependency to replay migrations in disposable in-process PostgreSQL. It does not read `.env`, open a network connection, or require provider credentials. Output contains the pinned project reference, each local migration version/name/SHA-256, expected catalog counts and explicit `UNKNOWN` hosted/backup/restore states. `--manifest` also includes the expected metadata for independent inspection.

Local auth and storage objects are minimal replay stubs. Supabase-managed auth/storage behavior, actual migration history and real tenant sessions are not represented by those stubs. Do not load a synthetic manifest into the migration ledger or use it to mark a hosted check passed.

## Tomorrow: inspect the existing target

1. Connect the Supabase account that owns InfFyn. Verify the project reference and company ownership before opening its connection configuration. Do not use Blueprint OS, create a substitute project, or infer access from another project's credentials.
2. Confirm a trusted native `psql` client is available (`psql --version`, `psql --help`). PostgreSQL 18.6 clients were installed from the official distribution during private-alpha preparation; on this workstation use `C:\Users\rhblu\scoop\apps\postgresql\current\bin\psql.exe` if the current shell has not refreshed PATH. No hosted connection is implied by client installation.
3. Obtain the verified direct or **session-pooler** host and database username from the owner's connection metadata. Use port 5432. Direct host is `db.jmfzmoqdvweeixxwzlma.supabase.co`; a shared pooler must use a username ending in `.jmfzmoqdvweeixxwzlma`. Copy the actual pooler host; do not invent one from a region name. [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
4. Have the authorized operator place the database password in a dedicated, access-restricted libpq password file outside the repository, and obtain the trusted database root certificate. Do not paste credentials into chat, CLI arguments, source files or reports. The preflight script only checks these file paths; native libpq reads the password. [PostgreSQL password-file documentation](https://www.postgresql.org/docs/current/libpq-pgpass.html)
5. Run the following with the operator's actual absolute support-file paths. These example paths contain no password and are placeholders, not files supplied by the repository:

```powershell
node scripts/database-preflight.mjs --live --project-ref jmfzmoqdvweeixxwzlma --host db.jmfzmoqdvweeixxwzlma.supabase.co --user postgres --pgpass-file 'C:\secure\inffyn-preflight.pgpass' --ssl-root-cert 'C:\secure\inffyn-root.crt'
```

If `psql` is outside PATH, add `--psql 'C:\actual\PostgreSQL\bin\psql.exe'`. If the network requires the verified session pooler, replace only `--host` and `--user` with that project's actual metadata. Transaction pooler port 6543, arbitrary hosts, another project, connection URLs and password arguments are rejected.

The live transport starts `psql` without shell execution or user startup files, suppresses password prompts, enforces `verify-full` TLS and uses a sanitized process environment. It pins `search_path` to `pg_catalog`, sets a read-only transaction, ten-second statement and two-second lock timeouts, and rolls back the transaction after fixed catalog queries. A bounded 45-second client timeout and 8 MB response limit prevent an unbounded inspection. No custom SQL argument or migration executor exists. [PostgreSQL psql options](https://www.postgresql.org/docs/current/app-psql.html)

Output includes only catalog metadata and hashes—not customer rows, credential values, migration SQL, function bodies or policy expressions. Raw database error text is not printed. If the connection fails, verify the operator's target, password-file permissions, certificate and catalog access privately; do not weaken TLS or expose the credential to diagnose it.

## Read the report before changing anything

- **Migration ledger:** matches exact version identifiers; reports missing, unexpected, duplicate or differently named versions. A same-name timestamp does not automatically replace an older numeric version. A ledger stub without statements proves only a recorded version. Retained SQL fingerprint differences may be CLI formatting or actual drift and stay unverified until reviewed.
- **Tables and columns:** compares required objects, types, nullability, default-expression hashes, RLS and forced-RLS flags. Unexpected existing objects remain visible and are never removed.
- **Access controls:** compares effective browser table/column privileges, including credential columns; detects unexpected browser mutation privileges, missing required service privileges, policies and policy-expression hashes. Supabase's extra privileged service-role defaults are not confused with browser access.
- **Functions, constraints and enforcement:** compares RPC signatures, security mode, search-path settings, body hashes, grants, indexes, constraints and triggers. An unexpected browser-executable security-definer function is blocking.
- **Unknowns:** backup recoverability, a witnessed restore and real-JWT tenant acceptance always remain `UNKNOWN`. A SQL catalog cannot prove these operational facts. Supabase-managed auth/storage internals are outside the disposable baseline.

`OFFLINE_PREPARED_HOSTED_UNVERIFIED` is an offline result. `REVIEW_REQUIRED` means drift, missing evidence or unresolved ledger content. `CATALOG_MATCH_RELEASE_UNVERIFIED` means the inspected catalog and recorded history match the baseline; it is **not** a production-ready verdict. Every result has `release_ready: false`. Exit 0 means the inspection completed, exit 2 means its findings need review, and exit 1 means inspection did not complete. No exit code authorizes deployment.

## Separate activation and recovery sequence

1. Archive the preflight report, current application/engine deployment identifiers and approved target metadata. Review every missing/unexpected object and version against the actual ledger. If earlier migrations exist under different identifiers, investigate their contents and history; do not automatically repair or mark versions applied.
2. Confirm a recoverable backup with the owning account, its timestamp, retention and expected recovery point. Prepare an isolated restore destination and retain required encryption-key access through the approved secret manager. Record who can perform restoration. No backup or restore is executed by this tool.
3. Construct the exact **missing subset** of migrations only after drift is understood. Review that concrete additive change and its transaction/deployment order. Do not replay the full local chain blindly, drop tables, recreate the database, or reverse migrations containing customer records. The new monthly migrations depend on the earlier tenancy and economic-audit schema.
4. Apply that separately reviewed migration subset using the established deployment process. Re-run this read-only inventory and review its result. Deploy the engine first, verify the API contract, then deploy the application; keep public release closed while completing acceptance.
5. Configure the customer app/engine for the existing project using approved secret delivery. Execute [hosted monthly acceptance](HOSTED-MONTHLY-ACCEPTANCE.md) with two test companies and real Supabase sessions: provisioning and membership, ordinary and cross-company reads/writes, drafts and revision conflicts, save/return/export, immutable report correction, provider access, retained history after entitlement expiry, and safe error handling.
6. Witness a backup restore in an isolated destination and verify report versions, memberships, grants, expiry behavior and availability of credential encryption keys. Verify scheduled retention and monitoring delivery. Record the restore outcome independently from catalog checks.
7. Before opening the company workspace, complete the customer-core gates and authorized live acceptance for **all three connectors: OpenAI, Anthropic and Stripe**, following [provider acceptance](PROVIDER-ACCEPTANCE.md). The approved launch requires all three; a missing connector is not a partial-release exception. If application acceptance fails, roll back to the previous verified app/engine deployment and disable the affected feature flag. Preserve additive tables and historical records. Restore the database only through the separately rehearsed recovery procedure when the failure actually requires it.

The observed legacy schema requires the targeted convergence described in the activation plan. Company scoping remains unchanged. Implemented protections and their acceptance in the actual hosted environment remain separate.
