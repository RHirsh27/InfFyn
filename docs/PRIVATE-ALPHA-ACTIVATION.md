# InfFyn private alpha: activation and acceptance

Updated September 12, 2026. **Source is on GitHub and protected previews are deployed; the private alpha is not yet activated.** This milestone accepts real CSV evidence from Ryan and Stephen after recovery and hosted checks pass. Provider imports, paid billing, managed backups and public launch remain deferred. Older all-provider launch gates apply to the later public release.

The persistent Python engine is deployed on Render at https://inffyn-engine-alpha.onrender.com. All seven missing migrations are now applied to the existing Supabase project, and database admission is enabled for the two named accounts. Ryan is verified; Stephen must verify his email. Retention approval and monthly intake remain disabled. The protected feature-branch frontend now uses this engine and the existing Supabase Auth service. Ryan completed an actual email sign-in and reached the activation-gated company workspace; the public review aliases are unchanged. See [the deployment evidence](RENDER-PRIVATE-ALPHA.md#hosted-verification-on-september-12-2026). No Docker is required.

### September 12 verified connection and recovery progress

Source is now published on GitHub, and both Vercel projects build protected stateless previews from the feature branch. Database migrations and named-account admission are complete; release of company financial operations remains pending. The previous local-only implementation description is historical.

The Supabase Free plan includes database and authentication services. A paid-plan upgrade is not required to connect this application. The approved manual recovery requirement remains separate from managed-backup pricing.

Native PostgreSQL authentication now succeeds against the dashboard-confirmed session pooler, `aws-1-ca-central-1.pooler.supabase.com:5432`, with project-bound user `postgres.jmfzmoqdvweeixxwzlma` and `verify-full` TLS. The source reports PostgreSQL **17.6**. The full read-only catalog inspection completed, confirming the legacy ledger through `0011` and all 11 existing public application tables with RLS enabled. No migration was applied.

The initial connection probe showed that the session pooler did not preserve the requested startup `default_transaction_read_only` setting. The existing catalog and backup inventory queries use explicit `BEGIN READ ONLY`; the live catalog returned `transaction_read_only=on`. Do not rely on `PGOPTIONS` alone as the read-only boundary.

A full native database and roles capture completed and was encrypted through age. The schema/permissions and row-count inventories matched before and after capture. Application-writable tables were temporarily held in SHARE mode for that capture and the transaction was rolled back afterward; managed read-only tables and permissions were left intact. No application rows were changed. The trusted receipt and encrypted files remain outside the repository.

**Recovery progress, September 12 evening:** Chrome uploads now work. The database, roles and manifest archives were uploaded to the designated private Drive folder, downloaded and hash-verified. The downloaded database restored into isolated native PostgreSQL 17.11 with Vault 0.3.1; schema, functions, grants, policies, indexes, triggers and row counts matched. The source bootstrap role and database owner were reproduced. Seven Storage objects were separately encrypted, uploaded, downloaded and restored with matching hashes. This verifies API-visible object bytes and metadata; it does not prove physical orphan enumeration or a hosted Storage-service restore. A separate password-manager copy of the age identity remains outstanding before real-data intake.

The seven migrations passed rehearsal on the restored database with Supabase's policy-management library, then were applied through the authorized native connection. A fresh full encrypted database capture was uploaded immediately before live migration. The source's eleven historical ledger records remain unchanged. The post-migration catalog contains all eighteen versions and the new financial/private tables have RLS and no browser SELECT grants. No billing or provider feature was activated.

Ryan and Stephen's Auth UUIDs are registered privately. Stephen was created with email confirmation false, without a password or email message. Database admission additionally checks current email verification, so pre-registration does not admit him yet. Ryan received invitation-administration rights; company memberships were not changed. Live role checks admitted Ryan, denied unconfirmed Stephen and an excluded identity, and denied legacy writes. Genuine authenticated HTTP sessions remain a separate acceptance check.

