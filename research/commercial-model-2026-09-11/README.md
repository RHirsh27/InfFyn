# InfFyn commercial scenario model

September 11, 2026. **A decision model built from judgment assumptions, not a customer-calibrated revenue forecast.** No real customer observations were used to fit the distributions. More runs reduce numerical noise; they do not resolve uncertainty about demand.

## What was run

- 50,000 independent business trajectories within each of three conditional operating cases: **150,000 primary paths**, each 24 months.
- 12 controlled input variations, one referral interruption, an independent-parameter comparison and a second seed: **300,000 additional sensitivity paths**.
- Seed `20260911`; secondary seed `20260912`. Zero starting paying customers.
- The baseline price is **$349/company/month**, verified in the repository's current offer. Billing remains deferred in private alpha; the model assumes a later authorized paid release.
- $900 outputs reuse exactly the same customer trajectories. They are a price sensitivity with **no demand elasticity**, not evidence that $900 will sell or retain equally well.
- Cases have no assigned probability and are not averaged together. The multi-advisor case assumes a distribution capability not yet established by Stephen's network.

Month 1 is the planning start, not a promised calendar launch. Simulation parameters persist for a run; monthly arrivals and customer decisions vary randomly. Reported P10–P90 intervals are the middle 80% of **this model's** outcomes, not empirical confidence intervals for InfFyn's future.

## Assumptions

Every triple below is **minimum / mode / maximum**, drawn from a triangular distribution. These numbers are founder-planning hypotheses, not industry benchmarks or inferred from FinOps surveys.

| Input | Limited reach / difficult onboarding | Focused CFO-led business | Repeatable multi-advisor channel |
|---|---:|---:|---:|
| Qualified introductions in first active month | 2 / 4 / 8 | 4 / 8 / 14 | 6 / 12 / 20 |
| Introduction → discovery | 35% / 55% / 75% | 50% / 70% / 85% | 55% / 75% / 90% |
| Discovery → usable evidence | 25% / 45% / 70% | 45% / 65% / 85% | 55% / 75% / 90% |
| Usable evidence → paid account | 12% / 25% / 40% | 25% / 40% / 60% | 30% / 50% / 65% |
| Monthly customer churn | 4% / 7% / 12% | 1.5% / 3% / 5.5% | 0.8% / 2% / 4% |
| Monthly introduction growth | −1% / 0% / 1.5% | 0% / 2% / 4% | 2.5% / 5% / 7.5% |
| Recurring delivery hours/account/month | 2 / 3 / 5 | 0.6 / 1.25 / 2.5 | 0.3 / 0.65 / 1.25 |
| One-time onboarding hours/account | 5 / 9 / 16 | 3 / 6 / 10 | 2 / 3 / 6 |
| Available delivery hours/month | 60 | 80 | 160 |
| Partner share of subscription revenue | 0% / 5% / 10% | 0% / 10% / 20% | 10% / 20% / 30% |
| Fixed nonlabor overhead/month | $1,000 | $1,500 | $3,000 |

Introductions are company opportunities screened for the ICP, not website visitors. Repeated names should not be counted as new opportunities when real data replaces these assumptions. The model has no measured market size and caps monthly introduction intensity at 60. Recruiting advisors, sales effort and the ability to sustain introductions are conditions, not automatic effects of releasing software.

Common inputs: delivery labor **$50 / $75 / $120 per hour**, account platform costs **$8 / $12 / $25 per billable month**, payment costs **3.2%**, combined owner allowance **$8,000/month** for non-delivery sales, engineering and administration. Fixed overhead covers nonlabor infrastructure/tools and acquisition expenses. No empirical CAC, acquisition staffing or enterprise sales cycle has been established. Capacity does not hire itself; the assumed delivery hours must be staffed.

Delivery labor is costed even if founders do it. The owner allowance covers additional non-delivery work. A founder who performs both may receive both components; they are not two independent estimates of the same hour. An economic labor cost can be unpaid founder effort, so model deficits must not be presented as literal cash funding requirements.

