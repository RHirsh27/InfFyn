from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.v2.billing import checkout, apply_webhook, billing_client
from app.v2.stripe_evidence import invoice_evidence
from datetime import date, datetime, timezone


@contextmanager
def unlocked(*args):
    yield "synthetic-operation"


def settings(**updates):
    return SimpleNamespace(
        **{
            "billing_enabled": True,
            "billing_price_approved": True,
            "billing_live_approved": False,
            "stripe_billing_key": "sk_test_synthetic_unused",
            "stripe_billing_price_id": "price_test",
            "stripe_billing_webhook_secret": "whsec_synthetic_unused",
            "app_base_url": "https://example.test",
            **updates,
        }
    )


def test_checkout_uses_separate_client_and_reuses_open_session():
    repo = MagicMock()
    repo.subscription.return_value = {"customer_id": "cus_test"}
    client = MagicMock()
    client.v1.prices.retrieve.return_value = {
        "currency": "usd",
        "unit_amount": 34900,
        "active": True,
        "recurring": {"interval": "month", "interval_count": 1},
        "livemode": False,
    }
    client.v1.subscriptions.list.return_value = {"data": []}
    client.v1.checkout.sessions.list.return_value = {
        "data": [
            {
                "mode": "subscription",
                "metadata": {"inffyn_tenant_id": "tenant"},
                "url": "https://checkout.stripe.com/test",
            }
        ]
    }
    with (
        patch("app.v2.billing.billing_client", return_value=client),
        patch("app.v2.billing.billing_lock", unlocked),
    ):
        assert checkout(repo, "tenant", settings()) == {
            "url": "https://checkout.stripe.com/test"
        }
    client.v1.checkout.sessions.create.assert_not_called()
    client.v1.customers.create.assert_not_called()


def test_wrong_price_and_live_key_fail_before_checkout():
    with pytest.raises(HTTPException):
        billing_client(settings(stripe_billing_key="sk_live_synthetic_unused"))
    client = MagicMock()
    client.v1.prices.retrieve.return_value = {
        "currency": "usd",
        "unit_amount": 14900,
        "active": True,
        "recurring": None,
    }
    with (
        patch("app.v2.billing.billing_client", return_value=client),
        pytest.raises(HTTPException),
    ):
        checkout(MagicMock(), "tenant", settings())
    client.v1.checkout.sessions.create.assert_not_called()


def test_subscription_event_uses_current_resource_inside_tenant_lease():
    event = {
        "id": "evt_new",
        "type": "customer.subscription.updated",
        "created": 200,
        "livemode": False,
        "data": {
            "object": {
                "id": "sub_test",
                "customer": "cus_test",
                "metadata": {"inffyn_tenant_id": "tenant"},
                "status": "active",
            }
        },
    }
    repo = MagicMock()
    repo.subscription.return_value = {"customer_id": "cus_test"}
    client = MagicMock()
    client.v1.subscriptions.retrieve.return_value = {
        "id": "sub_test",
        "customer": "cus_test",
        "metadata": {"inffyn_tenant_id": "tenant"},
        "status": "past_due",
        "items": {
            "data": [
                {
                    "quantity": 1,
                    "price": {"id": "price_test"},
                    "current_period_end": 1900000000,
                }
            ]
        },
    }
    with (
        patch("app.v2.billing.stripe.Webhook.construct_event", return_value=event),
        patch("app.v2.billing.billing_client", return_value=client),
        patch("app.v2.billing.billing_lock", unlocked),
    ):
        assert apply_webhook(b"{}", "signature", repo, settings())["received"]
    name, args = repo.db.rpc.call_args.args
    assert (
        name == "apply_inffyn_subscription" and args["p_state"]["status"] == "past_due"
    )
    assert args["p_event"] == "evt_new" and args["p_tenant"] == "tenant"


def test_wrong_customer_webhook_cannot_assign_subscription():
    event = {
        "type": "customer.subscription.updated",
        "livemode": False,
        "data": {
            "object": {
                "id": "sub",
                "customer": "wrong",
                "metadata": {"inffyn_tenant_id": "tenant"},
            }
        },
    }
    repo = MagicMock()
    repo.subscription.return_value = {"customer_id": "right"}
    with (
        patch("app.v2.billing.stripe.Webhook.construct_event", return_value=event),
        pytest.raises(HTTPException),
    ):
        apply_webhook(b"{}", "sig", repo, settings())
    repo.db.rpc.assert_not_called()


def test_old_invoice_paid_in_period_is_reviewable_collections_not_revenue():
    paid = int(datetime(2026, 8, 10, tzinfo=timezone.utc).timestamp())
    client = MagicMock()
    client.v1.invoices.list.return_value.auto_paging_iter.return_value = iter(
        [
            {
                "id": "in_old",
                "created": 1,
                "status_transitions": {"paid_at": paid},
                "currency": "usd",
                "amount_paid": 25001,
                "customer": "cus_test",
            }
        ]
    )
    result = invoice_evidence(client, date(2026, 8, 1), date(2026, 8, 31))
    assert result["revenue_basis"] == "collections" and result["review_required"]
    assert "250.01" in result["revenue_csv"] and "refunds" in result["notice"]
    assert "created" not in client.v1.invoices.list.call_args.args[0]
