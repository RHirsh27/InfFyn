# InfFyn v1 verification record

September 6, 2026. Build branch: `codex/inffyn-v1-build`. Baseline: `57e324c35d1ebfe05adab0917f021358d83cb67d`. Engine calculation version: `inffyn-2.0.2`; input schema: `2.0`.

**Local validation passes. Hosted-provider acceptance and customer validation remain outstanding.** This is a runnable implementation with a separate synthetic local harness, not a claim that production authentication, payments or customer economics have been validated.

## Automated verification

| Check | Result | Practical boundary |
|---|---|---|
| `engine/.venv/Scripts/python.exe scripts/test-engine-safe.py` | 107 passed | Network blocked; no project `.env` loading. Includes legacy regression coverage and v2 API/math/billing tests. |
| `node tests/audit-v2-migration.test.mjs` | 10 checks passed | Executes migration 0012 and inverse in disposable embedded PostgreSQL. Not hosted Supabase or production-checkpoint replay. |
| `npm run test:middleware` | Passed | Public routes remain usable without Supabase configuration; protected routes fail closed. |
| `npm run typecheck --workspace app` | Passed | TypeScript contract/build check. |
| `scripts/run-local-validation.ps1 -Target build` | Passed | Next 16.3.4 production compilation, page generation and tracing, using Webpack. Configuration loading isolated from customer/provider credentials. |
| `npm audit` | 0 reported vulnerabilities | JavaScript dependency advisory snapshot, not a full security audit. |
| Ruff `--select F` for new engine modules and tests | Passed | No undefined or unused imports/variables in scoped files. |
| `python -m pip check` | Passed | Tested Python 3.11.9 dependency set is compatible; constraints recorded for release. Linux installation remains a hosted check. |

Two Python test warnings remain: Starlette's deprecated httpx test transport, and an intentionally short key used only in the tampered-signature fixture. Neither is a reported test failure or a production credential.

The embedded PostgreSQL suite checks forced RLS on all five new tables, denied browser-role reads/RPCs, membership-checked one-time preview claims, expired claims, durable preview quotas, billing leases, duplicate/out-of-order webhook state, evidence/report retention and a real inverse migration. API tests cover cross-tenant refusal, immutable saved versions, duplicate submissions, subscription lapse/upgrade, source export/deletion, invalid signatures, upload/export bounds and retirement of legacy mutation routes when v2 is enabled.

## Browser verification

Browser: Codex in-app browser against loopback app `http://127.0.0.1:3012/validation` and engine port 8012. All records were synthetic. The engine uses the production calculation/router with local SQLite and a synthetic tenant/subscription.

- Product example: included costs **$175**, reviewed revenue **$380**, contribution **$205**, margin **53.9%**. Customer `c-beacon` has **($60)** contribution; `c-acme` has **$265**. Cost components reconcile to $100 inference + $10 tools + $5 compute + $60 human review.
- Internal example: included costs **$175**, **3** accepted outcomes across **4** runs, **$58.33** per accepted outcome. Revenue is N/A. Modeled capacity value **$105** is explicitly separate from cash savings and contribution.
- Saved history and a complete report remained readable after stopping and restarting both services. Editing a new version preserved the previous saved record.
- Report JSON and original-evidence export buttons produced downloadable files. The downloaded JSON was parsed independently; report totals and all four source usage rows matched the saved example.
- Removing one billed price produced a **$163 known-cost subtotal**, **3/4 priced rows**, a missing-cost finding and **unavailable total contribution**. The affected customer had unavailable contribution while the independently complete customer retained its reviewed result.
- A malformed usage file returned the exact missing headers and the received header preview. It created no new audit and did not replace the saved report.
- Economics and executive report layouts were visually inspected at desktop width. The report has print styles and a browser Print / PDF action; an actual paginated PDF render and mobile/browser-matrix accessibility audit have not been verified.

Development-only full reloads and temporary connection failures occurred during rebuilds. They were resolved by reopening the restarted local app; they are not evidence of hosted uptime.

## Performance and current limits

A synthetic pure-engine calculation plus sensitivity with 20,000 usage rows and 5,000 revenue rows completed in **1.43 seconds** during development and reconciled $200 cost / $50,000 revenue. This measures calculation only. It does not establish HTTP/export capacity: the public app enforces a 4 MB combined request and a 3.8 MB result/report boundary. Large traces require aggregation or a shorter period until pagination is implemented. No rows are silently truncated.

## Hosted acceptance still required

1. Ryan reviews the pending migration ledger and applies the approved set through `supabase db push`; 0012 and rollback are prepared, but not applied to hosted Supabase.
2. Verify real JWT/JWKS, tenant isolation, anonymous claim through login, saved reports after sign-out/sign-in and source/report expiration in the hosted environment.
3. Verify read-only Stripe OAuth, encryption/refresh/revocation and known invoice evidence against an approved test company.
4. Verify Stripe test-mode Checkout, portal, signed webhook delivery, cancellation, duplicate events and failed renewals. All billing tests in this record use mocks; no Checkout session, price, customer or payment was created in Stripe.
5. Approve price, retention/backup policy and tax treatment; configure hourly retention cleanup and safe error monitoring. Public intake and live billing remain disabled until their respective gates pass.
6. Review one real period with the fractional CFO and consenting design partners. Record decision usefulness, repair time, repeat use and payment; none is established by these synthetic checks.

See [release runbook](V1-RELEASE-RUNBOOK.md), [revised PRD](V1-REVISED-PRD.md) and [founder packet](FOUNDER-PACKET-V1.md). Existing `research/`, `prototype/` and `outputs/` were preserved. No production deployment, provider mutation, customer intake, outreach or live charge was performed in this build.
