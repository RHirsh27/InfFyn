# InfFyn standalone monthly release

**Current milestone:** [PRIVATE-ALPHA-ACTIVATION.md](PRIVATE-ALPHA-ACTIVATION.md) governs the approved restricted real-CSV alpha. Managed backups, provider connections, paid billing and public launch remain deferred; verified manual recovery and hosted alpha acceptance are required.

Current activation status: [ACTIVATION-PLAN.md](ACTIVATION-PLAN.md) supersedes older account-access and migration-baseline statements below. Supabase metadata access is now verified; database activation and hosted company acceptance remain pending. The later all-three-connectors launch gate in COMPANY-MVP-RELEASE.md still controls public launch.

Implementation date: September 10, 2026 (America/New_York). The company-facing refinement is recorded in [COMPANY-MVP-RELEASE.md](COMPANY-MVP-RELEASE.md); that document supersedes this implementation snapshot where they differ. Historical verification and the hosted review remain separately documented.

## Product and commercial decision

One independent company workspace answers: what did our AI cost, what revenue or accepted work is associated with that cost, how well is the evidence supported, and what changed since last month? Product and internal workloads share the calculation engine and reporting history. Product workloads show associated revenue and contribution. Internal workloads show accepted work and modeled capacity without inventing revenue.

The approved offer remains $349 USD per company per month, with public signup and separate complimentary access. Stephen owns customer validation; engineering owns implementation and release verification. The target is a focused ten-working-day release, contingent on infrastructure and account access. FynScale OS integration is deferred to Q2 2027. Company ownership, stable workload IDs, versioned APIs and revocable access remain independent of the future OS integration.

## Implemented

| Area | Delivered behavior |
|---|---|
| Standalone workspace | `/app/monthly`: Overview, Workloads, Data, Reports and Settings. Existing sign-in, company provisioning, access invitations and subscription services are reused. Default authentication and billing returns lead into monthly reporting. |
| Inputs | Strict CSV validation for usage, dated rates, additional costs, revenue/adjustments and outcomes. Choose event costs, aggregate provider costs, or AI expenses/subscriptions. Missing prices stay unknown. No fabricated request events for aggregate provider charges. |
| Cost and value | Decimal calculation; billed event costs before supplied reference rates; supporting costs and failed work included. Customer/feature/model breakdowns, allocation sensitivity and evidence traces reuse the v2 engine. |
| Evidence confidence | Separate cost, revenue-association and outcome scores. Each has five checks worth 20 points; pass earns 20, unknown/fail earns zero. Reports show each result and what needs review. Scores are checklist completion, not statistical probability or causality. |
| Monthly performance | One explicitly selected immutable report per company/month. Up to 12 selected months, included spend, inference costs, unallocated costs, contribution, accepted-unit cost, volume, acceptance rate, and evidence-score history. |
| Comparability | Consecutive completed calendar months; consistent workload definitions, cost scope, units, mappings, allocation/revenue basis, currency and calculation versions; complete included cost coverage. Current months and incompatible history show explanations instead of numeric improvement claims. |
| Baseline comparison | Prior cost per accepted unit × current accepted volume − current included cost. This is a volume-adjusted cost difference, not verified cash savings. Modeled hours and labor capacity remain labeled estimates. |
| Versioning | Changed evidence/definitions/calculation versions create new fingerprints. Duplicate submissions return the same report. PostgreSQL prevents overwriting saved results or source inputs; only expired raw inputs may be cleared. Selection replacement requires the expected prior version and records actor, time and reason atomically. |
| Earlier audits | Retained full calendar-month audits can be adopted into monthly reporting. Their original records stay unchanged. Partial periods require a new correctly scoped upload. |
| Provider connectors | Bounded, read-only OpenAI/Anthropic organization reports and Stripe paid-invoice imports. Cursor progress persists, retries are idempotent, concurrent steps use compare-and-set, and failed imports can resume. Each import is bound to its starting credential generation or Stripe account; replacing it requires a fresh import. Each connector is disabled until separately verified on hosted infrastructure. |
| Provider trust | Credentials are encrypted server-side. Successful complete imports verify the current connection. Provider-reported cost labels require retained imported records matching the amount/date/source; a CSV source label alone cannot claim verified import provenance. |
| Overlap controls | A provider project/workspace maps to one workload. Duplicate economic IDs across inputs/workloads and recognized provider-total versus event overlaps are rejected. Arbitrary overlapping customer exports with unrelated identifiers still require reviewer reconciliation. |
| Reports | Full JSON export, printable executive report/PDF, confidence reasons, controls, sensitivity, dimensional detail and trace. Large traces are bounded in the interface; the full retained report is exportable. |
| Security and operations | Forced RLS and service-only grants on six new tables; explicit tenant filters and owner-only credential/deletion actions; paid access enforced on the server. Credential/input validation errors and telemetry omit private payloads. Authenticated retention endpoint and a production-only hourly Vercel cron configuration are included. |

