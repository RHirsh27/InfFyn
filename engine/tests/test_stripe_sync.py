from unittest.mock import MagicMock, patch

import stripe

from app.stripe.sync import (
    _normalize_charge,
    _normalize_invoice,
    collect_revenue_records,
    sync_stripe_revenue,
)


def test_normalize_invoice_maps_customer_and_raw_ref():
    inv = {
        "id": "in_123",
        "customer": "cus_abc",
        "amount_paid": 5000,
        "currency": "usd",
        "created": 1700000000,
        "status_transitions": {"paid_at": 1700000100},
        "lines": {
            "data": [
                {
                    "description": "Pro plan",
                    "price": {"product": {"id": "prod_x", "name": "Pro"}},
                }
            ]
        },
    }
    row = _normalize_invoice(inv, "tenant-1")
    assert row["tenant_id"] == "tenant-1"
    assert row["customer_ref"] == "cus_abc"
    assert row["raw_ref"] == "stripe:in_in_123"
    assert row["amount"] == 50.0
    assert row["currency"] == "USD"
    assert row["product"] == "Pro"
    assert row["source"] == "stripe"


def test_normalize_charge_skips_invoice_linked_in_sync_layer():
    ch = {
        "id": "ch_456",
        "customer": "cus_def",
        "amount": 1200,
        "currency": "eur",
        "created": 1700000200,
        "paid": True,
    }
    row = _normalize_charge(ch, "tenant-2")
    assert row["raw_ref"] == "stripe:ch_ch_456"
    assert row["customer_ref"] == "cus_def"
    assert row["amount"] == 12.0
    assert row["product"] is None


# ── Double-count guard: an invoice + its linked charge → exactly ONE row ──────
# (Unit-level mirror of the live Northwind $200 fixture. Auth mocking changed —
#  reads now authenticate with the access token and pass NO stripe_account — but
#  the dedup logic must be byte-for-byte unchanged.)
def test_collect_dedupes_invoice_linked_charge_and_omits_stripe_account():
    # $200 subscription: one paid invoice AND its linked charge (same payment),
    # plus one unrelated standalone charge.
    invoice = {
        "id": "in_1",
        "customer": "cus_NW",  # Northwind-style
        "amount_paid": 20000,  # $200.00
        "currency": "usd",
        "created": 1700000000,
        "status_transitions": {"paid_at": 1700000100},
        "lines": {"data": [{"description": "Subscription", "price": {"product": "prod_1"}}]},
    }
    charge_linked = {
        "id": "ch_1",
        "customer": "cus_NW",
        "amount": 20000,
        "currency": "usd",
        "created": 1700000100,
        "paid": True,
        "invoice": "in_1",  # ← carries an invoice, must be skipped
    }
    charge_standalone = {
        "id": "ch_2",
        "customer": "cus_X",
        "amount": 500,
        "currency": "usd",
        "created": 1700000200,
        "paid": True,
    }

    with patch.object(
        stripe.Invoice, "list", return_value={"data": [invoice], "has_more": False}
    ) as inv_list, patch.object(
        stripe.Charge,
        "list",
        return_value={"data": [charge_linked, charge_standalone], "has_more": False},
    ) as chg_list:
        records, new_cursor = collect_revenue_records("sk_access_token", "tenant-1", 0)

    raw_refs = {r["raw_ref"] for r in records}
    # The $200 payment appears exactly ONCE (the invoice); the linked charge is skipped.
    assert raw_refs == {"stripe:in_in_1", "stripe:ch_ch_2"}
    assert "stripe:ch_ch_1" not in raw_refs
    assert len(records) == 2

    invoice_row = next(r for r in records if r["raw_ref"] == "stripe:in_in_1")
    assert invoice_row["amount"] == 200.0  # not 400 — no double count
    assert invoice_row["customer_ref"] == "cus_NW"

    # New auth surface: NO stripe_account param on either list call.
    assert "stripe_account" not in inv_list.call_args.kwargs
    assert "stripe_account" not in chg_list.call_args.kwargs
    assert inv_list.call_args.kwargs.get("status") == "paid"
    assert new_cursor >= 1700000100


# ── sync_stripe_revenue: new access-token auth seam + idempotent upsert key ───
def test_sync_uses_access_token_and_idempotent_upsert():
    supabase = MagicMock()
    revenue_table = MagicMock()
    conn_table = MagicMock()
    supabase.table.side_effect = lambda name: revenue_table if name == "revenue_events" else conn_table
    revenue_table.upsert.return_value.execute.return_value = MagicMock(data=[{"raw_ref": "stripe:in_in_1"}])

    connection = {"stripe_account_id": "acct_1", "status": "connected", "last_cursor": "0"}
    records = [{"tenant_id": "tenant-1", "raw_ref": "stripe:in_in_1", "amount": 200.0}]

    with patch("app.stripe.sync.get_connection_for_tenant", return_value=connection), patch(
        "app.stripe.sync.get_access_token_for_tenant", return_value="sk_access_xyz"
    ) as get_token, patch(
        "app.stripe.sync.collect_revenue_records", return_value=(records, 1700000100)
    ) as collect, patch(
        "app.stripe.sync.mark_connection_status"
    ) as mark:
        result = sync_stripe_revenue(supabase, "tenant-1")

    # New auth seam is used, and the access token (not an account id) drives collection.
    get_token.assert_called_once_with(supabase, "tenant-1")
    collect.assert_called_once_with("sk_access_xyz", "tenant-1", 0)
    # Idempotency key unchanged: upsert on (tenant_id, raw_ref).
    revenue_table.upsert.assert_called_once_with(records, on_conflict="tenant_id,raw_ref")
    assert result["status"] == "connected"
    assert mark.call_args.kwargs["status"] == "connected"
