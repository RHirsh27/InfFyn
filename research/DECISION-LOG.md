# InfFyn decision and hypothesis register

Research date: 6 September 2026. This is a decision record, not customer validation. The user clarified that they are building for a fractional CFO who will handle outreach and has many contacts spending thousands on AI each month. This is user-reported channel access. Specific client profiles, access to data, budgets, and willingness to pay are not yet known.

## Iteration 1 — Customer margin as the wedge

**Hypothesis:** joining provider usage to customers and Stripe creates a scarce product.

**For:** variable usage can make fixed-price accounts uneconomic; provider totals do not supply application customer identities. Existing InfFyn has much of the ingestion and reporting scaffold.

**Against:** Amberflo, CloudZero, Revenium, and smaller products explicitly offer customer economics. Vantage now offers token cost allocation. A warehouse join is feasible when identifiers are already good. Stripe cash collections are not period revenue.

**Decision:** reject a general customer-margin dashboard as the founding wedge. Confidence: high that this is contested; unknown how well each product works for a particular buyer.

**Most likely company-killing assumption:** an appealing output is assumed to be differentiated.

## Iteration 2 — Accounting close as the wedge

**Hypothesis:** reconciliation, completeness, immutable periods, and adjustments are the missing layer.

**For:** provider documentation distinguishes usage from cost; delayed bills and incomplete telemetry require explicit bridges. The local app audit demonstrates how plausible totals can conceal accounting errors.

**Against:** Spendline expressly markets this close workflow; CloudZero markets invoice reconciliation and finance close; Revenium also claims reconciliation. FOCUS 1.4 standardizes more of the invoice bridge. Public documentation is not a hands-on product test, but it defeats a claim of empty market space.

**Decision:** reject 'we invented the AI close' positioning. Retain close as a *customer-specific workflow hypothesis* to test using a common acceptance fixture. No engineering platform commitment. Confidence: medium in workflow usefulness, low in a new vendor's right to win.

**Most likely company-killing assumption:** the remaining work is bespoke data cleanup whose service cost exceeds subscription value.

## Iteration 3 — Cross-provider, non-token contract profitability

**Hypothesis:** voice, tools, human review, asynchronous work, and subscription contracts create a narrow recurring gap that token tools miss.

**For:** minutes, executions, and labor do not share token semantics; a single successful workflow may span several providers and retries. Some token-allocation specifications exclude non-token pricing.

**Against:** general billing/FinOps platforms support custom costs, and customers can model these units themselves. Outcome-based vendors may already meter the relevant business unit. More connectors raise onboarding and support costs.

**Decision:** keep as an interview segment, not an asserted winner. Test on the introduced company's last two closes and existing tools. Confidence: low until a repeated unmet task appears.

**Most likely company-killing assumption:** enough reachable buyers share the same gap to fund a repeatable product.

## Iteration 4 — Execution and falsification

Build a small local reconciliation harness, an explicit economic model, a priced pilot, and a comparative acceptance script. Run it on synthetic examples now; require authorized customer evidence before commercial conclusions. The prototype tests technical invariants, not demand or competitor inferiority.

