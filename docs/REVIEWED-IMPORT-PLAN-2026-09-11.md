# InfFyn reviewed import: the next useful product slice

September 11, 2026. Design proposal grounded in the current repository. No application code, remote database or hosting configuration changed for this analysis. Estimates and operating targets below are planning hypotheses, not measured outcomes or a release commitment.

## Recommendation

Build **Upload → Organize → Resolve exceptions → Confirm → Calculate** inside the existing Monthly Review. A customer should be able to supply supported exports as they are, review an understandable proposed dataset, download it, and explicitly approve that exact version for the economics engine. Next month, reuse the reviewed mapping and show only changes, unresolved evidence and control checks.

This solves a practical adoption problem: the existing product expects the customer to assemble our canonical CSVs before obtaining the benefit. It is a credible improvement, not a claim that data cleaning alone establishes a durable competitive moat. The useful combined experience is a repeatable path from company evidence to an explainable financial decision, with much less engineering coordination.

Keep three questions separate:

1. **Can the file be interpreted?** Columns, dates, decimal formats, units and duplicates.
2. **Does it represent the stated business activity and period?** Company-confirmed scope, workload assignments, source totals and accounting basis.
3. **What can the evidence support?** Cost calculations and associations; revenue allocations remain allocations, and observed efficiency is not proof of incremental revenue or cash savings.

A clean, approved file can still contain incomplete evidence. Approval never turns a customer-supplied amount into a provider-verified amount or makes revenue allocation causal.

## What the current code already provides

| Foundation | Repository evidence | How to use it |
| --- | --- | --- |
| Strict normalized evidence contract | `engine/app/v2/contract.py`, `engine/app/v2/economics.py`, `app/lib/audit-v2.ts` | Produce the existing usage, costs, revenue, rates and outcomes schemas; reuse deterministic validators and Decimal calculations. |
| Calendar-month and workload scope | `engine/app/monthly/contract.py` | Reuse product/internal workload definitions, selected month and explicit cost basis. |
| Durable preparation with edit conflicts | `engine/app/monthly/router.py`, `repository.py`, migration `20260911031800_company_monthly_preparation.sql` | Retain unfinished mapping/review and require expected revision. Existing draft writes invalidate prior financial confirmations when evidence changes. |
| Cost and invoice overlap checks | `engine/app/monthly/preparation.py`, `economics.py` | Preserve source amounts, original/allocated invoice lineage, Unallocated, no double counting across sources or workloads. |
| Immutable reports | `engine/app/monthly/economics.py`, migration `20260911015433_standalone_monthly_economics.sql` | Add server-owned import basis to new report fingerprints, while preserving existing reports and calculation contracts. |
| Company and private-alpha boundaries | `engine/app/private_alpha.py`, monthly router, private-alpha database migration | Every source, mapping, revision and export belongs to one authorized company. Advisor/admin status alone grants no evidence access. |
| Retention/recovery foundation | `docs/PRIVATE-ALPHA-ACTIVATION.md`, `docs/PRIVATE-ALPHA-BACKUP.md` | Extend the existing expiry/backup process; actual hosted recovery and access remain pending. |

The present UI's `file()` function in `app/components/monthly/workspace.tsx` reads `selected.text()` into a canonical CSV field. It does not retain an original-file manifest or offer source column mapping, a transformation log, a quarantine view, source-version comparison or saved cleaning recipes. Provider import tables are restricted to provider identities; do not pretend a file import is OpenAI, Anthropic or Stripe API evidence.

Current scaling constraints matter: the engine allows 20,000 rows per normalized CSV, the `/v2/` body is capped at 4,000,000 bytes, draft writes at 3,500,000 serialized bytes, and report output at 3,800,000 bytes. Monthly scope is USD. Fixing headers does not make arbitrary event warehouses fit these limits.

## First release: deliberately bounded

