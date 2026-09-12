# Demand, buyers, prospect cohort, and commercial falsification

Research checked 2026-09-06. Public-source research only: no interviews, private datasets, outreach, purchase orders, paid pilots, renewals, or customer commitments. Company targets below are discovery prospects, not customers. Confidence labels concern the claim stated, not the attractiveness of the company.

Final synthesis: [FOUNDER-PACKET.md](../outputs/FOUNDER-PACKET.md) and [CFO-PILOT.md](../outputs/CFO-PILOT.md) supersede the alternative ICP bands and direct/partner pricing scenarios in this research note. The selected experiment is a $2,000 two-client partner pilot, then $299/practice + $199/active client monthly. All prices remain hypotheses.

## Finding

The underlying problem is demonstrated: companies build internal allocation pipelines, replace billing infrastructure, change AI pricing, and buy observability to deal with variable costs. **A separate AI accounting business is not validated.** The strongest available evidence also shows that customers already spend money with substitutes. Current CloudZero positioning explicitly includes invoice reconciliation and closing AI costs; generic customer margin plus a historical ledger cannot be presented as uncontested whitespace.

The next product should be a bounded, paid reconciliation and customer-contribution pilot attached to an actual monthly close. The user's latest steering is that this is being built for a fractional CFO who will handle outreach and has many contacts spending many thousands of dollars on AI each month. That is user-reported distribution access, not confirmed spend, client consent, paid demand or a commitment from the CFO. The partner-led model below supersedes the earlier introduction/cold-prospect acquisition assumption. Actual clients must still qualify on their exports, existing tools and unresolved close work.

## Evidence ledger

The following are paraphrases, not extended quotations. Access date is 2026-09-06 for all entries. Evidence classes: **operator-primary** = company describes its own actual system/problem; **vendor-case** = named customer in supplier-hosted story; **survey-primary** = survey publisher; **product-primary** = company's own pricing/docs; **hypothesis** = our inference.

