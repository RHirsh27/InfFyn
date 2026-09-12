# InfFyn: database and hosted workspace activation

**Current approved milestone:** [Private-alpha activation](PRIVATE-ALPHA-ACTIVATION.md) supersedes this earlier broad-launch sequence. Real company CSV use is allowed after verified manual recovery and restricted hosted acceptance. Managed backups, provider connections, paid billing and public launch are deferred. The metadata and migration-history evidence below remain relevant; older provider-before-any-workspace gates now apply to the later public release.

Prepared September 11, 2026. This is the execution plan for turning the existing review deployment into a persistent company workspace. Engineering owns the checks; Stephen validates customer value after the workflow works. This document supersedes older statements that Supabase account access is unavailable.

## Current verified position

| Item | Evidence | Status |
| --- | --- | --- |
| Supabase account access | Fresh authenticated MCP client returned the exact project URL, migration history and public table/column metadata | Verified for `jmfzmoqdvweeixxwzlma` |
| Existing schema | 11 public tables; each reports RLS enabled | Metadata inspected; policy correctness and tenant isolation unverified |
| Migration history | Remote `0001`–`0011`; remote `0009` is `drop_scaffold_healthcheck`, while local `0009` is `stripe_app_oauth_refresh_token` | Known divergence; never replay or repair the ledger blindly |
| Stripe legacy schema | `stripe_connections.refresh_token_encrypted` is absent | Additive convergence required |
| Backups | Signed-in Chrome dashboard shows InfFyn Free and “Free Plan does not include project backups” | No managed recovery point available; a manual backup may exist elsewhere but has not been provided or verified |
| Hosting | Existing `inffyn-preview` and `inffyn-preview-engine` Vercel deployments are Ready | Review service only; readiness does not prove persistence |
| Engine configuration | Production env-name inventory contains only the two preview flags and proxy secret | Supabase runtime connection and company activation configuration absent |
| App configuration and routes | Supabase auth variables absent; `/login` and `/app/monthly` redirect to `/review` | Hosted company sign-in is not activated |
| Hosted company acceptance | No authenticated company run completed | Pending |

Evidence receipts live in `outputs/supabase-access-2026-09-11/`. They contain metadata, not customer records or credentials. The source checkout at the start of this phase is `8c74e3f016969695af021f7f975cb36127b7b3ab`; this is not proof of the hosted source revision.

## Phase 1 — reconcile and prepare the upgrade

1. Preserve every historical migration file and the live ledger. Do not claim that matching numeric version `0009` means matching SQL.
2. Add `20260911141814_reconcile_stripe_oauth_legacy_history.sql`. It adds the nullable encrypted refresh-token column only if absent, rejects an incompatible existing column, preserves existing ciphertext and restricts browser access to the original non-secret columns. It does not recreate the retired healthcheck table.
3. Replay the normal migration chain and an explicitly synthetic reconstruction of the observed legacy shape. Test repeat application, incompatible column rejection, credential grants, data preservation and strict preflight behavior.
4. Generate the ordered, hashed candidate list from the saved metadata. An exact match to this narrow metadata baseline is **not** a full catalog match or permission to execute.

Candidate order, subject to the live catalog and recovery gates:

1. `0012_audit_v2.sql`
2. `0013_release_access.sql`
3. `20260911015433_standalone_monthly_economics.sql`
4. `20260911031800_company_monthly_preparation.sql`
5. `20260911141814_reconcile_stripe_oauth_legacy_history.sql`

Generate the review plan without contacting a database:

```powershell
node scripts/database-preflight-activation.mjs --metadata outputs/supabase-access-2026-09-11/metadata-access.json --columns outputs/supabase-access-2026-09-11/schema-columns.json
```

The planner refuses a different project, changed baseline or stale evidence. It always returns `executable: false` and `release_ready: false`. Recollect metadata before deployment; do not edit timestamps to make an old receipt pass.

The hosted configuration preflight validates both existing Vercel project links before listing environment names. It separates core CSV requirements from provider, billing and operational requirements; it never pulls values, toggles flags or deploys:

