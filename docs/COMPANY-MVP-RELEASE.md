# InfFyn company-facing MVP

**September 11 private-alpha decision:** [PRIVATE-ALPHA-ACTIVATION.md](PRIVATE-ALPHA-ACTIVATION.md) is the current milestone. Restricted real-CSV use for Ryan and Stephen requires verified manual recovery and hosted acceptance; managed backups, provider connections, paid billing and public launch are deferred. Older all-provider gates below describe the later public release.

Current activation status: [ACTIVATION-PLAN.md](ACTIVATION-PLAN.md) records the September 11 authenticated Supabase inspection, historical migration mismatch, added convergence migration, missing hosted configuration and recovery requirements. Its access findings supersede the earlier unavailable-account snapshot below; the original release test results remain historical evidence.

September 11 follow-up: the public methodology, downloadable evidence and infrastructure acceptance preparation are deployed and recorded in [METHODOLOGY-AND-ACCEPTANCE-RELEASE.md](METHODOLOGY-AND-ACCEPTANCE-RELEASE.md). The next launch gate requires all three OpenAI, Anthropic and Stripe connectors to pass real authorized verification before opening the company workspace. The earlier verification below remains a record of the initial company demonstration release.

This release follows the approved standalone company-workspace plan. The intended buyer is a founder, finance lead or fractional CFO at a company typically spending USD 10,000–100,000 per month on AI. The existing USD 349/company/month commercial configuration is unchanged. FynScale OS integration remains deferred to Q2 2027.

## Product delivery

- Executive workspace with company/period context, material financial findings, product contribution, internal unit economics, six-month demonstration and source confidence.
- Guided workload purpose/team, outcome acceptance and cost/source setup. A workload represents a business activity, not a model name.
- Connections and Monthly Review are separate. Preparation follows Import, Assign, Reconcile, Review and Save report.
- Server-side company/month drafts retain incomplete preparation with revision checks, fixed evidence expiration, explicit conflict recovery and invalidated confirmations after economic scope changes.
- Provider projects can be assigned to workloads; unresolved costs remain explicit. Prepared imports preserve separate customer-supplied evidence and do not imply missing customer or outcome data exists.
- Bundled Stripe invoices retain their source account, original amount, reviewed dollar allocations and remaining balance. Each allocated portion has stable source lineage. Allocation amount, workload, date and source tampering, duplicate originals/portions and over-allocation are rejected.
- Source amount verification is separate from management's attribution. Stripe imports represent paid-invoice collections, not recognized or incremental revenue. Reviewed invoice splits remain modeled.
- Executive report and evidence appendix retain period, scope, assumptions, source basis, calculation version, confidence and findings. Existing report versions remain immutable.

## Interfaces and migration

New `GET/PUT /v2/monthly/drafts/{YYYY-MM}` uses `expected_revision` and returns the saved revision, content, timestamps, expiry and invalidated confirmations. `POST /v2/monthly/prepare` builds evidence from company-owned retained imports and reviewed assignments. Monthly report requests accept optional import references, cost assignments and invoice allocations; existing CSV requests remain compatible.

`supabase/migrations/20260911031800_company_monthly_preparation.sql` adds the forced-RLS, service-only draft table and an atomic revision-checked save function. Draft expiry never extends the original retention window or referenced source expiration. Workload metadata additions use the existing versioned JSON definition. Calculation version is `monthly-1.1.0`; previous calculation versions remain readable and incompatible comparisons are explained.

## Demonstration and customer workspace

`/demo/monthly` uses a fixed public synthetic endpoint and never loads a tenant, provider credential or customer record. Northstar Intelligence has five workloads, March–August 2026 history, USD 22,600–43,400 included workload costs, a USD 64,000 bundled invoice, a USD 1,200 negative product contribution, USD 1,900 unallocated cost and a USD 220 control discrepancy. Inference and human review are both included and separately broken down. See [COMPANY-DEMO.md](COMPANY-DEMO.md) for the assumptions and evidence-replay procedure.

