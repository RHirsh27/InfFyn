"""InfFyn's subscription account is separate from customer read-only OAuth."""

from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4

import stripe
from fastapi import HTTPException


def billing_client(settings):
    if (
        not settings.billing_enabled
        or not settings.billing_price_approved
        or not settings.stripe_billing_key
        or not settings.stripe_billing_price_id
    ):
        raise HTTPException(
            503, "Subscription activation is awaiting configuration and price approval."
        )
    key = settings.stripe_billing_key
    if (
        not (key.startswith("sk_test_") or key.startswith("rk_test_"))
        and not settings.billing_live_approved
    ):
        raise HTTPException(503, "Live billing has not been approved.")
    return stripe.StripeClient(
        key, max_network_retries=2, http_client=stripe.HTTPXClient(timeout=20)
    )


def entitled(state, price_id):
    try:
        end = datetime.fromisoformat(
            state.get("current_period_end", "").replace("Z", "+00:00")
        )
    except (ValueError, AttributeError):
        return False
    return bool(
        price_id
        and state.get("price_id") == price_id
        and state.get("status") == "active"
        and end > datetime.now(timezone.utc)
    )


@contextmanager
def billing_lock(repo, tenant):
    operation = str(uuid4())
    if (
        not repo.db.rpc(
            "lock_inffyn_billing", {"p_tenant": tenant, "p_operation": operation}
        )
        .execute()
        .data
    ):
        raise HTTPException(409, "Billing is processing another change. Retry shortly.")
    try:
        yield operation
    finally:
        repo.db.rpc(
            "unlock_inffyn_billing", {"p_tenant": tenant, "p_operation": operation}
        ).execute()


def checkout(repo, tenant, settings):
    client = billing_client(settings)
    price = client.v1.prices.retrieve(settings.stripe_billing_price_id)
    if (
        price.get("currency") != "usd"
        or price.get("unit_amount") != 34900
        or not price.get("active")
        or (price.get("recurring") or {}).get("interval") != "month"
        or (price.get("recurring") or {}).get("interval_count") != 1
    ):
        raise HTTPException(
            503,
            "Configured subscription price does not match the approved monthly offer.",
        )
    if price.get("livemode") and not settings.billing_live_approved:
        raise HTTPException(503, "Live billing has not been approved.")
    with billing_lock(repo, tenant) as operation:
        state = repo.subscription(tenant)
        customer = state.get("customer_id")
        if not customer:
            customer = client.v1.customers.create(
                {"metadata": {"inffyn_tenant_id": tenant}},
                options={"idempotency_key": f"inffyn-customer-{tenant}"},
            )["id"]
            repo.db.table("inffyn_subscriptions").update({"customer_id": customer}).eq(
                "tenant_id", tenant
            ).execute()
        existing = client.v1.subscriptions.list(
            {"customer": customer, "status": "all", "limit": 100}
        )
        if any(
            s["status"] not in ("canceled", "incomplete_expired")
            for s in existing["data"]
        ):
            raise HTTPException(
                409, "A subscription already exists. Use Manage subscription."
            )
        sessions = client.v1.checkout.sessions.list(
            {"customer": customer, "status": "open", "limit": 100}
        )
        for session in sessions["data"]:
            if (
                session.get("mode") == "subscription"
                and session.get("metadata", {}).get("inffyn_tenant_id") == tenant
            ):
                return {"url": session["url"]}
        base = settings.app_base_url.rstrip("/")
        session = client.v1.checkout.sessions.create(
            {
                "mode": "subscription",
                "customer": customer,
                "client_reference_id": tenant,
                "metadata": {"inffyn_tenant_id": tenant},
                "subscription_data": {"metadata": {"inffyn_tenant_id": tenant}},
                "line_items": [
                    {"price": settings.stripe_billing_price_id, "quantity": 1}
                ],
                "success_url": base
                + (
                    "/app/monthly"
                    if getattr(settings, "monthly_enabled", False)
                    else "/app/audits"
                )
                + "?billing=returned",
                "cancel_url": base
                + (
                    "/app/monthly"
                    if getattr(settings, "monthly_enabled", False)
                    else "/app/audits"
                )
                + "?billing=canceled",
                "integration_identifier": "inffyn_audit_v1_qmztxkpa",
            },
            options={"idempotency_key": f"inffyn-checkout-{operation}"},
        )
        return {"url": session["url"]}


def portal(repo, tenant, settings):
    client = billing_client(settings)
    state = repo.subscription(tenant)
    if not state.get("customer_id"):
        raise HTTPException(409, "This company has no subscription customer yet.")
    return {
        "url": client.v1.billing_portal.sessions.create(
            {
                "customer": state["customer_id"],
                "return_url": settings.app_base_url.rstrip("/")
                + (
                    "/app/monthly"
                    if getattr(settings, "monthly_enabled", False)
                    else "/app/audits"
                ),
            }
        )["url"]
    }


def apply_webhook(raw, signature, repo, settings):
    if not settings.stripe_billing_webhook_secret:
        raise HTTPException(503, "Billing webhook is not configured.")
    try:
        event = stripe.Webhook.construct_event(
            raw, signature, settings.stripe_billing_webhook_secret
        )
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(400, "Invalid billing webhook signature.") from None
    if event.get("livemode") and not settings.billing_live_approved:
        raise HTTPException(503, "Live billing has not been approved.")
    obj = event["data"]["object"]
    if event["type"].startswith("customer.subscription."):
        subscription_id = obj["id"]
    elif (
        event["type"] == "checkout.session.completed"
        and obj.get("mode") == "subscription"
    ):
        subscription_id = obj.get("subscription")
    else:
        return {"received": True, "ignored": True}
    tenant = obj.get("metadata", {}).get("inffyn_tenant_id")
    if not tenant or not subscription_id:
        return {"received": True, "ignored": True}
    # The customer was created under a membership-checked, owner-only request.
    prior = repo.subscription(tenant)
    if not prior.get("customer_id") or prior["customer_id"] != obj.get("customer"):
        raise HTTPException(409, "Billing customer association is not established.")
    client = billing_client(settings)
    with billing_lock(repo, tenant):
        # Fetch current provider state while holding the tenant lease. Do not trust an old event body.
        sub = client.v1.subscriptions.retrieve(subscription_id)
        if (
            sub.get("customer") != prior["customer_id"]
            or sub.get("metadata", {}).get("inffyn_tenant_id") != tenant
        ):
            raise HTTPException(409, "Subscription association does not match.")
        items = sub.get("items", {}).get("data", [])
        valid = len(items) == 1 and items[0].get("quantity") == 1
        price_id = items[0].get("price", {}).get("id") if valid else None
        end = items[0].get("current_period_end") if valid else None
        end = end or sub.get("current_period_end")
        state = {
            "customer_id": sub["customer"],
            "subscription_id": sub["id"],
            "status": sub["status"],
            "price_id": price_id,
            "current_period_end": datetime.fromtimestamp(end, timezone.utc).isoformat()
            if end
            else None,
            "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        }
        repo.db.rpc(
            "apply_inffyn_subscription",
            {
                "p_event": event["id"],
                "p_created": event["created"],
                "p_tenant": tenant,
                "p_state": state,
            },
        ).execute()
    return {"received": True}
