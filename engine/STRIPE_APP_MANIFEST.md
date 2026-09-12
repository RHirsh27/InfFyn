# InfFyn Stripe App — manifest rationale (read-only)

**Status:** Step 1 of the Stripe App migration — the manifest only. No OAuth code, `sync.py`, or
schema changes are made in this step. This file locks *exactly what access InfFyn requests*, which is
the trust promise made machine-enforceable: read-only, minimal, provable at the permission level.

The manifest is `engine/stripe-app.json`.

## Why a Stripe App at all

Stripe removed read-only Connect OAuth. Read-only access is now only available through a Stripe App
(`stripe_api_access_type: "oauth"`). The Stripe App becomes the shared integration going forward — it
is the artifact that "survives relaunch," replacing the dead Connect app
`ca_UrNtGDMr6c6WxcE7354XVzrCXmtFUe74`.

## The permission set — minimal, read-only, every grant justified by a real read

InfFyn's sync reads **exactly two** Stripe objects. The engine performs **no `expand` calls** anywhere
(verified by grep), so the only permissions required are for the two objects it lists directly.

| Grant | Stripe object | Where the code reads it | Why it's needed |
|---|---|---|---|
| `invoice_read` | Invoices | `stripe.Invoice.list` — `engine/app/stripe/sync.py:159`; normalized in `_normalize_invoice` (`sync.py:69`, reading `amount_paid`:76, `currency`:77, `customer`:70, `status_transitions.paid_at`/`created`:71, `id`:79) | The **primary revenue source** for the audit (`stripe:in_...`). |
| `charge_read` | Charges (and Refunds) | `stripe.Charge.list` — `engine/app/stripe/sync.py:160`; dedup at `sync.py:170-175` | Needed for the **double-count dedup**: a charge that carries an invoice is skipped (`if ch.get("invoice"): continue`, `sync.py:173`) so invoice + charge revenue isn't counted twice. This is the exact logic the double-count fixture depends on. |

**No write permission of any kind is requested.** A grep for Stripe write verbs
(`create/update/modify/delete/capture/cancel/refund/pay`) across `engine/app` returns nothing — the
integration is read-only by construction, and the manifest makes that fact enforceable at Stripe's
permission layer. `charge_read` grants read on Charges *and* Refunds; no refund is ever created.

## Candidate permissions deliberately DROPPED

The task's candidate list included `customer_read`, `plan_read`, and `product_read`. None are actually
exercised by the current code, so all three are dropped — minimal footprint wins:

- **`customer_read` — dropped.** Per-customer attribution uses `customer_ref`, which is the customer
  **ID string embedded on the invoice/charge** (`invoice.get("customer")` `sync.py:70`,
  `charge.get("customer")` `sync.py:87`). That ID comes free with `invoice_read`/`charge_read`. The
  code never retrieves, lists, or expands a `Customer` object, so `customer_read` is not required.
- **`plan_read` (Prices) / `product_read` — dropped.** `_product_from_invoice` (`sync.py:55-66`) reads
  `lines.data[].price.product`, which is embedded in the invoice line as an **ID string** (no expand).
  The `isinstance(product, dict)` branch (`sync.py:62-63`) only fires if the product were expanded — it
  isn't — so the code always falls to the string/`description` path. Stripe requires these grants only
  when you **expand** into Price/Product objects; the engine never does. The `product` axis also
  degrades gracefully to `first.get("description")` (`sync.py:66`) if a name isn't present.

**None added.** Every object the code reads is covered by the two grants above.

### If scope ever expands later (not now)

- Want real customer **names** (not IDs) on the per-customer view → add `customer_read`.
- Want product **names** via `expand=["data.lines.data.price.product"]` → add `product_read` (+ `plan_read`
  if expanding the Price). Only add these alongside the code change that actually performs the expand.

## Manifest fields of note

- `stripe_api_access_type: "oauth"` — read-only server-side OAuth app (matches the OAuth 2.0 swap).
- `sandbox_install_compatible: true` — allows **test-mode / sandbox installs**, so this can be exercised
  in Stripe test mode via an "External test" OAuth link. App review only gates *public launch*, not
  testing — this is how the double-count verdict finally gets unblocked.
- `allowed_redirect_uris` — reuses the existing engine callback path `/stripe/connect/callback`
  (`engine/app/main.py:127`). **Confirm the production host** and set both entries to match
  `STRIPE_OAUTH_REDIRECT_URI` before testing (the Render host below is a placeholder to verify).
- No `ui_extension` — InfFyn has no Stripe Dashboard views; it's a backend reader only.

## What this manifest does NOT change (next steps — separate tasks)

This is manifest-only, zero working code touched. The remaining ~3–4 dev-days:

1. **`engine/app/stripe/oauth.py`** — swap the dead Connect OAuth endpoints for the Stripe App OAuth 2.0
   authorize/token flow.
2. **`engine/app/stripe/sync.py`** — auth swap only (use the app access token instead of
   `stripe_account`). The sync/dedup/double-count logic is auth-agnostic and does **not** change.
3. **`stripe_connections` schema** — store the encrypted read-only **refresh token** for the app grant.

## Confirmation

The manifest reflects the trust promise: **read-only, minimal, and "we never write to your Stripe" is
now provable at the permission level** — two read grants, zero write grants, every grant tied to a real
read in `sync.py`.
