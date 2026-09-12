# InfFyn economic evidence harness

This local prototype tests whether a fractional CFO can review inference spending across separate clients without hiding uncertainty. It is a falsification and acceptance harness, not a finished accounting system or proof of a unique market position. Every supplied example is synthetic. No app, engine, migration, provider account, deployment, or customer record is changed.

It runs on Python 3.11+ using the standard library. There are no dependencies to install, network calls, credentials, background workers, or environment-file reads. The CLI can parse user-selected local files; it does not acquire customer data. The existing deployed application is separate and has material calculation gaps documented in `EXISTING-APP-AUDIT.md`.

## Reproduce locally

From the repository root in PowerShell:

```powershell
python -B -m unittest discover -s prototype/tests -v
python -B -m prototype.demo
python -B -m prototype.workflow_demo
python -B prototype/ledger.py --db prototype/.local/review.sqlite import-json prototype/examples/synthetic-input.json
python -B prototype/ledger.py --db prototype/.local/review.sqlite close --tenant synthetic-outreach-client --name august-initial --start 2026-08-01T00:00:00Z --end 2026-09-01T00:00:00Z --as-of 2026-09-03T00:00:00Z --currency USD
python -B prototype/ledger.py --db prototype/.local/review.sqlite import-json prototype/examples/synthetic-late-credit.json
python -B prototype/ledger.py --db prototype/.local/review.sqlite close --tenant synthetic-outreach-client --name august-credit --start 2026-08-01T00:00:00Z --end 2026-09-01T00:00:00Z --as-of 2026-09-06T00:00:00Z --currency USD --prior august-initial
python -B prototype/ledger.py --db prototype/.local/review.sqlite show --tenant synthetic-outreach-client --name august-initial
```

Imports are idempotent. Snapshot names are immutable: rerunning a close with the same name rejects; use `show` to reread it, or choose a new name. The generator uses a temporary database and rewrites only synthetic example files; the CLI database persists across processes under ignored `.local/`.

## Inspectable behavior

- Event identity is `(tenant_id, source, source_id)`; same payload is a no-op, changed payload is a conflict. An import bundle is atomic. Explicit corrections use a new source ID plus `supersedes: {source, source_id}`; prior events and snapshots remain stored.
- Unsupported normalized fields reject instead of being silently discarded. Usage is request-attempt evidence; invoice records assert the full specified provider/account/charge-period pool. Model-limited invoice scopes and aggregate usage rows require a different explicit schema; they cannot silently enter this one. Snapshot event/rate reads and persistence share one SQLite write-reserving transaction, avoiding a mixed import state.
- Tenant is required for event/rate ownership, close creation, and snapshot retrieval. The two-client fixture deliberately repeats source IDs and provider-account labels. This proves query partitioning in a local operator tool; it does **not** implement partner authentication, authorization, invitations, roles, or consent.
- The period is half-open `[start, end)` in UTC. `incurred_at` selects usage/revenue economics; declared `received_at <= as_of` selects evidence known to the snapshot. Inputs carry source-declared receipt time; this is not an independently verified ingestion timestamp. Every frozen snapshot records its selected source hashes and rate versions.
- Money and rates use finite `Decimal` values. Numeric strings preserve sub-cent amounts. Binary floats, non-finite values, quantities below zero, missing timezones, and ambiguous currency codes reject. A snapshot is one currency; other-currency rows are counted as excluded. No FX rate is inferred.
- Each usage attempt records request identity, attempt number, outcome, and explicit billability. An error is charged when its source says billable. A retry is a second source event, not a duplicate logical request.
- Captures sharing provider/account/request/attempt identity are rejected across sources until an authoritative source or correction is selected. This depends on upstream identity normalization; different aliases for the same real request cannot be discovered automatically.
- Input meters are disjoint: `input_uncached + input_cached + cache_write = input_total`. Output tokens are rated separately. Every attempt names an immutable rate version with provider/account/model/currency/effective dates and source reference. Rates not yet received at cutoff, missing prices, and incompatible versions remain unknown.
- Reconciliation is by tenant/provider/account/currency/charge period. Exact-period invoice totals replace the estimate for that scope; the estimate is not added to the invoice. Signed credits reduce invoice totals. The invoice minus rated usage difference remains signed and unallocated. The harness does not distribute unexplained residuals across customers.
- Invoice intervals that only partly overlap the close block a complete cost result. Their full amount appears in the issue record; no arbitrary daily proration is applied. Distinct provider accounts cannot cover one another's estimates.
- A credit without its principal invoice does not establish provider coverage. It adjusts only the known estimate, remains explicitly unallocated, and blocks complete cost/profit totals until the missing principal charge evidence is supplied.
- Customer attribution uses the explicit source customer ID. Revenue imports must say `basis: recognized` and represent revenue already normalized by a finance owner. Raw Stripe cash collections are rejected. No feature revenue or customer association is inferred. Imported revenue is not independently verified accounting recognition.
- Known customer costs + unassigned usage costs + signed invoice residual = selected known costs. Unknown-priced costs are never silently zero. A customer with missing costs, missing revenue, or revenue-only evidence gets null profit/margin. A fully priced customer's number remains an estimate based on usage, even when the provider invoice matches in aggregate.
- A snapshot is always `review_snapshot` and `not_approved`. `matched_within_imported_scope` means only that arithmetic checks had no listed issues, not that provider coverage, accounting recognition, approvals, or the ledger's completeness were established. Later evidence produces a linked adjustment snapshot; the original digest remains unchanged.
- Revision revenue deltas are null when either comparison lacks revenue evidence; missing revenue is never converted to a zero baseline.

