# InfFyn product assessment and gated evolution

Prepared September 11, 2026. Read-only assessment of the current repository and its recorded acceptance evidence. No customer interviews, real-company usability tests, new hosted verification, or infrastructure changes were performed for this assessment. The five user journeys below are hypotheses, not five customers or statistical observations.

## Judgment

InfFyn has become a considered finance workflow with a working calculation foundation. It is substantially beyond a decorative dashboard or token-price calculator. It is still a locally verified private-alpha candidate: the activation record says the database-backed alpha has not been deployed, the actual backup/restore has not passed, and real customer intake is not activated. Calling this production-grade today would confuse implementation quality with operating evidence.

The strongest future product is **the monthly AI economics review for finance and the people building AI workflows**: explain the included spend, identify the business activity it supports, show unresolved evidence, retain the reviewed month, and return next month to see what changed. Sell the decision and the repeatable review. A confidence percentage, a pretty chart, or an inference calculator is supporting functionality.

The promising commercial route is a focused company product, distributed initially through Stephen's relationships. The product should remain company-owned and work without FynScale. Stephen's channel can accelerate learning and lower initial acquisition friction; it does not establish willing buyers, renewal, competitive superiority, or a scalable market.

## Quality by dimension

These are subjective judgments tied to specific evidence. They are deliberately not averaged into an invented quality score.

| Dimension | Current assessment | Evidence and implication |
| --- | --- | --- |
| Economic model | Thoughtful within its declared scope | Separate product/internal economics; included supporting and failed-work costs; internal revenue not applicable; collections versus revenue; explicit source/association provenance. See `docs/V1-REVISED-PRD.md:20`, `engine/app/monthly/economics.py:32`, `engine/app/monthly/contract.py:13`. This is a credible starting point for finance review, not proof of complete accounting gross margin. |
| Trust and auditability | A genuine product strength | Duplicate economic-record checks, retained invoice lineage, modeled allocations, immutable report fingerprints, source controls and explicit unallocated amounts. See `engine/app/monthly/economics.py:71`, `:235`, `:422`; `docs/COMPANY-MVP-RELEASE.md:13`. These reduce the risk of plausible but unsupported outputs. |
| Presentation and information hierarchy | Much more company-oriented than the initial prototype | Executive overview leads with included costs, comparable movement, product contribution, assignment coverage and material findings; workload setup begins with purpose, team and accepted unit. See `app/components/monthly/executive.tsx:129`, `app/components/monthly/workload-editor.tsx:126`. Prior visual checks are documented, but no fresh visual or real-user assessment was performed here. |
| First-use usability | Still potentially demanding | The guided path exists, but finance must obtain correctly structured evidence and reconcile it with engineering. The live preparation UI still includes CSV textareas, source notes, control totals, outcome definitions and review confirmations. See `app/components/monthly/workspace.tsx:1451` and `:1495`. A polished empty state does not prove a CFO can independently complete a first month. |
| Recurring utility | Plausible, not demonstrated | Saved revisions, return sessions, selected historical reports and compatible monthly comparisons are implemented. See `engine/app/monthly/router.py:227`, `:452`, `:470`. We have not observed a company returning to close a second month or renewing. |
| Confidence interpretation | Honest internally, easy to overread externally | `engine/app/monthly/confidence.py:5–45` defines five equal 20-point checks for each evidence class. Several depend on supplied records or reviewer confirmation. A 100 score means checklist completion; it is not a 100% probability that cost, attribution or ROI is correct. Prefer prominent “4 of 5 evidence checks complete” wording alongside the existing details. Do not train or invent a predictive confidence model without labeled outcomes. |
| Reliability and security | Substantial local work; hosted proof outstanding | Recorded 280 engine tests, 109 targeted checks, 17 migration replays and a native synthetic encrypted restore. Actual identity admission, tenant separation, recovery, retention and delivery still need hosted acceptance. See `docs/PRIVATE-ALPHA-ACTIVATION.md:21–30` and `outputs/private-alpha-implementation-2026-09-11.json`. Test counts describe scope, not a probability of safety. |
| Breadth and fit at company scale | Appropriate bounded wedge, meaningful exclusions | USD-only evidence, CSV/file/request-size limits, max 30 workloads per report, no continuous ingestion, no quality experiment system, no automatic recognition or FX. See `docs/V1-REVISED-PRD.md:51–66`, `engine/app/monthly/contract.py:140`. Companies spending $100,000/month may have vastly different row volumes; spend alone does not prove the import limits fit. |
| Defensibility | Weak in arithmetic; possible in workflow and distribution | Earlier independent DIY work reproduced clean normalized economic outputs. See `research/DIY-BASELINE.md` and `research/CFO-BUILD-OR-BUY.md`. Reusable source mappings, exception handling, trusted history and recurring adoption could become defensible execution. None is yet an established moat. |