Support CSV exports with column mapping, known decimal/date conventions, company-reviewed source identities, deterministic normalization and saved recipes. Start with two actual recurring export families from Stephen's companies; select those from observed formats, not guessed provider promises. Cover usage/cost and revenue evidence first. Existing normalized rates and outcomes CSVs remain usable.

For this increment:

- One company and one reporting month per preparation; preserve the existing product/internal split.
- UTF-8 CSV including BOM, comma/semicolon/tab delimiters, quoted fields, selectable header row, explicit locale/date interpretation. Ambiguity requires review.
- A conservative 2,000,000-byte original-file cap per upload, plus existing combined normalized/report limits. Confirm this against actual fixtures before committing. Reject oversized files with a specific aggregation guide; never silently truncate.
- Deterministic column alias suggestions and exact remembered company mappings. No LLM dependency for launch.
- All final numbers calculated by the existing engine. A preview may show parsed controls before confirmation; it is labeled unapproved and cannot be saved as a final economic report.
- No automatic FX, arbitrary SQL, executable transformations, PDF/OCR, mailbox ingestion, universal spreadsheet repair, provider reconnect work or broad ETL platform.

XLSX can follow after the CSV workflow passes acceptance. Bound it to a selected sheet/table, no macros, no external links or formula execution, explicit formula/cached-value handling and ZIP expansion limits. It is a separate 2–4 working-day estimate subject to the selected library and file corpus; it is not hidden inside the CSV estimate.

## Experience

1. **Upload evidence.** Select company, month, source type and source-account label. Display file hash, size, row count and detected coverage. Explain supported evidence, not a technical schema dump.
2. **Review column interpretation.** Show source header and representative values beside proposed target field and unit. Highlight required fields and optional missing dimensions. A saved mapping explains that it came from this company's earlier confirmed import.
3. **See the organized result.** Before/after table and concise summary: rows accepted, rows quarantined, duplicate candidates, date coverage, known amounts, unallocated amounts and missing controls. Group exceptions by shared cause; allow one explicit rule to resolve a batch while listing affected rows.
4. **Resolve exceptions.** Make corrections as recorded overlays; never overwrite the original. Show ambiguous `09/10/2026`, currencies, unknown model names, changed IDs and overlapping exports for review. Do not make customers edit thousands of identical issues one row at a time.
5. **Confirm the exact version.** Present mapping, source/control totals, exclusions, remaining unknowns and accounting basis. The action means “Use this reviewed dataset,” not “These financial conclusions are proven.” A financial reviewer confirms business allocation/basis separately where required.
6. **Use it in Monthly Review.** Existing workload assignment, reconciliation, confidence checks, report and comparison views consume the confirmed canonical version. Download clean CSVs with a manifest and exception report; no other financial system writeback in this slice.
7. **Return next month.** Select the saved recipe; compare headers, types, source-account scope, identifiers, currencies and period to last time. Stage routine transformations automatically. Request review for changed or ambiguous items, followed by an explicit period confirmation.

## Deterministic rules and conservation

| Allowed operation | Conditions and trace |
| --- | --- |
| Rename/reorder columns; decode BOM; trim presentation whitespace | Record parser/rule version and source field. Preserve original bytes. Never trim/change an opaque business identifier without an explicit reviewed rule. |
| Parse amount/date/unit | Decimal arithmetic; explicit format and currency. Do not guess ambiguous dates or thousands separators. Cents-to-dollars requires source unit evidence and confirmation. |
| Normalize known model/provider aliases | Versioned exact alias dictionary or company-reviewed mapping. Unknown model remains unknown; no fabricated reference price. |
| Assign an existing workload/customer alias | Use a company-owned reviewed map with source-account scope. Missing customer/feature/run IDs remain missing. No semantic invention from a model name. |
| Remove export subtotal/header rows | Detect as proposals; confirm exclusion with row range/reason. Do not add both detail and subtotal. Preserve their values as controls where applicable. |
| Identify repeated evidence | File hash handles byte-identical retry. Source account plus immutable economic ID handles business duplicates. Similar amounts/dates are candidates only, not automatic deletion. |
| Partition an export by period/workload | Retain every source-row disposition; out-of-period rows remain visible. Missing assignment goes to Unallocated where compatible. |
| Correct a supplied amount | Requires an explicit human amendment and reason, retaining before/after values; contributes a separate signed adjustment to controls. It is not ordinary formatting cleanup. |

