"""Read-only, bounded provider imports. No prompts, API-key inventory, or write APIs."""

import csv
import hashlib
import io
import json
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from fastapi import HTTPException

from app.v2.economics import number

COST_HEADERS = [
    "cost_id",
    "date",
    "category",
    "amount",
    "currency",
    "source",
    "customer_id",
    "feature",
    "workflow",
    "team",
    "run_id",
    "model",
    "project_id",
]
REVENUE_HEADERS = [
    "revenue_id",
    "date",
    "amount",
    "currency",
    "customer_id",
    "feature",
    "method",
    "allocation_note",
]
NOTICES = {
    "openai": "Provider-reported aggregate costs. Completion usage is diagnostic and does not include every usage modality. Customer and outcome mappings require your records. Credits, contracts, and invoice basis need review.",
    "anthropic": "Claude Platform aggregate costs and message usage. Priority Tier costs are excluded by the provider cost endpoint; supply these separately if applicable. Enterprise chat subscriptions and cloud-resold usage require separate evidence.",
    "stripe": "Gross paid-invoice collections only. Standalone charges are excluded. Review taxes, refunds, credits, and service periods; collections are not recognized revenue.",
}


def bounds(month):
    start = datetime.fromisoformat(month + "-01T00:00:00+00:00")
    end = start.replace(
        year=start.year + (start.month == 12),
        month=1 if start.month == 12 else start.month + 1,
    )
    return start, min(end, datetime.now(UTC))


def csv_text(records, headers):
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf, fieldnames=headers, extrasaction="ignore", lineterminator="\n"
    )
    writer.writeheader()
    writer.writerows(records)
    return buf.getvalue()


def fetch_json(url, headers, params):
    # Fixed provider URLs only; redirecting with administrative credentials is forbidden.
    with (
        httpx.Client(timeout=20, follow_redirects=False) as client,
        client.stream("GET", url, headers=headers, params=params) as response,
    ):
        if response.status_code in (401, 403):
            raise HTTPException(
                424,
                "Provider access was denied. Check organization permissions or reconnect.",
            )
        if response.status_code == 429:
            raise HTTPException(
                429, "Provider rate limit reached. Wait before resuming this import."
            )
        if response.status_code != 200:
            raise HTTPException(
                502,
                "The provider did not complete this request. Resume later or use CSV.",
            )
        chunks = bytearray()
        for chunk in response.iter_bytes():
            chunks.extend(chunk)
            if len(chunks) > 4_000_000:
                raise HTTPException(
                    413,
                    "Provider response exceeds the import limit. Use a scoped CSV export.",
                )
        return json.loads(chunks, parse_float=Decimal)


def identifier(parts):
    return hashlib.sha256(
        json.dumps(parts, sort_keys=True, default=str).encode()
    ).hexdigest()[:40]


def parse_page(provider, phase, data, source_id, month):
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("data"), list)
        or not isinstance(data.get("has_more"), bool)
    ):
        raise TypeError("Unexpected provider page")
    output = []
    for bucket in data["data"]:
        if provider == "openai":
            day = datetime.fromtimestamp(bucket["start_time"], UTC).date().isoformat()
        else:
            day = datetime.fromisoformat(bucket["starting_at"]).date().isoformat()
        if day[:7] != month or not isinstance(bucket.get("results"), list):
            raise ValueError("Unexpected provider period")
        for row in bucket["results"]:
            project = (
                row.get("project_id" if provider == "openai" else "workspace_id")
                or "default"
            )
            model = row.get("model") or ""
            description = (
                row.get("line_item" if provider == "openai" else "description") or ""
            )
            if not all(
                isinstance(x, str) and len(x) <= 1000
                for x in (project, model, description)
            ):
                raise ValueError("Unexpected provider dimensions")
            identity = identifier([source_id, phase, day, project, model, description])
            if phase == "costs":
                if provider == "openai":
                    amount = row["amount"]["value"]
                    currency = row["amount"]["currency"]
                else:
                    amount, currency = row["amount"], row["currency"]
                if str(currency).lower() != "usd":
                    raise ValueError("Non-USD provider currency")
                amount = number(amount, "provider cost", signed=True) / (
                    100 if provider == "anthropic" else 1
                )
                detail = description.lower()
                category = (
                    "tools"
                    if "search" in detail
                    else "compute"
                    if "code" in detail
                    else "inference"
                    if model
                    or any(x in detail for x in ("token", "gpt", "claude", "embedding"))
                    else "other"
                )
                output.append(
                    {
                        "cost_id": provider + ":" + identity,
                        "date": day,
                        "category": category,
                        "amount": str(amount),
                        "currency": "USD",
                        "source": f"{provider} cost API / {description or 'unspecified line item'} / {source_id}",
                        "model": model,
                        "project_id": project,
                    }
                )
            else:
                # Retain observed fields without converting aggregate tokens into fake runs.
                fields = (
                    (
                        "input_tokens",
                        "output_tokens",
                        "input_cached_tokens",
                        "num_model_requests",
                    )
                    if provider == "openai"
                    else (
                        "uncached_input_tokens",
                        "cache_read_input_tokens",
                        "output_tokens",
                    )
                )
                record = {
                    "id": provider + ":" + identity,
                    "date": day,
                    "project_id": project,
                    "model": model,
                }
                for key in fields:
                    record[key] = (
                        str(number(row[key], key, integer=True))
                        if key in row and row[key] is not None
                        else None
                    )
                if provider == "anthropic":
                    record["cache_creation"] = {
                        key: str(number(value, key, integer=True))
                        for key, value in (row.get("cache_creation") or {}).items()
                        if key
                        in ("ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens")
                    }
                output.append(record)
    next_page = data.get("next_page")
    if data["has_more"] and (
        not isinstance(next_page, str) or not next_page or len(next_page) > 2000
    ):
        raise ValueError("Missing provider pagination cursor")
    return output, next_page if data["has_more"] else None


