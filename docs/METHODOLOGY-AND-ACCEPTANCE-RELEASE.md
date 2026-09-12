# Methodology and infrastructure acceptance preparation

Implemented September 10–11, 2026. This delivery improves the public review experience and prepares verification of the existing InfFyn infrastructure. It does not activate the company workspace or change the commercial offer.

## Public experience

- `/methodology` uses the company typography, warm financial panels, green navigation accents, seven linked sections and keyboard-accessible evidence controls.
- Worked examples load only the existing fixed synthetic `/api/demo/company` response. Shape, provenance, amounts, invoice reconciliation and confidence math are checked before display. Missing or invalid example data leaves the explanation available and identifies the unavailable example.
- Costs reconcile to $43,400: $28,685 inference, $12,815 human review and $1,900 shared subscriptions. The invoice remains $64,000 split $46,000/$18,000. Document contribution is ($1,200); Finance variance is ($220); Support unit cost is about $0.93 and its July-baseline difference is $860. Neither that difference nor modeled capacity is verified cash savings.
- The executive PDF and a 27-file normalized CSV ZIP are downloadable. The ZIP is generated from the August scenario through the real engine. File-only revenue uses customer-supplied IDs and modeled allocations; it does not claim retained Stripe lineage. Company replay is separately tested.
- Only the three designated synthetic files bypass authentication. Unknown `/examples` paths remain protected. The review-mode CTA leads to the public demo.

## Infrastructure preparation

- [Database preflight](DATABASE-PREFLIGHT.md): offline by default, pinned to `jmfzmoqdvweeixxwzlma`, fixed read-only SQL and drift inventory. All 15 existing migrations replay locally. Backups, restoration and hosted tenancy remain unknown.
- [Hosted monthly runner](HOSTED-MONTHLY-ACCEPTANCE.md): real user sessions and two explicitly designated synthetic companies; opt-in writes only. Checks drafts, conflicts, isolation, immutable versions, valid invoice portions with remainder, source snapshots and exports. Empty/missing evidence stays pending.
- [Provider cases](PROVIDER-ACCEPTANCE.md): independent source totals, UTC period, pagination, interrupted import, retries, revocation/reconnection and accounting-basis controls for OpenAI, Anthropic and Stripe. No provider was contacted by the runner.

**All three connectors must pass real authorized acceptance before opening the company workspace.** Database/account access and independently known source totals are required next. No alternative project, new migration, pricing change, public financial API or OS integration was added.

## Verification

| Check | Result |
|---|---|
| Full engine suite | 203 passed via `scripts/test-engine-safe.py`; external network and `.env` loading disabled. Two existing test/dependency warnings remain. |
| Database preflight | 14 offline tests passed, including PostgreSQL read-only enforcement, wrong project, grants and catalog drift. Offline CLI reports `OFFLINE_PREPARED_HOSTED_UNVERIFIED`. |
| Hosted runner assertions | 25 offline tests passed, including injected auth/isolation/CAS/lineage/history failures. Default CLI reports `pending`, `release_ready: false`. |
| Methodology | 7 real-engine mapping/fallback tests passed. Missing source and wrong provenance do not become displayable results. |
| CSV/PDF | Four artifact tests passed, including complete company replay without fabricated provider lineage. Generated package check agrees with scenario inputs; public PDF matches the previously verified artifact. |
| Auth boundaries | Demo-access, middleware-resilience and review-access tests passed after the exact public download allowlist. |
| Local public HTTP | Six methodology checks passed: static explanation, links, three exact file hashes and source fingerprint. |
| Chrome | Desktop hero, section navigation, populated examples and keyboard Tab/Return verified. Phone 390px and 320px and tablet 900px layouts inspected; document width equals viewport content width (no horizontal overflow). Mobile workload/checklist selection works. Temporary viewport override reset. |
| Contrast/responsiveness | Static contrast review: body 13.37:1, muted 5.08:1, example labels 4.76:1; focus 4.33:1 on light and 7.55:1 on dark. Responsive layouts visually checked as above; this is not a complete WCAG conformance audit. |

Native browser print pagination and actual hosted auth/provider/operational acceptance remain open. The standalone executive PDF is an independently rendered artifact; downloading it is not proof that browser print works.

## Deployment and hosted verification

Application deployment `dpl_HppR6TuNiN2hurECtsoKXHS1EnPG` passed the Vercel production build and was promoted to the existing `inffyn-preview` review project on September 11, 2026. The unchanged engine remains the existing review engine. Staged checks confirmed the preview CTA, exact ZIP hash and original synthetic report fingerprint before promotion.

Live URL: [InfFyn methodology](https://inffyn-preview.vercel.app/methodology). The deployed page and loaded invoice example were inspected in Chrome; the tab remains open for the user.

- `node scripts/check-methodology-http.mjs`: 6 hosted checks passed, including exact PDF/ZIP/guide hashes and the synthetic source fingerprint.
- `node scripts/check-hosted-company.mjs`: 8 hosted public demonstration and protected-route checks passed.
- `node scripts/check-hosted-review.mjs https://inffyn-preview.vercel.app`: 19 existing live review checks passed with synthetic inputs only.
- Local production build and Vercel production build passed. Dependency install reported zero vulnerabilities. Vercel warned that Sentry source maps were not uploaded because an auth token was absent; monitoring acceptance remains open.

These 33 hosted public checks do not establish company persistence, real provider imports, backups, restoration or production customer readiness. No live database inspection/migration or provider acceptance run was performed. Both infrastructure runners remain explicitly unverified for those gates.