| ID | Hypothesis | Evidence for | Evidence against / gap | Confidence | Test | Result / decision |
|---|---|---|---|---|---|---|
| H01 | AI cost pain is real | Provider APIs, FinOps survey, documented customer stories | Broad pain may already be served | High for category pain | Observe last close | Category supported; separate product unproven |
| H02 | A customer-margin dashboard gets installed | Concrete pricing decisions | Many direct competitors; cheap tools | Low | Compare incumbent on same fixture | Reject broad wedge |
| H03 | A finance close is unserved | Data fragmentation and local accounting failures | Spendline/CloudZero/Revenium claims | Low as whitespace | Hands-on incumbent acceptance run | Reject novelty; test execution gap |
| H04 | A non-proxy importer wins | Avoids application request-path change | Vantage S3, warehouse exports, sidecars exist | Low | Time to import and value vs incumbent | Channel convenience alone insufficient |
| H05 | Mixed-unit contract economics is a repeatable gap | Tools, voice, human-review spend | Custom metering systems can represent units | Low | Three similar companies, two periods each | Retain for discovery |
| H06 | Finance pays at least $1,500/mo | Material spend and close labor can justify it | No paid evidence for InfFyn | Unknown | Fixed-price paid pilot, renewal at full price | Pending |
| H07 | Source data supports credible customer assignment | Request IDs and tenant tags can exist | Lost identity cannot be reconstructed from aggregates | Medium technical, unknown customer | Join coverage and unexplained residual | Pending real exports |
| H08 | Revenue can be causally attributed | Sold transactions; controlled experiments | Subscription membership is not causation | Low generally | Separate association from experiments | Reject general causal revenue number |
| H09 | Rating and history can be reproducible | Explicit versioned rules and snapshots | Existing app does not satisfy this | High feasibility | Adversarial local tests | Prototype verification recorded separately |
| H10 | Service becomes software | Same exports and exception rules could recur | Bespoke connectors and policy decisions | Unknown | <=8h setup; <=2h monthly service by third close | Pending |
| H11 | New vendor can resist incumbents | Trusted recurring workflow may embed | Stripe/Metronome + gateway convergence | Low initially | Buyer explains paid reason to choose us | Pending |
| H12 | Reachable market supports attractive company | Numerous AI applications | No census of qualifying spend + gap + buyer | Unknown | Enumerate 100 qualifying accounts | Scenario only |

## Iteration 5 — The fractional CFO changes the route to market

**New evidence from the user:** a fractional CFO is the intended partner and will conduct outreach through an existing network of AI-spending companies. Interpret 'fractal cfo' as fractional CFO.

**Revised hypothesis:** a portfolio close workbench sold to this CFO can make a repeatable AI-finance service faster and more reliable. The first installation may be in the CFO's workflow rather than in every client's application.

**What changed:** we have a plausible initial operator, channel, repeated deadline, and way to observe several client workflows. Test client handoffs, missing evidence, review status and reusable mappings across separately permissioned clients.

**What did not become evidence:** the CFO has not agreed to buy, contacts are not qualified clients, thousands in AI spend is not a tool budget, and multi-client packaging is not a moat. Incumbent partner/MSP and accounting-practice tools must be compared.

**Decision:** BUILD, BUT ONLY WITH THIS WEDGE means build the bounded partner pilot and local acceptance prototype. Full-platform and standalone-company commitments remain gated by paid use, recurring closes, contribution economics, and an explicit reason to choose this over incumbents. This is a conditional investment decision, not an assertion that the mission's commercial proof has been achieved.

**Test:** one paid partner pilot covers two consenting clients, then three monthly cycles across at least five client accounts and a second independent CFO. Require recurring willingness to pay, declining service effort, and a real current-tool gap. If the partner can meet the same needs with an incumbent plus an export, recommend that setup instead of custom software.

**Most likely company-killing assumption:** one CFO's enthusiasm or custom service needs are being mistaken for a scalable product market.

## Iteration 6 — Attack incomplete economics and review evidence

**Hypothesis:** a local prototype can compute costs beyond tokens without counting supplier invoices twice, manufacturing outcome success, or treating a matching total as source completeness.

**Evidence for:** 77 integrated tests pass. A realistic-size synthetic cohort includes inference, search, compute and rated human review, with all failed attempts and rejected runs retained. Source declarations check hashes/counts/totals and bind exact active event hashes to a frozen snapshot. A durable local journal preserves assignment, notes, review conclusions and revisions. Independent adversarial review found and then verified fixes for historical identity reuse and unassigned workflow costs.

**Evidence against / limits:** source populations, supplier coverage, outcome acceptance, loaded labor rates and revenue recognition are still operator assertions. Provider-native conversion is narrow. A named local owner is not a verified identity, and HTML presents saved evidence rather than editing a hosted review workflow. Technical feasibility does not establish paid demand.

