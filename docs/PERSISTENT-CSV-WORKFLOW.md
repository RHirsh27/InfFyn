# Persistent CSV workflow: recovery and resume

September 13, 2026. This increment improves the existing company workflow. It does not activate financial intake, add a database, enable providers, or change pricing. The existing seven applied migrations supply the required schema; no new migration is needed.

## Customer behavior

1. Sign in to the admitted company workspace and open Monthly Review.
2. Select the reporting month. Upload a supported CSV or resume a retained source.
3. Map columns and resolve exceptions. **Save interpretation and check** persists that revision; unsaved interpretation changes block changing the source, reporting month, workspace tab, or signing out. Export edits before explicitly discarding them when necessary.
4. Review and confirm the organized dataset. Returning to the exact confirmed source revision restores that confirmation. A later interpretation revision requires a new confirmation. Confirmation covers the dataset, not financial completeness or causal attribution.
5. Assign approved evidence to a workload. Monthly preparation autosaves to the authenticated company database with a revision check.
6. Reconcile and review scope, then save an immutable report. Source corrections create new versions; previous reports and confirmed exports remain unchanged within their retention period.

Financial data is never saved to localStorage by this workflow. Unsaved edits exist only in the open tab until the server acknowledges them. Closing a tab despite its warning can lose those unsaved edits. An explicit downloaded edits file is a user-controlled export, not automatic persistence.

## Interrupted saves

- Network failures and HTTP service errors show a retry action and retain the current edits. They no longer put every failed save into a permanent conflict state.
- A retry first checks an uncertain prior write. If the server holds exactly that submission, the client acknowledges its revision without writing it again.
- Edits made after the uncertain write use the recovered revision. A competing revision with different content requires review; there is no silent merge or force overwrite.
- Definitive validation, access and size errors retain the local input for correction. Authentication failures do not grant access or silently switch storage.
- The interface reports saving, interrupted, conflicted and saved states separately. Initial draft-load failure has an explicit retry.

Source row pagination now accepts an optional `expected_revision`. A stale page request receives 409 instead of combining a previous interpretation's totals with newer rows. The app forwards this parameter. Existing callers without it remain supported. The import response adds optional `confirmation` metadata for the current unexpired source, company, source hash, canonical hash and revision.

## Verification

Reproducible checks run in GitHub Actions with synthetic inputs:

| Check | What it establishes |
|---|---|
| `tests/revisioned-save.test.ts` | Lost-response recovery, conflicts, access/validation failures, expiry and in-flight input snapshots |
| `tests/csv-review-ui.test.mjs` | Actual React control events, resume, retry, explicit discard and navigation guards in a disposable DOM |
| `tests/reviewed-import-migration.test.mjs` | Original, revisions, confirmation and draft survive a disposable PGlite database restart; immutable reports, expiration and repeated sweeps |
| `engine/tests/test_import_review_http.py` | Additive HTTP contract, retained confirmation and stale pagination with an explicit in-memory adapter |
| `engine/tests/test_import_resume.py` | Exact source/version and tenant filtering for retained confirmations |
| `tests/reviewed-import-runner.test.mjs` | Hosted runner defaults to no requests and rejects unexpected hosting origins |

The hosted runner is `scripts/acceptance/run-reviewed-import.mjs`. It is pinned to the existing Render alpha origin, verifies two distinct authenticated owners, and refuses companies already containing workloads, reports, retained imports for the test month or drafts. Its generated data is synthetic. Running it leaves those fixture records for review. Repeated acceptance requires separately designated empty fixtures, not deletion of customer data.

Readback using the same token is not a new login. The runner explicitly leaves browser sign-out/return, direct database access, retention operation and recovery acceptance separate. DOM tests do not establish visual layout, keyboard/contrast acceptance or hosted sign-in.

## Activation remains gated

Follow [private-alpha activation](PRIVATE-ALPHA-ACTIVATION.md). Required next evidence includes independent recovery-key custody, hosted retention and scrubbed monitoring, complimentary company access, Stephen's verified sign-in, and the two-company CSV-to-report acceptance. Do not enable monthly or audit intake solely because CI or a Preview build passes. OpenAI, Anthropic, Stripe, paid billing and public launch remain deferred.

The engine change is backward compatible and should deploy before the frontend is used for acceptance. The frontend tolerates an older engine without the optional confirmation metadata, but final acceptance must run against the matching engine commit so stale pagination is enforced. Keep the existing public review aliases unchanged.
