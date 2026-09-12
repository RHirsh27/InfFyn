# InfFyn v1 release and validation runbook

**Current standalone monthly release:** use [STANDALONE-RELEASE.md](STANDALONE-RELEASE.md) for the September 10 scope, new migration, connector gates, monthly acceptance and production cron configuration. Local monthly validation runs at `http://127.0.0.1:3012/validation/monthly` using the same safe launch commands below.

September 7 latest authority update: the user authorized NEW isolated InfFyn hosting under their own accounts, with Stripe and email delivery disabled so Stephen can preview the working product. The historical Supabase `jmfzmoqdvweeixxwzlma` and Render project are not required targets. See `HOSTED-PREVIEW.md` for the current Vercel projects and storage boundary. Reviewed additive database migrations remain authorized through `supabase db push` once the new project's organization and provisioning cost are confirmed. Never reuse another product's database or inspect/print credential values. The customer-launch acceptance below still applies when cloud persistence and integrations are enabled.

## Run the local validation build

From the repository root, use two terminals:

Install workspace dependencies with `npm ci`. Create `engine/.venv` with Python 3.11+ and install `engine/requirements.txt` with `engine/constraints-v1.txt`. The constraints record the tested dependency versions; the Render blueprint uses them on release. Platform-specific dependencies still require verification on the Linux host.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-validation.ps1 -Target engine
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-validation.ps1 -Target app
```

Open `http://127.0.0.1:3012/validation`. Choose a synthetic example, run/save, inspect the result, then reopen it from history. Repeat for an internal workflow. The same production calculation and route implementation runs with a local SQLite repository and a clearly synthetic company/subscription. Local provider actions are disabled. This does not test Supabase JWTs, hosted RLS or Stripe round trips.

The engine binds only to loopback, and the validation web route requires development mode, a local host and an explicit validation flag. The launch script prevents Next from loading project `.env` files. Local records live in ignored `.validation/audits.sqlite`; keep this directory private and use synthetic data. API tests use separate temporary databases.

## Repeatable local checks

```powershell
.\engine\.venv\Scripts\python.exe scripts/test-engine-safe.py
node tests/audit-v2-migration.test.mjs
npm run test:middleware
npm run typecheck --workspace app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-validation.ps1 -Target build
npm audit
```

The safe Python runner disables `.env` loading and external socket connections. The migration test executes 0012 and its inverse against disposable embedded PostgreSQL, using synthetic auth/tenancy prerequisites. It is not a production-checkpoint migration replay. The revised UI builds with Next 16 and uses `app/proxy.ts` for authenticated routing. Webpack is explicitly selected for consistency between validation and deployment.

## Engine configuration: names only

Existing required configuration remains: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the approved JWT/JWKS configuration. Provider credentials stay engine-side.

New switches default false:

| Name | Activation requirement |
|---|---|
| `AUDIT_V2_ENABLED` | 0012 and 0013 applied and engine deployed; legacy ingest, new-audit and sync routes retire while old reports remain readable |
| `AUDIT_RETENTION_APPROVED` | Founder-approved data terms, backup/deletion treatment and working hourly retention sweep |
| `BILLING_PRICE_APPROVED` | $349 USD/company/month approved September 7; configured price must match |
| `BILLING_ENABLED` | Correct test-mode price, Checkout, webhook and portal acceptance passed |
| `BILLING_LIVE_APPROVED` | Public paid launch authorized September 7; enable only after provider acceptance and business/service details are complete |

New engine-only values: `STRIPE_BILLING_KEY`, `STRIPE_BILLING_PRICE_ID`, `STRIPE_BILLING_WEBHOOK_SECRET`. These are InfFyn's subscription account, separate from the existing Stripe App OAuth key and encrypted customer refresh tokens. Prefer scoped restricted keys where supported. Verify configured price is active USD 34900 cents, recurring monthly with quantity one; the server checks the offer before creating Checkout. Do not put any secret in the Next app or in `NEXT_PUBLIC_*`.

