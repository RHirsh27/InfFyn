# InfFyn v1: revised product and implementation contract

Updated September 7, 2026. This document and `INFFYN-V1-BUILD.md` supersede conflicting earlier research recommendations and the original Stripe-unlocks-profitability rule. Product owner: Stephen. The user authorized agent-owned engineering delivery, reviewed migrations and deployment. Local validation is distinct from verified hosted readiness. Invitation access and release status are specified in `V1-PRODUCTION-DELIVERY.md`.

## The product

One audit workspace, one economics engine, two uses. Product companies review the cost of serving customers and the contribution left after included costs. Teams running custom internal agents review the cost of complete workflows and accepted outcomes. Neither path requires a gateway migration. The first input is a set of reviewed CSV exports; customer Stripe data is an optional read-only evidence source.

The differentiator being tested is the reviewable economic record: source-aware cost calculation, explicit revenue associations, unresolved amounts kept visible, method sensitivity, failed-work costs and reproducible saved reports. A token-cost calculator or dashboard alone is not a durable advantage. Whether customers value this workflow enough to renew remains unvalidated.

## What remains strong from the original PRD

- Engine owns parsing, math, attribution and facts; the web app owns interaction and presentation.
- Tenant membership is verified for every protected engine request. New evidence tables are not readable directly by browser roles.
- Unknown costs are not zero. Ambiguous revenue stays unallocated. Reference prices remain estimates.
- Historical reports retain their original basis. New runs create or reuse immutable audit versions.
- Findings direct investigation toward negative contribution, with evidence rather than unsupported optimization claims.
- Narrow audit-first release, manually reviewed design-partner results and commercial evidence before roadmap expansion.

## What changed

| Original | Revised v1 |
|---|---|
| Inference profitability only | Product economics and custom internal workflow economics |
| Token price table as sole cost source | Supplied billed costs first; dated supplied reference rates as fallback; separate tool/compute/review costs |
| Revenue embedded in usage CSV | Separate reviewed revenue evidence, with identifiers, basis and refund handling |
| Stripe connection unlocks full audit | Subscription unlocks full audit; reviewed revenue files and Stripe evidence are equal intake options |
| Gross profit / GPp1M identity | Contribution after included costs; GPp1M secondary and conditional |
| Internal revenue entered as zero | Internal revenue and contribution are not applicable |
| Grade or efficiency score | Separate evidence, economics and outcome-evidence panels |
| Revenue from Stripe treated as actual | Paid invoices are gross collections evidence; refunds, credits, taxes and recognition require review |
| Internal value suggested by inference savings | Cost per accepted outcome across failed/rejected work; optional modeled capacity value kept separate |
| Proposed free-connected-paid funnel | Anonymous cost preview, authenticated saved preview, monthly subscription, full audited record |

## Initial buyer and validation

Reach companies through the fractional CFO partner and their existing relationships. Start with companies that can supply a month of usage and business context, have a meaningful cost or allocation question, and will review the output with finance and engineering. The original $5,000 monthly inference-spend gate is a qualification hypothesis, not a hard-coded admission rule.

Ask each partner for one decision they cannot make today. After the audit, record whether they trust the calculation, which missing mappings cost time, whether the finding changes a decision, delivery effort, willingness to pay and willingness to repeat next month. Target 3–5 reviewed audits, two decision changes and a paid renewal before adding monitoring. These are validation targets, not achieved evidence.

## Core flow

1. Select product or internal workflow, inclusive period and USD reporting currency.
2. Upload usage and optional cost, rate, revenue and outcome evidence. Downloadable templates explain the contract. Inspect and edit the CSV before calculation.
3. Confirm revenue basis and evidence scope. Period or source changes require renewed review.
4. Calculate a limited anonymous cost preview, then sign in and claim it once. Anonymous evidence expires after one hour.
5. Save the audit under the current company. An inactive subscription receives only a cost projection; an active subscription receives full results and an executive report.
6. Inspect customer/feature/model/cohort/workflow/team views, unmapped amounts, source trace and feature-allocation sensitivity.
7. Export the report and retained source evidence, print the executive report to PDF, or edit a new version. Expired subscriptions retain access to previously purchased reports until their retention deadline.

