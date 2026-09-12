"""Stripe Connect revenue sync → revenue_events (read-only, idempotent)."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException
from stripe import AuthenticationError, PermissionError, RateLimitError, StripeError
from supabase import Client

from app.stripe.oauth import (
    get_access_token_for_tenant,
    get_connection_for_tenant,
    mark_connection_status,
)

logger = logging.getLogger(__name__)

SOURCE = "stripe"
MAX_NETWORK_RETRIES = 3
BACKOFF_BASE_SECONDS = 1.0


def _stripe_client(access_token: str) -> None:
    # Auth swap: reads authenticate with the per-tenant Stripe App access token
    # (read-only grants invoice_read + charge_read), NOT the platform secret key +
    # stripe_account header. Everything downstream of this is unchanged.
    stripe.api_key = access_token
    stripe.max_network_retries = MAX_NETWORK_RETRIES


def _parse_cursor(raw: str | None) -> int:
    if not raw:
        return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def _ts_to_iso(unix_ts: int) -> str:
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).isoformat()


def _amount_from_cents(cents: int | None) -> float | None:
    if cents is None:
        return None
    return cents / 100.0


def _product_from_invoice(invoice: dict[str, Any]) -> str | None:
    lines = invoice.get("lines", {}).get("data", [])
    if not lines:
        return None
    first = lines[0]
    price = first.get("price") or {}
    product = price.get("product")
    if isinstance(product, dict):
        return product.get("name") or product.get("id")
    if isinstance(product, str):
        return product
    return first.get("description")


def _normalize_invoice(invoice: dict[str, Any], tenant_id: str) -> dict[str, Any]:
    customer = invoice.get("customer")
    paid_at = invoice.get("status_transitions", {}).get("paid_at") or invoice.get("created")
    return {
        "tenant_id": tenant_id,
        "source": SOURCE,
        "occurred_at": _ts_to_iso(int(paid_at)),
        "amount": _amount_from_cents(invoice.get("amount_paid")),
        "currency": (invoice.get("currency") or "usd").upper(),
        "customer_ref": str(customer) if customer else None,
        "raw_ref": f"stripe:in_{invoice['id']}",
        "confidence": "clean",
        "product": _product_from_invoice(invoice),
        "is_deferred": False,
    }


def _normalize_charge(charge: dict[str, Any], tenant_id: str) -> dict[str, Any]:
    customer = charge.get("customer")
    return {
        "tenant_id": tenant_id,
        "source": SOURCE,
        "occurred_at": _ts_to_iso(int(charge.get("created", 0))),
        "amount": _amount_from_cents(charge.get("amount")),
        "currency": (charge.get("currency") or "usd").upper(),
        "customer_ref": str(customer) if customer else None,
        "raw_ref": f"stripe:ch_{charge['id']}",
        "confidence": "clean",
        "product": None,
        "is_deferred": False,
    }


def _list_with_backoff(list_fn, **params) -> list[dict[str, Any]]:
    """Paginate a Stripe list call with 429 backoff."""
    items: list[dict[str, Any]] = []
    starting_after = None
    while True:
        attempt = 0
        while True:
            try:
                kwargs = dict(params)
                if starting_after:
                    kwargs["starting_after"] = starting_after
                page = list_fn(**kwargs)
                break
            except RateLimitError:
                attempt += 1
                if attempt > 5:
                    raise
                sleep_for = BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                logger.warning("Stripe rate limit — backing off %.1fs", sleep_for)
                time.sleep(sleep_for)
            except (AuthenticationError, PermissionError):
                raise
            except StripeError as exc:
                raise HTTPException(status_code=502, detail=f"Stripe API error: {exc}") from exc

        data = page.get("data", [])
        items.extend(data)
        if not page.get("has_more") or not data:
            break
        starting_after = data[-1]["id"]
    return items


def collect_revenue_records(
    access_token: str,
    tenant_id: str,
    cursor_unix: int,
) -> tuple[list[dict[str, Any]], int]:
    """Pull paid invoices + charges since cursor. Returns records + new cursor."""
    _stripe_client(access_token)
    created_filter = {"gte": cursor_unix} if cursor_unix > 0 else None

    invoice_params: dict[str, Any] = {
        "status": "paid",
        "limit": 100,
    }
    if created_filter:
        invoice_params["created"] = created_filter

    charge_params: dict[str, Any] = {
        "limit": 100,
    }
    if created_filter:
        charge_params["created"] = created_filter

    invoices = _list_with_backoff(stripe.Invoice.list, **invoice_params)
    charges = _list_with_backoff(stripe.Charge.list, **charge_params)

    records: list[dict[str, Any]] = []
    max_created = cursor_unix

    for inv in invoices:
        records.append(_normalize_invoice(inv, tenant_id))
        paid_at = inv.get("status_transitions", {}).get("paid_at") or inv.get("created", 0)
        max_created = max(max_created, int(paid_at))

    for ch in charges:
        if ch.get("paid") is False:
            continue
        if ch.get("invoice"):
            continue
        records.append(_normalize_charge(ch, tenant_id))
        max_created = max(max_created, int(ch.get("created", 0)))

    new_cursor = max_created if records else cursor_unix
    return records, new_cursor


def upsert_revenue_events(supabase: Client, records: list[dict[str, Any]]) -> int:
    if not records:
        return 0
    result = (
        supabase.table("revenue_events")
        .upsert(records, on_conflict="tenant_id,raw_ref")
        .execute()
    )
    if result is None or not result.data:
        return len(records)
    return len(result.data)


def sync_stripe_revenue(supabase: Client, tenant_id: str) -> dict[str, Any]:
    """Full sync for one tenant — fail closed, no partial writes on error."""
    connection = get_connection_for_tenant(supabase, tenant_id)
    if not connection:
        raise HTTPException(status_code=404, detail="No Stripe connection for tenant")
    if connection["status"] not in ("connected", "error"):
        raise HTTPException(
            status_code=400,
            detail=f"Stripe connection status is {connection['status']} — reconnect required",
        )

    cursor = _parse_cursor(connection.get("last_cursor"))

    try:
        # Auth swap: obtain a fresh read-only access token (refreshes + rolls the
        # stored refresh token). A revoked grant raises AuthenticationError → the
        # existing handler below marks the connection needs_reauth.
        access_token = get_access_token_for_tenant(supabase, tenant_id)
        records, new_cursor = collect_revenue_records(access_token, tenant_id, cursor)
        written = upsert_revenue_events(supabase, records)
        now = datetime.now(timezone.utc).isoformat()
        mark_connection_status(
            supabase,
            tenant_id,
            status="connected",
            last_error=None,
            last_sync_at=now,
            last_cursor=str(new_cursor),
        )
        return {
            "status": "connected",
            "rows_synced": written,
            "last_cursor": str(new_cursor),
            "last_sync_at": now,
        }
    except (AuthenticationError, PermissionError) as exc:
        logger.warning("Stripe auth failed for tenant %s: %s", tenant_id, exc)
        mark_connection_status(
            supabase,
            tenant_id,
            status="needs_reauth",
            last_error=str(exc),
        )
        raise HTTPException(status_code=401, detail="Stripe connection revoked — reconnect required") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Stripe sync failed for tenant %s", tenant_id)
        mark_connection_status(
            supabase,
            tenant_id,
            status="error",
            last_error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Stripe sync failed") from exc