**Step 4 completed, September 12 evening:** Chrome confirms `ryan@inffyn.xyz` is an InfFyn organization Owner. The project settings and public-key pages work. Disabled sidebar annotations were not sufficient evidence of an account-permission problem: following the observed settings URL opened the authorized page. The separate MCP connector still denies publishable-key retrieval; it was not used to change access or bypass permissions.

The protected Vercel feature branch now has the Supabase public client key, project URL, server-only UUID allowlist, alpha markers and Render `ENGINE_URL`. A dedicated proxy credential is configured on both services. The branch overrides the old Vercel-engine protection header with an empty value so that credential is not forwarded to Render. Production settings and public review aliases were preserved.

Supabase's default Site URL now uses the protected branch origin. Three exact callback entries cover the callback itself, `/app/monthly` and `/invite`; earlier entries were preserved. Public signup and anonymous sign-in are disabled, and email confirmation stays enabled. Existing SMTP delivered Ryan's real magic-link message from `noreply@inffyn.xyz`; Gmail classified it as Spam. The link completed the callback and opened `/app/monthly`, and a reload retained sign-in. This verifies Ryan's email/authentication and the app-to-Render activation response, not saved financial evidence or Stephen's sign-in. Email deliverability still needs attention.

**Next activation gate:** finish operator-run retention and scrubbed monitoring checks, obtain the independent recovery-key copy, issue/redeem complimentary company access and execute the synthetic two-company workflow. No real company CSV was uploaded in this connection check. The September 13 [operations increment](PRIVATE-ALPHA-OPERATIONS.md) adds protected maintenance checks, safe operator receipts and the live rollback-only database retention proof; hosted execution is recorded separately.

The activation planner now includes all seven outstanding migrations, ending with reviewed CSV imports. Its prior six-candidate list rejected the current 18-file repository. The planner still only prepares a review plan and never authorizes or executes database changes. GitHub Actions now runs the activation and catalog preflight regression suites.

Historical MCP/account problems are separate from this verified native connection. Explicit-scope MCP authorization completed after selecting the correct account, although the existing tool client's token refresh remained unavailable. If reauthorization is needed in a fresh client, the previously accepted command was:

```powershell
codex mcp login supabase --scopes organizations:read,projects:read,database:read,database:write,environment:read,environment:write,secrets:read,storage:read
```

Use the account granted access to the existing InfFyn organization. Do not authorize a substitute Blueprint OS organization, change the project reference or claim a configured MCP entry proves a working session. Do not publish authorization URLs or credentials. The native connection uses its own protected password file; it is not evidence of working MCP access.

## Scope and current position

| Area | Implemented or observed | Remaining acceptance |
| --- | --- | --- |
| Company workflow | Workloads, CSV preparation, revision-checked drafts, reconciliation, reports and comparisons | Complete authenticated hosted workflow |
| Alpha admission | Database and both services have the two-user allowlist; Ryan signed in; Stephen registered but unconfirmed | Stephen verification and authenticated excluded-user checks |
| Closed routes | Positive route lists block legacy intake, anonymous persistence, provider and billing mutations; twelve Render engine probes passed | App probes and authenticated exclusions after identity setup |
| Reports | New server-owned alpha context enters immutable fingerprints; existing reports unchanged | Hosted report/export/dashboard agreement and corrections |
| Recovery | Encrypted offsite retrieval, full database restore and seven Storage-object byte restores passed | Independent recovery-key copy; hosted Storage-service restoration remains separate |
| Local recovery rehearsal | Downloaded Supabase backup restored in isolated native PostgreSQL 17 with real extension binaries; seven migrations rehearsed | This does not establish hosted application acceptance |
| Supabase | Seven migrations applied; 18 ledger versions preserved; controls and owner access checked; exact callback and signup settings saved | Two-company authenticated acceptance |
| Stephen | `stephen@fynscale.com` pre-provisioned without confirmation or message | Magic-link verification and complimentary invitation redemption into his own workspace |
| Hosting | Render and protected Vercel frontend connected; Ryan email callback passed; public review preserved | Email deliverability, monitoring/retention, access grants and financial workflow acceptance |

