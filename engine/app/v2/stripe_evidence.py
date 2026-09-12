"""Read-only billing evidence for review; never silently recognized revenue."""

import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal

import stripe
from fastapi import HTTPException

from .billing import billing_lock


def invoice_evidence(client, start: date, end: date):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "revenue_id",
            "date",
            "amount",
            "currency",
            "customer_id",
            "feature",
            "method",
            "review_note",
        ]
    )
    # Do not filter on creation time: an old invoice may be paid in this period.
    iterator = client.v1.invoices.list(
        {"status": "paid", "limit": 100}
    ).auto_paging_iter()
    count, included = 0, 0
    for invoice in iterator:
        count += 1
        if count > 20000:
            raise HTTPException(
                422,
                "Stripe history exceeds the v1 read limit. Use a reviewed revenue export for this period.",
            )
        paid_at = invoice.get("status_transitions", {}).get("paid_at")
        if not paid_at:
            continue
        day = datetime.fromtimestamp(paid_at, timezone.utc).date()
        if not start <= day <= end:
            continue
        if invoice.get("currency") != "usd":
            raise HTTPException(
                422,
                "This period contains non-USD invoices. Supply a reviewed USD revenue file with conversion basis.",
            )
        customer = invoice.get("customer")
        if isinstance(customer, dict):
            customer = customer.get("id")
        writer.writerow(
            [
                invoice["id"],
                str(day),
                str(Decimal(invoice["amount_paid"]) / 100),
                "USD",
                customer or "",
                "",
                "direct",
                "Gross invoice collections. Review refunds, credits, tax and service periods before use.",
            ]
        )
        included += 1
    return {
        "revenue_csv": output.getvalue(),
        "revenue_basis": "collections",
        "rows": included,
        "review_required": True,
        "notice": "Gross paid-invoice collections only. Standalone charges are excluded. Review refunds, credits, tax and period recognition; edit or replace this evidence before confirming it.",
    }


def collect(repo, tenant, start, end):
    from app.stripe.oauth import get_access_token_for_tenant

    with billing_lock(repo, tenant):
        token = get_access_token_for_tenant(repo.db, tenant)
        client = stripe.StripeClient(
            token, max_network_retries=2, http_client=stripe.HTTPXClient(timeout=20)
        )
        return invoice_evidence(client, start, end)