## Provider coverage and limits

- **OpenAI:** organization cost buckets grouped by project and line item. Completion usage grouped by project/model is diagnostic and does not represent all modalities. Obtain organization reporting permission; regular inference credentials may not suffice. Invoice credits, contractual rates and scope still need review.
- **Anthropic:** Claude Platform cost reports grouped by workspace/description and message-usage diagnostics. Provider cost reporting excludes Priority Tier; enterprise chat subscriptions and cloud-resold usage need separate evidence. Null workspace IDs map to `default`.
- **Stripe:** read-only customer authorization is separate from InfFyn subscription billing. Imports scan paid invoices using the payment timestamp for the selected month, including older invoices paid in the period. Output is gross collections; standalone charges, refunds, taxes, credits and revenue-recognition schedules require separate review/adjustments. Nothing infers incremental revenue caused by AI.
- Provider projects are mapped explicitly to workloads before applying imports. Put unresolved shared costs in an Unallocated workload. Aggregate provider evidence cannot supply customer or outcome detail it does not contain; upload those records when needed.
- One connected organization/account per provider per company is supported in this release. Additional accounts require separately reviewed CSV evidence.
- USD only. Thirty workloads per calculation, 100 configured workloads per company, 4 MB combined input, bounded 3.8 MB report, 100 recent report/import entries, and up to 12 selected performance months. Imports cap pages, rows and stored evidence. Larger sources must be aggregated without losing needed business dimensions.
- Provider imports run on demand from the Data screen, with persisted resume progress. This release does not schedule continuous provider synchronization, capture prompts/responses, install an SDK, route models, enforce spend, benchmark other customers, or promise savings.

