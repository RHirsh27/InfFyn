# What business is the CFO actually buying?

Commercial challenge review · 6 September 2026 · Local analysis only

**Recommendation: decide the delivery business before funding more product.** The CFO relationship makes a commissioned internal tool or a recurring finance service plausible. It does not yet select a standalone software business. The existing prototype is enough to make a comparison concrete; the next missing evidence is the CFO's actual recurring job, alternative cost and purchasing choice.

This review uses the existing [founder packet](../outputs/FOUNDER-PACKET.md), [pilot](../outputs/CFO-PILOT.md), [competition](competition.md), [demand evidence](demand.md) and [model assumptions](../outputs/model-assumptions.json). It adds no vendor research, outreach, quote, client data or commitment. The user reported a fractional CFO who will handle outreach and has contacts spending thousands on AI. We still lack a confirmed spend type, recurring workflow, qualified account count, agreed commercial arrangement, payment and actual close data. Every price and hourly value below is an experiment or model assumption.

## Three businesses, three different reasons to proceed

| Business | What is sold and who pays | Evidence that would justify proceeding | What its success would establish |
|---|---|---|---|
| **Commissioned internal tool** | The CFO practice funds a defined build for its own operation, with explicitly priced maintenance. The builder earns project/maintenance revenue. | A demonstrated practice-specific job; a funded scope and acceptance output; build plus upkeep costs below the practice's measured benefit or acceptable strategic budget. A cheaper adequate existing tool should be considered. | One viable customer project. Bespoke requirements and a single buyer can be acceptable when paid for. It does not require a large market, multiple independent buyers or a SaaS label. Ownership and reuse rights are unresolved commercial terms, not assumed assets. |
| **Recurring AI finance service using licensed incumbent tools** | The CFO sells a close/reconciliation service to clients and buys the most effective tools. The builder may earn implementation, integration or support fees. An InfFyn subscription need not exist. | Clients pay for the recurring result; the CFO can deliver it with acceptable combined labor and software expense; the next close repeats economically. Actual partner/client licenses and permitted operation must be established. | A potentially attractive services business. The CFO's client invoices are the CFO's service revenue; software fees paid to a vendor are costs. Tool implementation revenue is not InfFyn subscription ARR. |
| **Standalone software distributed through CFOs** | InfFyn sells a repeatable license, initially to a CFO practice under the proposed $299 + $199/active-client plan. Alternatively clients buy directly, with separately modeled partner compensation. | The same product repeatedly beats the available alternatives on total delivery cost or a necessary output; the payer renews; a second independent practice uses and pays for substantially the same workflow; support and acquisition costs leave sufficient contribution. | Evidence for a software company. Expansion to ten clients under one CFO license is one buyer's expansion, not ten independent purchase decisions. Broad distribution, defensibility and retention remain unproved. |

The first two businesses can be commercially sensible without passing the standalone-product gates. Conversely, funding a custom tool does not entitle the builder to software ownership or prove that another CFO will adopt it. Clarify whose business is being built: the CFO's practice, the builder's project business, or a shared product venture.

The strongest incumbent baseline is the eligible tool in the client's actual stack. Existing research establishes that Spendline markets close controls, Vantage offers billed allocation and partner accounts, and Mavvrik offers partner portfolio functions; none has been exercised here. This warrants comparison, not an assertion that any named product wins. Published prices in the [competition review](competition.md) are research anchors, not quotes for this CFO's volume, client isolation, support, retention or licensing arrangement. A request for a quote is not evidence of its eventual amount.

## What the proposed license must save

For `n` active clients, the monthly fee is `R = $299 + $199n`. At the model's assumed CFO labor value of `$100/hour`, a labor-only purchase requires **net hours eliminated across the practice of at least `R / 100` each month**. Net means the old recurring work minus all new recurring preparation, import, exception review, correction and vendor-management work. Our support time does not count as the CFO's time saved.

| Active clients | Monthly fee | Fee per client | Net hours saved, whole practice | Net hours saved per client | Old monthly hours/client required if 0.5h remains |
|---:|---:|---:|---:|---:|---:|
| 1 | $498 | $498.00 | 4.98 | 4.98 | 5.48 |
| 2 | $697 | $348.50 | 6.97 | 3.49 | 3.99 |
| 5 | $1,294 | $258.80 | 12.94 | 2.59 | 3.09 |
| 10 | $2,289 | $228.90 | 22.89 | 2.29 | 2.79 |

Amounts are rounded for display. These are break-even thresholds, not an attractive return. At five clients, reducing each close from three hours to half an hour releases $1,250 of assumed capacity, **$44 less than the license**. Reducing four hours to half an hour releases $1,750, leaving $456 before onboarding or other costs. No measured baseline supports either scenario yet. At $50/hour the required hours double; at $200/hour they halve.

Capacity value becomes cash benefit only if paid labor expense falls, additional billable work is sold, or another measurable benefit is realized. A founder's desired hourly billing rate is not automatically the value of unused capacity. Validated decision value or avoided costs may justify the fee, but need separate evidence and must not be double-counted as time savings. AI spend alone supplies no such evidence: at five clients the $258.80 fee allocation would require a 5.18% reduction of a $5,000 AI bill just to recover the fee, before implementation, if savings were the only benefit.

