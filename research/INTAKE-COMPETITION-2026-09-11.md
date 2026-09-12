# InfFyn: intake and evidence-workflow competition

Research checked September 11, 2026. Scope: current official product pages and technical documentation, not access to vendor customer accounts. No customer data was uploaded, trials provisioned, or vendors contacted. “Documented” below means an operational interface or method is described publicly; it does not mean we executed or independently verified the vendor's implementation. Undated pages are current retrievals, not proof of a launch date.

## Conclusion

An intake workflow that turns customer exports into a reviewable dataset is a sensible next InfFyn investment. It directly addresses the work that can otherwise consume Ryan's and Stephen's time every month. But CSV import, automatic field conversion, reconciliation, outcome metrics, and review controls each already appear in competitors' public materials. We should build a better complete journey for a specific buyer and measure that improvement, rather than declare another individual feature unique.

The proposed distinction is: **a finance owner can turn the evidence the company already has into a reviewed monthly AI economics record, with unresolved items assigned to an owner and the next month largely prepared from confirmed rules.** This is a hypothesis about speed, scope and usability, not a demonstrated moat.

## Evidence matrix

| Vendor | Documented data entry and preparation | Economics and review overlap | Dependencies and what remains unestablished |
| --- | --- | --- | --- |
| Revenium | Provider billing APIs independently of app instrumentation; SDK/API/OTLP for detailed activity and business tags; strict ingestion can hold unknown references for correction and resubmission. | Billed-versus-metered comparison, customer/product economics, business outcomes and human-time costs; outcome corrections retain history. | Provider authorization is required; richer attribution needs customer/product/job metadata and reported outcomes. An arbitrary historical spreadsheet-to-reviewed-finance-package workflow was not established by the pages reviewed. |
| Spendline | Documented proxy onboarding changes provider base URLs and adds attribution headers. Its public FAQ says onboarding is through guided pilots. | Customer margin where revenue is available; invoice reconciliation, allocation completeness, adjustment records and locked monthly periods are explicitly described. | Engineering must route relevant calls and supply attribution. Public claims do not establish independent reliability, customer adoption, or a general cleanup workflow for historical unstructured exports. |
| Vantage | Native billing integrations; FOCUS CSV/API custom costs; selective invoice/CSV conversion utility; S3 request logs for token allocation; business metrics from files or connected systems. | Cost allocation, token reconciliation, unit costs, gross margin, customer-labeled revenue and custom business metrics. | Granular allocation needs matching cost integrations and usable tags/logs. General import does not supply missing business semantics. A mandatory finance sign-off of each cross-source reconciliation and immutable mixed-evidence report was not established by these reviewed pages. |

Source detail and limitations follow. “Not established” is not “the vendor cannot do it.”

## Revenium: more than SDK metering