Application configuration remains the public Supabase URL/anon key, server-side `ENGINE_URL` and approved monitoring configuration. Set `APP_BASE_URL` in the engine to the exact application origin. Register Supabase auth callback URLs. The login callback accepts only application-relative return paths.

## Database release: authorized delivery agent

1. Confirm the target InfFyn project and capture `supabase migration list` without reading credential values.
2. Resolve the status of proposed migration 0011 before pushing. **0012 does not depend on 0011, but a blind push may apply all pending migrations.** Review the exact pending set.
3. Review `supabase/migrations/0012_audit_v2.sql` and the matching `supabase/rollbacks/0012_audit_v2.down.sql`. Back up relevant configuration. Rollback deletes v2 tables and reports; export retained v2 data before using it.
4. Apply the reviewed 0012 and 0013 migration set via `supabase db push` after resolving 0011. Verify migration ledger and grants afterward. The agent is authorized to execute this step on the confirmed InfFyn project.
5. Confirm new tables force RLS, revoke browser-role access, and only grant privileged RPCs to service role. Test a real Tenant A JWT against Tenant B's audit, claim, source export, deletion and billing routes.

## Hosted acceptance before customer intake

Use an explicitly approved staging/test company. Never substitute synthetic results for these checks.

- Valid JWKS JWT resolves the expected tenant; wrong issuer, expired token and nonmember tenant are rejected.
- Anonymous preview creates no tenant ownership. Signing in claims it once. Expired/reused tokens fail and no claim token appears in client JSON or JavaScript-readable storage.
- Saved audit and source export return after sign-out/sign-in. Duplicate upload is idempotent; changed inputs create a new version.
- A free account cannot retrieve profitability or reports by guessing audit IDs, using direct database requests or calling retired legacy new-audit routes.
- Existing full reports remain readable after subscription lapse until report expiry. Sources expire independently.
- Connect/revoke/reconnect read-only Stripe App OAuth; credentials remain encrypted. Read invoice evidence and verify a known amount, customer ID, date and currency. Review tax/refunds/credits before treating the file as revenue evidence.
- Test hosted Checkout and customer portal. Confirm the configured portal uses cancellation at period end; disable plan switching to unsupported prices. No automatic refunds. Define the support and refund process before enabling real billing.
- Send a correctly signed test webhook directly to engine `POST /v2/billing-webhook`. Include `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` and `checkout.session.completed`. Verify duplicates, old events, failed renewals, cancellations and reconnect/retry behavior against current provider state.
- Stripe tax settings and registrations must be reviewed for the intended customer jurisdictions. Automatic tax is not enabled by this build. Approve the tax treatment before live billing.
- Run `python -m app.v2.maintenance` hourly in the approved engine scheduler and verify evidence/report expiration. Logical read expiry alone does not establish physical deletion. Record backup deletion lag and legal exceptions in the policy.
- Deliver a safe test error through each service's approved monitoring configuration. No source CSVs, tokens, cookies, request bodies or local variables should reach error telemetry. Session replay and automatic logs are disabled for the financial workspace.

## What is intentionally not in this release

No actual-price freshness feed, multi-currency conversion, invoice reconciliation subledger, real-time monitoring, model routing, autonomous revenue attribution, employee AI-license management or cross-client CFO portal. The Stripe importer produces reviewable gross paid-invoice evidence and excludes standalone charges. Executive reporting is deterministic; there is no LLM failure dependency or generated financial advice.

## Human validation session

With the fractional CFO and a design partner, run one reviewed period. Ask the partner to trace one expensive customer/workflow to its source, explain one missing mapping, compare an allocation assumption, export the report, and name the financial/product decision this changes. Record time to usable output, manual repair time, trusted/contested figures, action taken and willingness to repeat/pay. Preserve the distinction between a working product and validated demand.
