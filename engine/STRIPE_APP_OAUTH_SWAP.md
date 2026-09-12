# Stripe App OAuth swap — build notes + test path (steps 2–4)

Revives read-only Stripe connect via the Stripe App OAuth 2.0 flow (the read-only Connect OAuth
was retired). **Auth mechanism changes; sync/dedup/double-count logic does not.**

## What changed

| Piece | File | Change |
|---|---|---|
| OAuth 2.0 | `engine/app/stripe/oauth.py` | Authorize → `marketplace.stripe.com/oauth/v2/authorize`; token/refresh → `POST api.stripe.com/v1/oauth/token` (HTTP Basic with the app developer secret key). Stores the **encrypted refresh token**; adds `get_access_token_for_tenant` (refresh → rolls token → returns access token). Signed HMAC state kept. |
| Callback | `engine/app/main.py` | `/stripe/connect/callback` now calls `exchange_code_for_tokens` + `upsert_connection(…, refresh_token)`. `/stripe/connect/start` still returns `{ authorize_url }` — **contract preserved**. |
| Encryption | `engine/app/stripe/crypto.py` (new) | Fernet encrypt/decrypt; key = `STRIPE_TOKEN_ENC_KEY` (Render env only). |
| Config | `engine/app/config.py` | Adds `stripe_app_client_id`, `stripe_token_enc_key`; retires `stripe_connect_client_id`/`stripe_oauth_client_secret` (kept as ignored fields so old env doesn't error). |
| Schema | `supabase/migrations/0009_stripe_app_oauth_refresh_token.sql` (+ rollback) | Adds `refresh_token_encrypted TEXT`; narrows the `authenticated` SELECT grant to non-secret columns. RLS/FORCE RLS + tenant policy unchanged. |
| Sync auth | `engine/app/stripe/sync.py` | `stripe.api_key = <access token>`; dropped the `stripe_account` param. Dedup, per-customer attribution, and idempotent upsert unchanged. |
| Dep | `engine/requirements.txt` | Adds `cryptography>=42.0.0`. |

## sync.py — auth-only diff (everything else byte-for-byte)

Only three things changed in `sync.py`:
1. `_stripe_client(access_token)` sets `stripe.api_key = access_token` (was the platform secret key).
2. `collect_revenue_records(access_token, …)` no longer passes `stripe_account` to `Invoice.list` / `Charge.list`.
3. `sync_stripe_revenue` calls `get_access_token_for_tenant(...)` before collecting.

Unchanged and verified present: the charge-with-invoice skip (`if ch.get("invoice"): continue`),
`raw_ref` = `stripe:in_…` / `stripe:ch_…`, the idempotent upsert `on_conflict="tenant_id,raw_ref"`,
per-customer `customer_ref`, cursor logic, and the `(AuthenticationError, PermissionError) → needs_reauth`
recovery path (a revoked grant now surfaces via the refresh call and hits that same handler).

## Read-only + security posture

- **Read-only:** matches the manifest's two grants (`invoice_read` + `charge_read`). No write path exists;
  the access token can only do what the installed app was granted.
- **Refresh token encrypted at rest** (Fernet); key on Render only, never in repo or DB. Tokens roll on
  every refresh and the rolled token is re-encrypted and persisted.
- **CSRF:** the HMAC-signed, TTL-bound `state` (`oauth_state.py`) is unchanged.
- **RLS preserved:** the encrypted column is excluded from the `authenticated` grant; the engine reads it
  with the service-role key. anon/public stay revoked.
- **`{ authorize_url }` contract preserved** — the dashboard `ConnectStripeButton` flow still works.

---

## Ryan's checklist (do before testing)

1. **Generate the Fernet key** and set it on **Render (engine)** as `STRIPE_TOKEN_ENC_KEY`:
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
2. **Upload the app** (test mode) so it has an OAuth client id:
   from `engine/`: `stripe apps upload` → open the app's **External test** tab.
3. From the **External test → Test OAuth** section, copy the **test-mode** authorize link. Set on Render:
   - `STRIPE_APP_CLIENT_ID` = the `client_id` in that link.
   - `STRIPE_OAUTH_REDIRECT_URI` = your engine callback, e.g. `https://<engine-host>/stripe/connect/callback`
     — and make sure that exact URL is in the manifest's `allowed_redirect_uris` (update the placeholder host
     in `engine/stripe-app.json`, re-upload).
   - `STRIPE_SECRET_KEY` = InfFyn's **test-mode** secret key (`sk_test_…`) — used only for the token exchange.
4. **Apply the migration** to `jmfzmoqdvweeixxwzlma` from repo (source of truth):
   `supabase db push` (MCP is read/inspect only — don't apply via MCP). Confirm with `supabase migration list`
   that `0009` is the new head.
5. Redeploy the engine so the new deps + env load.

## Test path — connect → sync → double-count verdict

1. **Connect:** in the app, click **Connect Stripe** (or open the test authorize link directly). Approve the
   read-only permissions on the InfFyn **test** account → you're redirected to `…/stripe/connect/callback` →
   `/app?stripe=connected`. Confirm a `stripe_connections` row: `status='connected'`, `scope='read_only'`,
   `refresh_token_encrypted` populated (ciphertext, not readable as a token).
2. **Sync:** trigger `/stripe/sync?background=false` (or the dashboard re-run). It refreshes the token, reads
   paid invoices + charges, and upserts `revenue_events`.
3. **Double-count check (the payoff):** the staged fixture is **Northwind Analytics** (`cus_UrOYhCZlk7E80p`)
   with the **$200 subscription** (invoice + its charge). After sync, verify Northwind's revenue is **$200,
   not $400** — exactly one `revenue_events` row for that payment (the `stripe:in_…` invoice row; the
   charge is skipped because it carries an invoice). That confirms the dedup holds under the new auth.
4. **Idempotency:** run sync again — no new rows (upsert on `(tenant_id, raw_ref)`), revenue still $200.
5. **Recovery:** revoke the app on the test account → next sync's refresh is rejected →
   `AuthenticationError` → connection flips to `needs_reauth` (not a hard crash).

Passing 3–4 is the double-count verdict that gets v1 to **verified**.

## Follow-up (not in this task)

The Stripe tests (`test_stripe_sync.py`, `test_stripe_sync_recovery.py`, `test_stripe_api.py`) assert the
**old** signatures (`stripe_account` param, `exchange_code_for_account_id`, platform-key client). They need a
companion update to mock `get_access_token_for_tenant` / the refresh exchange and drop `stripe_account`. Flagging
so CI is updated alongside — happy to do it next.