The current documented commercial configuration is **$349 per company per month**, with complimentary named access in private alpha. This assessment proposes no price change. Earlier practice-level scenarios and references to roughly $900/month are not the current offer. Source: `docs/STEPHEN-MONTHLY-GUIDE.md:5`, `docs/V1-REVISED-PRD.md:68–72`, latest alpha supersession in `docs/PRIVATE-ALPHA-ACTIVATION.md:3`.

## The buyer to prioritize

Start with one cluster rather than “every company using AI.” The strongest initial candidate is a small or midsize software or AI-enabled service company with multiple material AI workflows, a finance owner, a cooperative engineering owner, accessible exports, and a real pricing, delivery-cost or workflow-investment decision due this month. The stated $10,000–$100,000 monthly AI spend range is a useful screen, not proof of need.

Prioritize product and service-delivery economics when revenue relationships can be reviewed and the costs can change a decision. Support internal custom workflows in the same engine, especially document work and support where accepted units exist. Internal subscriptions with no workflow or outcome instrumentation may support spend inventory, but they are a weak initial “value attribution” customer. OpenAI/Anthropic API reports cannot supply missing human acceptance or causal business results.

Three people matter even if only one buys:

- **Finance/CFO:** needs a reconciled, explainable month and defensible basis for a decision; rejects hours of recurring CSV repair or numbers that cannot be traced.
- **Founder/product leader:** needs the answer quickly: which offer, customer segment or workflow warrants intervention, and what evidence supports it; rejects impressive charts with no decision.
- **Engineering/operations:** supplies project/customer/run identifiers and acceptance data; rejects an app migration or endless custom instrumentation simply to produce a finance dashboard.

We should test the entire handoff, not just ask the buyer whether the finished PDF looks good. When finance cannot obtain the evidence without the builder doing bespoke cleanup every month, the product may be a paid service or commissioned internal tool rather than scalable SaaS.

## Five representative hypothetical journeys

All company names below are descriptors, all amounts are illustrative, and pass criteria are proposed experiment thresholds. A simulated persona agreeing with us is not validation. These journeys specify what an actual recruited company should attempt.