Every source row has exactly one disposition: included once, identified non-economic structure, excluded with explanation, duplicate candidate/confirmed duplicate, or quarantined. Internally generated row reference IDs are technical lineage only and must never be presented as source-issued transaction IDs. Without stable source IDs, duplicate detection across overlapping files is explicitly incomplete. A company can supply a reviewed composite business key, but the product must show its collision/uniqueness check.

Within each distinct source/account/currency/basis and period scope:

`parseable source detail amount + explicit amendments = included detail + quarantined parseable amount + reviewed exclusions + confirmed duplicate occurrences removed`

Keep a separate count of unparseable monetary rows; their amount is **unknown**, not zero. Do not use this partition to claim a bank/provider bill was reconciled. Compare the included unique economics to an independently supplied control amount after separating subtotal rows, duplicate export occurrences, credits, taxes and accounting basis. Show the signed unexplained difference, without a balancing plug. Costs and revenue never net against one another in a control check.

Exact decimal equality is the default for normalization and allocation. If a provider's independently rounded totals justify a tolerance, record its amount and basis explicitly. Never round every underlying token charge to cents before aggregation.

Source-level accepted records and control evidence have distinct roles. Provider invoice totals and token-priced usage for the same spend must not both enter cost. Bundled invoice allocation requires reviewed portions summing to the original with a visible remainder. File-supplied invoice amounts are customer supplied, even after review. Existing API-verified invoice handling remains separate.

## Proposed storage and endpoint contract

These names are a draft, not an implemented public contract. Keep this a small upstream module (`engine/app/import_review/`) and reuse the monthly engine through an adapter.

Proposed additive tables, all tenant-scoped, forced RLS, browser roles revoked, explicit membership and alpha checks at the service boundary:

- `inffyn_import_sources`: UUID, tenant, actor, source type/account label, original filename, SHA-256, parser version, size, original bytes, created/expiry times. For the bounded small-file alpha, capped `bytea` storage keeps the originals inside the already-planned database backup path and avoids opening the disabled legacy ingest bucket. This choice must be load-tested; it is not a long-term warehouse design.
- `inffyn_import_recipes`: immutable recipe revisions with company/source scope, expected schema signature, mapping operations, explicit formats/units, approved actor/time and superseded version. Store rules rather than sample customer rows; a schema match is insufficient if account, units or semantics drift.
- `inffyn_import_revisions`: import UUID, expected revision, recipe version, source hashes, draft/ready/confirmed status, exception decisions, canonical rows, row/field lineage, control results and canonical hash. JSON remains bounded and paginated for the UI. Source bytes are not copied into each revision.
- `inffyn_import_confirmations`: actor, timestamp, exact source/revision/canonical/recipe hashes, selected period, accepted limitations and source-account scope. Append-only; change the dataset by creating a new revision and confirmation.

Use a transaction/RPC to confirm atomically against the expected revision and all current source hashes, and to attach exactly that confirmed dataset to the monthly draft against its own expected revision. A conflict returns 409 with a recoverable reload path. Lost responses/retries use an idempotency key; they cannot attach rows twice. Tenant-local file-hash detection must not reveal that another company uploaded a similar file.

