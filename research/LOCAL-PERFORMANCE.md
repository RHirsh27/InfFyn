# Local synthetic ledger performance — 2026-09-06

The optimized harness imported **10,000 realistic synthetic attempts in 0.576 seconds** and created their snapshot in **0.713 seconds**. A separate 1,000-attempt / 500-run workflow case took 0.076 seconds to import and 0.141 seconds to project and persist. These are local, single-run measurements of bounded fixtures, not production capacity or proof of complete monthly client ingestion.

Reproduce: `python -B -m prototype.benchmark` from the repository root. The runner loads `ledger.py` once, uses separate temporary SQLite databases, makes no provider/network calls, and removes its temporary databases on normal completion. A 40-second interrupt and 45-second hard-stop fallback bound execution. Both measurements used Python 3.11.9 / Windows build 26200. Concurrent or subsequent author edits are not covered by a measured version hash.

## Before optimization

Loaded ledger SHA-256: `dd5a220fd10817617879144ff28e908e0abd87b5b12c096182bb653b867a7251`. Total elapsed **6.628 seconds**, exit 0. Each case used a fresh tenant/database and one bundle.

| Synthetic attempts | Total event rows | Input + output tokens | Synthetic expense | Import seconds | Snapshot seconds | Snapshot bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 111 | 422,142 | $1.1099840 | 0.044588 | 0.009406 | 59,245 |
| 500 | 511 | 2,312,881 | $6.0582605 | 1.077654 | 0.030790 | 269,573 |
| 1,000 | 1,011 | 4,716,810 | $12.3202715 | 5.190394 | 0.069468 | 532,486 |

## After optimization and economic-component extension

Loaded ledger SHA-256: `fe0000c001c2b05755434f4c6107b2a66b11dacdcf2de78166dc185924159432`. All five cases completed in **2.191 seconds total**, exit 0, in one process with one ledger code load.

| Attempts | Workflow runs | Total event rows | Input + output tokens | Synthetic expense | Import seconds | Snapshot seconds | Snapshot bytes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0 | 111 | 422,142 | $1.1099840 | 0.010637 | 0.011036 | 63,445 |
| 500 | 0 | 511 | 2,312,881 | $6.0582605 | 0.031866 | 0.036065 | 273,785 |
| 1,000 | 0 | 1,011 | 4,716,810 | $12.3202715 | 0.056121 | 0.070918 | 536,698 |
| 10,000 | 0 | 10,011 | 47,612,618 | $124.0736250 | 0.576334 | 0.712865 | 5,304,879 |
| 1,000 | 500 | 1,511 | 4,716,810 | $12.3202715 | 0.075507 | 0.140637 | 1,040,568 |

The shared 1,000-attempt case imported approximately **92 times faster** in this run. The new version also emits additional economic fields, so this is a before/after implementation comparison rather than an isolated microbenchmark. Snapshot time remained close at that size. The workflow case includes twice the approximate output bytes and 500 extra business-outcome records; its slower snapshot is not a pure measurement of run-index lookup cost.

## What was measured

One run per case, one tenant, one provider account, two named model/rate versions, ten explicit customers, and unique attempt identities. Each call has 256–8,192 input tokens and 64–1,024 output tokens, with deterministic cached reads, retries, and source-declared nonbillable errors. Even the 10,000-attempt case ends in August; no giant per-call token total substitutes for real request volume. These are constructed test inputs, not observed customer traffic. The invoice matches the independently computed Decimal total; ten recognized-revenue rows exercise customer output. Each size adds eleven accounting records after the attempts.

The workflow case assigns every pair of attempts to one run under one workflow, with a consistent explicit customer and one source-declared accepted business outcome per run. It therefore has 500 runs and 500 outcome records. It checks that the aggregate accepted count is 500 and that the displayed unit-cost estimate equals exact expense divided by 500. It has no unassigned workflow cost, non-token component, missing source, invoice discrepancy or correction history.

Import timing includes normalization, identity/conflict checks, capture deduplication, insertion and commit. Snapshot timing includes input selection, rating, reconciliation, workflow projection when applicable, output hashing and persistence. Data generation and database creation are excluded from individual operation timings but included in total elapsed time. Exact expected costs, attempt counts, event counts, workflow ratio and conservation assertions passed. Disk caches, machine load and run variance were not controlled; no memory, concurrency, percentile or sustained-throughput claim is made.

## Bottleneck and change

In the baseline `Ledger.import_bundle`, every new usage record selected all tenant event payloads, decoded their JSON, reconstructed superseded identities, and scanned active records for a matching provider/account/request/attempt. For a fresh tenant with attempts inserted first, this visits `N*(N-1)/2` prior usage rows: **4,950 / 124,750 / 499,500** in the baseline cases. These counts are derived from the inspected baseline algorithm, not profiler samples. The runner now labels this comparison field `baseline_quadratic_prior_rows`; it is **not** a count of rows scanned by the optimized implementation.

The baseline 5× increase from 100 to 500 attempts took 24.2× longer to import; doubling 500 to 1,000 took 4.8× longer. The author replaced that repeated scan with a single preload per participating tenant per bundle, plus in-memory source, active-capture and historical-correction indexes updated during the same SQLite write transaction. The new 10× increase from 1,000 to 10,000 fresh attempts took 10.3× longer to import in this run. The import path and snapshot creation still serialize against writers.

The author also preindexed workflow, run and customer rows before the measured version. The earlier all-active-events scan per run was removed. The current unassigned-workflow-cost guard still checks potentially relevant unmapped rows per run; a large unmapped population was not exercised. Importing many tiny batches into a growing tenant still repeatedly preloads its history, and a large preexisting tenant or long correction history was not tested. Output storage grows with retained evidence and snapshots: the measured 10,000-attempt snapshot is about 5.3 MB before any transport or UI overhead.

## Bounded pilot interpretation

- **Up to 10,000 token attempts, one fresh bundle:** observed responsive local scale on this machine; about 1.29 seconds for import plus snapshot. This is a useful provisional bound for a supervised experiment with the tested shape.
- **500 runs / 1,000 attempts:** observed workflow-projection scale, about 0.22 seconds for import plus snapshot. Larger run populations, many workflows, non-token component populations and mapping exceptions remain unmeasured.
- **Complete client month:** unproven. At these illustrative rates, 10,000 attempts account for $124.07. Clients spending thousands can have substantially larger populations. Establish their real record counts and source completeness before promising a monthly close. A selected sample must remain labeled partial and cannot prove whole-period economics. Do not compress many requests into fictitious giant token attempts.

The independent benchmark lane changed only its runner and this report; the implementation author made the ledger changes. Focused independent reproductions confirmed that a later identity-changing correction cannot permit an unrelated earlier backfill to duplicate a historical attempt, same-chain identity returns remain valid, and known unmapped workflow costs block all-in unit-cost ratios without being allocated. Supplier invoices remain non-additive with covered components; explicit component/invoice corrections preserve earlier cutoff results; newly unknown labor suppresses complete profit and unit-cost figures. These semantic checks and timing results do not verify external provider completeness, accounting policy, live source intake, or production readiness.