## File adapters

`import-json` accepts `{rates: [...], events: [...]}`; the synthetic input is the complete normalized schema example. Decimal money/rates should be strings. `import-csv` accepts the exact columns in `examples/synthetic-attempts.csv`. This is a normalized request-attempt format, not a claim of compatibility with a provider's CSV export. Import rates separately or unknown prices remain unresolved.

```powershell
python -B prototype/ledger.py --db prototype/.local/from-csv.sqlite import-csv prototype/examples/synthetic-attempts.csv
```

`import-openai-response` accepts a **saved OpenAI Responses JSON object**, not a dashboard screenshot, live API connection, or arbitrary provider export:

```powershell
python -B prototype/ledger.py --db prototype/.local/native-file.sqlite import-openai-response prototype/examples/synthetic-openai-response.json --tenant synthetic-native-client --account synthetic-openai-account --received-at 2026-09-02T00:00:00Z --rate-version operator-supplied-version --customer explicitly-mapped-customer
```

This narrow adapter requires a completed response with explicit default service tier, text-only output, no tools, consistent input/output totals, and no nonzero unsupported meter. Cached reads are subtracted from total input before rating uncached input; reasoning output is already included in output tokens. Nonzero cache writes, audio, priority/flex/batch economics, tools, and incomplete/error responses require explicit normalization through the general schema. It preserves the response identifier and source-file SHA-256 without retaining prompt/response text. It cannot discover retry relationships or customer identity; those remain operator-owned mappings. The source format was checked against [OpenAI's Responses reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/retrieve) on 2026-09-06. The included file imitates that documented shape with synthetic values; no real provider file has been validated in this session.

## Synthetic review case

The first synthetic client has $9,000 recognized revenue, $2,850 in rated usage, and a $3,200 invoice. Customer-attributed estimated cost is $2,750; unassigned usage is $100; the unexplained signed difference is +$350. Thus $450 remains unallocated. A later $100 credit reduces selected costs to $3,100 and produces a linked revision. The second client has twice those initial amounts under a different tenant. These are arithmetic stress fixtures with intentionally oversized token quantities per row, not realistic individual requests. Do not treat them as market evidence, real customer performance, or a production cost benchmark.

## Full workflow costs and source coverage

`python -B -m prototype.workflow_demo` supplies realistic-size synthetic attempts: 10 business runs, 20 billable attempts, 10 failed attempts, 8 accepted reports and 2 rejected reports. Its $0.26 inference estimate plus $1.00 search charge is covered by one $1.26 supplier invoice, counted once. Additional compute costs $0.25. Rated review time is 2.5 hours at a synthetic loaded $40/hour, or $100. Known economic cost is $101.51 and cost per accepted report is $12.68875. This is an economic estimate; allocated or rated labor is not automatically a new cash expense.

`cost_component` records retain category, quantity/unit, basis (`observed`, `rated`, `allocated`), evidence reference and an explicit invoice relationship. Rated amounts derive from quantity × unit rate; allocated amounts require a policy reference. Tool, search, compute, storage, review and shared costs use this contract. It does not validate the upstream allocation policy. Components covered by a supplier invoice join that reconciliation pool; additional/internal costs are separate. Inference and other costs retain their separate bases instead of all becoming "actual".

Business `outcome` records carry workflow/run, metric, acceptance status, quantity and an explicit cohort declaration. API success never becomes a business outcome. Failed/retried attempts and rejected runs stay in the numerator. `workflow_economics` reports known cost, accepted outcomes, evidence composition, blockers and run traces. Its completeness means completeness within imported, attributed run evidence; it cannot discover an omitted source. The UI additionally withholds the ratio when the bound source coverage evaluation is blocked.

`coverage.evaluate_coverage(manifest, batches, as_of)` checks exact supplied normalized-file hashes, parsed counts, totals, account/currency/period scope, missing intervals, duplicates and replacement versions. The generated `workflow-coverage-manifest.json` and `workflow-coverage-batches.json` show the contract. A manifest is an operator declaration of expected sources. Local matching does not certify provider completeness, original-file conversion, or accounting recognition. Versioned evidence received after the cutoff cannot silently alter an earlier evaluation.

## Durable local review journal

`review.ReviewDesk` freezes a snapshot and its bound coverage evidence, then appends owner assignments, next actions, notes and review conclusions. A linked revised snapshot leaves the original evidence intact. Review without coverage or with unresolved issues becomes `reviewed_with_exceptions`; a local match permits `reviewed_for_declared_scope`. Both retain `accounting_approval: false`. A new note reopens review work. Database triggers prevent update/delete through normal application access; direct database administrators can bypass them.

The workflow demo closes and reopens the SQLite review database and verifies both review versions. It exports saved states in `examples/workflow-evidence.json`; its temporary databases are discarded. For persistent operator work, choose a local database path whose parent exists and use the CLI:

```powershell
python -B -m prototype.review --db prototype/.local/review-journal.sqlite register path-to-snapshot.json --coverage path-to-evaluation.json
python -B -m prototype.review --db prototype/.local/review-journal.sqlite assign --tenant CLIENT --name CLOSE --owner "Named operator" --next-action "Explain the source gap"
python -B -m prototype.review --db prototype/.local/review-journal.sqlite note --tenant CLIENT --name CLOSE --note "Evidence and decision"
python -B -m prototype.review --db prototype/.local/review-journal.sqlite review --tenant CLIENT --name CLOSE --conclusion "Review conclusion"
python -B -m prototype.review --db prototype/.local/review-journal.sqlite show --tenant CLIENT --name CLOSE
```

The HTML workbench displays generated journal evidence. It does not save assignments or notes, and a typed operator name is not an authenticated identity.

## Known limits and next evidence

This is a bounded local tool with import-side tenant partitioning and append-only SQLite triggers. It has no authenticated partner workspace, RBAC, separation of reviewer duties, hosted storage, encryption/key management, retention policy, independently verified source population, accounting journal export, FX, tax/fee classification, formal revenue recognition, audit certification, or independent tamper resistance. Someone with direct file/database administration can bypass the application's protections. Input assertions such as receipt time, billability, recognized revenue, invoice completeness, and price contract are not verified by the tool. Cross-file import deduplication works only when upstream source IDs are retained. Native endpoint adapters are deliberately narrow; successful synthetic tests do not establish provider E2E. Measured local scaling and its remaining limits are recorded in [LOCAL-PERFORMANCE.md](../research/LOCAL-PERFORMANCE.md).

Before expanding this into a partner product, use a consented, read-only client close to establish actual source completeness, explain residuals, validate invoice/usage semantics, measure CFO review time against the current process, and test whether the CFO and clients pay for recurring close value. The supplied partner UI is a demonstration of output, not evidence that these requirements have been met.