`/app/monthly` remains authenticated and database-backed. `/validation/monthly` and its bypass proxy are loopback development fixtures only. The prior `/review` browser-local audit is preserved. Demonstration success does not prove hosted account provisioning, persistence, provider access, billing or recovery.

## Hosted release boundary

The existing InfFyn database is the required target: `jmfzmoqdvweeixxwzlma`. Do not create a Blueprint OS project. The connected MCP account and Chrome account do not currently provide access. Inspect the actual migration ledger and backup/restore capability before applying the existing fifteen-file migration chain or its missing subset.

The authorized review hosting remains Vercel `inffyn-preview` and `inffyn-preview-engine`, team `team_sP2wD4MBHG6ACAEpv5pm8rb9`. These stable review aliases retain preview/browser-storage flags. The company demo adds no customer-data intake or provider actions to that environment. CLI deployment packages exclude credentials, repository metadata, research and user-owned output directories.

Customer launch requires actual hosted JWT/tenant tests, database persistence and recovery, each advertised connector's authorized import/retry/revocation test, sign-in delivery, subscription entitlements, monitoring delivery and retention scheduling. Configure the operating identity/support and remaining service notices before paid launch. Missing infrastructure acceptance is blocked, never marked passed from fixtures.

## Verification

Verified September 10, 2026 (US Eastern):

| Check | Evidence |
|---|---|
| Engine | `engine/.venv/Scripts/python.exe scripts/test-engine-safe.py`: 199 passed. Includes source lineage, precise invoice reconciliation, overages, duplicates, stale revisions, retention and invalidated confirmations. |
| Database contracts | `node tests/monthly-migration.test.mjs`: 12 PostgreSQL checks passed. `node tests/fresh-migration-chain.test.mjs`: all 15 migrations replay with Supabase schema stubs; all seven monthly tables force RLS. This is not hosted tenant verification. |
| Preparation and boundaries | 10 preparation-state tests passed, plus demo-isolation, middleware-resilience, review-access and telemetry-privacy suites. |
| Local HTTP | `check-company-http.mjs`: 9 checks; `check-monthly-http.mjs`: 8 checks. Uses loopback synthetic evidence, not hosted accounts. |
| Hosted review | `check-hosted-company.mjs`: 8 checks; `check-hosted-review.mjs`: 19 existing checks. Public synthetic totals reconcile and private/local-only routes remain inaccessible. |
| Build | Local Next production build and final Vercel production build passed TypeScript and static generation. Vercel dependency install reported zero npm vulnerabilities. |
| Chrome workflow | Created a workload through all three setup steps; supplied USD 12,500 and 800 accepted outcomes via CSV; saved, reloaded and recovered the draft; confirmed controls; saved an immutable report with USD 15.63 per accepted outcome. Public report JSON downloaded through Chrome exactly matched the hosted August report. |
| Presentation | Desktop overview, workload wizard, invoice split and report inspected in Chrome; keyboard Tab/Enter navigation verified. Static responsive/focus review fixed the hidden tablet workload list, narrow KPI cards and focus contrast. Viewport override did not change Chrome's measured width, so narrow-screen visual verification remains open. |
| PDF example | Two-page deterministic standalone PDF rendered from the actual exported August facts; both pages visually checked, fingerprint/totals verified. Native browser print preview was not inspectable and remains an acceptance item. |

Final review deployment identifiers:

- Application: `dpl_Cwn4ZZCyoS5L4C4TwewS9RK6HhZ6` at `https://inffyn-preview.vercel.app/demo/monthly`.
- Engine: `dpl_8UVG599YaxF4z3cUUVHHgpveVKbS` at `https://inffyn-preview-engine.vercel.app`.
- Demo August fingerprint: `3fb69317960b729f7578f41813de2f436ec413ef5ea6908133702cb9a4b61e01`.

The review release is available for Stephen. Customer production launch is not approved by these checks: InfFyn Supabase access, migration inspection, actual hosted authentication/tenancy/recovery, authorized provider imports, operational monitoring and the remaining visual acceptance must pass. Engineering owns this acceptance; Stephen evaluates customer usefulness and willingness to buy.
