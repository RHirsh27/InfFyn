# InfFyn hosted review — September 7, 2026

**Historical audit preview.** The company-facing walkthrough and current verification are described in [COMPANY-MVP-RELEASE.md](COMPANY-MVP-RELEASE.md). The existing `/review` audit remains separate from the synthetic company demo and authenticated company workspace.

## Current delivery

The user authorized a separate review deployment under their own hosting accounts. Stripe, email delivery and public customer launch are deferred. The previous Supabase/Render ownership limitation no longer blocks hosting.

**Share with Stephen:** [Open the working review](https://inffyn-preview.vercel.app/review). No account or Vercel sign-in is required. Choose **Try synthetic example**, or start a new audit and upload anonymized CSVs. Choose **Internal workflow** to review cost per accepted outcome. Saved audits are private to the browser that created them.

| Resource | Target | Ownership |
| --- | --- | --- |
| Web application | `inffyn-preview`, project `prj_jZDPzOm2PZRiwYK43GJ5FTOmZ54c` | User's Vercel team `team_sP2wD4MBHG6ACAEpv5pm8rb9` |
| Calculation API | `inffyn-preview-engine`, project `prj_YkyoXtOXd8AtPRdiW8jxcN3JqnIv` | Same team; separate app/service secrets |
| Saved audits | Reviewer's browser, IndexedDB | No shared synthetic company and no cloud database |
| Supabase | Existing InfFyn project `jmfzmoqdvweeixxwzlma`, not linked to this review deployment | Owning-account access required |
| Stripe and email | Disabled | No credentials provisioned and no provider actions in the review engine |

The user subsequently directed use of the existing InfFyn database, explicitly excluding Blueprint OS. The connected account can see Blueprint OS but cannot access the InfFyn project. Do not create another project as a workaround; connect the owning account and inspect the existing migration history before database changes.

## What Stephen can review

- Upload usage, other variable costs, effective pricing, reviewed revenue and outcome CSV files.
- Calculate product/customer contribution and internal workflow cost per accepted outcome with the production economics implementation.
- Inspect incomplete cost scope, missing prices, evidence labels, allocation sensitivity and margin drag.
- Save up to 20 audits in the same browser, reopen versions, export report/source JSON, and print a report to PDF.

The examples are synthetic and labeled. Uploaded data is calculated from the supplied records; it is not replaced by sample results. The engine handles calculation only and does not save a server-side audit. Requests and responses use HTTPS and are not deliberately logged by this implementation. Use sample or anonymized test data for this review release; customer-data onboarding awaits the hosted persistence/security/retention acceptance.

Browser saves do not sync to another device or browser and disappear if site storage is cleared. Source payloads expire after 90 days and reports after one year; browser expiration cleanup runs when the workspace next accesses storage, not on a server scheduler. Export before clearing site data. Database-backed customer retention guarantees are not implied.

## Configuration and deployment

Both new Vercel projects use Production environment settings to provide stable aliases for this **review** environment. This is not approval to launch paid customer service.

| Configuration name | App | Engine |
| --- | --- | --- |
| `INFFYN_PREVIEW_MODE` | `true` | `true` |
| `INFFYN_PREVIEW_STORAGE` | `browser` | `browser` |
| `AUDIT_PROXY_SECRET` | Same server-only sensitive value | Same server-only sensitive value |
| `ENGINE_URL` | `https://inffyn-preview-engine.vercel.app` | Not required |
| Supabase, Stripe, email, model-provider keys | Absent | Absent |

The Vercel engine entrypoint selects the stateless review app only when both preview switches match. The normal application retains real JWT/tenant enforcement and its ordinary database requirements. The dedicated review engine exposes health and signed calculation endpoints; billing, invitations, Stripe and legacy ingestion routes are absent. Request size is limited to 4 MB and calculated output to 3.8 MB. This stateless review does not have the database-backed global quota enforcement used by the customer workspace. Reassess anonymous abuse controls before broader distribution.

The app's project root is `app`; its install runs `npm ci` from the repository root. The engine is linked separately from `engine`, uses Python 3.12, and installs `requirements.txt` with `constraints-v1.txt`. `.vercelignore` excludes local environment files, validation data, dependencies, research and founder outputs. No existing product hosting settings were changed.

The Windows-generated lockfile omitted Linux Rollup platform packages. Their matching **4.62.2** lock entries were restored using an isolated npm-generated lock, preserving every existing dependency record and version. This fixes the Linux build without upgrading application dependencies. See [npm's platform dependency issue](https://github.com/npm/cli/issues/4828).

CLI deployments do not require GitHub access. The current `DA-CTO/InfFyn` Git remote returns Repository not found with this session's access; no push is represented as successful. Preserve local source commits and arrange repository ownership/access before automatic deployment or ownership handoff.

A CLI attempt carrying historical Git author metadata was blocked by Vercel's team-membership check. `scripts/stage-review-deployment.ps1` packages the exact current app source into a new temporary directory with only the intended Vercel project link. Deploy that source package through the authenticated project owner's CLI account. This does not alter commit authors, repository access or team membership. Vercel documents [direct source deployments independently of Git integration](https://vercel.com/docs/deployments/overview).

```powershell
$inffynSourcePackage = & .\scripts\stage-review-deployment.ps1
npx --yes vercel@latest deploy --cwd $inffynSourcePackage --prod --yes --scope ryanmhirsh-gmailcoms-projects
```

## Before cloud persistence and customer launch

1. Obtain access to the existing InfFyn Supabase project and review its migration history and backups before additive updates. Verify real JWTs, tenant isolation, save/return/export/delete, database grants and backup restore.
2. Configure an appropriate sign-in method. A private review can use Supabase anonymous accounts without outbound email; production account recovery and invitations need a deliberate authentication setup.
3. Enable and test retention scheduling, sanitized error alerts and availability monitoring. Vercel runtime/build logs are available now; Sentry delivery and a retention scheduler are not configured.
4. Establish a source repository the owner can access, then link automatic deployment if desired. Record both Vercel projects, Supabase project, secrets, billing ownership and domain ownership for Stephen's later transfer. Rotate credentials when ownership changes.
5. When Stephen is ready to launch, complete the previously documented Stripe OAuth/billing, email, actual business/support details and data-handling acceptance. A custom domain is optional for preview; no OpenAI/Anthropic API key is required for deterministic calculations and reports.

## Verification

Engine: 121 tests passed. TypeScript, middleware resilience, signed review-proxy/origin/size-limit tests and the local production build passed. The hosted engine health check returned stateless review, browser storage, Stripe disabled and email disabled without Vercel authentication.

Both services are live and were checked through their stable aliases:

| Service | Stable URL | Verified deployment |
| --- | --- | --- |
| App | `https://inffyn-preview.vercel.app/review` | `dpl_6ZWty9V1h1pFEWisrRCxGiAhB85x` |
| Engine | `https://inffyn-preview-engine.vercel.app/health` | `dpl_38SqoYS8ToJeLxJoihqxGeBpYvGg` |

The final app deployment passed **19 live HTTP acceptance checks** with repository synthetic fixtures: unauthenticated public access, browser-storage disclosure, no-index metadata, foreign-origin rejection, product/internal calculations, uncached responses, correct report fingerprint, repeated-evidence fingerprint, unknown-cost behavior, invalid CSV rejection and protected database routes. Repeat with `node scripts/check-hosted-review.mjs https://inffyn-preview.vercel.app`. The last run records its timestamp and assertions in ignored `.validation/hosted-review-checks.json`.

Live browser verification used the actual public URL:

- Saved the product example: $175 included costs, $380 reviewed revenue, $205 contribution and a ($60) customer margin drag. Reloaded and reopened the saved audit successfully.
- Uploaded `fixtures/v2/usage-sample.csv` through the native file chooser. Its four rows produced $100 of included inference costs. Missing revenue/contribution remained unavailable; the page explicitly requests revenue evidence before assessing margin.
- Saved an internal audit: $175 includes failed/rejected work, three accepted outcomes, $58.33 per accepted outcome and $105 modeled capacity value. Capacity is not claimed as realized cash savings.
- Downloaded and parsed the report JSON. Verified its facts fingerprint and $205 contribution, and confirmed that raw source payload is excluded after reopening. Downloaded the original source evidence separately and verified the CSV fields remain available there.
- Reran unchanged saved evidence: three saved audits remained three and the original timestamp/fingerprint was preserved.
- Edited the saved title and reran: a fourth audit appeared with a new fingerprint while the original remained available. Opened the executive report on the final hosted build and checked its visible layout.

These are technical checks with synthetic evidence, not customer validation. Browser storage does not prove Supabase authentication, cloud persistence, hosted RLS, backup restoration, Stripe, email or scheduled retention. Print/PDF is provided through the browser print interface; this session verified the report page and JSON downloads, not a saved PDF file.