```powershell
node scripts/hosted-config-preflight.mjs
node scripts/hosted-config-preflight.mjs --live
```

The first command performs no network work. The live command returns exit 2 for a completed names-only review; even all names present would leave values and actual behavior unverified. Current configuration and HTTP receipts are `outputs/hosted-config-preflight-2026-09-11.json` and `outputs/hosted-activation-inventory-2026-09-11.json`.

## Phase 2 — establish recovery and inspect the full catalog

Choose one real recovery path before database writes:

- Enable managed backups for the existing InfFyn organization, then verify an actual completed recovery point. An upgrade or plan badge alone is insufficient.
- Keep the Free plan and have an authorized operator create an access-restricted, encrypted manual database backup through the normal PostgreSQL/Supabase tooling. Verify that it can be restored in an isolated test destination.

Record the backup time, scope, protected artifact or provider reference, recovery point, restore owner and restore evidence. Do not put backup contents, passwords, keys or signed download URLs in this repository. Include storage-object recovery if the app retains uploaded files there: database backups alone do not include Storage API objects. See [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

Use the fixed catalog inspection in [DATABASE-PREFLIGHT.md](DATABASE-PREFLIGHT.md) to inspect grants, policies, function signatures/hashes, constraints, triggers and retained migration fingerprints. Purpose-built MCP metadata calls have succeeded. The fresh CLI's earlier generic `execute_sql` inspection was rejected before execution because it required an approval that its `never` policy could not grant; no approval setting was weakened. Native `psql`, `pg_dump` and `pg_restore` are not currently on PATH. Complete inspection through an authorized supported transport; do not treat the partial metadata receipts as a replacement.

Reconcile the known `0009` and retired-scaffold differences explicitly. Any additional drift needs review before applying the five candidates. Do not rewrite history to force the default fresh-schema comparison green.

The live Supabase advisor also reports these review items. Its category count is not its affected-object count; see `advisors-affected-objects.json` for the sanitized details:

| Finding | Observed objects | Required disposition |
| --- | --- | --- |
| RLS enabled with no policy | `audit_aggregates`, `ingest_jobs` | Check effective grants and the intended service-only access before adding any browser policy. No-policy RLS can be intentional denial. [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) |
| Signed-in users can execute a security-definer function | `create_tenant` | Local source intentionally permits authenticated tenant creation and checks `auth.uid()`. Verify the hosted function body hash, search path, grants and caller-bound membership behavior; do not equate this warning with a proven exploit or revoke it blindly. [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |
| Leaked-password protection disabled | Auth setting | Assess the enabled authentication methods and password policy. Current app login is email magic-link only; do not claim password hardening verified. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| Foreign-key indexing and RLS initialization performance | `usage_events`; nine RLS findings across eight tables | Review actual policies and query plans before targeted performance changes. [Foreign-key guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) |
| Unused indexes | Nine index findings | Preserve indexes during activation. Lack of observed usage on a dormant application does not justify deleting them. [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) |

## Phase 3 — apply and configure a controlled hosted build

After Phase 2 passes, apply the exact reviewed candidate files, preserving their version identifiers and hashes. Use transactions and bounded lock/statement timeouts; stop and inspect any failure before retrying. Do not run a blanket `db push` against the divergent history. Re-run the catalog inventory and security advisors after application.

Use the existing authorized Vercel projects. Inventory environment variable names separately from values. Enter keys only through approved hosting secret-entry controls; never paste them into chat or pull them into a report.

| Service | Foundation for hosted CSV acceptance |
| --- | --- |
| App | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ENGINE_URL`, matching `AUDIT_PROXY_SECRET`; approved app origin; non-preview configuration in the controlled acceptance deployment |
| Engine | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, matching `AUDIT_PROXY_SECRET`, approved `APP_BASE_URL`, JWT/JWKS configuration and the audited monthly feature/retention flags |
| Authentication | App callback `/auth/callback` allowlisted on the exact acceptance origin; tested email magic-link delivery; two separate verified test owners |
| Access | Existing complimentary-access process for designated synthetic companies; never simulate payment or enable live billing to make an acceptance test pass |

The login interface currently uses email magic links. Deferring marketing/product emails does not remove the auth-email dependency. No login email is sent by this plan or its preparation tools.

Keep the public review experience available while testing a restricted non-preview deployment. Deploy the engine first, then the app against that exact engine. Do not switch the shared review alias to an unverified customer configuration. Connector credentials are not needed to verify CSV persistence, but all three connectors remain required before the public company launch.

## Phase 4 — prove the hosted company workflow

Run [HOSTED-MONTHLY-ACCEPTANCE.md](HOSTED-MONTHLY-ACCEPTANCE.md) with two dedicated synthetic companies, real owners and securely supplied sessions. Do not extract browser cookies or tokens into chat.

- Sign in, provision the company and define a workload.
- Import known CSV evidence, save a monthly draft, return in a new session and recover that preparation.
- Reject stale draft updates and cross-company reads/writes.
- Calculate and save an immutable report; verify dashboard, report and export totals agree.
- Save a correction as a new version and show that the earlier report remains unchanged.
- Test invoice lineage and over-allocation against an authorized retained Stripe test import when available; until then, mark those hosted cases pending.
- Separately verify the browser sign-out/return flow, membership revocation, expired evidence/access, monitoring delivery, retention scheduling and restoration.

Local fixtures prove calculation and test-runner behavior only. A hosted public demonstration is not this acceptance run.

## Phase 5 — provider verification and launch handoff

Complete [PROVIDER-ACCEPTANCE.md](PROVIDER-ACCEPTANCE.md) for OpenAI, Anthropic and Stripe using organization reporting access, a known completed period and independently known totals. Test coverage, pagination, partial failure/resume, duplicate retries, revocation and reconnection. Stripe data authorization and InfFyn subscription billing are separate.

After core, provider and operational gates pass, complete the existing commercial release checks without changing pricing. Stephen receives a working URL, isolated demonstration, clean onboarding path, executive report and engineering acceptance record. A remaining blocker stays visible; no fixture or configuration-presence check becomes a production-readiness claim.

## Recovery if activation fails

Keep launch closed. Roll back the app/engine to the previously verified deployment and disable the affected feature. Preserve additive tables and historical reports. Do not reverse data-bearing migrations as routine rollback. Use database restoration only through the separately tested recovery procedure when the failure requires it.

## Inputs still required

1. A verified recovery path for this existing database. A paid upgrade requires the owner's billing decision; manual backup requires secure operator connection setup.
2. Supabase runtime credentials entered privately into the authorized hosting projects, plus the auth callback/delivery setup.
3. Two designated real test identities and their complimentary company access for hosted acceptance.
4. Authorized provider accounts and independent period totals for connector acceptance.

The account login itself is complete. Repeating OAuth will not create a backup, populate hosting configuration or prove the company workflow.

## This phase's implementation and verification

- Added the separately versioned Stripe schema convergence and its observed-baseline migration planner. Preserved all historical migrations and strict drift reporting.
- Added the hosted configuration names preflight and verified its output against the two authorized Vercel projects.
- Confirmed backup availability in signed-in Chrome. No backup, billing change, remote SQL, migration, environment mutation or customer-data intake occurred.
- Retrieved live security/performance advisory categories and affected-object metadata. Their disposition remains separate from RLS-enabled flags and local test success.
- `node --test tests/database-activation.test.mjs tests/database-preflight.test.mjs tests/hosted-config-preflight.test.mjs tests/hosted-acceptance-runner.test.mjs`: **51 passed**. These are local tests of migrations, preflights and simulated transports.
- `node tests/fresh-migration-chain.test.mjs`: **16 migrations replayed** in disposable PostgreSQL with Supabase stubs; seven monthly tables force RLS.
- `node tests/monthly-migration.test.mjs`: **12 PostgreSQL checks passed**, covering tenant contracts, immutable reports, credential grants, revision conflicts, lineage-related selection constraints and retention.
- Hosted authenticated/provider/restore acceptance remains pending. The implementation delivered in this phase is upgrade and activation preparation; it has not switched the review deployment into a customer workspace.