| Hypothetical company and actor | Job and realistic evidence | How InfFyn should help | Decisive friction or failure | Proposed observed pass criteria |
| --- | --- | --- | --- | --- |
| B2B research application; $40,000/month AI; founder plus finance lead | A fixed-price package is popular but might be underwater. Usage has customer/workload identifiers, provider bill totals and reviewed collections or revenue. | Assign costs, review revenue basis, expose low contribution and issue a period-specific report that points to the responsible product decision. | Bundled revenue has no economically meaningful split; engineering must invent customer IDs; collections are mistaken for recognized revenue. | Two reviewed months reconcile included costs; founder can name one actual pricing/packaging/investigation decision supported by the result; all unsupported allocations remain visible. A decision to leave pricing unchanged can count if the evidence resolved a genuine uncertainty. |
| AI-enabled service firm; $25,000/month AI plus material review labor; COO | Document delivery looks cheap at model level but retries and people make it expensive. Has delivery batches, accepted documents and supplied review costs. | Calculate full included cost per accepted document, retain rejected work, compare contract economics. | No stable run/cohort identifiers or review-labor basis; custom cleanup outweighs analysis time. | Accepted unit is agreed before running; complete cohort/failed work reconciles; next month repeats without changing code; combined customer/builder preparation time is measured separately. |
| Internal support automation; $15,000/month; operations lead plus CFO | Assess whether expanding automation is justified. Has ticket IDs, reopen window, final acceptance and known support costs. | Separate spend growth from accepted-volume growth and cost per accepted resolution; show modeled capacity separately. | Faster response is mislabeled resolution, reopened tickets are excluded, capacity is sold as payroll savings. | A predeclared acceptance window is actually used; full costs and outcomes support unit cost; report states missing causal evidence; owner makes an expansion, hold or investigation decision. No unsupported cash-savings claim. |
| Fractional CFO advising five firms; $20,000–$80,000/month per firm; advisor plus each owner | Produce recurring client economics reviews using consistent practices while preserving ownership and isolation. | Reuse the review method across individually owned workspaces, export traceable reports and retain historic versions. | Advisor access becomes cross-client administrator access; every client needs custom connectors; financial approvals get confused with financial provenance. | At least two consenting companies complete two periods with isolated access; each owner can revoke advisor access without losing history; recurring handling time and payer are explicit. Portfolio management remains deferred unless this repeated use justifies it. |
| API-heavy developer company already using observability; $80,000/month; engineering-led buyer | Already knows model/customer spend. Finance wants confidence in the month-end allocation and included contribution. | Bring existing exports into a reconciled record without replacing telemetry, preserve missing spend and reviewed allocations. | Existing tool plus an export already produces an accepted report faster/cheaper; InfFyn adds a duplicate dashboard. | Compare the same period and accepted output against the actual existing process; customer identifies a specific recurring gap, chooses InfFyn at its stated price and repeats. If no gap remains, disqualify rather than expanding features to win the demo. |

Additional obvious poor-fit screens: individual hobby builders, organizations buying only uninstrumented seat subscriptions, procurement requiring enterprise controls we cannot verify, unsupported currencies, companies with no owner for the evidence, and buyers demanding guaranteed AI savings or automatic causal attribution.

## What should evolve next

The evolution should be **calculation → dependable monthly review → reusable evidence and decisions → integrated distribution**. This does not require becoming a gateway, general ledger, autonomous optimizer or full observability platform.

### 1. Activate and prove the current scope

Finish the existing private-alpha acceptance sequence: verified manual recovery, inspected migrations, named identities, restricted deployment, source intake, fresh-session draft return, report/export agreement, historical correction, direct tenant boundaries, retention and scrubbed errors. This is the next engineering work, not a request that Stephen establish whether authentication works. Do not trade these checks for another design sprint. Evidence: `docs/PRIVATE-ALPHA-ACTIVATION.md:111–138`.

Exit: the engineering acceptance checklist passes on hosted infrastructure with explicit open limitations; Stephen gets a usable URL and his company-owned workspace. Managed backups, paid billing and provider imports remain deferred as authorized for this phase. Later advertised provider integrations must be verified before a broader release; alpha does not imply that gate is satisfied.

### 2. Reduce repeat preparation before adding broad capabilities

Observe three to five qualified companies using actual evidence. Record initial setup time separately from each repeated month, each required manual repair, missing dimension and accepted output. Choose the two or three most common import formats and make those repeat reliably. Preserve existing manual review and native source limitations. Connector count is a poor progress metric; time to a reviewed month is a better one.

Proposed targets to test, not promises: median first accepted month within one working session after evidence is available; month-two customer review at or under one hour; InfFyn recurring support below 30 minutes/company/month after stabilization. At $349, hours of continuing manual service quickly undermine software economics. If targets miss, simplify the workflow or price a service explicitly; do not hide the work in onboarding.

Exit: at least three real companies complete the workflow, at least two repeat another month, and actual handling time is known. These counts are directional learning gates, not a statistically reliable retention estimate.

### 3. Add the smallest decision-follow-through loop

Current reports identify material findings, but the continuing business value is whether someone acts and whether the next month informs the action. Add a compact record attached to an existing finding/report: owner, investigation/decision, expected metric, date, and later observation. Keep “reviewed,” “implemented,” and “observed result” distinct. This is not a project-management system or an autonomous recommendation agent.

Upgrade the monthly explanation only when usage warrants it. Current `compare()` rejects the entire comparison when the company comparison signature changes (`engine/app/monthly/economics.py:518–537`). That is safer than false comparability, but evolving companies will add a workload or change one scope. The useful next step is an explicit change bridge and comparisons for individually compatible workloads while clearly separating changed/new scope. Do not remove the comparison safeguards or force continuity.

