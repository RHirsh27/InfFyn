# Independent DIY counterexample — 6 September 2026

**The displayed cost arithmetic is reproducible with a small export-analysis script. It is not sufficient product differentiation.** The independent script reproduced the supplied clean fixture's total cost, recognized revenue, both customer contribution estimates and cost per accepted outcome exactly. It also handled a bounded set of adverse inputs without presenting missing costs or incomplete outcomes as reliable unit economics.

Run from the repository root:

```powershell
python -B research/diy_baseline.py
```

The executable is `research/diy_baseline.py`; full results are in `research/diy-baseline-result.json`. It uses only Python's standard library and Decimal. It imports no prototype module, copies no ledger helper function, and opens no database, UI, credential file or provider connection. It writes only its result JSON. The generated `workflow-evidence.json` is loaded **after** the independent calculations, solely to compare results.

## What the clean export reproduces

| Quantity | Independent result | Compared with generated prototype output |
| --- | ---: | --- |
| Inference: 20 attempts | $0.260 | Included in matching total |
| Search/tool charge evidence | $1.000 | Included in matching total |
| Compute | $0.250 | Included in matching total |
| Human review: 2.5 hours at supplied $40/hour | $100.000 | Included in matching total |
| Supplier invoice replacing covered inference + search | $1.260 | No invoice-plus-usage double count |
| Total economic cost | **$101.510** | Exact match |
| Supplied recognized revenue | $200.000 | Exact match |
| Customer-associated contribution | **$98.490** | Exact match |
| Customer A contribution: revenue $120, cost $50.755 | $69.245 | Exact match |
| Customer B contribution: revenue $80, cost $50.755 | $29.245 | Exact match |
| Accepted reports | **8** | Exact match |
| Cost per accepted report | **$12.68875** | Exact match |

All ten billable failed attempts remain in the numerator. The two rejected runs' costs also remain; those runs add no accepted reports. The script makes no claim that AI caused the customer revenue. These are contribution estimates based on the supplied costs and recognized-revenue schedule, not full-company profit.

All six clean-reference comparisons and nine adverse-behavior checks passed in the current version, exit 0. The original version, with eight adverse checks, reached successful verification during the observed tool-clock interval **13:11:29–13:14:38 UTC**, approximately **3 minutes 9 seconds**. Documentation and refinement followed; the parent-reviewed missing-revenue rejection was verified at **13:16:06 UTC**, another **1 minute 28 seconds** later. That ninth check was not part of the original interval. These timings exclude the agent's earlier familiarity with the schema and business rules, product research and fixture development. They are not estimates of CFO delivery labor, customer onboarding time or maintainable software-development effort. The current internal load/select/analyze/compare timing was **0.009804 seconds**, excluding output serialization; runtime is not delivery hours.

## Bounded adverse cases actually run

| Case | Result |
| --- | --- |
| Original initial export: acceptance source declared partial | Keeps visible expense facts; withholds the period unit-cost ratio. Uses the earlier batch version selected at the September 3 cutoff. |
| Remove output-token price | Reports every affected attempt as unpriced; withholds customer contributions and the unit ratio. The complete asserted supplier invoice still bounds total supplier expense, so the aggregate total remains $101.51. |
| Change the supplier invoice from $1.26 to $2 | Uses supplier expense once, giving total $102.25; retains signed unexplained difference **+$0.74** and withholds customer contribution estimates and the unit ratio. Aggregate contribution from known invoice expense is $97.75. |
| One labor row has unknown rate and amount | Shows known subtotal $91.51; total cost, aggregate contribution and unit ratio are null. It does not price unknown labor at zero. |
| Same source identity with conflicting customer content | Explicit rejection. |
| One run declares an incomplete cohort | Keeps observed accepted count, but withholds the unit ratio. |
| Exact source row replay | No additional economic effect; result equals the clean analysis. |
| Remove all recognized-revenue records | Explicit rejection: absent revenue evidence is not zero revenue. |

The price, invoice, labor, duplicate and run-cohort variants are **calculation-level mutations after parsing**, not independently acquired source exports. Their result records explicitly state that they do not claim newly verified export hashes or external completeness. The initial-partial and final-clean cases use the actual supplied batch versions and their hashes/counts/totals. No prototype modules were run to obtain expected answers for the variants; their required behaviors are explicit assertions in the independent script.

## What was supplied upstream

This is deliberately a favorable DIY baseline. `workflow-input.json` provides price versions and the expected identity population. The coverage batches provide **already normalized records**; the manifest supplies the expected sources and periods. Customer/run mappings, billability, disjoint token quantities, invoice coverage declarations, recognized revenue, loaded labor rates and asserted allocation-policy references are given; policy approval is not verified. The script recomputes rated labor from quantity and rate rather than trusting its supplied derived amount.

Its source checks cover this fixture's one full-period batch per source, exact payload hashes, declared row counts/totals, scope fields and simple declared batch-version replacements. Those checks establish internal agreement with the operator's declaration. They do not establish that the provider export or declared source inventory is externally complete. Actual client normalization, permissions and reconciliation work remain unmeasured.

## Explicit boundaries

The script rejects conflicting identities, overlapping authoritative attempts, event correction chains, partial-period invoice/source intervals, mixed clients or currencies, unmapped cost/outcome records, multiple workflows or outcome metrics, unsupported meters and non-recognized revenue. It has no native-provider parser. Even where rejection is safe, it may be inconvenient for a real CFO.

It does not implement immutable historical closes, arbitrary event/price correction history, review ownership/signoff, role authorization, durable audit retention, export approval, source issue assignment, FX, tax/prepayment accounting or ERP journal posting. It does not discover aliases that represent the same invoice under different external IDs. **A rate's `received_at` is not checked against the cutoff**; population/batch checks do not repair that limitation. Rate contracts require an approved current export; the script does not establish historical price knowledge or a separately versioned mapping policy. Re-running a file replaces its result JSON rather than preserving an immutable close. Exact output equivalence is established only for the named clean fixture.

## Consequence for the product decision

A pitch limited to token + tool + labor totals, customer-associated contribution, outcome ratios and a few exception checks has a credible DIY substitute. The prototype's state, review, lineage and coverage workflow remain implementation differences from this script, but that does not make them unique relative to existing vendors or another maintained internal tool.

In the CFO pilot, run this baseline and the incumbent against the same consented client evidence. Record the cost of normalization, correction handling, explanation, recurring reruns and reviewer decisions. Keep building only if the product removes paid recurring work that the script/incumbent cannot handle economically. This experiment proves neither CFO willingness to buy nor any vendor's willingness to partner.