## Supported evidence contract

- Stable IDs within each source file, strict numeric and period validation, USD only. No silent malformed-to-zero coercion.
- Usage may be aggregated; `requests` does not imply one row is one attempt. `run_id` must identify the workflow execution to calculate accepted-outcome unit cost.
- Supplied billed amounts require a source label. They remain **Customer supplied**, not independently verified Actual.
- Reference rates require provider, model, effective date interval, separate input/output/cached-input prices and a source. Overlapping rate periods fail. The actual rate basis is retained in the result.
- Additional costs include tools, compute, human review and other supplied costs. Signed corrections/credits are supported. Inference cannot also be entered as an additional-cost category.
- Revenue records use direct associations or explicitly described allocations. A unique customer-to-cohort association can carry revenue to its cohort; ambiguous cohorts remain unmapped. Feature allocation is optional, within the same customer, using requests or equal shares. No cost-proportional allocation.
- One final outcome per included run, with consistent accepted-outcome units. Failed/rejected runs have zero accepted quantity. A complete cohort and complete declared cost scope are required for complete cost per accepted result.
- Optional capacity inputs are baseline minutes, after minutes and loaded hourly rate. The derived value can be negative; it is not added to revenue or contribution.

## Honest limits in this version

Reference pricing is uploaded with explicit provenance; there is no automatically refreshed provider-price feed. Stripe reads up to 20,000 paid invoices across history so late-paid old invoices are not skipped, then selects payments in the requested period. It does not ingest standalone charges or automatically net refunds/taxes; the user must review and correct the returned evidence. Multi-currency conversion, invoice-level reconciliation against rated usage, continuous ingestion, SDKs, quality experiments, autonomous model recommendations and accounting close are deferred.

The public preview has a durable global pilot quota of 10 requests/hour. This is deliberately bounded for the first validation release, not a high-volume acquisition system. Each source is capped at 20,000 rows; usage CSV at 4 MB, reference rates at 0.5 MB, each other CSV at 1 MB. The combined JSON request must fit within 4 MB, and the derived result/trace within 3.8 MB. Oversize results are rejected before saving with a specific correction; nothing is silently truncated. These limits leave room under the [Vercel payload limit](https://vercel.com/docs/errors/function_payload_too_large). Higher-volume trace pagination is future work.

## Approved commercial offer and retention

Approved price: $349/company/month, recurring audits and executive reports, no monitoring or automatic refunds. Private invitations grant full access until revoked, without a card or automatic subscription. Full new audits require an active paid subscription OR an active complimentary grant. Revocation does not change a paid subscription. Cancellation is managed in Stripe's configured portal at period end. Existing full reports remain exportable during retention. Public checkout requires verified provider configuration and published business/service details; demand interviews are not an engineering release gate.

Approved retention: anonymous evidence one hour; authenticated source payload 90 days; derived audit/report and its calculation trace 12 months. Calculation traces retain cost records and pseudonymous dimensions; they are not anonymized aggregates. No cross-customer reuse or benchmark consent is assumed. The engine scheduler must run the retention sweep hourly. Backup deletion lag and legal exceptions require an explicit provider policy before public intake.

## Acceptance

- Product and internal audits calculate, persist, reopen and export with accurate evidence labels.
- Cost and revenue totals reconcile independently within each dimension, including unmapped remainder.
- Free projections never expose margin, revenue, source traces or executive report content.
- Duplicate submissions and preview claims cannot duplicate or transfer audit ownership.
- Cross-tenant reads, writes, claims and billing actions fail; account owners control billing and deletion.
- Signed webhooks dedupe and serialize provider-state refreshes; out-of-order events do not restore older subscription state.
- Historical audit, source-retention expiry, report expiry and deletion behave distinctly.
- Local tests, embedded PostgreSQL migration checks and browser validation pass before hosted acceptance.
- Hosted auth, OAuth, billing, database and error-monitoring checks are separately recorded; local synthetic results do not pass those gates.
