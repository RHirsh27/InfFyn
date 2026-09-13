# Private-alpha operations and remaining acceptance

The persistent CSV workflow is implemented. This increment makes retention and error-delivery checks operable on the existing protected Vercel frontend and native Render engine. It does not enable real-data intake, billing, connectors, public signup or a public launch.

## Operational behavior

- Retention processes both audit and monthly evidence even while `MONTHLY_ENABLED=false`. A partial failure returns 503 and a safe run ID; it never records completion.
- The existing `/v2/maintenance` and `/api/maintenance` remain protected by separate, server-only maintenance/cron credentials. The application checks the exact Render destination during private alpha and refuses redirects.
- `POST /v2/maintenance/check` emits a fixed synthetic, scrubbed diagnostic event. The application forwards the same check through `POST /api/maintenance` with `X-InfFyn-Maintenance-Action: monitoring`, then emits its own event. Request bodies, credentials and financial evidence are not included.
- An event emission or SDK flush does **not** mean delivery was verified. The operator must find the exact event IDs in Render/Vercel logs and, when configured, the external monitoring destination. External alert delivery remains a separate gate.
- The operator runner pins Supabase, Vercel and Render to the existing InfFyn deployment. It cannot enable intake or change access. It writes metadata-only receipts and flags missing, failed, future-dated or overdue sweeps.
- The company screen retains the actual complimentary-access state while uploads are paused. It provides activation status and invitation administration instead of incorrectly telling an admitted owner that their access grant is missing.

The policy remains 90 days for raw evidence and 12 months for reports. Seven-day encrypted backups are a separate operator responsibility. Retention checks do not prove recovery-key custody or a successful backup.

## Run the daily operator check

Copy `scripts/operations/config.example.json` to the approved private operator folder. Set the existing approved retention policy to true there. Supply its two credential environment references through the secure operator configuration; do not enter secrets as command-line arguments or commit them. The application protection value must be the existing Vercel automation credential, sent as a header only to the protected app.

```powershell
# Configured Windows operator: secure credentials stay outside the checkout.
.\scripts\run-alpha-operations.ps1 -Execute
.\scripts\run-alpha-operations.ps1 -Check

# Safe default: no requests or credential loading.
node scripts/operations/run.mjs

# Explicitly execute retention and fixed synthetic monitoring events.
node scripts/operations/run.mjs --execute --config <private-config.json> --report <new-private-receipt.json>

# Read an array of prior metadata-only receipts; no network or writes.
node scripts/operations/run.mjs --check-receipts <private-receipts.json>
```

A `release_ready: false` receipt is intentional: this runner does not prove the financial workflow or recovery. A sweep older than 24 hours is overdue; a failed sweep prevents the next real-data session. Retry the same command after correcting the failure. Sweeps are idempotent. Receipt paths must be new, so prior operator evidence is preserved.

Vercel Preview does not run the configured Production cron. The private alpha requires an operator sweep after each active day and before resuming if overdue. Do not present this as an automated schedule. [Vercel cron scope](https://vercel.com/docs/cron-jobs)

## Database retention proof

`scripts/operations/retention-proof.sql` creates known synthetic fixtures, exercises the existing service-role retention function, verifies financial-table browser grants, a rejected cross-company draft RPC, report immutability, raw/report expiry, retained lineage and repeat sweeps, then rolls the entire transaction back. It neither migrates the database nor changes an Auth identity. Execute it only on the existing project through the approved native PostgreSQL transport with `verify-full` TLS and `ON_ERROR_STOP=1`; do not bypass the SQL-tool approval boundary.

On September 13 this proof passed ten assertions against `jmfzmoqdvweeixxwzlma`. The native session ended with rollback. Private receipt: `activation-evidence/retention-rollback-proof-20260913.json` under the private-alpha operator directory. The same SQL is exercised with disposable PostgreSQL fixtures in GitHub Actions. Neither run is a two-user authenticated application test.

## Access and activation sequence

1. Retention policy and maintenance secrets are configured through secure hosting settings. Keep `MONTHLY_ENABLED=false` until the remaining gates pass. A retention-approved status may make company invitation administration available without enabling CSV intake.
2. Create email-bound complimentary invitations for the two named alpha accounts. Stephen redeems his own invitation after email verification. Ryan's access-admin role does not grant him access to Stephen's company evidence. No automatic invitation email is sent.
3. Verify maintenance responses and scrubbed test events on the deployed commit. If Sentry is used, configure both service projects and verify exact event delivery and the intended error notification. Platform log visibility alone is not external alert delivery.
4. Record the owner's confirmation of an independent recovery-key copy. Never read, transmit or store that key with the backup archive, source code or chat.
5. Enable the monthly workflow for the reviewed synthetic acceptance run; use two explicitly designated empty companies and genuine authenticated owner sessions. Run the existing hosted monthly and reviewed-import runners, followed by browser sign-out/return and exports. Do not substitute an administrative token or manually confirmed Auth row for an owner's session.
6. Only after these checks pass, hand Stephen the working private-alpha workspace. Provider imports and public production readiness remain deferred.

## Current open inputs

At the start of this phase, Ryan's Auth account was verified, Stephen's was not, and there were no saved monthly reports, reviewed imports, drafts or complimentary grants. Sentry had neither configured deployment variables nor an authenticated operator/browser session. Independent recovery-key custody had not been confirmed. These observations are separate from the completed database restore and migration rehearsal.

The pending external checks must be reported as pending until executed. The checklist in [PRIVATE-ALPHA-ACTIVATION.md](PRIVATE-ALPHA-ACTIVATION.md) is the release record.