Exit: at least two customer decisions are documented with an observable follow-up, and paying customers choose to renew. If customers only want a one-off audit, package that honestly and stop pretending the dashboard itself creates monthly demand.

### 4. Turn repeat use into a sustainable standalone product

Verify and enable only the provider connections demanded by the repeat cohort, complete the paid release controls, reduce support load, and document the exact scope the customer buys. Add practical administration/roles only where observed collaboration requires them. Establish a recovery service level and mature the temporary backup process before promising broader commercial operations.

Exit: a small paying cohort returns across several reporting cycles; acquisition, initial setup, support, hosting and advisor effort are separately measured; revenue is not confused with founder income. Test at least one buyer acquired outside Stephen's immediate personal channel before inferring transferable demand. A few friendly renewals still do not establish large-market fit.

### 5. Integrate into FynScale OS in Q2 2027

Keep the planned calendar window but require the standalone workflow and OS access/review controls to be ready. InfFyn retains evidence, economics, mappings, report versions and company ownership. FynScale owns engagement context, requests/files, staff assignments, review commentary, release and follow-up. Use one explicitly linked InfFyn company workspace per FynScale client, scoped advisor grants, federated actor mapping and an immutable export-to-review handoff. Standalone use survives ending the FynScale engagement.

Reuse the workspace, rather than maintain two divergent products. Keep computed analysis, CFO review and released deliverable as separate states; CFO approval does not make a modeled allocation actual. Do not assume identical user IDs or reuse an OS path that bypasses review. This preserves current standalone ownership requirements (`docs/STANDALONE-RELEASE.md:13`) and the earlier integration decisions recorded in the memory sources below; those earlier OS implementation details must be reverified before integration work.

Exit: an OS client can enter the same authorized company workspace, send a specific report version for review, receive a released deliverable, and later revoke FynScale access while retaining standalone history. There is no reason to start a second finance engine to accomplish this.

## What not to build yet

- Cross-company percentile grades: current evidence scores are checklists; cross-company units, scope, outcome criteria and collection/revenue bases are not inherently comparable.
- “Verified savings” or causal ROI inferred from month-over-month changes. A controlled or otherwise credible causal design is separate from a baseline calculation.
- Autonomous routing/spend enforcement, SDKs, real-time monitoring, broad procurement/seat inventory, general-ledger close or a custom dashboard builder before the repeating job demonstrates need.
- A portfolio platform solely because Stephen knows several companies. First prove each company can complete and repeat its own review.
- An LLM report narrator as the next priority. Deterministic facts and readable investigation guidance already cover the immediate executive need.

## What simulations can and cannot answer

Monte Carlo can expose how assumed acquisition, conversion, retention, support effort and pricing combine into possible revenue and contribution outcomes. It cannot establish buyer trust, data availability, usability, competitive displacement or product-market fit. Ten thousand fictional users do not add ten thousand independent observations; repeated draws from invented probabilities only make a hypothetical model numerically smoother.

The useful pairing is a transparent commercial sensitivity model plus these five falsifiable journeys. Real onboarding times, conversion decisions and renewals should replace assumptions as they arrive. Keep forecast ranges conditional, include a no-repeat-demand outcome, and never present scenario percentages as an empirical chance of success.

## Evidence boundary and historical context

Current code and the September 11 activation record were inspected. Prior documents contain superseded plans, especially provider requirements for public launch and practice-level pricing scenarios. The current CSV-only private-alpha exception is explicit; older broad-release requirements remain relevant only to the subsequent release. Earlier competitive statements are historical research, not freshly verified market facts in this document. Current competitor assessment belongs in the parallel market review.

Memory consulted to preserve previous company ownership/provenance boundaries: the current registry's InfFyn section, `MEMORY.md:109–112`; `rollout_summaries/2026-09-06T12-38-57-OPpv-inffyn_fynscale_economic_audit_integration.md`. Rollout `01a076ba-a050-7013-8d24-d04f480fd579`. The current repository, not the old hosted status in memory, establishes the implementation state reported here.