| Proposed endpoint under authenticated `/v2/monthly/` | Behavior |
| --- | --- |
| `POST import-reviews` | Accept bounded original CSV and metadata; create or recover an idempotent staged import. Compute hash server-side. No report calculation. |
| `GET import-reviews/{id}` | Safe summary, current revision, issues and control status. |
| `GET import-reviews/{id}/rows?cursor=...` | Bounded before/after/lineage and exception pages. No unrestricted source dump in logs. |
| `PUT import-reviews/{id}/revision` | Expected revision plus whitelisted mapping/decision operations. Re-run deterministic profile/validation. |
| `POST import-reviews/{id}/confirm` | Expected revision and canonical hash; create immutable confirmation after blockers pass. |
| `POST drafts/{month}/attach-reviewed-import` | Confirmed import references plus draft expected revision; server adapter composes canonical evidence and prevents overlap. |
| `GET import-reviews/{id}/export` | Approved canonical CSVs plus manifest, limitations and exceptions; escape spreadsheet formula payloads in human-facing text exports without corrupting canonical numeric values. |
| `GET/POST import-recipes` | List and explicitly save a reviewed company recipe/version. No global transfer of a customer's data or aliases. |

The client may not supply arbitrary normalized rows claiming an existing confirmation. The server rehydrates the confirmed data and checks its hash. Manual canonical CSV entry remains backward compatible but carries its existing customer-supplied/manual evidence basis; it cannot claim reviewed-import lineage.

Add optional reviewed-import references to monthly preparation and result metadata, with a new calculation/version marker for new reports. Do not overload existing `import_ids`, whose provider validation would otherwise reject CSV sources or mislabel their provenance. Existing reports keep their stored fingerprints; source, mapping, confirmation and allocation changes create new fingerprints and require renewed review.

## Retention, safety and routine operation

- Originals, transformation before/after values, quarantine content and staged canonical evidence follow the existing 90-day raw-evidence window. Recipe-only metadata and report-safe confirmation hashes can survive with the retained report for its 12-month period. A recipe cannot smuggle customer row values past raw-data expiry.
- A report after raw expiry retains calculation totals/basis/hash and states that source rows are no longer retrievable. Do not promise indefinite row-level replay. Recalculation after expiry requires re-upload and a new version.
- Deletion/expiry removes raw bytes and source-bearing logs, including failed jobs, while honoring the documented seven-day temporary backup lag. Extend and verify the retention RPC and recovery inventory before real intake.
- Keep transformations idempotent and bounded. A failed parse produces a safe issue code, no report and no raw financial contents in monitoring. The customer's own exception view may display relevant source cells under authorization.
- No executable formulas, external URLs fetched from data cells, model-generated scripts or silent provider calls. CSV text is untrusted data, including any apparent instructions.
- An optional later AI assistant may suggest column mappings from minimized headers/sample structure. It must output only a constrained mapping suggestion, record its suggestion version, require review, and fall back deterministically. No model arithmetic, invented business IDs or evidence transmission enabled by default. Such transmission is a separate product/data-handling decision.

The operating goal is **software performs routine preparation; the company reviews exceptions and confirms the month**. Founder investigation is reserved for system failures, not normal formatting. Do not promise zero maintenance: new export formats, policy changes, retention/recovery and security upkeep remain engineering responsibilities.

Proposed measurements, to validate across at least five actual supported-format companies and a second monthly cycle:

- First supported import to usable draft: median under 30 minutes of customer active work.
- Repeat supported monthly preparation: median under 10 minutes of active work, excluding waiting for source exports and substantive financial decisions.
- At least 80% of routine rows pass deterministic preparation without individual edits; any unresolved amount remains visible. Row automation rate is never a financial confidence score.
- Zero silently dropped rows, unreviewed amount changes, duplicated included economics or cross-company disclosures in acceptance.
- Founder/support time separately recorded for initial setup and each repeated cycle; target under 15 minutes per company per repeated cycle by the fifth company, rather than assuming free support in the business model.
- Collect p50/p90 time, total setup time, exception causes and failure rates. A fast happy-path demo is not proof that these targets are met.

## Delivery sequence and acceptance

**Incremental estimate: 7–10 focused working days** for the bounded CSV slice, after current alpha activation dependencies are resolved and representative files are available. Two engineers can overlap work, but this estimate is not the entire product's remaining launch timeline. The first useful source-to-preview interaction should be reviewable in 2–3 working days. Broader formats or larger workloads require re-estimation, not silent scope expansion.

