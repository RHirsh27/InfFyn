# Independent commercial-model review

Reviewed September 11, 2026. Scope: `simulate.py`, generated `results.json`, run receipt, and the repository's configured subscription-price check. This is an internal mathematical and interpretation review, not validation against customer observations.

**Verdict:** suitable for exploring conditional business scenarios and identifying the assumptions that matter. It does not estimate InfFyn's probability of product-market fit, obtaining access, launching, surviving, or attaining a particular revenue level. No blocking arithmetic defect was found for the configured parameter ranges.

## Checks performed

In addition to the script's own self-checks, an independent review executed 2,000 additional paths for each of the three scenarios, with a separate seed. These checks passed:

- Customer conservation: current active customers equal prior active customers less churn plus accepted new customers.
- Churn never exceeds prior customers; new customers and demand rejected for insufficient capacity remain nonnegative.
- Delivery hours stay within each scenario's capacity. The resulting customer base also fits capacity when all customers incur a full subsequent month of support, for these configured parameter ranges.
- Billable account-months equal retained customers plus half of newly onboarded customers.
- Subscription revenue equals contribution plus the explicitly modeled variable costs. Surplus equals contribution less fixed nonlabor overhead and the owner allowance.
- Separate edge checks passed for 100% monthly churn, zero paid conversion, triangular-distribution endpoints and monotonicity, and unchanged-customer repricing.
- Generated $900 results retain exactly the same customer paths as the $349 case.
- SHA-256 hashes of the reviewed script and results matched `run-receipt.json` at review time.

The internal billing implementation checks for USD 349 per month in `engine/app/v2/billing.py`. This supports using $349 as the **configured offer**, not calling it a customer-validated price or a currently operating paid service.

## What the model correctly separates

It distinguishes end-of-month MRR and run-rate ARR from revenue during a month and cumulative 24-month revenue. ARR is not cash received or earned during the year.

Acquisition passes through introductions, discovery, data availability and paid conversion. There is an activation delay and a two-month introduction-to-paid lag. Capacity is finite; candidates that cannot be onboarded are lost rather than silently carried into an unlimited backlog. Churn and new account arrivals have monthly randomness, while the underlying business assumptions persist within a path.

Costs include delivery labor, platform usage, payment charges, partner share, nonlabor overhead and an additional owner allowance for non-delivery work. The stated owner-allowance definition avoids automatic labor double-counting: delivery labor and sales/engineering/admin work are different categories. Actual operators must still map these categories to their own compensation and contractor arrangements.

Correlation between acquisition friction, churn and service effort is explicitly assumed. Marginals remain triangular under the Gaussian construction. The stated 0.5 correlation belongs to the latent normal variables; it should not be presented as a measured correlation between observed customer metrics.

## Interpretation limits that must remain prominent

1. **More draws do not create market evidence.** Funnel rates, churn, support effort, referral growth, activation delay and correlations are judgments. The P10-P90 ranges and shares of simulated paths are conditional on them; they are not empirically calibrated confidence intervals or success probabilities. Do not pool the three scenarios as though each had an established probability.
2. **The $900 case is arithmetic sensitivity.** It does not model price elasticity, willingness to pay, procurement friction, different support expectations or changed retention. It cannot establish that charging $900 would deliver the simulated outcome.
3. **Economic surplus is not literal bank cash.** Delivery labor is costed even when performed by founders, and the $8,000 allowance is modeled compensation. A cumulative deficit is not automatically the funding required to operate. Cash needs depend on what is actually paid, timing, reserves, taxes, collections and financing. The model also omits sunk build costs, setup fees and annual prepayments.
4. **Timing is simplified.** Leavers churn at the start of the month and generate no revenue or support cost that month. New accounts generate half a month of revenue and support, plus full onboarding effort. These conventions are internally consistent but are not invoice-level cash accounting.
5. **Continuation is assumed.** Every path is allowed to operate for 24 months despite deficits. There is no cash-runway shutdown, founder departure or failure-to-launch branch. This is appropriate only while the output is explicitly conditional on continued operation.
6. **Channel success is an operating assumption.** The high case requires repeatable access to multiple advisors, growing introductions and more service capacity. It cannot be read as evidence that Stephen's present contact network can produce that throughput.

## Commercial implication

At the configured $349 offer, the focused case's median month-24 MRR is $10,470, while median modeled month-24 surplus is approximately negative $5,783 after the specified labor and owner allowance. The multi-advisor case reaches median month-24 MRR of $34,202 and positive monthly surplus of about $4,409, but its median cumulative 24-month surplus is still approximately negative $126,421. A positive final-month run rate does not mean the preceding build-and-growth period paid for itself.

The useful decision is to measure qualified introductions, data-ready conversion, onboarding hours, recurring support hours, payment and renewal before increasing forecast confidence. The first improvement to this model should be replacing priors with observed funnel and delivery data, not increasing its simulation count.