For build-versus-buy, compare **total cost of the same accepted output**: license + integration amortization + recurring operator/support time + upkeep. For a commissioned tool with upfront price `B`, monthly upkeep `M`, integration effort valued at `I`, and a 12-month decision horizon, a simple undiscounted labor ceiling is `B <= 12 × (net monthly hours saved × hourly value − M) − I`. The actual horizon, cash realizability and risk allowance belong to the CFO. There is no evidence here from which to quote `B`.

## Two-sided delivery economics

The builder's model assumes $20/client/month hosting/data, $40/practice/month delivery overhead, and support at $75/hour. If `h` is our monthly hours per active client, direct contribution is `R − 40 − n(20 + 75h)`. This excludes acquisition, product development, general overhead and tax.

| Clients | Maximum our support h/client at zero direct contribution | Maximum h/client for 80% direct contribution |
|---:|---:|---:|
| 2 | 4.11 | 0.396 (23.8 minutes) |
| 5 | 3.08 | 0.317 (19.0 minutes) |
| 10 | 2.73 | 0.290 (17.4 minutes) |

The 80% column is a sensitivity target, not an industry requirement. The current model's 0.25-hour mature assumption fits it, but no customer delivery has demonstrated that assumption. At five clients and three hours of our support each, only $29/month remains before excluded costs. Ten comparable clients lose $201/month. More clients can make a labor-heavy service worse under this license price.

The CFO's own service model also needs scrutiny. At the **hypothetical** $600/client service fee and $100/hour labor value, direct service contribution per client is `600 − (199 + 299/n) − 100 × CFO hours`. At five clients and half an hour it is $291.20, or 48.5%; at three hours it is $41.20, or 6.9%, before other practice overhead. To achieve a 50% direct contribution at that service price, CFO work must be no more than 0.412h/client at five clients or 0.711h at ten. At two clients the license alone exceeds half of the assumed service fee. The proposed combined-delivery target of two hours/client does not, by itself, establish attractive CFO economics or a customer labor saving.

## What the $2,000 pilot proves and costs

The proposal buys one historical month for each of two clients, with an 18-hour builder delivery budget. At $75/hour plus $100 other delivery cost, modeled direct contribution is **$550, or 27.5%**. Direct break-even is 25.33 builder hours; R&D and general overhead would lower the economically available delivery budget. Calling an 18-hour cap a scope control does not prove the work fits it or that additional necessary work disappears.

For a CFO funding this from labor savings alone, $2,000 requires **20 net hours of value at $100/hour** over the selected benefit horizon, before extra CFO onboarding work. Over only the two historical client-months, that is ten net hours each. A buyer may rationally pay for learning, one-time cleanup or a consequential decision instead; document that reason rather than labeling it recurring software demand.

If setup is recovered over three subsequent months at the two-client $697 monthly license, total fees are $4,091. Labor-only recovery then requires 40.91 net hours over those three months, or **13.64 hours/month across the two clients**, before extra implementation costs. This assumes the pilot fee is additional to, and precedes, all three monthly charges; different timing changes the arithmetic. A profitable pilot is still one project. A paid pilot plus renewal demonstrates more than a paid pilot alone, but does not distinguish demand for the builder's manual work from demand for the software without time logs.

## Where current recommendations outrun the evidence

The founder packet's **“BUILD, BUT ONLY WITH THIS WEDGE”** and the competition review's **“BUILD a bounded, partner-operated validation workbench”** choose custom implementation before observing the CFO's recurring workflow or comparing an incumbent. Read them as permission to demonstrate the hypothesis, not evidence that building a new product is the best commercial route. The existing local work already supplies that demonstration; another product increment needs a concrete requirement.

The proposed CFO-practice buyer, two-client pilot, monthly license, five-account expansion, $600 client service fee and mature support assumptions are all explicit hypotheses. The documents generally label this correctly. Their specificity should not be mistaken for acceptance. A reported network improves access; it supplies neither paid demand nor the number of accounts with customer-serving inference. A recurring service can succeed with licensed tools, and a funded internal project can succeed without ever becoming standalone SaaS.

## The next real-world discriminator

**Have the CFO choose a funded delivery route after demonstrating one real recurring close task and its next-month rerun.** Use the CFO's own screen and existing authorized tools first. Pick a client with customer-serving AI and a required output the CFO already produces. Compare the current process, the strongest available incumbent/export option and the existing prototype approach on that same output. Do not add feature breadth to make the exercise impressive.

The decision needs four pieces of evidence together: the accepted output and unresolved exceptions; separately timed initial cleanup and recurring rerun work for both CFO and builder; the actual all-in alternative price or an explicitly still-unknown quote; and the CFO's choice of what their budget will fund. Client-approved copies are needed only if the subsequent scoped exercise requires intake; the current synthetic prototype does not establish real-client acceptance.

If a one-time practice-specific gap is worth a funded build, proceed as a **commissioned project**. If the recurring client service is valuable and an incumbent can deliver it economically, operate the **service using that tool**, with implementation work priced honestly. If the prototype approach wins the repeat job and the CFO pays the proposed license, continue the **software experiment** and test an independent practice before broad product investment. If no recurring burden or funded project is demonstrated, stop custom expansion. The immediate discriminator is the observed job and purchasing route—not another prospect list, technical test count or expression of interest.