def provider_page(provider, credential, month, cursor, source_id, fetch=fetch_json):
    start, end = bounds(month)
    phase = cursor.get("phase", "costs")
    if phase not in ("costs", "usage"):
        raise ValueError("Unknown import phase")
    if provider == "openai":
        url = "https://api.openai.com/v1/organization/" + (
            "costs" if phase == "costs" else "usage/completions"
        )
        headers = {"Authorization": "Bearer " + credential}
        params = {
            "start_time": int(start.timestamp()),
            "end_time": int(end.timestamp()),
            "bucket_width": "1d",
            "limit": 31,
            "group_by": ["project_id", "line_item"]
            if phase == "costs"
            else ["project_id", "model"],
        }
    else:
        url = "https://api.anthropic.com/v1/organizations/" + (
            "cost_report" if phase == "costs" else "usage_report/messages"
        )
        headers = {
            "x-api-key": credential,
            "anthropic-version": "2023-06-01",
            "User-Agent": "InfFyn/1.0",
        }
        params = {
            "starting_at": start.isoformat(),
            "ending_at": end.isoformat(),
            "bucket_width": "1d",
            "limit": 31,
            "group_by[]": ["workspace_id", "description"]
            if phase == "costs"
            else ["workspace_id", "model"],
        }
    if cursor.get("page"):
        params["page"] = cursor["page"]
    data = fetch(url, headers, params)
    values, next_page = parse_page(provider, phase, data, source_id, month)
    if next_page == cursor.get("page") and next_page:
        raise ValueError("Provider repeated pagination cursor")
    next_cursor = (
        {"phase": phase, "page": next_page}
        if next_page
        else {"phase": "usage"}
        if phase == "costs"
        else {"phase": "done"}
    )
    return phase, values, next_cursor


def stripe_page(token, month, cursor, source_id, fetch=fetch_json):
    start, end = bounds(month)
    # Invoice creation time is not collection time. Scan paid invoices in bounded pages.
    params = {"status": "paid", "limit": 100}
    if cursor.get("page"):
        params["starting_after"] = cursor["page"]
    data = fetch(
        "https://api.stripe.com/v1/invoices",
        {"Authorization": "Bearer " + token},
        params,
    )
    if not isinstance(data.get("data"), list) or not isinstance(
        data.get("has_more"), bool
    ):
        raise TypeError("Unexpected Stripe page")
    values = []
    for row in data["data"]:
        paid = (row.get("status_transitions") or {}).get("paid_at")
        if paid is None:
            continue
        if start.timestamp() <= paid < end.timestamp():
            if row["currency"] != "usd":
                raise ValueError("Non-USD Stripe invoice")
            customer = row.get("customer")
            if customer is not None and not isinstance(customer, str):
                raise ValueError("Unexpected customer")
            values.append(
                {
                    "revenue_id": row["id"],
                    "date": datetime.fromtimestamp(paid, UTC).date().isoformat(),
                    "amount": str(
                        number(row["amount_paid"], "invoice amount", integer=True) / 100
                    ),
                    "currency": "USD",
                    "customer_id": customer or "",
                    "feature": "",
                    "method": "direct",
                    "allocation_note": NOTICES["stripe"],
                }
            )
    if data["has_more"]:
        if not data["data"] or data["data"][-1]["id"] == cursor.get("page"):
            raise ValueError("Invalid Stripe cursor")
        next_cursor = {"page": data["data"][-1]["id"]}
    else:
        next_cursor = {"phase": "done"}
    return "revenue", values, next_cursor


def merge_page(evidence, phase, records):
    evidence = {k: list(v) for k, v in evidence.items()}
    key = {"costs": "cost_id", "usage": "id", "revenue": "revenue_id"}[phase]
    old = {x[key]: x for x in evidence[phase]}
    for record in records:
        if record[key] in old:
            raise ValueError("Overlapping provider buckets")
        old[record[key]] = record
    evidence[phase] = list(old.values())
    if len(old) > 20000 or len(json.dumps(evidence).encode()) > 3_500_000:
        raise HTTPException(
            413, "Import exceeds the retained evidence limit. Use a scoped CSV export."
        )
    return evidence