| Days | Engineering deliverable |
| --- | --- |
| 1–2 | Source fixture corpus, issue taxonomy, supported bounds, pure deterministic profiler/transforms and conservation fixtures. |
| 2–4 | Original/revision/recipe persistence, confirmation transaction, tenant controls, expiry and server adapter. |
| 3–6 | Column review, before/after table, grouped exceptions, controls, explicit confirmation and clean export. |
| 6–8 | Recipe reuse/drift, attach/retry/conflict behavior, immutable monthly lineage and report appendix. |
| 8–10 | Real authenticated hosted acceptance, retention/recovery extension, accessibility and fixes. |

Engineering acceptance must include:

1. A supported messy CSV reaches the same economics as the trusted manually normalized fixture, with original bytes recoverable during retention.
2. All rows are accounted for, including malformed numeric fields, subtotal rows, exclusions, duplicates and quarantines. Ambiguous money/dates block affected confirmation.
3. Amounts, tokens, request counts and row counts reconcile after each accepted transformation; controls stay scoped by currency/source/period.
4. Byte-identical retry is idempotent; changed/reordered/overlapping exports with stable IDs do not double count. Sources without stable IDs visibly retain the limitation.
5. Unknown model/rate/customer/outcome identity stays unknown. Revenue allocations and file-reported amounts retain the correct provenance after review.
6. Out-of-period/cross-currency data cannot silently enter a USD monthly result. Provider totals and detailed event estimates cannot both count as spend.
7. Stale mapping edits or simultaneous confirmation/attachment return recoverable conflicts; report creation cannot consume an unconfirmed or modified revision claiming reviewed status.
8. Same-company users resume after sign-out; different companies cannot inspect original bytes, rows, recipe aliases, confirmations or exports through app, engine or direct database calls.
9. A modified mapping, amount or workload definition produces a new required review and report version. Earlier report/export contents stay unchanged.
10. Expired sources/recipes containing source values are handled according to policy; retained summary fingerprints cannot be used to retrieve deleted raw data. Recovery restores the new source/recipe/confirmation tables and privileges.
11. Keyboard navigation, paginated tables, screen-reader issue links and printed/downloaded summaries work on supported viewport sizes. Oversize/timeout/cancel failures leave no falsely confirmed dataset.

## Ownership and activation dependencies

**Ryan/engineering:** parser, contracts, deterministic transformations, validation, confirmation enforcement, persistence, privacy, recovery, tests, deployment and measured preparation performance. Engineering proves it works and owns error recovery. Do not hand implementation verification to Stephen.

**Stephen:** supplies permitted representative export shapes through the agreed secure intake once active, identifies which formats recur, confirms customer terminology and business value, and owns the commercial motion. He does not need to invent normalization rules or act as a daily data janitor.

**Company finance/operations reviewer:** chooses accounting basis, business scope, allocations and exclusions; confirms the particular monthly dataset. **Company engineering/data owner:** answers genuinely missing source semantics or provides missing identifiers/outcomes. A blank field cannot be solved by more aggressive cleaning.

**Dependencies:** the existing private alpha is still not activated according to the current checklist. First complete its actual encrypted recovery, database inspection/migrations, identity/hosting setup and authenticated acceptance. Local parser/UI/fixture development can proceed independently. New remote tables and real source intake require that approved recovery path, an additive reviewed migration and expanded hosted checks; source deletion and retention operations must preserve the explicit recovery policy. No credential reset, public launch, paid provider activation or new database is implied by this proposal.

If five companies need five bespoke transformations every month, stop broadening format coverage and narrow the first supported export families. If repeated imports become routine and the monthly review changes decisions, invest next in removing the few observed export steps through verified connectors. The differentiator should be proven reduction in financial-preparation work and repeatable decision usefulness, rather than an increasingly general-purpose file cleaner.