**Decision:** retain the local harness for a controlled comparison using client evidence. Confidence is high in the tested arithmetic invariants and low in commercial differentiation. The [completion audit](../outputs/COMPLETION-AUDIT.md) keeps all twenty mission requirements tied to their actual evidence status.

## Iteration 7 — Attack import economics

**Hypothesis:** even a correct local calculation is unsuitable if normal ingestion becomes prohibitively slow.

**Test/result:** a bounded benchmark exposed repeated full-history parsing: 1,000 attempts took 5.1904 seconds to import. Replacing that scan with one tenant preload plus maintained identity indexes reduced the measured case to 0.0561 seconds. A 10,000-attempt case and a workflow-heavy case completed within the bounded run. [The benchmark report](LOCAL-PERFORMANCE.md) records raw measurements and remaining limits.

**Decision:** initial local scale is more credible; production monthly scale remains unproven. No million-event or concurrent hosted claim follows from these measurements. Avoid additional speculative connectors until representative client files reveal the actual workload.

**Most likely company-killing assumption after both cycles:** the CFO and clients will pay recurring prices for a gap that an existing product or well-maintained export cannot solve more cheaply. The next decisive work is the CFO's observed client close and paid decision, not more synthetic features.

## Iteration 8 — Execute the DIY substitute and test buyer value

**Hypothesis:** an AI-generated export-analysis script can reproduce the numbers that make the product look valuable; the buyer's recurring labor burden may be too small to justify the proposed license.

**Test/result:** an independent standard-library script, importing no prototype modules, reproduced the clean normalized fixture's cost, revenue, customer contributions and cost per accepted outcome. Six reference comparisons and nine bounded adverse checks passed in the root rerun. It received normalized records, mappings, prices and source declarations; onboarding from native client exports and historical review controls remain outside its capability. [Executed counterexample](DIY-BASELINE.md).

**Buyer arithmetic:** at five clients, the proposed $1,294 monthly fee needs 12.94 net hours of capacity value at the assumed $100/hour if labor is the only benefit. A reduction from three hours to 0.5 hour per client leaves a $44 shortfall before transition costs. The workbench now exposes this buyer comparison, including only explicitly cancellable tool costs. No actual client hours or willingness to pay have been observed.

**Decision:** the arithmetic is demonstrably reproducible and is a weak moat. Stop speculative custom-product expansion until the CFO demonstrates a recurring accepted output, measured current/rerun effort and a funded reason to use the prototype rather than a simpler alternative. A commissioned internal tool, an AI-finance service using licensed software, and a standalone InfFyn license are distinct businesses; success in one does not prove the others. [Funded-route comparison](CFO-BUILD-OR-BUY.md).

**Remaining blocker:** the same commercial evidence gap persists: no named qualified partner clients, observed close process, paid decision or repeat use. It has remained unresolved through the research, prototype extension and DIY-comparison goal turns. Further local calculations cannot supply buyer behavior. The full mission remains unproved; resume with the CFO's selected companies and observed workflow evidence, without counting the finished local harness as business validation.

## Evidence retrieval and stopping rule

Independent lanes examined incumbent product documentation, emerging direct competitors, demand statements, buyer examples, provider limitations, standards, and the current repository. The highest-impact overlap claims were opened again by the coordinating agent. Search terms included AI cost customer margin, invoice reconciliation, AI month close, AI subledger, token allocation, internal SQL/FinOps, and usage-based billing.

Stop broad desk research when another search is unlikely to change the decision: the obvious wedges are already claimed and willingness to pay cannot be resolved by collecting more vendor pages. The next evidentiary step is a customer workflow session, followed by a paid pilot only if the comparative test reveals an unmet recurring need. Do not convert an introduction, demo, prototype, or friendly response into validation.

Sources: [competition evidence](competition.md), [demand evidence](demand.md), [economic architecture](../outputs/ECONOMIC-SYSTEM.md), and [founder packet](../outputs/FOUNDER-PACKET.md).
