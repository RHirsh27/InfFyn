# Reviewed imports: implementation and acceptance

September 12, 2026. Implemented locally; no remote migration, deployment, identity change or customer-data import performed for this increment.

## What is now implemented

- Monthly Review contains a reviewed-import panel: original CSV upload, column mapping, explicit date/number/unit interpretation, before/after inspection, paginated rows, explained exclusions/corrections, confirmation, assignment and exports.
- Company-owned recipes can be saved from confirmed revisions and staged next month. Header/account/type changes require review; every reporting month requires confirmation.
- A deterministic engine prepares usage, cost and revenue CSVs. Existing canonical rates/outcomes remain available. Unknown amounts, missing business IDs and unknown model rates are never fabricated.
- Source rows retain a disposition and lineage. Monetary partitions use Decimal and separate currencies. Excluding unknown amounts does not declare full financial coverage.
- New authenticated endpoints and four company-scoped tables retain originals, revisions, confirmations and recipes. Browser database roles have no direct access. Service queries enforce tenant scope; mutations check membership.
- Confirmation and draft attachment use a transactional RPC. Report creation verifies source/confirmation hashes and canonical bytes rather than accepting client claims. Manual edits remove the reviewed designation in the UI.
- Reports include a reviewed-source appendix and a new fingerprint when reviewed evidence is present. Empty reviewed references are omitted from legacy calculation fingerprints. Source expiry constrains draft/report payload retention.
- Clean exports include canonical machine CSV, spreadsheet-safe CSV, confirmation manifest and exceptions. Formula-like text is escaped only in the spreadsheet version.
- A fixed synthetic two-month research-delivery example is generated through the real import and economics engines at `/demo/reviewed-import`, with downloadable source files and reports.

## Boundaries and operating defaults

- UTF-8 CSV, optional BOM, comma/semicolon/tab delimiters; 2,000,000 original bytes and 20,000 detail records maximum. Normalized profiles and existing draft/report limits also apply.
- One reviewed source per evidence slot per workload. Assignment never silently replaces existing data. Export and explicitly clear a populated slot before replacement; earlier reports remain retained. Preparing multiple workload-specific exports is required when one source spans workloads. Existing Stripe allocation behavior is unchanged and provider routes remain deferred.
- No XLSX/PDF parsing, arbitrary executable transforms, LLM dependence, new provider calls, pricing changes or public financial APIs.
- Interpretation edits are retained when **Save interpretation and check** completes. Staged unsaved edits are visibly labeled. Existing monthly draft autosave remains separate.
- Original bytes, normalized rows and correction explanations expire after 90 days. Recipe rules exclude source-row samples; safe confirmation hashes and report summaries retain their 12-month lifetime. Temporary encrypted backups retain the existing seven-day policy.
- Creation/revision/confirmation timestamps, exception counts, decisions and saved recipe versions supply an initial preparation event record. The UI reports session elapsed time including idle time. Active-work-time measurement and a customer-calibrated 50% improvement claim are NOT established.

## Verification

Run from the repository root in PowerShell:

```powershell
$env:SUPABASE_URL = 'https://example.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = 'offline-test-placeholder'
.\engine\.venv\Scripts\python -m pytest engine/tests -q
node tests/reviewed-import-migration.test.mjs
node --test tests/alpha-app.test.mjs tests/private-alpha-acceptance.test.mjs tests/private-alpha-backup.test.mjs tests/private-alpha-database.test.mjs
npm run typecheck --workspace=app
npm run build:app
```

The placeholders above are solely for offline tests. Do not use them as hosting configuration. Use a separate terminal for deployment operations.

New tests independently verify normalization totals against the economics engine, unknown amounts, duplicate conservation, separate currency controls, explicit date formats, expiry behavior, formula-safe exports, schema drift, client tampering, HTTP confirmation/export/resume behavior and transactional SQL boundaries. SQL tests use disposable PGlite PostgreSQL; HTTP contract tests explicitly use a test-only in-memory store. Neither establishes hosted Supabase acceptance.

The full engine run passed **300 tests**. The new migration passed **nine disposable PostgreSQL checks**, and **51 existing alpha/app/recovery checks** passed. Production build and TypeScript passed. Desktop and 390px Chrome inspection of the fixed walkthrough passed; keyboard focus was observed. The editable authenticated panel, print output and full accessibility acceptance still require a configured database/browser session.

## Activation sequence

1. Complete the existing private-alpha recovery and live catalog gates described in `PRIVATE-ALPHA-ACTIVATION.md`. Preserve historical migration records and existing company data.
2. Apply missing previously prepared migrations in their reviewed order, then `20260912190000_reviewed_csv_imports.sql` through the authorized database transport.
3. Verify forced RLS and privileges on all four `inffyn_import_*` tables and `write_inffyn_import`. Confirm browser roles cannot call the RPC or read original rows.
4. Capture/retrieve/restore the encrypted backup with the new tables. The existing backup tool dumps the full database and dynamically inventories tables, functions, grants and row counts; the new originals use `bytea`, so no new Storage bucket is required. Actual hosted recovery remains mandatory.
5. Deploy engine first, then app, to the existing restricted InfFyn projects. Preserve public review aliases and disabled provider/billing routes.
6. Run `node scripts/acceptance/run-reviewed-import.mjs` for the no-network pending checklist. Execution requires explicit `--execute --synthetic-companies-only`, two authenticated tokens and two designated synthetic tenant IDs entered outside chat. The runner refuses to replace existing preparation and retains its synthetic records for review.
7. Complete browser sign-in, source upload, recipe preparation, confirmation, assignment, report creation, fresh-session return and month-two reuse. Verify direct database denial and run retention/recovery checks separately. The runner does not claim browser reauthentication or recovery proof.

Stephen's value-validation handoff follows engineering acceptance. Actual recurring customer export formats, low-support repeat use and paid retention remain unverified.
