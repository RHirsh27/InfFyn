# Hosted monthly acceptance

This runner is prepared for the existing InfFyn Supabase project, **`jmfzmoqdvweeixxwzlma`**. It has not been executed against a hosted customer workspace. The default command performs no network requests and records every acceptance gate as **pending**.

```powershell
node scripts/acceptance/run-hosted-monthly.mjs
```

The runner uses the application's existing `/api/v2` routes with real Supabase browser cookies and the engine's existing `/tenant/verify` and `/v2` routes with real user access tokens. It does not introduce an authentication bypass, use a service-role credential, issue invitations, create users or companies, initiate billing, contact a provider, apply migrations, or create provider imports.

## Before an authorized hosted run

1. Complete the project's database and deployment preflight. Confirm the exact approved HTTPS application and engine origins and the configured Supabase project. A public demonstration deployment does not satisfy this requirement.
2. Designate **two separate, empty synthetic companies**, each with a different real authenticated owner. Neither owner may belong to the other test company. Give both companies approved subscription or complimentary access through the existing application process. The runner does not grant access.
3. Confirm that these companies and any referenced provider imports contain only approved synthetic acceptance evidence. Do not substitute customer companies or a shared workspace. The runner refuses existing workloads, reports or a draft for the selected month; it also rejects imports outside its explicit allowlist.
4. Copy [the disabled manifest example](../scripts/acceptance/manifest.example.json) to a private local configuration path. Replace the identifiers and approved origins, set the four approval booleans, and use this exact confirmation only after the conditions are true:

   `These two companies and all referenced imports are dedicated synthetic acceptance fixtures; I authorize this run's writes.`

5. Supply the real owners' current app Cookie headers and matching access tokens through the named environment variables, using an approved secret-entry mechanism. Never put values into the manifest, command-line arguments, source control, chat, screenshots, or diagnostic logs. The runner does not inspect browser storage or load `.env` files.

The Cookie header must contain the `sb-jmfzmoqdvweeixxwzlma-auth-token` cookie or its numbered chunks. The runner forwards only that project's auth cookies and the designated active-company cookie. It requires the cookie's access token to match the separate access-token environment reference, rejects service-role/anonymous/wrong-project/expired sessions, and requires at least five minutes of remaining validity. Claim inspection is only a local preflight: the actual engine must validate the signature and return the designated user and tenant before workspace writes begin.

To check retrieval through a second independently authenticated session for Company A, add `resume_cookie_env` and `resume_token_env` to Company A's manifest entry. Those variables must contain a separate real login for the same user with a different session ID. Without them, this case remains pending. **A second API session does not prove the browser sign-out/sign-in flow**; that separate gate always remains pending in this runner.

## Execute only after those conditions are met

```powershell
node scripts/acceptance/run-hosted-monthly.mjs --manifest C:\Private\inffyn-acceptance.json --execute --report C:\Private\inffyn-acceptance-result.json
```

The manifest path and report path contain no session values. The example origins are not automatically approved merely because they appear in the template. `--execute` is required for all network activity. A missing approval, invalid manifest or unavailable session produces a pending preflight result, not a pass.

The run creates one clearly named synthetic workload in each company, one draft and two report versions in Company A, and report-selection history. When an approved completed Stripe import is supplied, it also adds a second product workload to Company A and saves a source-backed report allocating an invoice across both products. It leaves this evidence in place for review. It does not delete workspaces or automatically clean up a partially failed run. Repeated runs require newly designated empty fixture workspaces or deliberate cleanup through the normal application; the runner will not overwrite existing preparation.

## What is checked

| Area | Assertion |
| --- | --- |
| Authentication and target | Both real user sessions resolve to the configured company and owner; production-shaped monthly access is enabled; preview entitlement is rejected. |
| Unauthorized access | Missing and tampered bearer tokens receive 401. Each owner receives 403 when addressing the other company's tenant context. |
| App/engine company binding | A workload created through each app session appears only in that company's authenticated engine context. |
| Durable preparation | A saved draft returns revision 1; a stale revision returns 409; later reads preserve its content. A separate real session can retrieve the same draft when supplied. |
| Draft isolation | Company B cannot see Company A's draft, and cannot read or write it using Company A's tenant context. |
| Report correctness | A synthetic known-value calculation produces the expected total, and retrying identical inputs returns the same report ID. |
| Report isolation and history | Company B cannot retrieve Company A's report or raw evidence. A corrected calculation creates a new version while the earlier report remains unchanged. |
| Selection conflicts | A stale selected-report expectation returns 409; a correct expectation succeeds. |
| Missing allocation lineage | An allocation row without the original retained invoice is rejected. |
| Import isolation, when supplied | Company A can read an approved completed import for the period; Company B cannot read or advance it. |
| Invoice allocation, when supplied | A two-product allocation of a retained synthetic Stripe invoice reaches a saved report and evidence export, retaining a nonzero unassigned balance. Original amount, both portions, remainder, explanations, account identity, invoice date/currency/customer reference and modeled basis persist unchanged; an over-allocation and an altered explanation are rejected. |

For optional import checks, place only deliberately prepared synthetic import IDs in Company A's `approved_import_ids`. The runner reads these through existing authenticated routes. It does not generate fake provider records or mark a connector verified because an import row exists. Without a suitable completed Stripe import, the over-allocation case remains pending. Provider setup, known-period totals, pagination, retries and revocation are covered by [the provider acceptance runbook](PROVIDER-ACCEPTANCE.md) and its separate evidence record.

## Interpreting the result

The receipt contains check IDs, statuses and safe reason codes. It excludes cookies, JWTs, company/user IDs, raw errors, imported records and financial amounts. Requests stay on the two configured origins, reject redirects, use timeouts and bound response sizes. A check failure stops the run; subsequent checks stay pending.

`release_ready` is always **false** in this focused runner. Even a successful hosted core run leaves browser sign-out/return, provider authorization and known totals, retry/revoke behavior, membership revocation, actual expired-source/session behavior, billing lifecycle, monitoring, retention and restoration to their separate acceptance records. Missing checks are not inferred from local tests or synthetic data.

- Exit `0`: dry run completed; all hosted acceptance remains pending.
- Exit `1`: an executed assertion or transport failed.
- Exit `2`: preflight could not authorize execution, or the executed core checks finished while release gates remain pending.

## Offline verification of the runner

```powershell
node --test tests/hosted-acceptance-runner.test.mjs
```

The transport tests simulate successful responses and deliberately broken authentication, tenant isolation, revision checks, totals, report idempotency, history, selection conflicts, source lineage and invoice allocations. They verify that the runner fails those regressions and does not leak secrets or financial data in its receipt. They also verify that a dry run makes no requests and missing evidence remains pending.

These tests validate the runner's assertions only. Their receipts are labeled `offline-transport-test`; they do not verify Supabase, a deployment, real user authentication, or a provider integration.
