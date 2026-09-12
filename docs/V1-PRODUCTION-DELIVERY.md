# InfFyn production delivery — September 7, 2026

**Superseded for the immediate review release:** the user subsequently authorized fresh Vercel/database projects in their own accounts and explicitly deferred Stripe and email. Current hosting and verification are recorded in [HOSTED-PREVIEW.md](HOSTED-PREVIEW.md). The account limitations below explain the earlier stop; they do not prevent the new Vercel review deployment. The remaining hosted acceptance applies before a customer launch, rather than before Stephen can preview the app.

## Approved target

Ship the working CSV/Stripe economics app, public $349/company/month subscription, and private access portal. Invitations expire after seven days if unused; redeemed access lasts until explicitly revoked. No automatic payment conversion. Stephen validates the product with customers after engineering delivers a functioning deployment. The agent is authorized to implement, apply reviewed additive migrations and deploy on the existing InfFyn infrastructure.

## Implemented in this release

- Access portal at `/app/admin/access`: verified administrators issue one-time links, see invitation status and revoke access. No automatic messages are sent.
- `/invite` preserves its token in a short-lived HttpOnly cookie through sign-in. The link secret is in a fragment rather than the HTTP path, is removed promptly, and only its SHA-256 hash is stored in PostgreSQL. Sentry performance traces and replay are disabled to avoid URL/fragment evidence leakage; sanitized error reporting remains.
- Migration 0013 enforces administrator checks and verified-email matching, provisions an isolated company atomically, and makes same-user redemption retries idempotent. Issuing an invitation confers no company membership on its administrator. Service-only access tables force RLS.
- Paid subscriptions and complimentary grants are independent sources of full access. Revoking a grant does not cancel paid access or delete historical reports.
- Atomic first-sign-in provisioning; invitation return path survives magic-link authentication without allowing arbitrary redirects.
- Durable hourly limits: public visitor 20, all public previews 200, company audits 60, all company audits 1000, company Stripe imports 10, company billing actions 20, administrator invitations 60 and user redemption attempts 20. Public requests require a fresh server-signed pseudonymous visitor proof; the raw IP is not stored in quota records.
- Published approved price and honest retention/service-status pages. Full legal notice publication remains blocked on actual business details; no company identity or contact has been invented.
- Reproducible Vercel dependency install with `npm ci`.

## Current infrastructure blocker — verified, no writes attempted

The connected Supabase account cannot access InfFyn project `jmfzmoqdvweeixxwzlma`; project lookup and migration lookup return permission denied. The CLI's project inventory does not include InfFyn. The connected Vercel team also does not list InfFyn. The command named `render` on this machine is an unrelated template renderer, not the hosting CLI. Do not substitute another listed project or use an unverified database password.

Needed from the user: connect the Supabase, Vercel and Render accounts that own InfFyn; supply the verified administrator sign-in emails for Ryan and Stephen, the operating business name and support email. These were requested while implementation continued. No keys should be pasted into chat.

## Remaining hosted acceptance

1. Confirm exact InfFyn provider ownership and deployment targets. Capture migration ledger and backup/restore availability. Resolve pending 0011 independently; review 0012/0013 and apply only the approved set with Supabase CLI.
2. Seed the two administrators only after their verified `auth.users` identities are confirmed. No user-editable metadata authorizes this role. Never give administrators membership in customer companies merely to administer access.
3. Configure the same random server-only `AUDIT_PROXY_SECRET` (32+ characters) in app and engine. Keep billing/OAuth keys engine-only. Set approved release flags only after required provider checks.
4. Verify real auth, anonymous claim, invitation sign-in and redemption, wrong-tenant rejection, save/return/export/delete, revoked access and retained reports on hosted Supabase.
5. Complete real read-only Stripe OAuth and known-value evidence import. Verify test Checkout, signed webhook, subscription renewal/cancellation and portal. Confirm business details, tax handling and service terms before live checkout.
6. Configure hourly retention execution of `python -m app.v2.maintenance` on the confirmed hosting account, verify successful and failed-job alerts, and document recovery from a missed sweep. The approved expiry windows are one hour / 90 days / 12 months. Database expiry tests are not proof that a scheduler is running.
7. Configure sanitized error monitoring, availability checks, backup recovery and deletion lag; verify one controlled error reaches the intended project. Populate the complete privacy/service notices with real business information and operating policy.
8. Deploy engine, verify contract, deploy application, then repeat hosted smoke tests. Provide Stephen the verified URL and founder packet. No live deployment or customer-data claim is justified by the local build alone.

## Local evidence

The engine test suite passed 112 tests, including the empty PostgREST response regression for first-time accounts. Disposable PostgreSQL passed 10 original audit migration checks and 10 new access migration checks. The new access tests use the real 0002 tenancy schema and test role privileges, forced RLS, wrong/unverified email, expired/revoked invitation, retry idempotency, isolated membership, billing preservation, provisioning, quota reset and inverse migration. Hosted concurrency and production-checkpoint replay still require the actual target.

Local browser verification confirmed invalid-link rejection and token removal, then saved a synthetic audit through the application: $175 included costs, $380 reviewed revenue, $205 contribution and a ($60) customer margin drag. The saved-audit sidebar also retained earlier local versions. This used the production economics implementation with the isolated SQLite adapter; no hosted provider round trip is implied. Production dependencies reported zero known npm vulnerabilities.

Final Next.js 16.3.4 webpack production build and TypeScript checks passed. The loopback invitation-proxy test passed malformed-body rejection, invalid token rejection, foreign-origin rejection, HttpOnly/SameSite/expiry attributes, no-store responses and unauthenticated administrator protection. Run it with `node tests/access-proxy.test.mjs` while the isolated application is listening on port 3012. Authentication-return and middleware resilience checks also passed.

Commands: `engine/.venv/Scripts/python scripts/test-engine-safe.py`, `node tests/audit-v2-migration.test.mjs`, `node tests/release-access-migration.test.mjs`, `npx tsx tests/auth-return.test.ts`, `npm run test:middleware`, `npm run typecheck --workspace app`, and the safe build script in `V1-RELEASE-RUNBOOK.md`.

## Implementation references

Current provider documentation checked: [Vercel trusted request headers](https://vercel.com/docs/headers/request-headers), [Supabase changelog](https://supabase.com/changelog), [Render blueprint reference](https://render.com/docs/blueprint-spec), [Render cron jobs](https://render.com/docs/cronjobs). These inform configuration, not evidence of a hosted deployment.