Its current setup page offers separate paths: coding-assistant connections, provider billing import, and app instrumentation. Provider totals can therefore arrive without installing an SDK. The SDK supplies request-level context and optional business metadata. Its quoted setup durations are vendor claims, not our measurements. **“No SDK” is not an InfFyn-only distinction.** [How it works](https://www.revenium.ai/how-it-works)

Provider documentation distinguishes invoiced amounts from metered usage valued at API rates and tells users not to add the two. It documents provider-specific permission and coverage limitations. OpenAI needs organization administration access; Anthropic needs an eligible reporting credential. Named coverage states accompany the totals. These are meaningful controls that overlap with InfFyn's evidence discipline. [Provider integrations](https://docs.revenium.io/integrations/provider-integrations.md)

Strict ingestion mode validates incoming references against existing account objects. Unknown or mismatched entities become held records with reasons; an operator fixes the objects or integration and resubmits. The page documents a 30-day held-record retention window. This is an existing correction queue, although it operates on metering records rather than establishing arbitrary spreadsheet interpretation. [Strict ingestion mode](https://docs.revenium.io/monetize-your-ai/strict-ingestion-mode.md)

Revenium also documents reported converted, escalated, deflected and custom outcomes, a supplied monetary outcome value, and separate human-time costs. Corrections require a reason and retain history. This refutes a claim that competitors only count tokens. It does not by itself establish that a reported sale or avoided task was caused by AI. That limitation follows from the supplied-value measurement design, not from evidence of a vendor defect. [AI Outcomes](https://docs.revenium.io/instrument-your-agents/agent-outcomes.md)

The ROI dashboard explicitly needs outcome reporting to populate the value side. Customer/product reporting depends on attribution metadata. This identifies the real unsolved customer work: deciding what the event means and obtaining trustworthy evidence for its value. [ROI and unit economics](https://docs.revenium.io/track-and-control-costs/analyze-roi-and-unit-economics.md)

## Spendline: financial close is already an explicit position

The FAQ describes a proxy with a base-URL change and tracking headers, not an installed SDK. It states that pilot provisioning is guided. “No SDK” therefore also fails to distinguish InfFyn from Spendline; **no request-path migration** is a more precise architectural distinction between these two products. This distinction is not unique across the entire market. [FAQ](https://www.spendline.ai/faq/)

The month-close guide is dated May 1, 2026 and updated August 10, 2026. It describes reconciliation, allocation completeness, adjustments and locked snapshots. Its product-specific section describes an append-only request ledger, period transitions, immutable closed periods and corrections as new rows. Memos and approvers are part of the described finance process. The guide labels its variance and unallocated-spend thresholds as operating recommendations, not standards, and its examples as illustrative. **InfFyn cannot credibly claim to have invented the AI monthly close.** [AI month close](https://www.spendline.ai/guides/ai-month-close-process/)

Current pricing advertises Growth at $500/month plus 1% of managed AI spend, capped at $1,000 total; Platform at $1,500 plus 0.75%, capped at $3,000 total. The latter lists customer-margin analytics and monthly close. This is a relevant packaging anchor, not proof of paying customers or permission to assume InfFyn can obtain the same price. The page says it is accepting pilot partners and labels its dashboard figures as sample data. [Product and pricing](https://www.spendline.ai/)

## Vantage: do not reduce it to a cheaper spend dashboard

The **August 20, 2026** announcement makes token allocation generally available, superseding the older February private-preview description. Provider costs are matched with request logs carrying allocation tags. The described split preserves the original billed total and leaves a remainder for uncovered usage; access to a compatible S3 log stream is required. **Reconciliation, residuals and customer tags are not exclusive features.** [GA announcement](https://www.vantage.sh/blog/token-cost-allocation-specification)

Custom-provider documentation supports FOCUS-compatible CSVs and an API. It documents required fields, validation errors, row preview and re-upload. The documented console limits are 10,000 rows and 2 MB. Uploading a file with an existing filename replaces that file's costs, so this particular import behavior differs from an immutable report snapshot. This does not establish that every Vantage report or other product surface lacks history. [Custom providers](https://docs.vantage.sh/connecting_custom_providers)

The linked free conversion utility takes selected vendor reports and invoices and returns FOCUS data. Its visible support includes ClickHouse CSV and Cloudflare/Temporal PDF instructions; several other vendor entries request examples before support is built. The utility therefore demonstrates existing conversion capability, **not universal messy-data interpretation or verified OpenAI/Anthropic invoice coverage**. No file was submitted during this review. [FOCUS converter](https://focus.vantage.sh/)

Vantage's business-metric documentation includes CSV ingestion, labeled dimensions, duplicate checks and calculations for unit cost and gross margin. Connected metric sources include Datadog, Snowflake and Metronome; some sources have separate availability constraints. Thus “we divide spend by successful outcomes” or “we join cost and revenue” is also insufficient differentiation. [Business metrics](https://docs.vantage.sh/business_metrics)

Its Metronome integration imports daily invoice revenue and usage by customer identifiers. This supports profitability calculations when cost and metric scopes agree. An invoice-revenue metric does not alone establish recognized-revenue accounting or causal sales lift. The reviewed documentation establishes import and joins, not automatic resolution of every revenue-accounting question. [Metronome integration](https://docs.vantage.sh/metronome)

## Which math is solved, and which evidence is missing?

This distinction is our reasoning from the documented inputs, not a vendor claim:

| Question | What is calculable | What an importer cannot invent |
| --- | --- | --- |
| What did inference cost? | Contract or reference rates applied to measured usage; billed amounts reconciled for the same scope and period. | Missing cache categories, private discounts, lost usage, credits, or ambiguous billing cutoffs. |
| Which workload incurred cost? | A direct join on reliable identifiers, or an explicitly reviewed allocation. | A customer ID that was never recorded; a causal activity assignment from an aggregate invoice alone. |
| What is product contribution? | Relevant revenue minus the included delivery costs, with a defined basis and scope. | Automatic recognized revenue from cash receipts; objective feature revenue splits for bundled products. |
| Did AI improve the business? | Accepted outcomes, quality, human effort and costs can be measured and compared. | The counterfactual result without AI, absent an experiment or defensible comparative design. |
| How much cash was saved? | Identified reduced invoices, contractor expenses or other displaced expenditure. | Cash savings from every theoretical hour of freed capacity. |

A $64,000 bundled invoice can be split correctly to the cent while the commercial interpretation remains an assumption. Human confirmation makes the allocation reviewed; it does not turn it into a causal fact. A normalized file can be perfectly formatted and economically incomplete.

## A narrow product advantage to build and test

Make InfFyn particularly good for the finance owner who receives several imperfect exports and must explain this month's AI economics without operating a gateway or maintaining a data platform.

1. **Accept a bounded evidence packet.** Start with named provider cost/usage exports, one billing export and a clearly defined workload/outcome table. Support flexible CSV columns and straightforward XLSX sheets before promising arbitrary documents.
2. **Suggest transformations visibly.** Detect headers, dates, units, currencies and aliases; show original values next to proposed values. Use deterministic parsing for known formats. Any AI-assisted semantic suggestion is a proposal, never a fact.
3. **Separate data repair from business judgment.** Parsing `'$1,250.00'` is formatting. Assigning a shared provider project to Support is a management decision. They need different controls and labels.
4. **Review exceptions rather than every row.** Rank discrepancies by financial impact; group repeat cases; retain unknowns. Confirm reusable rules with scope, owner, explanation and effective period. New schema or identifier changes require review.
5. **Produce the confirmed dataset as an export.** Return a normalized file plus a transformation log, unresolved-items list and control totals. This creates standalone utility even before a customer adopts every dashboard.
6. **Carry those decisions forward.** Next month reuse validated recipes, identify changes and present only remaining decisions. Preserve the source and old report basis when corrected evidence arrives.
7. **Close with an action.** Each material finding has an owner, action, expected metric and follow-up result. Keep price/mix/volume/quality effects separate and avoid automatically claiming realized savings.

The architecture itself is reproducible. Defensibility, if earned, comes from reliable source recipes, embedded monthly work, customer-approved mapping history, low operating effort, trusted financial semantics and Stephen's distribution relationships. Respectful data portability and company ownership should remain product requirements; artificial lock-in is not the strategy.

## Test superiority instead of assuming it

Use the same authorized or synthetic packet in side-by-side trials against the customer's current spreadsheet process and, where the customer already has access, an incumbent. No procurement or upload is implied by this recommendation.

Suggested product acceptance targets, not achieved results:

- A finance user can reach a reviewable first package within 45 minutes of active work for a supported packet; timing excludes waiting for missing evidence but that waiting is reported separately.
- Every financial source total is reconciled or has an explicit, valued exception. No silent row drops, currency mixing or unexplained cents.
- At least 80% of previously reviewed deterministic mappings carry forward correctly on a subsequent unchanged source format; measure exceptions and incorrect matches separately.
- Second-month active preparation falls below 20 minutes for the scoped packet and requires no Ryan intervention in at least four of five observed repetitions.
- The customer can explain two material conclusions and identify which inputs are supplied, billed, allocated or unavailable without engineering translating the screen.
- An approved report reopens identically after later inputs change; corrections create a new version with a visible explanation.

Failure tells us where the product needs work. It does not justify inventing clearer data, broadening confidence scores, or adding another decorative dashboard. These targets should be revised after observing the first real packets.

## Research limits

This review identifies feature overlap and opportunities to test. It does not establish competitors' customer count, retention, revenue, support effort, realized ROI, or suitability for Stephen's network. It also does not measure InfFyn's current onboarding time. Current documentation can change; undated pages were retrieved on September 11, 2026. No later-dated announcement was used.