The common adoption factor introduces a latent-normal correlation of ±0.5 among discovery, usable evidence, paid conversion, churn, support hours and onboarding hours. Better assumed adoption coincides with less friction. Triangular marginals are preserved with a Gaussian copula. This is a structural stress assumption, not a measured correlation. An independent-input run shows how that choice affects ranges.

Activation delay is 0, 1 or 2 months with judgment weights 50%, 30%, 20%. **There is no modeled probability of technical activation, business survival, product-market fit or complete failure.** All commercial paths assume the business is activated and continues operating for the 24-month horizon with sufficient resources. Failure to activate can mean zero revenue; these tables do not estimate its likelihood.

## Monthly mechanics and financial definitions

1. Draw qualified introductions from a Poisson count; use sequential binomial draws for discovery, usable evidence and paid conversion.
2. Eligible paid accounts arrive two months after the introduction. Onboarding must fit alongside existing delivery within the scenario's hour budget. Excess accounts are lost, not silently backlogged.
3. Existing customers can churn at month start. Departing accounts produce no revenue or delivery work that month. Surviving accounts pay a full month; new accounts contribute half a month.
4. **MRR** = ending active customers × price. **Annual run rate** = ending MRR × 12; it is neither collected annual revenue nor signed annual contracts.
5. Monthly service revenue = (survivors + half of new accounts) × price.
6. Delivery contribution = monthly service revenue less partner/payment shares, account platform cost and onboarding/recurring delivery labor.
7. Before-owner surplus = delivery contribution less fixed nonlabor overhead. After-owner surplus subtracts the additional $8,000 allowance. Both are pre-tax modeled quantities, not take-home pay.

No one-time implementation fees, upsell, expansion pricing, annual prepayments, receivables, bad debts, taxes, financing or sunk development costs are modeled. Different acquisition economics, unlimited contact pools, major incidents and competitor price responses can invalidate the inputs. Early users' actual cycle lengths and workloads must replace these simplifications.

## Reproduce and inspect

```powershell
python research/commercial-model-2026-09-11/simulate.py
```

Requires NumPy and Matplotlib; the receipt records the versions used. The script reads no credentials, calls no providers, and changes no product configuration. It writes only this research directory. Changing assumptions requires rerunning and reviewing the results; a screenshot is not a live model.

- `simulate.py`: complete source and checks.
- `results.json`: all assumptions, summaries, monthly quantiles, sensitivities and stress runs.
- `limited-paths.csv`, `focused-paths.csv`, `channel-paths.csv`: 50,000 run-level output rows each.
- `revenue-scenarios.png`: same-scale revenue trajectories, mean, median and P10–P90.
- `operating-surplus.png`: costs and pricing sensitivity at month 24.
- `run-receipt.json`: seed, versions, checks and source/results hashes.
- `model-review.md`: independent arithmetic and interpretation review.

The self-checks cover zero acquisition, zero revenue, no-churn monotonicity, initial sales lag, repeatability, nonnegative accounts, delivery capacity, annual-run-rate identities and proportional repricing. Independent review adds customer conservation, churn bounds, monthly revenue/cost identities, next-month service capacity, 100% churn, zero conversion and quantile bounds. These prove model behavior, not the realism of its assumptions.

## Replace assumptions with evidence

Track real introductions → discovery → usable evidence → first reviewed result → paid activation → second and third monthly reviews. Record reasons for loss and time spent by the customer, Stephen and engineering separately. Measure acquisition and service expense separately; do not bury consulting in software margin. Include companies that decline or stall, not just successful onboardings.

Use the first three to five companies to discover broken assumptions. Such a small cohort cannot estimate durable churn or willingness to pay precisely. Later cohorts can support explicit uncertainty intervals on conversion and retention. Preserve cohort, channel and price distinctions when updating the model.