| ID | Exact supported claim and date | Class / confidence | What this does and does not prove | Source |
|---|---|---|---|---|
| D1 | State of FinOps 2026 has 1,192 overall respondents, representing $83B+ annual cloud spend. Its AI management section says 98%, with N=693; AI challenge question N=649. Respondents were 47% large enterprise, 33% enterprise, 20% SMB; SMB means fewer than 1,000 employees. | survey-primary / high | Broad attention to AI cost, allocation, value. Not 98% of all companies, not 1,192 unique buying organizations, not a count of startups ready to buy. The technology-scope question includes today/next 12 months; report shorthand should not obscure this. | [FinOps survey](https://data.finops.org/) |
| D2 | Uber engineers describe their internal GenAI Gateway, audit logs for cost attribution, team usage/budgets, vendor and Uber-hosted models, and 16M monthly queries across approximately 30 teams. Published July 11, 2024. | operator-primary / high for historical system | Actual engineering investment and cost-attribution need. Also strong build-in-house alternative; historical volume is not current usage or paid-tool intent. | [Uber engineering](https://www.uber.com/us/en/blog/genai-gateway/) |
| D3 | GitLab's documented P&L pipeline combines GCP billing lines and credits, calculates feature-usage allocation ratios with FP&A/FinOps inputs, and maps costs into reporting categories/plans. Last modified October 14, 2025. | operator-primary / high | Concrete SQL/data-pipeline bricolage. This is cloud allocation, not proof of a missing AI-specific close product or a willingness to replace their pipeline. | [GitLab P&L allocation](https://handbook.gitlab.com/handbook/engineering/infrastructure-platforms/cost-management/cloud-finops/) |
| D4 | GitLab public DAP analytics epic says raw date/action/credit billing logs lack aggregation/team context; proposes namespace cost/adoption/forecasting, API-first BI access, with ROI later. Publication date unavailable. | operator-primary product backlog / medium | Real public product gap and requested economic context; supplier's own backlog is a competing solution, not a verified customer purchase request. Does not establish present delivery status. | [GitLab epic 20029](https://gitlab.com/groups/gitlab-org/-/work_items/20029) |
| D5 | Michael Truell's Cursor pricing explanation says the hardest requests cost an order of magnitude more than simple requests; explains replacing request-based pricing with API-priced usage and offers refunds after unclear communication. Page dated July 4, 2025, inspected live. | operator-primary / high | Real pricing action, cost heterogeneity, and customer-trust consequences. It does not prove Cursor lacks cost accounting or wants a new vendor. Historical page may have edited content. | [Cursor explanation](https://cursor.com/blog/june-2025-pricing) |
| D6 | Luminai's Metronome story says consolidating/reconciling/validating invoices took three hours per customer per billing cycle; Metronome plus QuickBooks/Bill.com reduced all-customer work to under half a day. The summary states under three hours total. No publication date displayed. | vendor-case / medium | Named adjacent finance pain and actual supplier adoption. Customer invoicing, not AI-provider-cost reconciliation. The incumbent already solved much of the pain. No independently audited savings or subscription price. | [Luminai case](https://metronome.com/customer-stories/luminai) |
| D7 | Portkey's SiteGPT story describes multi-provider production models, metadata logging and a reported six billion tokens processed; founder Bhanu Teja Pachipulusu attributes segmentation/debugging value to metadata. No publication date displayed. | vendor-case / medium | Real candidate already has upstream instrumentation. Multi-model and volume claims are vendor-reported; total tokens have no stated time window and cannot be converted to monthly spend. Not accounting or willingness-to-pay proof. | [SiteGPT case](https://portkey.ai/case-studies/sitegpt-built-ai-customer-support-platform) |
| D8 | Replit's Orb case describes choosing a supplier rather than delaying Autoscale launch to build billing; one engineer implemented over a month, with other UI/wrap-up support. Customer since 2023. | vendor-case / medium | Buyers pay for removing billing work; integration still material. This is deployment billing, not inference accounting. | [Replit case](https://www.withorb.com/case-studies/replit) |
| D9 | PostHog's Ian Vanagas describes a product whose daily LLM spend went from $5k to $10k while cost/run fell from $1.80 to $1.40, with workload growth explaining the change. Published August 18, 2026. | operator-primary from competing analytics vendor / medium | Operational unit costs change decisions; supplier is also demonstrating its own product. No invoice or independent verification. | [PostHog operator account](https://newsletter.posthog.com/p/this-post-will-save-you-tokens) |
| D10 | CloudZero's finance page explicitly claims attribution by customer/product/AI feature and AI spend reconciled against actual invoices for close. Live page; no publication date. | product-primary marketing / high for claim, unverified implementation | Direct competition for the proposed close wedge. Need comparative workflow test, not claim of an absent feature. | [CloudZero finance](https://www.cloudzero.com/solutions/finance/) |
| D11 | YC's AI directory says 1,586 AI startups, August 2026. Directory includes many two-person, consumer, hardware, and otherwise unqualified businesses. | directory-primary / high for published count | A prospect-search pool, not qualified market size. No reliable fraction meeting spend/pain/budget threshold. | [YC AI directory](https://www.ycombinator.com/companies/industry/ai) |

FinOps D1 also reports that 78% of practices sit under CTO/CIO, with the leadership-structure question N=523. Thus starting exclusively with a CFO is not justified. For small product companies, founder/CTO and finance jointly control the problem. For enterprise FinOps, technology leadership frequently owns it. Do not transfer large-enterprise survey proportions to startup purchasing behavior.

Public Reddit complaints were searched but excluded from core proof: many threads are anonymous, solicit alternatives, or contain sellers responding to sellers. They are useful interview language, not a buyer census or evidence of paid demand. Generic vendor thought leadership saying spreadsheets are painful is similarly weaker than D3's documented pipeline or D6's named customer workflow.

## Initial ICP and buyer hypothesis

Start with a B2B AI support/knowledge-agent vendor selling distinct customer subscriptions, commitments or metered tasks, with multiple model providers and identifiable tenant/workflow usage. Prefer API inference and existing gateway/trace exports. Exclude self-hosted GPU allocation from the first pilot. A practical qualification band is **$30,000-$300,000 monthly external AI/tool spend**, at least 50 paying customer accounts, and an upcoming close or renewal/pricing decision that their existing tools cannot answer. These thresholds are hypotheses, not researched population statistics.

The buyer is the founder or head of finance/controller who owns contribution reporting and agrees the answer changes a close, renewal, price, or budget. CTO/platform lead is the implementation sponsor. In a smaller founder-led business, one person may fill both roles; the introduction should establish actual authority rather than assume a CFO title is present.

The triggering question is: **Show the last AI bill or customer margin question that your existing tools could not resolve, who rebuilt the answer, how long that took, and which decision waited.** If there is no repeated exception, the company is not a pilot fit. A large AI bill alone is insufficient.

Minimum admission:

1. They can provide a selected closed-period provider invoice/export, a read-only usage export with stable tenant IDs, and an approved revenue schedule for the same period.
2. They identify a material exception or at least eight staff-hours of recurring monthly reconciliation work; do not invent missing evidence to clear this threshold.
3. Finance names the decision it will use the result for and the tolerance it accepts. The engine exposes remaining residuals; no balancing plug masquerades as attributed cost.
4. Existing gateway, billing vendor, warehouse query or FinOps tool cannot deliver the same result at an acceptable effort/price after a fair comparison.
5. They approve the sample, data handling and paid pilot scope. No production SDK rewrite, prompt bodies or end-user PII should be needed just to test the thesis.

This cohort is an integration-learning wedge. Below $10k/month, a standalone customer-margin product is difficult to justify from inference savings alone. A fractional CFO may still buy shared workflow software for recurring close labor across several clients; that is a different value case, tested separately in the partner-led model below. Do not infer margin pain merely from AI spend.

## Ten named companies to qualify

All links were inspected through current search/open responses. Public pricing is evidence of economic structure, not their supplier bills, margin, accounting failures, ability to spend, or interest. No employee email addresses were collected. Priority reflects likely information gain, not a sales probability. Requested role is an inferred discovery role, not verified current org ownership.

| Priority | Company / public evidence | Why test | Mismatch or disqualifier | First role |
|---|---|---|---|---|
| 1 | **SiteGPT**: [current pricing](https://sitegpt.ai/pricing?interval=month) maps one plan to a mix of GPT-4.1-mini/GPT-4.1 message capacity; [D7](https://portkey.ai/case-studies/sitegpt-built-ai-customer-support-platform) shows existing multi-provider logging. | Gateway export + customer subscription join may be feasible; founder already discusses metadata utility. | Existing Portkey may already answer enough. Monthly spend and unresolved finance problem unknown. Do not infer them from lifetime tokens. | Founder / finance owner + platform engineer |
| 2 | **Chatbase**: [credit FAQ](https://www.chatbase.co/docs/faq/faq) lists model-dependent credit multipliers; [pricing](https://www.chatbase.co/pricing) offers subscriptions, recharges, voice and enterprise. | Model mix, add-ons and customer allowance economics offer explicit testable cost/revenue joins. | Their credit system may already preserve economics; voice brings more cost sources than text-only pilot. | Finance/operations owner + platform lead |
| 3 | **Inkeep**: [cloud FAQ](https://docs.inkeep.com/cloud/faqs/pricing) says quoted pricing accounts for expected usage and unusual usage may prompt new pricing; [current product docs](https://docs.inkeep.com/pricing) show managed enterprise and open-source options, OTEL traces. | Customer contract repricing has an explicit reason to use accurate cost-to-serve. Existing traces may lower integration effort. | FAQ and newer pricing docs reflect different offerings; qualify current commercial model. Self-hosting shifts spend to buyers and reduces wedge. | Founder/finance owner + engineering |
| 4 | **DocsBot**: [pricing](https://docsbot.ai/pricing) includes AI credits, larger-model/action multipliers, document parsing and optional BYOK. | Mixed metered actions create cost and credit reconciliation opportunities. | BYOK accounts do not generate provider COGS for the vendor; exclude those. Accounting spend threshold unknown. | Founder / operations-finance owner |
| 5 | **eesel AI**: [current pricing](https://www.eesel.ai/pricing) charges $0.40 per regular task including a complete ticket/chat, irrespective of back-and-forth count. | Fixed revenue per task against variable conversation cost is a clean contribution experiment. | Task model may already internalize the distribution; smaller inference bills may make finance-grade close unnecessary. Older documentation has different plans: use current contract. | Founder / finance owner + backend lead |
| 6 | **My AskAI**: [pricing](https://myaskai.com/pricing) offers Pro from $199 with usage overage; [unit definition](https://support.myaskai.com/account-management/pricing-%2B-plans) differs by own widget versus helpdesk reply counts. | Explicit unit mapping across channels makes usage-to-revenue exceptions testable. | Simple mature metering may already suffice; low price per unit is not evidence of low margin. No supplier spend disclosure. | Founder / finance owner |
| 7 | **CustomGPT.ai**: [pricing](https://customgpt.ai/pricing/) has monthly plans and enterprise; [actions docs](https://docs.customgpt.ai/docs/actions-cost) apply action-specific credits, with Smart Tasks dynamically charged. | Multiple actions/queries plus enterprise contracts could create reconciliation complexity. | Existing query-credit ledger may solve main problem. Enterprise delivery services could dominate margin over inference. | Finance/operations owner + platform lead |
| 8 | **Kapa**: [current pricing](https://www.kapa.ai/pricing) offers production retrieval/API/hosted MCP, indexing and enterprise controls. | Customer-level retrieval and indexing cost is economically attributable. | Current retrieval positioning is a material mismatch with an LLM-inference-only MVP; do not assume hosted generation or published spend. Useful negative-control interview. | Founder / finance owner + infrastructure lead |
| 9 | **Wonderchat**: [pricing](https://wonderchat.io/pricing) describes paid agent tiers, message-credit limits, support/sales/internal agents and custom workflows. | Multiple customer agent workflows and credits are relevant allocation dimensions. | Current price fields were not reliably extracted; no numerical price claim. Provider mix, spend and buyer unknown. | Founder / finance owner |
| 10 | **Chat Thing**: [current product/pricing](https://chatthing.ai/) bundles message/storage tokens and offers GPT/Claude/Gemini model choice from Standard. | Public token quotas make a simple pilot or DIY comparison concrete. | $14 entry and $299 listed enterprise monthly pricing suggest possible lower-budget business; not evidence of revenue or actual spend. Disqualify if no material recurring close pain. | Founder / finance owner |

Do not begin with Cursor, Uber or GitLab as expected first customers: they are valuable reference patterns but have substantial internal infrastructure and harder procurement. Luminai is a stronger adjacent referral/interview candidate but already uses Metronome; the question is specifically what AI supplier-cost reconciliation remains after that deployment. Ten targets do not imply ten reachable or qualified buyers.

## Bottom-up market model

**Verified floor: ten named discovery targets, zero qualified buyers.** A statistical estimate of currently acute-pain companies is not supported by public data. YC's 1,586 AI companies is a transparent, inspectable screening universe; multiplying it by 100% would count pre-revenue companies, hardware, ML companies without material inference bills, and businesses already served. Langfuse adoption or FinOps survey percentages would be even weaker denominators for this particular product.

Screening sensitivity on that single YC pool (not global TAM):

| Assumed fraction meeting all ICP conditions | Qualified companies, rounded | At $18k annual subscription, 100% penetration | At 10% penetration |
|---|---:|---:|---:|
| 2% | 32 | $576k ARR | about $58k ARR |
| 5% | 79 | $1.422M ARR | about $142k ARR |
| 10% | 159 | $2.862M ARR | about $286k ARR |

Those percentages are assumptions to replace with an actual screened census, not confidence bounds or a forecast. Non-YC firms are additional but uncounted. Do not add overlapping provider, accelerator, directory and observability customer counts.

Company-scale requirements, independent of an unproven TAM:

| Subscription ARR objective | $12k ACV | $24k ACV | $60k ACV |
|---|---:|---:|---:|
| $1M | 84 customers | 42 customers | 17 customers |
| $10M | 834 | 417 | 167 |
| $100M | 8,334 | 4,167 | 1,667 |

At $24k ACV and 10% penetration, $10M ARR needs roughly 4,170 qualified buyers. Public evidence here does not establish that population. A small profitable business may be attainable with dozens of accounts if retention and delivery cost work; a venture-scale inference-close platform is not established. AI-scope growth in FinOps is a directional tailwind, not a measured growth rate of buyers for this product.

## Pricing tests and economic constraints

Sell a **$2,500 fixed-scope, 30-day paid pilot** covering one closed month, two API providers, one revenue schedule, one customer map, explicit residuals, and a reviewed contribution report. Test continuation at **$1,000-$2,000/month** for repeated monthly reconciliation, exception ownership and preserved calculation history. These are proposed experiments. No buyer has agreed. Do not charge a percentage of all AI spend: it penalizes growth, creates audit friction, and makes cost reduction reduce our revenue. Avoid savings-share initially because counterfactual savings and implemented changes are hard to verify.

| Customer monthly AI spend | Candidate commercial fit | Value arithmetic to test, not claimed savings |
|---|---|---|
| $1,000 | No standalone paid-close product; template/open-source/export may suffice. | A $100 fee requires 10% of spend just to equal its cost, before integration. |
| $10,000 | Only if repeated finance work/contract exceptions are unusually painful. | $500/month is 5% of spend. At 5% avoidable spend, there is no net savings before implementation; eight hours saved at assumed $100/hour might support a small fee. |
| $100,000 | Initial promising band if real close/margin blind spot. | $1,500/month is 1.5% of spend. A measured 3% improvement is $3k/month, but accounting alone may not cause that improvement. Alternative: 20 hours reduced at assumed $100/hour = $2k. Never count both if the same work generates both claims. |
| $1M | Larger enterprise option after controls proven. | $5k/month is 0.5% of spend; could be easy to justify, but enterprise procurement, security, data residency and incumbent overlap raise delivery/sales cost. Not initial one-month founder-sale assumptions. |

Illustrative vendor unit economics: at $1,500 MRR, $100 data/hosting, two support hours at $100 loaded/hour and $75 other customer delivery cost leave $1,125/month, or 75%, before acquisition/R&D/G&A. At six support hours, contribution falls to $725, 48%. The dominant risk is integration and exception labor, not token-rating CPU. These costs are assumptions requiring time logs. A $10,000 CAC would take about 8.9 months to recover at $1,125 monthly contribution; at $20,000 CAC, 17.8 months. No retention/LTV claim is possible before cohorts renew.

The $2,500 pilot is a validation service, not recurring SaaS revenue. At 15 delivery hours x assumed $100/hour plus $150 infrastructure/admin, contribution is $850 (34%); at 30 hours it loses $650. Cap scope before accepting bespoke source work. A renewal dependent on a founder spending 20 hours per account is not repeatable software demand.

## Client-level validation packet

The fractional CFO's own client work is now the initial route. Required facts are the company type, verified spend band, existing providers/billing/observability tools, and the last unresolved monthly close or customer profitability question. The CFO's relationship does not automatically authorize access to any client's records. Do not ask for credentials or end-customer content.

**First conversation, 30 minutes:** ask them to walk through the last monthly close. Identify the person who reconciled costs; actual hours, corrections and waiting; whether balances tie to provider totals; whether revenue is recognized, invoiced or simply cash receipts; and whether an exact contribution answer would change a decision. Ask what CloudZero/Vantage/Orb/Metronome/PostHog/their warehouse already does before proposing replacement.

**Artifact exercise, subject to customer-approved sharing:** obtain a small redacted representative slice plus provider totals, stable surrogate customer IDs and a revenue schedule. Build the result using their current tool or simple SQL first. If it takes two hours once and needs no recurring exception handling, disqualify the recurring product.

**Paid pilot offer:** deliver a signed-off cost bridge, customer contribution schedule with revenue basis named, and an exception list with owners. Acceptance is not 'looks useful': provider reconciliation must explain every residual; corrected facts must preserve previous calculations; the reviewer must reproduce a selected customer total; the report must support a named decision or demonstrably reduce recurring close work.

**Sequential decision gates:**

1. After 10 qualified conversations, at least 5 show a repeated material workflow and 3 will share representative approved exports. Otherwise stop the wedge.
2. Obtain 2 paid pilots at $2,500 or an explicitly documented equivalent scope/price; verbal intent and LOIs do not count as payment. User approval remains required for any payment request or outreach.
3. Time to first trustworthy bridge <=2 working days after complete inputs; <=1 engineer-day of customer integration per pilot. If missing IDs require major re-instrumentation, pricing and rollout must change.
4. At least one used output per pilot changes a real action or reduces measured recurring work. A report finding 'everything is profitable' can still matter if it removes a genuine close burden; it cannot merely be an interesting analysis.
5. Both pilot customers renew for at least two further monthly cycles at >=$1,000/month, with <=2 delivery/support hours per account per month by the third cycle. Only then fund a broader multi-tenant product build.
6. Run the same task through the strongest incumbent available to the buyer. If it delivers equivalent approved output at lower total cost, stop or sell a managed implementation service honestly.

**Most likely killer assumption:** the unresolved work is recurrent and common enough to warrant another vendor, rather than a one-time identity mapping and warehouse query that finance can maintain. Attack this by timing both the initial DIY version and the next monthly rerun. Second risk: the buyer wants budgets/routing or customer billing, while invoice-grade historical attribution is something the founder finds elegant but does not buy.

## First 10, 100 and 1,000 customer path

The first ten should be ten qualified client conversations arranged by the fractional CFO from their existing book or contacts. The ten public companies above are a backup research/comparison cohort, not the primary acquisition plan. No particular client count, availability or conversion is confirmed. An illustrative first pass is ten discussions -> four approved data reviews -> two paid client pilots, or one partner-paid pilot serving two approved clients. Those are different buyer counts and must be reported separately. The assistant sends no outreach.

At 100 customers, reuse two or three proven ingestion packages and recruit fractional CFO/accounting/FinOps implementation partners only after their clients' retention and our support economics are measured. Publish approved case studies tied to close hours or specific corrected decisions. No customer logos or 'money saved' claims without permission and attribution evidence.

At 1,000 customers, the narrow support-agent cohort is unlikely to suffice unless a census proves otherwise. Expansion would require adjacent workflow SaaS categories or a distribution integration through existing billing/gateway platforms. Each is a new product-market-fit test with different revenue contracts and cost types. At $24k ACV, 1,000 subscriptions equal $24M ARR; it is arithmetic, not a credible forecast today.

## Commercial verdict from this lane

**Do not build the full standalone platform yet.** Build the smallest read-only reconciliation proof needed to sell and fulfill a CFO-led paid close pilot, then require recurring use and renewal. The fractional CFO's actual client work is the highest-value next evidence source. A partner paying to serve two clients validates one buyer and two deployments, not two independent purchasing decisions. If the existing tools already suffice or no recurring work supports the price, report that result plainly before building more UI.

## Updated channel economics: fractional CFO partner

This section reflects the user's latest direction and supersedes the initial direct-sales assumptions where they conflict. All proposed prices, labor costs, conversion gates and split percentages below are experiments, not agreed commercial terms. The CFO handles outreach. Their contact network reduces the need for cold prospecting, but does not by itself establish distribution rights, client permission, purchasing authority, demand, or recurring retention.

### Decide who buys before calling it a channel

| Structure | Contract and payment path to test | Economic implication | What is not established |
|---|---|---|---|
| CFO is the software buyer | CFO pays for a portfolio workspace and uses approved outputs in their existing finance service. Clients approve the relevant access. | Recurring value may be CFO labor saved across clients; per-client AI spend can be lower. Best starting hypothesis if this tool is for the CFO's own work. | CFO's budget, authority, actual client count and willingness to pay. Their service fee is not our software ARR. |
| Client buys; CFO refers or implements | Each client signs and pays us. A written agreement specifies any referral fee and the CFO's separate implementation service. | Two clients paying means two buyer decisions. Fee and support responsibilities affect our margin. | A referral fee is not owed by assumption; no exclusive ownership of the client or all future revenue is implied. |
| CFO resells a bundled service | CFO contracts with client and buys a defined software allowance from us; service/support duties are explicit. | We recognize our actual contracted software fee. The CFO's full client invoice is not our revenue. | Wholesale price, markup, first-line support, renewals, client portability, collections risk and responsibility for corrections. |
| Build commissioned for one CFO | CFO funds bespoke internal software; ongoing maintenance is separately contracted. | This may be an attractive project or service business even if no repeatable SaaS demand exists. | Product ownership, IP/license rights, resale rights, maintenance SLA and future development funding require an agreement; none follows automatically from the introduction. |

Keep the first proposal nonexclusive. Specify who owns client relationships and approves exports; who contracts, pays, supports, renews and can terminate; and whether the CFO is an adviser, referral partner, reseller or customer. This is a commercial design checklist, not an assertion of agreed legal terms.

### Why 'many thousands per month' does not select a price

At $5k, $10k and $100k of monthly AI spend, a hypothetical 3% avoidable-cost reduction is respectively $150, $300 and $3,000. A $500 monthly software fee consumes 10%, 5% and 0.5% of that spend. Therefore the smaller clients cannot justify $500 from a 3% saving alone. No savings are promised: a reconciliation product may find no waste, and a recommended change must actually be implemented to create savings.

The CFO labor case is separate. At an **assumed $100/hour of loaded delivery cost**, reducing four monthly hours to one saves $300. Across five comparable clients it releases 15 hours, valued at $1,500. Count that as capacity value unless the CFO can reduce paid labor, serve more paying clients or realize another cash benefit. Do not add saved hours to avoided spend if they measure the same intervention. Time both the current process and subsequent reruns; the initial cleanup often overstates recurring labor.

For a $5k-spend client, qualify on recurring finance work or a material contract exception, and favor inclusion in the CFO's portfolio package. At $10k, require a stronger measured burden before an individual subscription. At $100k, cost exceptions can be economically material, but high spend still does not prove an unresolved problem. No spend threshold substitutes for a named decision and accessible records.

### Pilot and recurring fee experiments

**Partner-paid test:** $2,500 for one closed month across two approved clients sharing a supported input pattern, maximum two provider sources per client, one revenue schedule each, and explicit exception review. The CFO performs client coordination and signs off the outputs. Cap our delivery at 12 hours; at assumed $100/hour plus $200 data/admin cost, our pilot contribution is $1,100, or 44%, before product development and general overhead. At 24 hours it loses $100. Additional bespoke sources require a revised scope. CFO delivery hours and any fee they charge clients are separately recorded.

**Portfolio renewal test:** $500 per CFO workspace plus $200 per active client each month. At five clients, software revenue is $1,500/month. With assumed $150 shared monthly service cost and $100 per client ($25 infrastructure, half an hour support at $100/hour, $25 other delivery), contribution is $850, or 56.7%. If support grows to two hours per client, contribution falls to $100, or 6.7%. This pricing requires repeatable imports and self-service exception review; it cannot support unlimited founder labor. These assumptions also show why a $1,500 package is merely break-even against the example $1,500 of labor capacity freed, absent further value.

**Client-paid/referral alternative:** $1,000 per client/month, with an explicitly negotiated illustrative 20% referral share. If the share is recurring, $200 goes to the CFO; $75 infrastructure/other delivery plus 1.5 support hours at assumed $100/hour leaves $575 contribution, or 57.5%, before acquisition/R&D/G&A. If the referral fee applies only to year one, model that duration explicitly. Do not combine a recurring referral share and wholesale discount unless both are deliberately priced in. Lower-spend clients may reject this price, which is useful evidence.

Use these as alternative proposals, not simultaneous charges. Choose the structure that matches the actual buyer's work and budget. A single CFO account serving multiple clients may be an excellent first customer, but portfolio growth is expansion within one customer, not independent market replication.

### First-client protections and validation gates

Each client separately approves the source records and allowed use. Keep client tenants isolated: client-scoped source IDs, imports, revenue schedules, rules and outputs; deny cross-client access by default; explicit CFO membership per client; separate reviewer/client access; access revocation and exports on termination. A portfolio view can aggregate only authorized clients. Shared workspace ownership must not allow one client to view another's contracts or margins. Customer records never become cross-client benchmark data by default.

For the initial proof, obtain **one actual paying partner or two actual paying clients**, plus two separately approved client datasets and reviewers. Record which path occurred. Continue only if both clients complete a real close, the CFO uses the outputs in recurring work, and the paying buyer renews for two further monthly cycles. At portfolio pricing, target <=30 minutes of our ongoing support per client per month by cycle three; the earlier two-hour target is insufficient for these lower fees. Measure the CFO's own remaining work too, so effort is not merely transferred.

Before interpreting this as a broader company, secure a second independent CFO buyer or independently paying client outside the first CFO's relationships, with the same input/output pattern and acceptable support margin. One enthusiastic partner can conceal bespoke requirements and weak market demand. Track revenue concentration by actual contracting buyer: five client deployments under one CFO contract are still 100% partner concentration. Avoid exclusivity, unbounded customization, or building a portfolio platform on an unverified contact count.
