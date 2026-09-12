# InfFyn: reviewed data preparation and a stronger growth plan

September 11, 2026. Product and market analysis requested after the initial Monte Carlo review. This document proposes the next build and Stephen's commercial workstream. It changes no pricing, provider configuration, database, deployment or customer access, and sends no outreach.

## Correcting the interpretation of the prior simulations

The simulations did **not** find that InfFyn has low demand or is a bad product. Their funnel, churn, labor and growth distributions were selected planning assumptions. Increasing the run count did not create observations of buyers. The earlier presentation gave the conditional outputs more weight than their empirical basis supported.

The focused case's modal funnel began with eight introductions a month, multiplied by 70% reaching discovery, 65% supplying usable evidence and 40% becoming paid accounts. That is roughly **1.46 eventual paid accounts per originating month**, before growth, churn, sales lag and capacity. Modest acquisition was built into the inputs. It was not inferred from product quality, Stephen's sales ability, the size of the market or competitor performance. The additional $8,000 owner allowance also materially affected reported economic surplus; it is not a current bill or a compulsory cash expense.

Keep the previous model as sensitivity analysis. Use a **target-backwards operating plan** to decide what distribution, conversion and delivery capacity the desired business would require, then replace assumptions with Stephen's observed funnel. Do not improve the apparent outlook simply by assigning more favorable probabilities.

## What is and is not an unsolved math problem

| Question | What InfFyn and competitors can calculate | What the inputs do not establish |
|---|---|---|
| What did we pay for AI? | Source billing amounts, credits and supported usage/rate estimates, with their different bases named | Missing charges, discounts or unsupported sources cannot be inferred into actual expenditure |
| Which activity incurred the cost? | Direct mapping from supplied project/customer/workflow identifiers; reviewed allocation of shared costs | A clean format does not recover a business identifier that was never recorded |
| Was a product or customer profitable within scope? | Matched period revenue less included direct/allocated costs, with collections and recognized revenue separated | Customer revenue associated with AI is not automatically revenue caused by AI; incomplete serving costs are not full accounting gross margin |
| How efficient was an internal workflow? | Included cohort cost divided by accepted outcomes, including failed and retried work | Time released is not automatically lower payroll or additional revenue |
| Did AI cause incremental business value? | A measured estimate when a credible experiment/counterfactual and outcome data exist | Supplier bills, token counts and a customer confirmation cannot prove the outcome without AI |

For a simple illustrative case, a $10,000 supplier bill and $8,400 of matched usage leave a $1,600 reconciliation residual. Software can surface the gap and assist the investigation. It cannot label the residual waste without evidence. If included support costs are $20,000 for 8,000 accepted resolutions, cost per accepted resolution is $2.50. Whether those resolutions reduced payroll, increased retention or would have occurred anyway is a separate question.

There is a market for collecting, joining, explaining and controlling the solvable financial records. Competitor existence does not imply that they solved causal inference, nor does it establish their revenue or profitability. Our product should give a useful financial answer at the supported level of evidence.

## What the competitors actually overlap with

This is a review of current official product descriptions and documentation. It is not a hands-on competitive trial, proof of performance, or proof that an unmentioned feature is absent.

