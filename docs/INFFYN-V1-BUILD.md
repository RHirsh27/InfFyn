# InfFyn v1 build authority

**September 10 update:** the current standalone monthly scope, implemented contracts and production gates are recorded in [STANDALONE-RELEASE.md](STANDALONE-RELEASE.md). The sections below retain the earlier audit-only decisions. The new release adds monthly performance and independent provider imports; FynScale OS integration is deferred to Q2 2027.

Owner: Stephen Ninesling (product/commercial claims); Ryan (engine/security). Updated 2026-09-06 from the user's explicit replacement build request and planning decisions.

## Replacement objective

Build a working, testable InfFyn v1 so real customers can validate it. This replaces the earlier objective of proving the entire business before building. Market validation remains a subsequent customer activity. The Codex goal API refused replacement of the older unfinished blocked goal; this document records the actual current user objective without falsely completing that older goal.

One application and shared economic engine support customer-product and custom internal API/agent workflow audits. Anonymous cost preview precedes signup; customers can use Stripe or reviewed revenue files. Include inference, supplied tool/compute/review costs, revenue/customer associations, workflow outcomes and explicit uncertainty. Preserve saved versions and evidence-backed executive reports. The September 7 approved plan is self-serve monthly subscriptions at $349/company/month, plus private complimentary invitations until revoked. The agent owns implementation, reviewed migrations and deployment; Stephen owns customer validation. Current hosted blockers are recorded in `V1-PRODUCTION-DELIVERY.md`.

## Decisions and defaults

- Preserve existing research, prototype and historical audits. New versioned audit endpoints and tables replace the flawed computation path for new audits. Old reports are historical, not recomputed or relabeled silently.
- Public preview: limited cost/readiness output, bounded upload, no revenue/profit/report leakage. Anonymous evidence expires after one hour; a one-time ownership claim requires verified auth and tenant membership.
- Subscription: one company, recurring audits and reruns within technical limits, no monitoring. No trial and no automatic refunds. Cancellation at period end; failed/unpaid subscriptions cannot create new full reports. Existing saved reports remain exportable during the retention window.
- Raw anonymous uploads: one hour. Authenticated normalized evidence: proposed 90 days; derived reports: proposed 12 months. Retention must be approved before public intake. No cross-customer benchmarks or aggregate retention without consent. Deletion/export must cover retained evidence, not merely hide the UI.
- Recognized revenue files require explicit customer confirmation, a period/currency and stable identifiers. CSV usage does not supply an alternate hidden revenue source. Stripe invoices/collections keep their billing basis; customer review is required before a schedule can be used as period revenue. Never add overlapping revenue sources.
- Revenue N/A for internal audits. Capacity value is an estimate based on supplied baseline/after effort and loaded labor rate; it is not automatically cash savings. Cost per accepted outcome includes rejected/failed work; missing costs or incomplete cohorts withhold the complete ratio.
- Evidence, economics and outcome evidence are separate report-card axes. GPp1M is secondary and conditional. Unknown price is not zero. Reference-priced costs keep profit Modeled, even with directly mapped revenue.
- Preserve engine ownership of parsing/math and application ownership of UI/payment interaction. Use server-side entitlement checks. Read-only client Stripe OAuth is separate from InfFyn's own subscription billing.
- Production billing, public price, retention and general-availability activation remain fail-closed switches. No live charge, deployment, migration apply, customer intake or outbound customer communication is performed merely to test local code.

## Implementation scope

Engine: `engine/app/v2/`, app registration/config/auth hardening, Stripe read-path correction and tests. Application: new audit experience, public preview, authenticated v2 proxy, billing interaction, existing auth handoff/entry points and related shared types/styles. Database: additive migration 0012 plus matching rollback, independent of the proposed OpsX columns in 0011. Documents, normalized templates, fixtures and release verification belong to this build. Unrelated application modules and prior research remain preserved.

## Delivery sequence and evidence

1. Pure, versioned economic contract and adversarial golden tests.
2. Tenant-scoped persistence, anonymous handoff, reproducibility and expiration/deletion controls.
3. Server-enforced subscriptions with signed webhook handling, duplicate/out-of-order protection and test-mode acceptance.
4. Product/internal UI, readiness, mappings, reports, export, return visit and billing states.
5. Local integration/browser/security/math tests, build and a concrete release runbook. Provider/DB acceptance is reported separately; synthetic behavior is never labeled live-provider E2E.

## Current checkpoint

Baseline `57e324c35d1ebfe05adab0917f021358d83cb67d`, original branch `feat/landing-cream-hero`; build branch `codex/inffyn-v1-build`. The revised engine, app, additive migration, billing boundary, templates and founder packet are implemented. Local math/API/database/browser validation passes; see [verification record](V1-VERIFICATION.md). Existing untracked outputs/research/prototype are preserved. Hosted deployment and real-provider acceptance remain gated. No deployment, provider mutation, or new payment has occurred.
