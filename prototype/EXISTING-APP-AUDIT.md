# Existing InfFyn application: finance evidence audit

Read-only baseline on 2026-09-06: branch `feat/landing-cream-hero`, HEAD `57e324c35d1ebfe05adab0917f021358d83cb67d`, initially clean. `cursorrules` read; no applicable AGENTS.md found. No environment or credential file was read, no provider API was called, and no existing app/engine/migration file was changed. Findings describe the local code, not a live deployment.

## Assets worth reusing after correction

The repository has a Next.js 15/React 19 frontend, FastAPI engine, tenant membership/authentication boundaries, hardened Supabase table policies, fail-closed CSV validation with raw-row references, file-content deduplication, read-only Stripe authorization/sync scaffolding, retained audit results, entitlement projection, alternate feature revenue allocations with sensitivity, and deterministic board-report findings/validation/fallback. These are substantial implementation assets. None by itself establishes financial close correctness.

Key paths: `engine/app/ingest/csv.py`, `engine/app/ingest/jobs.py`, `engine/app/stripe/sync.py`, `engine/app/metrics/{data,cost,allocation,exact_metrics,audit,projection,board_report}.py`, `supabase/migrations/0004_canonical_model.sql`, and `0007_reference_pricing_audit_runs.sql`.

## Material calculation and evidence gaps

| Finding | Current evidence | Practical consequence |
| --- | --- | --- |
| All-time loading loses source lineage | `engine/app/metrics/data.py:18-20,82-89` reads no event IDs/raw refs/recognized times; no period or cutoff filter | A reporting month, exact inputs, and later adjustments cannot be reproduced as a close contract. |
| Unknown costs turn into zero on downstream axes | `cost.py:30-33,122`, `allocation.py:46-57`, `exact_metrics.py:87-109` | Missing prices can produce positive customer/feature profit rather than unknown margin. |
| Any actual model cost replaces the whole estimate | `cost.py:36-45,74-83` | Partial invoice coverage is indistinguishable from complete model cost; provider/account/currency/period scope is lost. |
| Cost attribution erases input/output and cache economics | `allocation.py:46-57`, `exact_metrics.py:65-87` | A model-wide average cost per total token gives identical costs to different input/output mixes. |
| Currencies are summed without segregation | `allocation.py:61-62`, `exact_metrics.py:23-24` | USD and EUR amounts are combined as if comparable. |
| Modeled revenue can be labeled Actual | `exact_metrics.py:35,54`; `allocation.py:131` | Token-share model allocation becomes Actual when aggregate cost is actual; the direct feature label describes only the split, not the full profit's basis. |
| Board output overstates certainty | `board_report.py:119-120,186` | 80% matched revenue is called full coverage; blended margin is always ACTUAL/STABLE, even when underlying cost is missing or modeled. |
| Stripe amount is cash collection, not recognized revenue | `stripe/sync.py:69-82` uses `amount_paid` and `paid_at`; deferral false | Month-by-month finance output requires a separate recognized-revenue contract and treatment for credits/refunds/taxes. |
| Invoice line and currency semantics are narrow | `stripe/sync.py:49-63` divides all currencies by 100 and selects the first line's product | Zero-decimal currencies and multi-product invoices need correct normalization. |
| Incremental cursor uses unlike clocks | `stripe/sync.py:142-166` filters invoice creation time but advances using payment time | An older invoice paid later can be omitted by later incremental collection. No live provider reproduction was performed. |
| CSV segment is treated as customer identity | `ingest/csv.py:145` maps `customer_segment` to `customer_ref` | A segment label is not a durable customer join; requested `revenue_usd` column is ignored by design at line 156. |
| CSV job completion has a failure window | `ingest/jobs.py:166-176` inserts rows, then separately marks complete; failed-job retry deletes the job | A failed completion write can leave inserted usage whose retry duplicates it; no event-level unique source key is present in canonical usage schema. Static finding, not fault injection in this session. |
| Close and pricing version substrate missing | `0007_reference_pricing_audit_runs.sql:15,32-39` unique model price; audit result with no period/source manifest/approval or close version | Rate history and immutable close/adjustment workflow require additional structures. |
| Proposed dimensions are not proof of hosted schema | `0011_opsx_grain_substrate.sql:1,16-17` explicitly proposed and unused | Do not assume this migration has been applied; no database inspection was performed. |

## Concrete local reproductions

Synthetic inputs passed through the **existing** Python functions produced:

- Unknown model, 100 usage tokens, $100 revenue: customer and feature cost `0.0`; profit `$100.0`; board blended output `ACTUAL` and `STABLE`.
- One million input-only tokens at $1/M and one million output-only tokens at $10/M: both features received `$5.50` rather than `$1` and `$10`.
- USD100 plus EUR100 revenue: aggregate `200.0` with no FX or currency separation.
- Add one `$1` actual event for the model: its whole cost becomes `$1`; model revenue token-share provenance becomes `Actual`.

These are evidence of semantic defects despite passing current tests. Production application fixes were deliberately not included in the additive prototype scope.

## Verification performed

`engine/.venv/Scripts/python.exe -B -m pytest tests/test_metrics_cost.py tests/test_metrics_allocation.py tests/test_metrics_exact.py tests/test_provenance.py tests/test_ingest_csv.py tests/test_board_report.py -q -p no:cacheprovider` with `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`: **31 passed**. These pure tests avoid the config module that automatically reads `.env`.

`npm run test:middleware`: **passed all five route assertions** with the test explicitly removing Supabase configuration and short-circuiting before network access.

Other API, tenancy integration, Stripe, and ingestion provider tests were not run because they can import environment-loaded configuration or require provider state. No installation, application build, live auth/provider/DB test, commit, push, migration apply, or deployment was performed. Existing test results do not establish revenue/cost reconciliation correctness.

## Bounded addition

Only `prototype/` is added. It provides an offline SQLite evidence ledger, deterministic cost rating, source deduplication/conflict rejection, one-currency period review snapshots, unresolved reconciliation differences, explicit customer associations, preserved corrections/late adjustments, normalized CSV and narrow saved-response JSON adapters, synthetic two-client examples, and invariant tests. It can falsify a partner close workflow locally. It does not make the current application finance-trustworthy, prove unique differentiation, or validate willingness to pay.