| Product | Actual overlap and adoption path | Implication |
|---|---|---|
| Revenium | Advertises billing-API imports, coding-assistant telemetry and SDK/OTLP application tracking. Bills do not require SDK instrumentation; richer customer/workflow detail requires metadata. Its API accepts customer-reported business outcomes and values. | Neither “no gateway” nor “we track business outcomes” is exclusive to InfFyn. Reported outcome value is supplied evidence, not causal proof. [Connection paths](https://www.revenium.ai/how-it-works), [outcome API](https://revenium.readme.io/reference/report_job_outcome). |
| Spendline | Describes an in-path proxy with tracking headers, attribution, budgets and invoice-reconciled monthly close. Its FAQ says customers enter through guided pilots. | Direct overlap with customer margins and reviewed periods; its principal collection path differs from a historical file-based finance workflow. We have not established whether it can meet our exact multi-file job. [FAQ](https://www.spendline.ai/faq/), [monthly close](https://www.spendline.ai/what-is-spendline/). |
| Vantage | Documents provider cost ingestion, allocation, custom cost uploads and a converter for supported CSV/PDF sources with preview/errors. Its token-allocation work joins usage metadata to bills. | Basic import, normalization and bill reconciliation already exist. A converter for listed formats does not prove arbitrary messy-file or revenue/outcome preparation. [Custom providers](https://docs.vantage.sh/connecting_custom_providers). |

The deeper [intake comparison](INTAKE-COMPETITION-2026-09-11.md) separates documentation, marketing claims and unverified gaps. The new import idea remains a valuable improvement to InfFyn, but generic data cleanup cannot honestly be declared a moat.

## The product improvement to build

**Bring the records you already have. InfFyn proposes an organized dataset, explains the changes and missing evidence, and calculates only from the reviewed version.**

The next slice should sit immediately before the existing monthly calculation engine:

1. **Collect a bounded evidence package.** Provider usage/cost exports, billing or revenue CSVs, accepted-outcome records and supporting-cost records. Identify the source account, period and measurement basis. Preserve each original privately under the approved retention policy.
2. **Propose normalization.** Detect a supported format, map columns, parse declared dates/currencies/units, suggest approved aliases and identify repeated records. Show original and proposed values side by side. Deterministic rules perform arithmetic and transformations.
3. **Separate exceptions from valid records.** Flag ambiguous dates, currencies, overlapping usage/bills, missing IDs, suspicious duplicates, unresolved assignments and missing control totals. No silent dropping, zero filling or currency relabeling. Ambiguous records remain quarantined/unallocated with a visible amount or count.
4. **Ask for business confirmation.** The customer or advisor reviews the interpretation, changes, exclusions and residuals. Confirmation accepts a method; it does not certify the source or turn an allocation into actual revenue.
5. **Publish a versioned evidence package.** Produce canonical data, transformation lineage, the mapping version, approval identity and unresolved exceptions. Permit export of the clean package and issues. The existing engine calculates and snapshots the approved version.
6. **Reuse the recipe next month.** Match the source/schema version, reapply reviewed rules, rerun controls and bring only new or changed problems back for review. A new model, column, business alias or sign convention triggers review instead of silently inheriting the old interpretation.

An AI assistant can later propose column matches and plain-language issue explanations from permitted metadata. It should not invent amounts, identities, revenue allocations or outcome values; it should not run generated transformation code. The first deterministic CSV slice does not require a new LLM dependency. Add XLSX and selected invoice extraction only after supported CSV preparation is stable.

The repository already has calculation, allocations, draft conflicts, report snapshots and monthly persistence. It does **not** yet have original-file manifests, reviewed column mappings, reusable import recipes or row-level transformation history. The [engineering plan](../docs/REVIEWED-IMPORT-PLAN-2026-09-11.md) specifies the reusable pieces, missing objects and acceptance tests. A reasonable planning estimate is **7–10 working days for the bounded CSV workflow**, subject to the existing hosted activation and recovery dependencies. This is not an estimate for universal file understanding.

## Where we can aim to outperform

The first segment to test is **AI-enabled service and software firms whose customer economics span model spend, tools, human review and accepted deliverables**. Research/document-processing services are concrete examples. Keep internal custom workflows in the same engine. Seat-only productivity scoring and enterprise-wide spend governance are weaker initial positioning choices for this build.

Our candidate distinction is the complete reviewed job, across existing financial and operational records, designed for the company and its fractional CFO. Prove it with the same source package and accepted output against the actual incumbent or spreadsheet process:

| Proposed competitive test | What success would mean | Evidence boundary |
|---|---|---|
| First usable review in one working session after sources are available | Customer can reach a reviewed result without the builder editing files or code | Does not include time waiting for permissions or missing business data |
| At least 50% less combined repeat preparation effort than the current accepted process | A measurable customer reason to switch or pay | Measure customer, advisor and engineering time separately; match output scope and quality |
| New financial exceptions are visible with source references | Changes are reviewable without trusting a black-box cleaned file | Reconciliation can be incomplete; it must not be forced to pass |
| Repeated source formats need no engineering repair | Templates reduce the builder's involvement | Only claim supported formats; unsupported sources remain explicit |
| Product/outcome decisions are revisited next month | The report has recurring use beyond a one-time dashboard | A recorded decision is not proof of economic improvement |

These are acceptance targets to measure, not statements that we already beat competitors. Vantage or Revenium exports can also be inputs if they are the customer's best available evidence; InfFyn does not need to replace useful telemetry to improve the finance review.

## How this becomes less labor-intensive

Separate automatic preparation from human business judgment. Known source formats, immutable recipes, validation, deduplication, retry, monitoring and report assembly should be routine software operations. A company owner or Stephen handles ambiguous business mappings and approves the month. Engineering handles reproducible product defects, not every client's spreadsheet.

- **Self-service correction:** show the affected row, original value, reason and supported fix; preserve draft state and retries.
- **Reusable configuration:** one reviewed rule for repeated rows; no bulk silent acceptance of novel mappings.
- **Controlled support scope:** three evidence lanes initially, a visible format list and documented file limits. Unsupported custom integrations enter a backlog rather than a permanent manual service.
- **Reliable operations:** automated retention, recovery and failure alerts with bounded retries before a broad release. The temporary manual private-alpha backup process cannot be the long-term operation for many companies.
- **Measured effort:** target recurring engineering/operator intervention below 15–30 minutes/company/month after stabilization, separately from Stephen's optional advisory service and the customer's monthly review.

Illustrative recurring contribution at $349, using 3.2% payment cost, 10% partner share, $12 platform cost and $75/hour labor:

| Recurring operator time/account/month | Contribution before onboarding, acquisition, fixed costs, engineering and tax |
|---|---:|
| 15 minutes | $272 (78%) |
| 1 hour | $216 (62%) |
| 3 hours | $66 (19%) |

These are assumptions and unit arithmetic, not actual gross margin. The important lever is eliminating recurring repair work. A separate advisory fee belongs to Stephen's service economics and must not be counted as InfFyn software revenue. We do not change the current price to make the model look stronger.

## Stephen's acquisition plan; Ryan's product responsibilities

Stephen owns prospecting, discovery, selling, partnerships and customer-value feedback. Ryan/engineering owns a working product, supported imports, demonstrable correctness, reliable operations and a repeatable onboarding experience. A short scheduled feedback review is sufficient; Ryan need not join every sales call or manually prepare each customer's month.

### First 30 days after activation

- Stephen builds a list of **30 genuinely suitable companies**, using his network and two or three potential advisor/referral relationships. Screen for meaningful spend, accessible evidence, a finance owner and a current decision.
- Target **10 completed discovery conversations**, **five consented evidence reviews** and **three product pilots**. These are initial execution targets, not an empirically estimated funnel or promises.
- The offer is a concrete first reviewed period: included spend, unresolved amounts, cost per accepted deliverable and product contribution where the revenue basis is usable. Avoid guaranteed-savings or causal-ROI promises.
- Engineering supplies the evidence request, supported-format guide, worked example, in-product review and safe report export. Stephen demonstrates the actual workflow. Capture setup/support minutes and reasons for stalls.
- Collect explicit willingness to continue at the current offer. Paid conversion happens only after the separately authorized billing/release gates; complimentary pilots do not count as paid customers.

### Days 31–60

- Repeat the review with the same companies; fix the two or three most common preparation failures.
- Stephen evaluates **three advisor relationships** for recurring referrals; require real company opportunities, not just an enthusiastic partner conversation.
- Write one factual before/after case study with the customer's permission, including preparation effort, decision, known limits and the price actually paid. Do not publish or message it without authorization.
- Separate a company that wants software from one buying Stephen's monthly finance service. Both can use InfFyn, but the economics and payer differ.

### Days 61–90

- Select a provisional operating target, such as **50 active companies in 12 months**, and work backwards from the measured funnel.
- Focus on the channel and company type producing usable data, paid continuation and acceptable support. Add independent CFO relationships rather than assuming Stephen can personally deliver every future account.
- Build the next verified provider/import format where the repeated cohort shows time savings. Maintain company ownership and revocable advisor membership; full OS integration remains Q2 2027.

### What a larger business would require

At $349, an illustrative 12-month plan from zero, with a two-month selling delay and 3% monthly customer churn, gives the following **required average flow**. A qualified opportunity means completed discovery, suitable pain, a buyer and a feasible data path. It is not a website visitor or cold introduction.

| Active customers at month 12 | Ending MRR | New paid accounts/month during months 3–12 | Qualified opportunities/month at assumed 25% close |
|---|---:|---:|---:|
| 50 | $17,450 | 5.7 | 22.9 |
| 100 | $34,900 | 11.4 | 45.7 |
| 144 | $50,256 | 16.5 | 65.8 |

The 50-account target therefore suggests an integer operating target of **six gross wins and 24 qualified opportunities per month**, after establishing the funnel. The unrounded expected-flow requirement is 22.9 opportunities at 25% close; at 15% close it needs roughly 38, and at 40%, about 14. A 100-account target needs roughly 46 opportunities at 25% close, or 48 to plan for twelve whole gross wins. These are conditional requirements, not a prediction that the channel can deliver them. They assume steady throughput early enough for the sales delay, without an acquisition ramp; actual ramping increases the later requirement. Capacity and hiring must also be planned.

For example, six productive advisors supplying four qualified company opportunities each month would provide 24 monthly opportunities. That is a partner operating requirement to test, not evidence that such advisors are currently recruited or available. Stephen can decide whether warm introductions, advisor partners and later buyer-intent content together can reach the chosen volume. Broad advertising is premature until activation and paid conversion are measured.

The reproducible [growth-requirements script](growth-requirements-2026-09-11.py) and [output](growth-requirements-2026-09-11.json) make the arithmetic explicit. They replace the question “what revenue did assumed low acquisition produce?” with “what must acquisition and delivery accomplish for the business we want?”

## What could become defensible

There is no established moat today. The math and a generic CSV mapper are reproducible. Company-specific reviewed mappings and history can make the product useful to retain; reusable format/exception knowledge can reduce delivery effort; trusted advisor distribution can create access to buyers. Each must be earned through repeated use. Do not turn private customer data into cross-customer training or benchmarks without a separate lawful, consented design.

A practical next build can make InfFyn materially easier to adopt. It cannot create an unassailable moat in a week. The standard should be a complete recurring job that a specific buyer prefers at a sustainable price, with measured effort and honest outputs. If the same-job comparison shows that an incumbent already solves it more efficiently, narrow the segment or integrate that tool's exports before adding feature breadth.

## Recommended decision

Proceed with the bounded **reviewed CSV preparation** design as the next product slice, alongside completion of existing alpha activation. Keep the deterministic economics engine, company workspace, internal/product lenses and Q2 2027 FynScale plan. Pair it with Stephen's explicit acquisition targets and a same-output comparison. Treat the prior simulations as conditional arithmetic and the next real funnel/handling-time observations as the basis for a forecast.