Provider contract references checked during implementation: [OpenAI organization usage and cost objects](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage), [Anthropic usage/cost reporting and exclusions](https://platform.claude.com/docs/en/manage-claude/usage-cost-api), and [Stripe invoice listing](https://docs.stripe.com/api/invoices/list). These establish the documented contracts; they do not establish successful access to a customer's organization.

## Database and deployment

New migration: `supabase/migrations/20260911015433_standalone_monthly_economics.sql`. It adds workloads, monthly reports, selections, selection events, encrypted connections and retained import jobs, plus service-only selection/workload/expiry functions and report immutability enforcement. It is additive to the existing 0001–0013 chain. The complete fourteen-file chain has been replayed against empty disposable PostgreSQL with Supabase auth/storage schema stubs. Hosted auth/storage behavior and the actual migration ledger still require the selected Supabase project.

Existing preview targets under the user's Vercel team are `inffyn-preview` and `inffyn-preview-engine`. The preview remains a separate review service; browser-local review history is not hosted monthly persistence. No new database or public production release has been provisioned by this implementation.

The user explicitly selected the existing InfFyn database, not Blueprint OS or a new project. The local project reference is `jmfzmoqdvweeixxwzlma`. Both the connected Supabase inventory and Chrome account expose only Blueprint OS; the project lookup returns permission denied. Connect the account that owns InfFyn, inspect its migration ledger and backup/recovery position, then apply reviewed additive changes. Do not create a replacement database or reuse another product's database. The old `DA-CTO/InfFyn` Git remote is unavailable; the user's `RHirsh27/InfFyn` repository is accessible with administrator permission but has a separate public scaffold history. No source publication or Git remote replacement is implied by a CLI review deployment.

### Configuration contract (names only)

| Service | Required configuration / gate |
|---|---|
| App | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ENGINE_URL`, `AUDIT_PROXY_SECRET`; production origin and approved Supabase redirect URLs. `INFFYN_PREVIEW_MODE` must be false for the customer workspace. |
| Engine foundation | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, approved JWT/JWKS setup, `APP_BASE_URL`, same `AUDIT_PROXY_SECRET`; `AUDIT_V2_ENABLED`, `AUDIT_RETENTION_APPROVED`, `MONTHLY_ENABLED` only after the corresponding acceptance gates. |
| Provider imports | `PROVIDER_TOKEN_ENC_KEY` is a separate server-only Fernet key. Independently activate `OPENAI_IMPORT_ENABLED` and `ANTHROPIC_IMPORT_ENABLED` only after known-value hosted imports. Customers enter their own reporting credentials through the authenticated owner flow. |
| Stripe customer data | Existing `STRIPE_SECRET_KEY`, `STRIPE_APP_CLIENT_ID`, `STRIPE_OAUTH_REDIRECT_URI`, `OAUTH_STATE_SECRET`, `STRIPE_TOKEN_ENC_KEY`; enable `STRIPE_IMPORT_ENABLED` after read-only authorization, refresh, revoke and evidence acceptance. |
| InfFyn subscriptions | Existing `STRIPE_BILLING_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_BILLING_PRICE_ID`; $349 monthly USD price must be verified. `BILLING_PRICE_APPROVED`, `BILLING_ENABLED`, and finally `BILLING_LIVE_APPROVED` are independent gates. No charge or live activation was performed. |
| Retention | App `CRON_SECRET` and a distinct `MAINTENANCE_SECRET` (32+ characters), with the same `MAINTENANCE_SECRET` on the engine. Production deployment uses `app/vercel.production.json`, which schedules hourly `GET /api/maintenance`; it forwards an authenticated request to engine `POST /v2/maintenance`. The existing preview configuration does not enable this cron. |
| Monitoring | Approved Sentry project configuration. Both services disable performance/replay capture for this workflow and retain only scrubbed error type/location metadata. Verify actual error delivery and alert ownership; local redaction tests do not establish monitoring. |

Keep all key values out of chat, command output, source control, reports and logs. Use secret-entry mechanisms at the chosen provider. Retention is 90 days for authenticated raw evidence/imports and 12 months for reports and normalized traces; physical cleanup, backup deletion lag and restoration require hosted verification.

## Release sequence and remaining gates

1. **Existing target access:** connect the account owning Supabase project `jmfzmoqdvweeixxwzlma`, inspect migration drift and verify backup/recovery before applying additive migrations. Confirm production domain, operating business identity, support address and InfFyn Stripe merchant account. No secrets are requested in chat.
2. **Foundation:** inspect the existing InfFyn database ledger, apply only missing reviewed additive migrations, verify grants/RLS and establish backup/restoration. Configure engine/app origins and JWKS. Deploy engine before application.
3. **Hosted core acceptance:** use two test companies and actual authenticated sessions. Verify signup/recovery, membership, tenant rejection, upload, save/return, immutable correction, report selection, export/deletion, expired entitlement and retained historical access. Confirm the old review mode cannot expose these routes.
4. **Connector acceptance:** for each provider, verify an authorized known-value period, pagination, partial failure/resume, duplicate retry, encrypted credential handling, revoke and reconnection. Reconcile the known total and coverage with source controls. Leave any unverified connector disabled; CSV remains the alternative once the core workspace is live.
5. **Commercial/operations acceptance:** publish completed terms/privacy/refund/support information. Test hosted Stripe checkout, signatures, out-of-order/duplicate webhooks, renewal failure, cancellation and portal. Verify auth email delivery, rate limits, safe errors, scheduled expiry, controlled monitoring errors and restore drill. Activate live billing only after these checks.
6. **Stephen handoff:** provide the working customer URL, a clean company workspace, the founder guide below and engineering evidence. Stephen can then validate usefulness and willingness to pay with design partners. Customer interviews are not a substitute for steps 2–5.

If a provider review or credential is delayed, the scope decision is to launch the verified core and enabled sources after the production gates pass. Do not convert an unavailable integration into a demo result or claim this local build is production accepted.

## Verification record

Passed locally: **163 engine tests** with external networking and project `.env` loading disabled; **9 monthly PostgreSQL checks**; replay of **all 14 migrations** against an empty disposable database; **8 app-to-engine HTTP checks**; authentication-return, middleware and telemetry-privacy checks; TypeScript; and the **Next.js 16.3.4 production build**. Production npm dependencies reported **zero known vulnerabilities**. Two existing Python warnings concern the Starlette test-client transition and a deliberately short fake HMAC key in an authentication test.

Chrome verification covered workload creation, CSV entry, independent controls, product calculation and saving, report reopening, evidence reasons/traces, internal monthly comparisons and disabled connector states. Hosted tenant/auth/provider/payment/retention/restore tests remain outstanding. Repeatable commands are listed here; none uses customer data:

```powershell
.\engine\.venv\Scripts\python scripts/test-engine-safe.py
node tests/monthly-migration.test.mjs
node tests/fresh-migration-chain.test.mjs
npx --no-install tsx tests/auth-return.test.ts
npx --no-install tsx tests/telemetry-privacy.test.ts
npm run test:middleware
npm run typecheck --workspace app
# With the two loopback validation services running:
node scripts/check-monthly-http.mjs
# Stop the app development process before building to avoid a shared .next cache:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-validation.ps1 -Target build
```

The Chrome walkthrough used explicitly synthetic records: a product with $35 included costs, $100 associated revenue, $65 contribution and $15 modeled capacity, and internal July/August reports with costs of $20/$30 and accepted quantities of 2/6. The latter produces +50% spending, −50% unit cost and a $30 volume-adjusted baseline difference. These are test outcomes, not business savings or live-provider acceptance.

## Release recovery

If hosted acceptance fails, disable the affected connector or monthly release flag and restore the previous verified app/engine deployment. The additive schema and historical reports can remain in place. Do not reverse migrations that contain customer reports as a routine rollback. A database restoration must first be rehearsed in an isolated destination, including access controls, expiry processing and credential-key availability.