Public aliases remain unchanged: [review](https://inffyn-preview.vercel.app/review), [synthetic company](https://inffyn-preview.vercel.app/demo/monthly), [methodology](https://inffyn-preview.vercel.app/methodology). They are not private-alpha acceptance evidence.

## Local verification on September 11

- Engine: **280 tests passed**, including signed-identity admission, current email-confirmation checks, safe failures, route denial, company access and immutable report context.
- App: **11 alpha tests**, middleware regression, TypeScript and safe production builds passed, including the final build with private-alpha mode enabled and the sign-out safeguard. Hosted visual and fresh-session checks remain pending.
- Combined app/acceptance/recovery/database-preflight/setup suites: **109 tests passed**, including **9 private-alpha database boundary tests**.
- All **17 migrations** replayed in disposable PostgreSQL with Supabase stubs; **12 monthly database checks** passed separately.
- Real PostgreSQL/age synthetic backup and restore passed. Actual Supabase/Drive recovery is still pending.
- Both source packages were produced with exact project checks and fixed alpha markers. No deployment or public alias change occurred; regenerate packages after any later code change.

Offline hosted acceptance is recorded in `outputs/private-alpha-acceptance-pending-2026-09-11.json`; every hosted item remains pending. No auth identity, permission, production environment, remote database or company record was changed during this implementation.

## 1. Secure connection and recovery

Use only Supabase `jmfzmoqdvweeixxwzlma`. Ryan owns manual recovery. Keep [inffyn data backup](https://drive.google.com/drive/folders/1tYakoV7ywyRpY1GTYEG2R2ocvV1a558O) private to `ryan@inffyn.xyz`. The connected Drive connector has a different identity; use signed-in Chrome without changing sharing.

The existing database password and trusted certificate are needed. Dashboard OAuth does not supply that password. Do not reset credentials or paste them into chat. Preview setup offline:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-private-alpha-db.ps1
```

The public certificate linked by the signed-in InfFyn database dashboard is bundled in `scripts/certificates/` and checked as a certificate without a private key, valid through April 2031. SHA-256: `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`. Initialization now verifies and copies it to `%LOCALAPPDATA%\InfFyn\private-alpha\certificates\supabase-prod-ca-2021.crt` when absent, so a fresh checkout does not need a manual certificate download. Existing mismatched certificates are never overwritten. `-PrepareCertificate` performs just this offline public-certificate step without prompting for a password. Run initialization in your own terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-private-alpha-db.ps1 -Initialize
```

Setup prompts without echo, creates an owner/SYSTEM-only directory outside the repository, refuses overwrites and writes a dedicated libpq password file. It never contacts a database. On another workstation, supply `-RootCertificate` with its own trusted certificate path. If IPv4 requires the session pooler, supply its exact dashboard host with `-DatabaseHost` and project-qualified `-DatabaseUser`; do not invent a host from a region.

Follow [PRIVATE-ALPHA-BACKUP.md](PRIVATE-ALPHA-BACKUP.md) to generate and separately retain an age identity, capture, upload only the encrypted archives, download to a different directory and restore into a compatible isolated local cluster. The recovery key, password, trusted receipt and env files stay out of Drive. Native PostgreSQL and age are installed; no application database service was activated by installation.

Actual backup, Drive retrieval, hosted-schema restoration, Storage coverage and independent key recovery must pass before migrations or real-data sessions. A zero Storage metadata count alone does not prove an empty object store. A full restore can require matching Supabase extension binaries; do not omit objects or ignore errors to obtain a pass.

Before schema changes and after each active day, take and verify a new encrypted copy. Retain seven days, preserving the last verified recovery point until a newer one is verified. A failed backup pauses the next real-data session. Retention reporting never deletes automatically.

## 2. Inspect and migrate

Run the pinned [read-only preflight](DATABASE-PREFLIGHT.md) with the prepared libpq file and certificate. Inspect grants, policies, functions, constraints, triggers and historical migration hashes. The earlier generic MCP SQL call required unavailable approval; do not change approval settings or disguise that route. Native tooling must have its own working authorized connection.

Preserve remote `0009=drop_scaffold_healthcheck` and the existing ledger. Exact reviewed order:

1. `0012_audit_v2.sql`
2. `0013_release_access.sql`
3. `20260911015433_standalone_monthly_economics.sql`
4. `20260911031800_company_monthly_preparation.sql`
5. `20260911141814_reconcile_stripe_oauth_legacy_history.sql`
6. `20260911155306_private_alpha_database_admission.sql` — closes the direct provisioning/legacy-intake gap found during independent review; the original five keep their order.
7. `20260912190000_reviewed_csv_imports.sql` — persists reviewed CSV preparation, version checks, accepted mappings and source lineage.

Record hashes with the activation planner. Apply only after live catalog and actual recovery checks pass, through authorized tooling with transactions and bounded timeouts. Preserve historical rows and version identifiers. Do not run blanket `db push` or repair history to suppress differences. Re-run catalog/advisor checks afterward. Review any additional drift before proceeding.

The seven monthly tables and privileged RPCs are service-only in the prepared migrations. Browser roles have no direct financial-table grants. Confirm live with anonymous and authenticated callers; allowlists do not replace database controls. Legacy tables and caller-bound tenant RPCs need separate hosted review.

## 3. Identities and ownership

Use the existing `ryan@inffyn.xyz` identity. Pre-provision `stephen@fynscale.com` through approved Auth administration with no password change, automatic signup or invitation email. Record the actual UUID. Do not substitute Stephen's older different-domain account. Magic-link login must confirm email; creating a row does not prove sign-in.

Enter both UUIDs in `INFFYN_ALPHA_USER_IDS` on both services. Never use a `NEXT_PUBLIC_*` variable. An alpha stage marker with missing/invalid admission settings denies access. The allowlist grants no cross-company access.

Use the existing email-bound complimentary invitation process. Stephen redeems and owns his own workspace. Ryan's invitation-administration rights do not grant access to Stephen's evidence. Do not add Ryan as a member without a separate request. Redemption lands on `/app/monthly`.

Disable public signup in Supabase as part of the reviewed alpha setup, preserving legitimate identities and data. Verify callback, confirmation, fresh-session return and excluded-account denial. No email to Stephen was sent during implementation.

## 4. Restricted deployment

The later September 12 owner instruction selects **Render native Python for the persistent engine**, without local Docker. Follow [RENDER-PRIVATE-ALPHA.md](RENDER-PRIVATE-ALPHA.md) for the new deployment. Keep the existing Vercel frontend and public aliases. The Vercel engine configuration below is retained as the previous plan and stateless fallback, not the new activation target. Recovery and authenticated acceptance gates are unchanged.

Existing team: `team_sP2wD4MBHG6ACAEpv5pm8rb9`.

| Service | Existing project | Preview-only configuration |
| --- | --- | --- |
| Engine | `inffyn-preview-engine` / `prj_YkyoXtOXd8AtPRdiW8jxcN3JqnIv` | Supabase URL/service credential, `APP_BASE_URL`, matching `AUDIT_PROXY_SECRET`, UUID list, maintenance secret and scrubbed monitoring |
| App | `inffyn-preview` / `prj_jZDPzOm2PZRiwYK43GJ5FTOmZ54c` | Supabase URL/client credential, exact `ENGINE_URL`, matching proxy secret, UUID list, maintenance/cron secrets, monitoring and `ENGINE_PROTECTION_BYPASS` |

Enter credentials through secure Vercel controls scoped to the alpha Preview deployment/branch. Do not pull env files or expose values. Production settings and public aliases stay unchanged. Only the Supabase client credential is public by SDK design; service and protection credentials stay server-only.

Packaging verifies the exact linked project and pins non-secret alpha flags in a temporary package. An independent `INFFYN_RELEASE_STAGE=private_alpha` marker keeps the gate active if the flag is missing. Providers/billing are false. No credentials, backups, research or Git metadata are packaged. Commands below are for use only after secure configuration and preceding gates pass:

```powershell
$inffynEnginePackage = powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stage-private-alpha.ps1 -Service engine -Package | ConvertFrom-Json
vercel deploy --cwd $inffynEnginePackage.package_directory --yes --scope ryanmhirsh-gmailcoms-projects

# Set the exact resulting engine URL in app Preview configuration first.
$inffynAppPackage = powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stage-private-alpha.ps1 -Service app -Package | ConvertFrom-Json
vercel deploy --cwd $inffynAppPackage.package_directory --yes --scope ryanmhirsh-gmailcoms-projects
```

Do not add `--prod`, promote, alias or disable Deployment Protection. Set the final app origin in engine configuration and the exact Supabase `/auth/callback` allowlist. Use a stable private Preview origin; verify the final redeploy still matches. Stephen also needs access through the chosen Vercel protection mechanism, separately from company membership.

Server-to-server protection uses `ENGINE_PROTECTION_BYPASS` in the `x-vercel-protection-bypass` header only. Caller-supplied bypass headers are removed and redirects rejected. This is [documented automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation); JWT/membership checks remain mandatory.

Verify retention with synthetic expired evidence and delivery of a scrubbed test error before real intake. Preserve 90-day raw-evidence and 12-month report retention. [Vercel cron targets Production](https://vercel.com/docs/cron-jobs), so do not claim the existing cron runs on Preview. For this phase, record operator-run retention sweeps and backups after active days; test failure/overdue handling. Automatic scheduling remains a separate hosted check. A failed recovery or retention operation pauses the next real-data session.

## 5. Acceptance and Stephen's handoff

Run [hosted monthly acceptance](HOSTED-MONTHLY-ACCEPTANCE.md) with two dedicated empty synthetic companies and genuine securely supplied sessions. Use empty `approved_import_ids` for CSV-only alpha. Supplemental alpha runner:

```powershell
node scripts/acceptance/run-private-alpha.mjs
```

Default is offline and reports pending. The alpha manifest extends the existing hosted-monthly manifest with `release_stage: "private_alpha"`. See its module for optional excluded-user and direct-database probes. No fixture token proves hosted access.

- [x] Local admission, route denial and immutable-context tests.
- [x] Persistent CSV save recovery and resume implementation; synthetic UI and database-restart tests are documented in [PERSISTENT-CSV-WORKFLOW.md](PERSISTENT-CSV-WORKFLOW.md). Hosted workflow acceptance remains below.
- [x] Native synthetic encrypted dump/restore rehearsal.
- [x] Offline setup rejects wrong projects, unbound poolers and unsafe directories.
- [x] Actual pre-migration backup, private Drive retrieval and native restore of the hosted schema.
- [x] Seven API-visible Storage object bytes retrieved and restored with matching hashes.
- [ ] Independent recovery-key copy; hosted Storage-service restoration remains separate.
- [x] Full live catalog through the authorized native PostgreSQL connection.
- [x] Seven prepared migrations, private database configuration and post-checks.
- [x] Ryan received a real sign-in email, completed the callback and retained sign-in on reload.
- [ ] Stephen sign-in and excluded-user authenticated operations.
- [x] Protected frontend connects to Render; production settings and public review aliases preserved.
- [ ] Two companies isolated via app, direct engine and direct database.
- [ ] CSV, assignment, saved draft, fresh-session return and report.
- [ ] Duplicates, stale edits, invalid allocations and expired evidence rejected.
- [ ] Dashboard/export/report agreement and immutable correction history.
- [x] Hosted negative checks for disabled provider/OAuth, billing and anonymous preview routes; complete the remaining direct Storage and authenticated legacy checks with the two-user run.
- [ ] Improve email deliverability: Ryan's received sign-in message landed in Spam.
- [x] Hosted maintenance sweep and ten rolled-back database retention assertions; scrubbed test events found in both platform logs.
- [ ] External Sentry receipt/alerts and protected access for Stephen.
- [x] Ryan's complimentary invitation redeemed through his actual browser; company ownership checked without granting access to other companies.
- [x] Stephen's separate invitation prepared, unredeemed and unsent; retained in private access administration.
- [ ] Stephen's own complimentary workspace and final alpha URL ready.

Handoff: [connected private-alpha sign-in](https://inffyn-preview-git-codex-p-8fa386-ryanmhirsh-gmailcoms-projects.vercel.app/login) (financial operations still awaiting activation), separate [demo](https://inffyn-preview.vercel.app/demo/monthly), [CSV guide](https://inffyn-preview.vercel.app/examples/CSV-IMPORT-GUIDE.txt), [examples](https://inffyn-preview.vercel.app/examples/InfFyn-normalized-CSV-examples.zip), [executive report](https://inffyn-preview.vercel.app/examples/InfFyn-Northstar-August-2026.pdf) and this checklist. Real uploads retain their evidence labels and never inherit the synthetic demo label.

Engineering proves operation; Stephen validates commercial usefulness. A local pass or Ready deployment does not establish hosted acceptance or public production readiness.

The alpha manifest template is `scripts/acceptance/private-alpha-manifest.example.json`. Its default placeholders and false authorization fields cannot run. Optional `app_protection_env` and `engine_protection_env` refer to securely populated `INFFYN_ACCEPTANCE_*` variables. Protection headers go only to their respective app/engine origins and never to Supabase.

## Database admission addendum: sixth activation migration

The reviewed additive upgrade now ends with **`20260911155306_private_alpha_database_admission.sql`**, after the five previously prepared migrations. This installs the database admission controls **disabled**, with no real UUIDs. It changes no existing company records and does not enable hosted alpha operation by itself.

The service-only `inffyn_private.alpha_configuration` singleton and `inffyn_private.alpha_users` table must be configured through the authorized operator SQL route after recovery and the migration/catalog checks. Insert only the pre-provisioned Ryan and Stephen Auth UUIDs, match both services' `INFFYN_ALPHA_USER_IDS`, then enable the singleton in the same reviewed transaction. A pre-registered unconfirmed account remains denied by the current-user predicate until email verification; never mark its email verified administratively. Do not grant browser access to either private table or expose allowlist values in model receipts. An absent singleton or enabled mode with an empty allowlist denies admission; an explicit disabled singleton preserves standard behavior.

While database alpha mode is enabled, both direct provisioning RPCs (`create_tenant` and `ensure_inffyn_workspace`) require current-user admission. The latter remains idempotent. Restrictive Storage policies close **INSERT, UPDATE and DELETE** into the legacy `ingest` bucket for all browser users; legacy reads additionally require admission and the existing membership policy. Other buckets retain their existing rules. The monthly CSV flow uses the engine's company-scoped persistence and requires no legacy Storage upload permission. The allowlist never grants membership or gives Ryan's access-administrator identity Stephen's company data.

The later **`20260912190000_reviewed_csv_imports.sql`** is the seventh activation migration. Apply and inspect all seven in the planner's order before enabling the database flag. Add hosted probes for excluded direct provisioning calls, excluded/allowed legacy Storage mutations, admitted-member-only legacy reads, unconfirmed identities, empty/missing configuration and repeated workspace provisioning. Verify the service role can read/write private configuration while browser roles cannot. Retain an explicit disabled row if the later standard release turns alpha mode off; do not delete the configuration singleton or reverse historical migrations.

The read-only preflight now includes `alpha_catalog`, covering private schema grants, table/column grants, RLS, columns and constraint fingerprints without reading identity rows. Public helper definitions/grants are covered by the existing function inventory. Encrypted backup and restore inventory includes the private schema and its row counts; the full encrypted dump retains its actual records. Live DB configuration and catalog checks completed September 12; the remaining authenticated company/Storage checks are listed above.
