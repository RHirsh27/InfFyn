# Stephen's guide to the company-facing InfFyn MVP

InfFyn helps a company understand what AI costs, which products and internal workflows justify that cost, and what changed this month—with evidence behind every conclusion.

The initial customer is a company spending approximately **$10,000–$100,000 per month on AI**, with a founder, finance lead or fractional CFO responsible for the economics. Each company has its own workspace, with invited teammates and advisors. The commercial configuration remains **$349 per company per month**. InfFyn launches as a standalone service; FynScale OS integration is planned for Q2 2027.

## Open the demonstration

[Open the Northstar Intelligence walkthrough](https://inffyn-preview.vercel.app/demo/monthly)

[Inspect the methodology and worked examples](https://inffyn-preview.vercel.app/methodology) · [Executive PDF](https://inffyn-preview.vercel.app/examples/InfFyn-Northstar-August-2026.pdf) · [Synthetic CSV examples](https://inffyn-preview.vercel.app/examples/InfFyn-normalized-CSV-examples.zip)

The methodology now traces the actual synthetic engine results through cost scope, product/internal outcomes, the $64,000 invoice allocation, the $220 discrepancy, evidence checklists and monthly comparisons. The CSV package can be replayed through the calculation workflow; it contains fictional evidence and carries no live provider verification. The public walkthrough remains read-only.

**Walkthrough verified September 10, 2026 (US Eastern).** The public demo, engine results and downloaded JSON export were checked. Customer onboarding and live provider connections remain gated on the hosted acceptance below. A two-page executive example is included at `output/pdf/InfFyn-Northstar-August-2026.pdf`; it is rendered from the same exported facts, separately from the browser print workflow.

Northstar Intelligence is a fictional 85-person B2B intelligence company. The demonstration is read-only and contains six completed months, March–August 2026. Every company, customer, source record and review is synthetic. No OpenAI, Anthropic or Stripe account is connected.

The figures run through InfFyn's actual calculation, allocation and evidence-checking engine. Synthetic labels remain in the reports and exports. This lets you evaluate the product's clarity and intended decisions without putting customer data into a preview.

## A ten-minute walkthrough

1. **Start with Overview.** August includes **$43,400** of AI and human-review costs, up from **$22,600** in March. Read the material findings before the detailed numbers. An increasing bill should prompt a look at volume and unit economics, rather than an automatic conclusion that efficiency is deteriorating.
2. **Inspect Workloads.** Research briefs and Document intelligence are customer products. Support resolution and Finance document review are internal activities. A workload is a repeatable business activity whose economics matter to the company. Each definition states its purpose, responsible team, included costs and accepted outcome. Shared expenditure remains a separate Unallocated workload.
3. **Follow the product margin problem.** Document intelligence costs **$19,200** in August against **$18,000** of associated collections, producing a **$1,200 contribution loss** within the included scope. Its accepted document volume has grown, but costs have grown faster. Review the allocation, rejected batches and human-review expense before recommending a pricing or product change.
4. **Compare an improving internal workload.** Support resolves **7,200 accepted cases** in August, compared with **3,000** in March. Cost per accepted resolution falls from **$1.60** to approximately **$0.93**. This shows improving unit economics even though total support expenditure rises. It does not establish cash savings.
5. **Open the August report and examine the invoice.** A **$64,000 bundled invoice** is allocated as **$46,000** to Research briefs and **$18,000** to Document intelligence, with no remainder. The source amount, portions and explanations remain visible. These are modeled management associations of collections, not recognized revenue or proof that AI caused revenue.
6. **Check the unresolved evidence.** Finance document review includes **$3,400** of cost against a **$3,620** control, leaving a **$220 discrepancy**. August also includes **$1,900 of Unallocated spend**. These amounts remain visible and affect the relevant evidence checks.
7. **Review the report and export.** Read the executive findings, then inspect the supporting calculations and provenance. Use the printable report to assess whether a founder or finance lead could explain the month in a leadership meeting. Connections and Monthly Review explain the live workflow; the demonstration does not accept uploads, change allocations or connect accounts.

## What a customer will do

The working sequence is **Import → Assign → Reconcile → Review → Save report**.

A customer defines its workloads, chooses a completed month, and supplies usage, costs and outcomes through CSV or an activated reporting connector. Product workloads also receive reviewed revenue evidence or invoice allocations. Internal workloads use accepted outcomes and, optionally, supplied before/after effort estimates.

Finance and engineering resolve assignments together, preserve uncertain amounts, and compare the included totals with independent controls. Preparation saves to the company workspace so they can return later. Reviewed calculations become immutable report versions; a correction creates another version. Monthly comparisons require compatible scope, units and reporting basis.

## Read these distinctions consistently

| Measure | Interpretation |
| --- | --- |
| Included AI spend | Known costs within the stated source and workload scope. Corporate overhead is excluded from this demonstration. |
| Product contribution | Associated revenue or collections less included costs. It is not automatically complete accounting gross profit. |
| Cost per accepted result | Full included cost, including failed and rejected work, divided by accepted business units in the reviewed cohort. |
| Acceptance rate | Accepted runs divided by reviewed runs. In Northstar, runs are delivery batches, while accepted quantities count individual business units. |
| Modeled capacity | An estimate from supplied before/after effort and labor rates. It is not money already saved. |
| Baseline cost difference | Prior unit cost applied to current accepted volume, less current cost. It is not a causal or verified savings claim. |
| Evidence confidence | Separate checklists for costs, revenue associations and outcomes. A complete checklist does not establish independent verification, causation or strong business performance. |

The differentiator is the connection between expenditure, business context and inspectable evidence. Provider totals alone do not explain whether a product or internal activity earns its cost. InfFyn gives that question a consistent monthly workflow and keeps unsupported conclusions visible.

## Engineering readiness and customer validation

**Engineering owns proving that the application works.** The synthetic demonstration and local tests do not establish hosted customer acceptance. Before customer onboarding, engineering must verify the existing InfFyn Supabase project, authenticated save-and-return, company isolation, invitations, live advertised connectors, commercial entitlements, email delivery, monitoring, retention and recovery. The target is the existing InfFyn database, not Blueprint OS. Exact status and release gates belong in [the release record](STANDALONE-RELEASE.md).

The launch rule requires **OpenAI, Anthropic and Stripe** to pass their real authorized acceptance before the company workspace opens. Engineering has prepared the [read-only database preflight](DATABASE-PREFLIGHT.md), [two-company hosted runner](HOSTED-MONTHLY-ACCEPTANCE.md) and [provider cases](PROVIDER-ACCEPTANCE.md). Their offline passes do not clear the hosted gates.

**Stephen owns validating customer usefulness and willingness to pay.** Once engineering clears those gates, begin with three to five qualified companies. Capture which financial decision the customer needs to make, whether the evidence is obtainable, which finding changes that decision, and whether the company chooses to repeat the process and pay $349 per month. The fractional-CFO network provides access to those conversations; it does not substitute for customer evidence.

The immediate handoff is a considered company-facing demonstration and a clear path to the customer workflow. Customer authentication, provider imports and production readiness must be assessed from engineering's verified release evidence, separately from the quality of this walkthrough.
