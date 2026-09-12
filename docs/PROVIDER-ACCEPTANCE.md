# Authorized provider acceptance

Status: **PENDING — no real authorized import was executed for this preparation.** All three connectors must pass before opening the company workspace. CSV remains supported; synthetic adapter tests are separate evidence.

Use this beside [hosted company acceptance](HOSTED-MONTHLY-ACCEPTANCE.md) and [database preflight](DATABASE-PREFLIGHT.md). Enter credentials only through the application connection flow or an approved secret manager. Never put credentials, auth cookies, raw provider responses, customer data or credential-bearing URLs in a manifest, report, source control or terminal output.

## Known-period record

Copy `examples/provider-acceptance.template.json` to a protected, untracked evidence directory. Record the approved source account, UTC month, independent source total, reporting basis, exclusions, expected page counts when known, source-export hash, release SHA and run time. Use decimal strings for money. A total inferred from InfFyn's own import is not an independent control. A null expected total is pending, not zero.

Use a completed month with settled source data. Document the boundary as the first day at 00:00:00 UTC through the first day of the next month, exclusive. Each phase gets PASS, FAIL or PENDING with dated evidence. Save redacted technical trace identifiers; retain raw source exports only in the approved restricted evidence store. Do not copy real financial data into a public synthetic company. Use a provider-designated synthetic/sandbox organization where possible; otherwise use a separate explicitly authorized private acceptance company and keep its artifacts private.

## Current integration scope

| Provider | Implemented source | Independent comparison and limits |
|---|---|---|
| OpenAI | Organization costs and completion usage, daily buckets; cost grouping by project and line item, usage by project and model | Compare cost totals with the same organization's cost export and UTC scope. Completion usage is diagnostic and cannot account for all modalities or establish customer/outcome detail. Review credits, contractual rates and invoice differences separately. Organization reporting authorization is required. |
| Anthropic | Organization cost report and messages usage, daily buckets grouped by workspace | Compare like-for-like Claude Platform scope. Cost amounts are decimal cents and must convert to USD exactly once. Priority Tier cost is excluded by the endpoint. Null workspace means default; do not drop it. Subscription and reseller evidence are separate. |
| Stripe | Paid invoices, filtered by `status_transitions.paid_at` in the month; `amount_paid` converted from minor USD units | Control is gross paid-invoice collections, not bank deposits, standalone charges or recognized revenue. Review taxes, credits, refunds and service-period differences explicitly. Invoice creation date is not collection date. |

Provider contract references, checked September 10, 2026: [OpenAI organization usage and costs](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage), [Anthropic usage and cost reporting](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api), [Stripe invoice listing](https://docs.stripe.com/api/invoices/list). The implemented route details are in `engine/app/monthly/providers.py`; re-check official contracts at live acceptance if permissions or response shapes differ.

## Cases to execute for each provider

| Case | Action | Required result |
|---|---|---|
| P01 Authorization | Authorized operator connects reporting access in the intended private company | Source account matches the approved control; minimum available reporting permissions; encrypted storage and safe status. No key values in response/logs. |
| P02 Known total | Import the recorded UTC month through all phases | Complete import; same source/scope/currency; normalized total reconciles to independent control with explicit documented rounding tolerance. Default tolerance is zero; do not widen to hide discrepancies. |
| P03 Boundaries | Include records exactly at month start, month end and just outside where source evidence exists | Start included, next-month start excluded. Source coverage shown accurately. Late-arriving or revised provider data produces a new reviewed import/basis. |
| P04 Pagination | Use a period/account that actually spans more than one page | Every observed cursor consumed once; last page reached; totals/unique records match the full independent export. One-page success leaves multi-page acceptance PENDING. Never fabricate page count. |
| P05 Interrupted import | Stop stepping a partially imported job, sign out, return and resume | State/cursor retained in the same company; partial evidence cannot masquerade as a completed source; final totals match P02. |
| P06 Duplicate/retry | Retry the same step and request the same source/month import again | No duplicate charges/invoices, no doubled report totals; either stable idempotent state or explicit safe conflict. Inspect report as well as import counts. |
| P07 Upstream failure | Exercise 429/timeout/malformed or repeated-cursor responses using the existing offline adapter harness; capture an authorized real failure only if naturally available | Actionable safe error, bounded request, retained progress, no partially published import. Offline injected transport results remain labeled OFFLINE; do not cause provider outages or overload an account. |
| P08 Revocation | Operator revokes the dedicated test credential/connection; retry the read | Actionable reconnect state; no fallback demo/cached data presented as fresh; historical reports unchanged. Never revoke a shared production integration for testing. |
| P09 Reconnection | Reauthorize the same approved source and retry | Source identity stable, successful fresh import, no duplicate charges, original report unchanged. If source changes, treat it as a distinct explicit source. |
| P10 Assignment | Assign a project/workspace to a workload; leave one shared bucket unresolved | Assigned plus Unallocated cost equals the source. No invented customer/run/outcome dimensions from aggregates. |

For Stripe additionally execute:

1. A paid invoice created before the chosen month but collected within it appears once; an invoice created in the month but paid later does not.
2. Review a bundled source invoice with two dollar allocations and a remainder. Portions plus remainder equal its original amount exactly. Save explanations and source account/object lineage into the immutable report. Over-allocation and assigning both original and portions fail.
3. Amend a reviewed allocation and save a new report; the old report and its downloaded export do not change. Verified source amount does not upgrade modeled allocation to Actual or causal revenue.
4. Test a documented refund/credit and tax treatment against the declared collections or recognized basis. The current paid-invoice connector does not automatically net unrelated refunds or perform revenue recognition. Record these scope exclusions and explicit adjustments; unavailable coverage is a finding.
5. Complete the actual OAuth authorization, callback, encrypted token refresh, disconnect and reconnect flow in an approved test account. A manually supplied token or adapter fixture cannot pass the OAuth gate.

## Final comparison

Reconcile source → retained import → reviewed assignment → workload total → monthly dashboard → immutable report → exported JSON/PDF. Preserve source amount and original invoice separately from the reviewed allocation. Cost basis must not include aggregate provider charges and equivalent event charges simultaneously. Demonstrate accepted-outcome metrics only with separately supported company run/cohort evidence.

Report each connector independently. Block launch if any required case fails or is pending, if permission scope cannot be verified, or if the expected amount is unavailable. Do not replace an unavailable live case with a synthetic PASS. Fault-injection adapter checks and real provider lifecycle verification belong in separate result columns.

## Offline preparation commands

```powershell
& engine/.venv/Scripts/python.exe scripts/test-engine-safe.py engine/tests/test_monthly_connectors.py -q
```

The safe runner disables external network and `.env` loading. Hosted/provider status stays PENDING after it passes.
