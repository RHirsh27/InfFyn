"""Offline, append-only economic evidence harness. No application/provider imports."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, getcontext
from pathlib import Path

getcontext().prec = 50
METERS = ("input_uncached", "input_cached", "cache_write", "output")
ZERO = Decimal("0")


class EvidenceError(ValueError):
    pass


def decimal(value):
    if isinstance(value, bool) or isinstance(value, float) or not isinstance(value, (str, int, Decimal)):
        raise EvidenceError("Amounts and rates must be decimal strings, never binary floats")
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise EvidenceError("Invalid decimal") from exc
    if not result.is_finite() or abs(result) >= Decimal("1e18") or result.as_tuple().exponent < -12:
        raise EvidenceError("Decimal must be finite, below 1e18, with at most 12 decimal places")
    return result


def money(value):
    return format(value.normalize(), "f") if value else "0"


def timestamp(value):
    if not isinstance(value, str):
        raise EvidenceError("Timestamp must be an ISO-8601 string with timezone")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise EvidenceError("Invalid timestamp") from exc
    if result.tzinfo is None:
        raise EvidenceError("Timezone is required")
    return result.astimezone(timezone.utc).isoformat(timespec="microseconds")


def required_text(obj, key):
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EvidenceError(f"{key} must be a nonempty string")
    return value.strip()


def currency(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Z]{3}", value):
        raise EvidenceError("currency must be an uppercase three-letter code")
    return value


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def normalize_rate(raw):
    allowed = {"tenant_id", "version", "provider", "account", "model", "source_ref", "currency", "effective_start", "effective_end", "received_at", "per_million"}
    if not isinstance(raw, dict) or set(raw) - allowed:
        raise EvidenceError("Rate contains unsupported fields; normalize its contract explicitly")
    out = {key: required_text(raw, key) for key in ("tenant_id", "version", "provider", "account", "model", "source_ref")}
    out.update(currency=currency(raw.get("currency")), effective_start=timestamp(raw.get("effective_start")),
               effective_end=timestamp(raw.get("effective_end")), received_at=timestamp(raw.get("received_at")))
    if out["effective_start"] >= out["effective_end"]:
        raise EvidenceError("Rate effective interval is empty")
    rates = raw.get("per_million")
    if not isinstance(rates, dict) or not rates or set(rates) - set(METERS):
        raise EvidenceError("Rates must name supported, disjoint usage meters")
    out["per_million"] = {}
    for meter, value in rates.items():
        amount = decimal(value)
        if amount < 0:
            raise EvidenceError("Rates cannot be negative")
        out["per_million"][meter] = money(amount)
    return out


def normalize_event(raw):
    common = {"tenant_id", "source", "source_id", "kind", "incurred_at", "received_at", "currency", "customer_id", "supersedes", "evidence_sha256"}
    workflow_fields = {"workflow_id", "run_id"}
    kind_fields = {"usage": {"provider", "account", "model", "request_id", "rate_version", "feature", "outcome", "billable", "attempt", "meters", "input_total"} | workflow_fields, "invoice": {"provider", "account", "service_start", "service_end", "amount", "document_type"}, "revenue": {"amount", "basis"}, "cost_component": {"category", "unit", "quantity", "basis", "amount", "unit_rate", "evidence_ref", "policy_ref", "invoice_coverage", "provider", "account"} | workflow_fields, "outcome": {"metric", "status", "quantity", "cohort_complete", "evidence_ref"} | workflow_fields}
    if not isinstance(raw, dict) or set(raw) - common - kind_fields.get(raw.get("kind"), set()):
        raise EvidenceError("Event contains unsupported fields; normalize source scope and granularity explicitly")
    out = {key: required_text(raw, key) for key in ("tenant_id", "source", "source_id", "kind")}
    out.update(incurred_at=timestamp(raw.get("incurred_at")), received_at=timestamp(raw.get("received_at")), currency=currency(raw.get("currency")))
    if out["received_at"] < out["incurred_at"]:
        raise EvidenceError("received_at cannot precede incurred_at")
    customer = raw.get("customer_id")
    if customer is not None and (not isinstance(customer, str) or not customer.strip()):
        raise EvidenceError("customer_id must be null or a nonempty explicit identifier")
    out["customer_id"] = customer.strip() if customer else None
    if "workflow_id" in raw or "run_id" in raw or out["kind"] == "outcome":
        out.update({key: required_text(raw, key) for key in ("workflow_id", "run_id")})
    if raw.get("evidence_sha256") is not None:
        if not isinstance(raw["evidence_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", raw["evidence_sha256"]):
            raise EvidenceError("evidence_sha256 must be a SHA-256 hex digest")
        out["evidence_sha256"] = raw["evidence_sha256"]
    if out["kind"] in ("usage", "invoice"):
        out.update({key: required_text(raw, key) for key in ("provider", "account")})
    if out["kind"] == "usage":
        out.update({key: required_text(raw, key) for key in ("model", "request_id", "rate_version")})
        out["feature"] = raw.get("feature")
        out["outcome"] = raw.get("outcome", "success")
        if out["outcome"] not in ("success", "error"):
            raise EvidenceError("outcome must be success or error; billability is separate")
        if type(raw.get("billable")) is not bool:
            raise EvidenceError("Every usage attempt must explicitly state billable true/false")
        out["billable"] = raw["billable"]
        out["attempt"] = raw.get("attempt", 1)
        if type(out["attempt"]) is not int or out["attempt"] < 1:
            raise EvidenceError("attempt must be a positive integer")
        meters = raw.get("meters")
        if not isinstance(meters, dict) or not meters or set(meters) - set(METERS):
            raise EvidenceError("meters must use disjoint input_uncached/input_cached/cache_write/output")
        if any(type(value) is not int or value < 0 or value >= 10**18 for value in meters.values()):
            raise EvidenceError("Meter quantities must be nonnegative integers below 1e18")
        out["meters"] = {meter: meters.get(meter, 0) for meter in METERS}
        if type(raw.get("input_total")) is not int or raw["input_total"] != sum(out["meters"][m] for m in METERS[:3]):
            raise EvidenceError("input_total must equal uncached + cached + cache_write exactly")
        out["input_total"] = raw["input_total"]
    elif out["kind"] == "invoice":
        out.update(service_start=timestamp(raw.get("service_start")), service_end=timestamp(raw.get("service_end")))
        if out["service_start"] >= out["service_end"]:
            raise EvidenceError("Invoice service interval is empty")
        out["amount"] = money(decimal(raw.get("amount")))
        out["document_type"] = raw.get("document_type", "invoice")
        if out["document_type"] not in ("invoice", "credit"):
            raise EvidenceError("document_type must be invoice or credit")
        if (out["document_type"] == "invoice" and decimal(out["amount"]) < 0) or (out["document_type"] == "credit" and decimal(out["amount"]) > 0):
            raise EvidenceError("Invoices are nonnegative; credit amounts are signed nonpositive")
    elif out["kind"] == "revenue":
        if raw.get("basis") != "recognized":
            raise EvidenceError("Revenue must be normalized recognized revenue, not a payment or Stripe cash receipt")
        out.update(amount=money(decimal(raw.get("amount"))), basis="recognized")
    elif out["kind"] == "cost_component":
        out.update({key: required_text(raw, key) for key in ("category", "unit", "basis", "evidence_ref", "invoice_coverage")})
        if out["category"] not in ("tool", "search", "compute", "storage", "human_review", "shared"):
            raise EvidenceError("Unsupported cost category; normalize tool/search/compute/storage/human_review/shared explicitly")
        if out["basis"] not in ("observed", "rated", "allocated"):
            raise EvidenceError("Component basis must be observed, rated, or allocated")
        coverage = out["invoice_coverage"]
        if coverage not in ("covered_by_supplier_invoice", "additional_to_supplier_invoice", "internal"):
            raise EvidenceError("Explicit supplier invoice coverage or internal cost is required")
        if coverage == "internal":
            if "provider" in raw or "account" in raw:
                raise EvidenceError("Internal costs have no supplier invoice reconciliation scope")
        else:
            out.update({key: required_text(raw, key) for key in ("provider", "account")})
        quantity = decimal(raw["quantity"]) if raw.get("quantity") is not None else None
        if quantity is not None and quantity < 0:
            raise EvidenceError("Component quantity cannot be negative")
        out["quantity"] = money(quantity) if quantity is not None else None
        amount = decimal(raw["amount"]) if raw.get("amount") is not None else None
        if out["basis"] in ("rated", "allocated"):
            out["policy_ref"] = required_text(raw, "policy_ref")
        elif raw.get("policy_ref") is not None:
            out["policy_ref"] = required_text(raw, "policy_ref")
        if out["basis"] == "rated":
            unit_rate = decimal(raw["unit_rate"]) if raw.get("unit_rate") is not None else None
            if unit_rate is not None and unit_rate < 0:
                raise EvidenceError("Component unit rate cannot be negative")
            computed = quantity * unit_rate if quantity is not None and unit_rate is not None else None
            if amount is not None and amount != computed:
                raise EvidenceError("Rated amount must equal quantity times unit_rate; unknown inputs remain unknown")
            amount = computed
            out["unit_rate"] = money(unit_rate) if unit_rate is not None else None
        elif "unit_rate" in raw:
            raise EvidenceError("unit_rate is valid only with rated basis")
        if amount is not None and amount < 0:
            raise EvidenceError("Cost components are nonnegative; use a source correction or supplier credit")
        out["amount"] = money(amount) if amount is not None else None
    elif out["kind"] == "outcome":
        out.update({key: required_text(raw, key) for key in ("metric", "status", "evidence_ref")})
        if out["status"] not in ("accepted", "rejected", "unknown"):
            raise EvidenceError("Business outcome status must be accepted, rejected, or unknown")
        quantity = raw.get("quantity")
        if out["status"] == "unknown":
            if quantity is not None:
                raise EvidenceError("Unknown outcome quantity must be null")
        elif type(quantity) is not int or quantity < 0 or quantity >= 10**18:
            raise EvidenceError("Known business outcome quantity must be a nonnegative integer")
        if type(raw.get("cohort_complete")) is not bool:
            raise EvidenceError("Business outcome must explicitly assert cohort_complete true/false")
        out.update(quantity=quantity, cohort_complete=raw["cohort_complete"])
    else:
        raise EvidenceError("kind must be usage, invoice, revenue, cost_component, or outcome")
    if raw.get("supersedes") is not None:
        prior = raw["supersedes"]
        if not isinstance(prior, dict):
            raise EvidenceError("supersedes must identify source and source_id")
        out["supersedes"] = {key: required_text(prior, key) for key in ("source", "source_id")}
    return out


class Ledger:
    def __init__(self, path):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS events (
          tenant TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
          payload TEXT NOT NULL, hash TEXT NOT NULL,
          PRIMARY KEY (tenant, source, source_id));
        CREATE TABLE IF NOT EXISTS rates (
          tenant TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL,
          PRIMARY KEY (tenant, version));
        CREATE TABLE IF NOT EXISTS snapshots (
          tenant TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL,
          PRIMARY KEY (tenant, name));
        """)
        for table in ("events", "rates", "snapshots"):
            for action in ("UPDATE", "DELETE"):
                self.db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'append-only evidence'); END")
        self.db.commit()

    def close(self):
        self.db.close()

    def import_bundle(self, bundle):
        rates = [normalize_rate(row) for row in bundle.get("rates", [])]
        events = [normalize_event(row) for row in bundle.get("events", [])]
        result = {"inserted_events": 0, "inserted_rates": 0, "duplicates": 0}
        def capture_key(event):
            if event["kind"] == "usage":
                return ("usage", *(event[k] for k in ("provider", "account", "request_id", "attempt")))
            if event["kind"] == "outcome":
                return ("outcome", *(event[k] for k in ("workflow_id", "run_id", "metric")))
            return None
        self.db.execute("BEGIN IMMEDIATE")
        try:
            # Preload each participating tenant exactly once per bundle. The
            # indexes update after every insert/correction, avoiding O(n^2)
            # JSON scans and keeping interleaved import batches serialized.
            states = {}
            for tenant in {event["tenant_id"] for event in events}:
                known = {}
                for row in self.db.execute("SELECT payload,hash FROM events WHERE tenant=?", (tenant,)):
                    event = json.loads(row["payload"])
                    known[(event["source"], event["source_id"])] = (event, row["hash"])
                superseded = {(e["supersedes"]["source"], e["supersedes"]["source_id"]) for e, _ in known.values() if e.get("supersedes")}
                captures = {capture_key(e): key for key, (e, _) in known.items() if key not in superseded and capture_key(e) is not None}
                roots, historical = {}, defaultdict(set)
                for source_key in known:
                    chain, key = [], source_key
                    while key not in roots:
                        chain.append(key)
                        parent = known[key][0].get("supersedes")
                        if parent is None:
                            roots[key] = key
                            break
                        key = (parent["source"], parent["source_id"])
                    for member in chain:
                        roots[member] = roots[key]
                    capture = capture_key(known[source_key][0])
                    if capture is not None:
                        historical[capture].add(roots[source_key])
                states[tenant] = (known, superseded, captures, roots, historical)
            for rate in rates:
                prior = self.db.execute("SELECT hash FROM rates WHERE tenant=? AND version=?", (rate["tenant_id"], rate["version"])).fetchone()
                if prior:
                    if prior["hash"] != digest(rate):
                        raise EvidenceError("Rate version conflict; append a new explicit version")
                    result["duplicates"] += 1
                    continue
                self.db.execute("INSERT INTO rates VALUES (?,?,?,?)", (rate["tenant_id"], rate["version"], canonical(rate), digest(rate)))
                result["inserted_rates"] += 1
            for event in events:
                key = (event["tenant_id"], event["source"], event["source_id"])
                source_key = (event["source"], event["source_id"])
                known, superseded_keys, captures, roots, historical = states[event["tenant_id"]]
                prior = known.get(source_key)
                if prior:
                    if prior[1] != digest(event):
                        raise EvidenceError("Source identity conflict; append a correction with a new source_id")
                    result["duplicates"] += 1
                    continue
                supersedes = event.get("supersedes")
                target_key = None
                if supersedes:
                    target_key = (supersedes["source"], supersedes["source_id"])
                    target_row = known.get(target_key)
                    if target_row is None:
                        raise EvidenceError("Correction target must already exist in the same tenant")
                    target = target_row[0]
                    if target["kind"] != event["kind"] or target["received_at"] > event["received_at"]:
                        raise EvidenceError("Correction must preserve kind and follow original receipt")
                    if target_key in superseded_keys:
                        raise EvidenceError("Correction target already superseded; extend the correction chain")
                capture = capture_key(event)
                if capture is not None and capture in captures and captures[capture] != target_key:
                    raise EvidenceError("Overlapping authoritative attempt/outcome capture; select one source or append a correction")
                root = roots[target_key] if target_key is not None else source_key
                if capture is not None and historical[capture] - {root}:
                    raise EvidenceError("Historical attempt/outcome identity belongs to another correction chain")
                self.db.execute("INSERT INTO events VALUES (?,?,?,?,?)", (*key, canonical(event), digest(event)))
                if target_key is not None:
                    superseded_keys.add(target_key)
                    target_capture = capture_key(known[target_key][0])
                    if target_capture is not None:
                        captures.pop(target_capture, None)
                known[source_key] = (event, digest(event))
                roots[source_key] = root
                if capture is not None:
                    captures[capture] = source_key
                    historical[capture].add(root)
                result["inserted_events"] += 1
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return result

    def snapshot(self, tenant, name):
        row = self.db.execute("SELECT payload,hash FROM snapshots WHERE tenant=? AND name=?", (tenant, name)).fetchone()
        if row is None:
            raise EvidenceError("Snapshot not found for tenant")
        result = json.loads(row["payload"])
        if digest(result) != row["hash"]:
            raise EvidenceError("Snapshot integrity mismatch")
        return {**result, "snapshot_hash": row["hash"]}

    def create_snapshot(self, tenant, name, period_start, period_end, as_of, selected_currency, prior_name=None):
        # Serialize the event/rate reads and snapshot insert against imports.
        # Separate autocommit reads could otherwise observe a combination of
        # events and prices that never coexisted in the database.
        self.db.execute("BEGIN IMMEDIATE")
        try:
            result = self._create_snapshot(tenant, name, period_start, period_end, as_of, selected_currency, prior_name)
            self.db.commit()
            return result
        except Exception:
            self.db.rollback()
            raise

    def _create_snapshot(self, tenant, name, period_start, period_end, as_of, selected_currency, prior_name=None):
        start, end, cutoff = map(timestamp, (period_start, period_end, as_of))
        selected_currency = currency(selected_currency)
        if start >= end or cutoff < end:
            raise EvidenceError("Use a nonempty half-open period and an as_of at or after period end")
        if not tenant or not name:
            raise EvidenceError("tenant and snapshot name are required")
        prior = self.snapshot(tenant, prior_name) if prior_name else None
        if prior and (prior["period_start"], prior["period_end"], prior["currency"]) != (start, end, selected_currency):
            raise EvidenceError("Adjustment snapshot must preserve period and currency")
        if prior and cutoff <= prior["as_of"]:
            raise EvidenceError("Adjustment cutoff must be later than prior snapshot")
        all_rows = self.db.execute("SELECT payload,hash FROM events WHERE tenant=? ORDER BY source,source_id", (tenant,)).fetchall()
        visible = [(json.loads(row["payload"]), row["hash"]) for row in all_rows if json.loads(row["payload"])["received_at"] <= cutoff]
        replaced = {(e["supersedes"]["source"], e["supersedes"]["source_id"]) for e, _ in visible if e.get("supersedes")}
        active = [(e, h) for e, h in visible if (e["source"], e["source_id"]) not in replaced]
        def in_period(e):
            return e["service_start"] < end and e["service_end"] > start if e["kind"] == "invoice" else start <= e["incurred_at"] < end
        selected = [(e, h) for e, h in active if in_period(e) and e["currency"] == selected_currency]
        seen_attempts = set()
        for e, _ in selected:
            if e["kind"] != "usage":
                continue
            key = tuple(e[k] for k in ("provider", "account", "request_id", "attempt"))
            if key in seen_attempts:
                raise EvidenceError("Historical snapshot contains overlapping usage captures; correct the evidence first")
            seen_attempts.add(key)
        rates = {r["version"]: r for row in self.db.execute("SELECT payload FROM rates WHERE tenant=?", (tenant,)) if (r := json.loads(row["payload"]))["received_at"] <= cutoff}
        issues, rated, used_rates = [], [], {}
        groups = defaultdict(lambda: {"rated": ZERO, "invoice": ZERO, "credits": ZERO, "invoice_count": 0, "principal_count": 0, "unknown": 0, "usage_count": 0, "partial": False})
        customers = defaultdict(lambda: {"revenue": ZERO, "revenue_count": 0, "known_cost": ZERO, "unknown": 0, "usage_count": 0, "sources": []})
        unassigned_usage = ZERO
        unassigned_revenue = ZERO
        revenue_total, revenue_count = ZERO, 0
        for e, h in selected:
            ref = {"source": e["source"], "source_id": e["source_id"]}
            if e["kind"] in ("cost_component", "outcome"):
                continue
            if e["kind"] == "revenue":
                amount = decimal(e["amount"])
                revenue_total += amount
                revenue_count += 1
                if e["customer_id"]:
                    customer = customers[e["customer_id"]]
                    customer["revenue"] += amount
                    customer["revenue_count"] += 1
                    customer["sources"].append(ref)
                else:
                    unassigned_revenue += amount
                    issues.append({"code": "unassigned_revenue", **ref})
                continue
            key = (e["provider"], e["account"])
            group = groups[key]
            if e["kind"] == "invoice":
                if (e["service_start"], e["service_end"]) != (start, end):
                    group["partial"] = True
                    issues.append({"code": "invoice_period_mismatch", **ref, "amount_not_allocated": e["amount"]})
                else:
                    group["invoice"] += decimal(e["amount"])
                    group["invoice_count"] += 1
                    if e["document_type"] == "invoice":
                        group["principal_count"] += 1
                    else:
                        group["credits"] += decimal(e["amount"])
                continue
            group["usage_count"] += 1
            customer = customers[e["customer_id"]] if e["customer_id"] else None
            if customer is not None:
                customer["usage_count"] += 1
                customer["sources"].append(ref)
            else:
                issues.append({"code": "unassigned_usage", **ref})
            rate = rates.get(e["rate_version"])
            rate_ok = rate is not None and (rate["provider"], rate["account"], rate["model"], rate["currency"]) == (*key, e["model"], selected_currency) and rate["effective_start"] <= e["incurred_at"] < rate["effective_end"]
            missing = [m for m, count in e["meters"].items() if count and (not rate_ok or m not in rate["per_million"])]
            amount = ZERO if not e["billable"] else None
            if e["billable"] and not missing and rate_ok:
                amount = sum((Decimal(count) * decimal(rate["per_million"].get(m, "0")) / Decimal("1000000") for m, count in e["meters"].items()), ZERO)
                used_rates[rate["version"]] = {"version": rate["version"], "hash": digest(rate), "source_ref": rate["source_ref"], "per_million": rate["per_million"]}
            if amount is None:
                group["unknown"] += 1
                if customer is not None:
                    customer["unknown"] += 1
                issues.append({"code": "missing_or_inapplicable_rate", **ref, "rate_version": e["rate_version"], "meters": missing})
            else:
                group["rated"] += amount
                if customer is not None:
                    customer["known_cost"] += amount
                else:
                    unassigned_usage += amount
            rated.append({**ref, "customer_id": e["customer_id"], "request_id": e["request_id"], "attempt": e["attempt"], "outcome": e["outcome"], "billable": e["billable"], "rate_version": e["rate_version"], "meters": e["meters"], "cost": money(amount) if amount is not None else None, "cost_basis": "usage_rated_estimate" if e["billable"] else "source_declared_nonbillable"})
        reconciliations, selected_cost, residual, invoice_total = [], ZERO, ZERO, ZERO
        cost_complete = True
        if not groups:
            issues.append({"code": "missing_cost_evidence"})
        for (provider, account), g in sorted(groups.items()):
            has_invoice = g["principal_count"] > 0
            credit_only = bool(g["invoice_count"]) and not has_invoice
            selected_amount = g["invoice"] if has_invoice else g["rated"] + g["credits"]
            delta = g["invoice"] - g["rated"] if has_invoice else g["credits"] if credit_only else None
            selected_cost += selected_amount
            invoice_total += g["invoice"]
            if delta is not None:
                residual += delta
                if delta:
                    issues.append({"code": "invoice_usage_difference", "provider": provider, "account": account, "signed_amount": money(delta)})
            if not has_invoice:
                issues.append({"code": "missing_invoice", "provider": provider, "account": account})
            if credit_only:
                issues.append({"code": "credit_without_principal_invoice", "provider": provider, "account": account, "signed_credit": money(g["credits"])})
            if g["partial"] or credit_only or (g["unknown"] and not has_invoice):
                cost_complete = False
            reconciliations.append({"provider": provider, "account": account, "currency": selected_currency, "service_start": start, "service_end": end, "rated_usage_known_subtotal": money(g["rated"]), "provider_invoice_total": money(g["invoice"]) if has_invoice else None, "provider_credit_total": money(g["credits"]), "selected_known_cost": money(selected_amount), "selected_cost_basis": "provider_invoice" if has_invoice else "usage_estimate_plus_unmatched_credit" if credit_only else "usage_rated_estimate", "signed_unallocated_difference": money(delta) if delta is not None else None, "unknown_usage_events": g["unknown"], "usage_events": g["usage_count"], "invoice_documents": g["invoice_count"], "principal_invoices": g["principal_count"]})
        customer_output = {}
        for customer_id, c in sorted(customers.items()):
            known = c["known_cost"]
            cost = known if c["usage_count"] and not c["unknown"] else None
            revenue = c["revenue"] if c["revenue_count"] else None
            profit = revenue - cost if revenue is not None and cost is not None else None
            customer_output[customer_id] = {"recognized_revenue": money(revenue) if revenue is not None else None, "revenue_basis": "imported_recognized_revenue" if revenue is not None else "missing", "known_usage_cost": money(known), "usage_cost": money(cost) if cost is not None else None, "cost_basis": "usage_rated_estimate" if cost is not None else "incomplete", "profit_estimate": money(profit) if profit is not None else None, "margin_percent_estimate": money(profit / revenue * 100) if profit is not None and revenue > 0 else None, "unknown_usage_events": c["unknown"], "source_references": c["sources"]}
        customer_cost = sum((c["known_cost"] for c in customers.values()), ZERO)
        unallocated = unassigned_usage + residual
        if customer_cost + unallocated != selected_cost:
            raise AssertionError("Cost conservation failed")
        result = {"schema_version": 1, "purpose": "synthetic/offline falsification harness; not accounting approval", "tenant_id": tenant, "name": name, "period_start": start, "period_end": end, "as_of": cutoff, "currency": selected_currency, "status": "review_snapshot", "approval_state": "not_approved", "arithmetic_state": "needs_review" if issues else "matched_within_imported_scope", "prior_snapshot": {"name": prior_name, "hash": prior["snapshot_hash"]} if prior else None,
            "totals": {"recognized_revenue": money(revenue_total) if revenue_count else None, "provider_invoice_total": money(invoice_total), "known_cost": money(selected_cost), "cost_total": money(selected_cost) if cost_complete and groups else None, "cost_complete_within_imported_scope": cost_complete and bool(groups), "customer_attributed_known_cost": money(customer_cost), "unassigned_usage_cost": money(unassigned_usage), "signed_invoice_residual": money(residual), "unallocated_cost": money(unallocated), "unassigned_revenue": money(unassigned_revenue), "profit_estimate": money(revenue_total - selected_cost) if revenue_count and cost_complete and groups else None, "cost_conservation": True},
            "customers": customer_output, "reconciliation": reconciliations, "rated_usage": rated, "issues": issues,
            "manifest": {"events": [{"source": e["source"], "source_id": e["source_id"], "hash": h} for e, h in selected], "rates": [used_rates[key] for key in sorted(used_rates)], "superseded_source_ids": [{"source": s, "source_id": i} for s, i in sorted(replaced)], "other_currency_events_excluded": sum(in_period(e) and e["currency"] != selected_currency for e, _ in active)}}
        extend_economics(result, selected, active)
        selected_cost = Decimal(result["totals"]["known_cost"])
        if prior:
            prior_revenue = prior["totals"]["recognized_revenue"]
            revenue_delta = money(revenue_total - decimal(prior_revenue)) if revenue_count and prior_revenue is not None else None
            result["adjustment"] = {"known_cost_change": money(selected_cost - decimal(prior["totals"]["known_cost"])), "recognized_revenue_change": revenue_delta, "revenue_evidence_state": "comparable" if revenue_delta is not None else "incomplete_comparison", "added_or_replaced_source_ids": [e for e in result["manifest"]["events"] if e not in prior["manifest"]["events"]]}
        try:
            self.db.execute("INSERT INTO snapshots VALUES (?,?,?,?)", (tenant, name, canonical(result), digest(result)))
        except sqlite3.IntegrityError as exc:
            raise EvidenceError("Snapshot name already exists; append a new named snapshot") from exc
        return {**result, "snapshot_hash": digest(result)}


def basis_composition(rows):
    """Composition of attributed evidence, not additive invoice-plus-usage totals."""
    groups = defaultdict(lambda: {"known": ZERO, "unknown": 0})
    for row in rows:
        key = (row["category"], row["basis"], row["invoice_coverage"])
        if row["cost"] is None:
            groups[key]["unknown"] += 1
        else:
            groups[key]["known"] += row["cost"]
    return [{"category": category, "basis": basis, "invoice_coverage": coverage, "known_amount": money(v["known"]), "unknown_events": v["unknown"]} for (category, basis, coverage), v in sorted(groups.items())]


def extend_economics(result, selected, active):
    """Add normalized expense components and outcomes without broad accounting claims.

    Observed components import a documented amount. Rated components preserve
    quantity, unit rate and policy. Allocated components preserve an asserted
    allocation amount and policy; this module does not invent or approve that
    policy. Full supplier-pool invoice coverage is an explicit source assertion.
    """
    start, end = result["period_start"], result["period_end"]
    source_events = {(e["source"], e["source_id"]): e for e, _ in selected}
    rows = []
    for rated in result["rated_usage"]:
        e = source_events[(rated["source"], rated["source_id"])]
        rows.append({**e, "category": "inference", "basis": "rated" if e["billable"] else "source_declared_nonbillable", "invoice_coverage": "covered_by_supplier_invoice", "cost": Decimal(rated["cost"]) if rated["cost"] is not None else None})
        if e.get("workflow_id"):
            rated.update(workflow_id=e["workflow_id"], run_id=e["run_id"])
    components = []
    for e, _ in selected:
        if e["kind"] != "cost_component":
            continue
        amount = Decimal(e["amount"]) if e["amount"] is not None else None
        row = {**e, "cost": amount}
        rows.append(row)
        components.append({**e, "cost": money(amount) if amount is not None else None})
        ref = {"source": e["source"], "source_id": e["source_id"]}
        if amount is None:
            result["issues"].append({"code": "unknown_component_cost", **ref, "category": e["category"], "basis": e["basis"]})
        if e["customer_id"] is None:
            result["issues"].append({"code": "unassigned_component_cost", **ref})
    scopes = {(g["provider"], g["account"]): g for g in result["reconciliation"]}
    covered = defaultdict(list)
    additional = []
    for row in rows:
        if row["kind"] != "cost_component":
            continue
        if row["invoice_coverage"] == "covered_by_supplier_invoice":
            covered[(row["provider"], row["account"])].append(row)
        else:
            additional.append(row)
    for key in covered:
        if key not in scopes:
            scopes[key] = {"provider": key[0], "account": key[1], "currency": result["currency"], "service_start": start, "service_end": end, "rated_usage_known_subtotal": "0", "provider_invoice_total": None, "provider_credit_total": "0", "selected_known_cost": "0", "selected_cost_basis": "component_evidence_without_invoice", "signed_unallocated_difference": None, "unknown_usage_events": 0, "usage_events": 0, "invoice_documents": 0, "principal_invoices": 0}
            result["issues"].append({"code": "missing_invoice", "provider": key[0], "account": key[1]})
    result["issues"] = [issue for issue in result["issues"] if issue["code"] != "invoice_usage_difference" and not (rows and issue["code"] == "missing_cost_evidence")]
    partial_scopes = {(e["provider"], e["account"]) for e, _ in selected if e["kind"] == "invoice" and (e["service_start"], e["service_end"]) != (start, end)}
    selected_cost, residual = ZERO, ZERO
    cost_complete = not any(r["cost"] is None for r in additional)
    for key, group in sorted(scopes.items()):
        component_known = sum((r["cost"] for r in covered[key] if r["cost"] is not None), ZERO)
        unknown_components = sum(r["cost"] is None for r in covered[key])
        attribution = Decimal(group["rated_usage_known_subtotal"]) + component_known
        has_invoice = group["principal_invoices"] > 0
        credit_only = group["invoice_documents"] > 0 and not has_invoice
        credits = Decimal(group["provider_credit_total"])
        amount = Decimal(group["provider_invoice_total"]) if has_invoice else attribution + credits
        difference = amount - attribution if has_invoice else credits if credit_only else None
        group.update(covered_component_known_subtotal=money(component_known), known_attribution_subtotal=money(attribution), unknown_component_events=unknown_components, selected_known_cost=money(amount), signed_unallocated_difference=money(difference) if difference is not None else None)
        if covered[key] and not has_invoice:
            group["selected_cost_basis"] = "mixed_component_and_usage_evidence" if group["usage_events"] else "component_evidence_without_invoice"
        if difference is not None:
            residual += difference
            if difference:
                result["issues"].append({"code": "invoice_usage_difference", "provider": key[0], "account": key[1], "signed_amount": money(difference)})
        selected_cost += amount
        if key in partial_scopes or credit_only or (not has_invoice and (group["unknown_usage_events"] or unknown_components)):
            cost_complete = False
    selected_cost += sum((r["cost"] for r in additional if r["cost"] is not None), ZERO)
    cost_evidence = bool(rows or scopes)
    rows_by_customer = defaultdict(list)
    for row in rows:
        if row["customer_id"]:
            rows_by_customer[row["customer_id"]].append(row)
    customer_ids = set(result["customers"]) | set(rows_by_customer)
    for customer_id in sorted(customer_ids):
        customer_rows = rows_by_customer[customer_id]
        prior = result["customers"].get(customer_id, {"recognized_revenue": None, "revenue_basis": "missing", "known_usage_cost": "0", "usage_cost": None, "unknown_usage_events": 0, "source_references": []})
        known = sum((r["cost"] for r in customer_rows if r["cost"] is not None), ZERO)
        unknown = sum(r["cost"] is None for r in customer_rows)
        economic_cost = known if customer_rows and not unknown else None
        revenue = Decimal(prior["recognized_revenue"]) if prior["recognized_revenue"] is not None else None
        profit = revenue - economic_cost if revenue is not None and economic_cost is not None else None
        component_rows = [r for r in customer_rows if r["kind"] == "cost_component"]
        component_cost = sum((r["cost"] for r in component_rows if r["cost"] is not None), ZERO)
        bases = {r["basis"] for r in customer_rows}
        basis = "incomplete" if economic_cost is None else "usage_rated_estimate" if not component_rows else next(iter(bases)) if len(bases) == 1 else "mixed"
        prior.update(known_component_cost=money(component_cost), known_economic_cost=money(known), economic_cost=money(economic_cost) if economic_cost is not None else None, cost_basis=basis, cost_basis_composition=basis_composition(customer_rows), unknown_cost_events=unknown, profit_estimate=money(profit) if profit is not None else None, margin_percent_estimate=money(profit / revenue * 100) if profit is not None and revenue > 0 else None, revenue_association="customer-associated; not causal workflow revenue")
        for row in component_rows:
            prior["source_references"].append({"source": row["source"], "source_id": row["source_id"]})
        result["customers"][customer_id] = prior
    attributed = sum((r["cost"] for r in rows if r["customer_id"] and r["cost"] is not None), ZERO)
    unassigned = sum((r["cost"] for r in rows if not r["customer_id"] and r["cost"] is not None), ZERO)
    unassigned_components = sum((r["cost"] for r in rows if r["kind"] == "cost_component" and not r["customer_id"] and r["cost"] is not None), ZERO)
    unallocated = unassigned + residual
    if attributed + unallocated != selected_cost:
        raise AssertionError("Full economic-cost conservation failed")
    totals = result["totals"]
    revenue = Decimal(totals["recognized_revenue"]) if totals["recognized_revenue"] is not None else None
    totals.update(known_cost=money(selected_cost), cost_total=money(selected_cost) if cost_complete and cost_evidence else None, cost_complete_within_imported_scope=cost_complete and cost_evidence, customer_attributed_known_cost=money(attributed), unassigned_component_cost=money(unassigned_components), signed_invoice_residual=money(residual), unallocated_cost=money(unallocated), profit_estimate=money(revenue - selected_cost) if revenue is not None and cost_complete and cost_evidence else None, additional_component_known_cost=money(sum((r["cost"] for r in additional if r["cost"] is not None), ZERO)), unassigned_workflow_known_cost=money(sum((r["cost"] for r in rows if not r.get("workflow_id") and r["cost"] is not None), ZERO)))
    result.update(reconciliation=[scopes[key] for key in sorted(scopes)], cost_components=components, attributed_cost_basis_composition=basis_composition(rows))
    result["workflow_economics"] = project_workflows(rows, selected, active, scopes, partial_scopes, result)
    result["arithmetic_state"] = "needs_review" if result["issues"] else "matched_within_imported_scope"


def project_workflows(rows, selected, active, scopes, partial_scopes, result):
    """Run-cohort unit economics; rejected runs retain costs in workflow totals."""
    run_rows, run_outcomes, active_by_run, workflow_rows = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for row in rows:
        if row.get("workflow_id"):
            run_rows[(row["workflow_id"], row["run_id"])].append(row)
            workflow_rows[row["workflow_id"]].append(row)
    for e, _ in active:
        if e.get("workflow_id") and e["kind"] in ("usage", "cost_component", "outcome"):
            active_by_run[(e["workflow_id"], e["run_id"])].append(e)
    for e, _ in selected:
        if e["kind"] == "outcome":
            run_outcomes[(e["workflow_id"], e["run_id"])].append(e)
    workflows = defaultdict(list)
    unmapped_rows = [r for r in rows if not r.get("workflow_id") and (r["cost"] is None or r["cost"] != 0)]
    for key in sorted(set(run_rows) | set(run_outcomes)):
        costs, outcomes = run_rows[key], run_outcomes[key]
        known = sum((r["cost"] for r in costs if r["cost"] is not None), ZERO)
        unknown = sum(r["cost"] is None for r in costs)
        cost_blockers, outcome_blockers = [], []
        if not costs:
            cost_blockers.append("missing_run_cost_evidence")
        if unknown:
            cost_blockers.append("unknown_run_cost")
        run_scopes = {(r["provider"], r["account"]) for r in costs if r["invoice_coverage"] == "covered_by_supplier_invoice"}
        run_customers = {r["customer_id"] for r in costs if r["customer_id"]}
        if any(r["customer_id"] is None or r["customer_id"] in run_customers or (r["invoice_coverage"] == "covered_by_supplier_invoice" and (r["provider"], r["account"]) in run_scopes) for r in unmapped_rows):
            cost_blockers.append("unassigned_workflow_cost")
        for scope in sorted(run_scopes):
            group = scopes[scope]
            if group["signed_unallocated_difference"] not in (None, "0"):
                cost_blockers.append("unallocated_supplier_difference")
            if scope in partial_scopes or (group["invoice_documents"] and not group["principal_invoices"]):
                cost_blockers.append("incomplete_supplier_coverage")
            if group["unknown_usage_events"] or group.get("unknown_component_events", 0):
                cost_blockers.append("unknown_cost_in_supplier_scope")
        for e in active_by_run[key]:
            if e["currency"] != result["currency"]:
                cost_blockers.append("run_spans_currencies")
            if not result["period_start"] <= e["incurred_at"] < result["period_end"]:
                cost_blockers.append("run_spans_period_boundary")
        metrics = {o["metric"] for o in outcomes}
        if not outcomes:
            outcome_blockers.append("missing_business_outcome")
        if any(o["status"] == "unknown" for o in outcomes):
            outcome_blockers.append("unknown_business_outcome")
        if outcomes and not all(o["cohort_complete"] for o in outcomes):
            outcome_blockers.append("incomplete_run_cohort")
        if len(metrics) > 1:
            outcome_blockers.append("mixed_outcome_metrics")
        accepted = None if not outcomes or any(o["status"] == "unknown" for o in outcomes) or len(metrics) != 1 else sum(o["quantity"] for o in outcomes if o["status"] == "accepted")
        cost_complete = not cost_blockers
        complete = cost_complete and not outcome_blockers
        blockers = sorted(set(cost_blockers + outcome_blockers))
        invoice_state = "not_applicable" if not run_scopes else "missing_invoice_estimate" if any(not scopes[s]["principal_invoices"] for s in run_scopes) else "unresolved" if any(scopes[s]["signed_unallocated_difference"] not in (None, "0") for s in run_scopes) else "matched_within_imported_scope"
        run = {"run_id": key[1], "customer_ids": sorted(run_customers), "known_cost": money(known), "economic_cost": money(known) if cost_complete else None, "cost_complete": cost_complete, "accepted_outcomes": accepted, "metric": next(iter(metrics)) if len(metrics) == 1 else None, "cohort_complete": complete, "provider_invoice_state": invoice_state, "cost_per_accepted_outcome": money(known / accepted) if complete and accepted and known >= 0 else None, "usage_attempts": sum(r["kind"] == "usage" for r in costs), "failed_usage_attempts": sum(r["kind"] == "usage" and r.get("outcome") == "error" for r in costs), "non_token_components": sum(r["kind"] == "cost_component" for r in costs), "cost_basis_composition": basis_composition(costs), "blockers": blockers, "source_references": [{"source": e["source"], "source_id": e["source_id"]} for e in costs + outcomes]}
        workflows[key[0]].append(run)
        for blocker in blockers:
            result["issues"].append({"code": blocker, "workflow_id": key[0], "run_id": key[1]})
    out = []
    for workflow_id, runs in sorted(workflows.items()):
        known = sum((Decimal(r["known_cost"]) for r in runs), ZERO)
        accepted = sum(r["accepted_outcomes"] for r in runs) if all(r["accepted_outcomes"] is not None for r in runs) else None
        metrics = {r["metric"] for r in runs if r["metric"]}
        blockers = {b for r in runs for b in r["blockers"]}
        if len(metrics) > 1:
            blockers.add("mixed_outcome_metrics")
            accepted = None
            result["issues"].append({"code": "mixed_outcome_metrics", "workflow_id": workflow_id})
        complete = not blockers and all(r["cohort_complete"] for r in runs)
        all_costs_known = all(r["cost_complete"] for r in runs)
        all_workflow_rows = workflow_rows[workflow_id]
        out.append({"workflow_id": workflow_id, "currency": result["currency"], "metric": next(iter(metrics)) if len(metrics) == 1 else None, "known_cost": money(known), "economic_cost": money(known) if all_costs_known else None, "accepted_outcomes": accepted, "cost_per_accepted_outcome": money(known / accepted) if complete and accepted and known >= 0 else None, "cohort_complete": complete, "basis": "estimate with explicit component composition", "revenue_attribution": "not inferred; customer association is noncausal", "cost_basis_composition": basis_composition(all_workflow_rows), "usage_attempts": sum(r["usage_attempts"] for r in runs), "failed_usage_attempts": sum(r["failed_usage_attempts"] for r in runs), "blockers": sorted(blockers), "runs": runs})
    return out


def read_bundle(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"), parse_float=Decimal)


def usage_csv_bundle(path):
    """Strict normalized request-attempt CSV. Never claims vendor-native compatibility."""
    columns = {"tenant_id", "source", "source_id", "incurred_at", "received_at", "currency", "provider", "account", "customer_id", "model", "request_id", "rate_version", "attempt", "outcome", "billable", "input_total", *METERS}
    reader = csv.DictReader(io.StringIO(Path(path).read_text(encoding="utf-8-sig")))
    if not reader.fieldnames or set(reader.fieldnames) != columns or len(reader.fieldnames) != len(columns):
        raise EvidenceError("CSV must contain exactly the documented normalized attempt columns")
    events = []
    for line, row in enumerate(reader, 2):
        try:
            if None in row or any(value is None for value in row.values()):
                raise EvidenceError("Wrong CSV row width")
            if row["billable"] not in ("true", "false"):
                raise EvidenceError("billable must be true or false")
            event = {**row, "kind": "usage", "customer_id": row["customer_id"] or None, "billable": row["billable"] == "true", "attempt": int(row["attempt"]), "input_total": int(row["input_total"]), "meters": {m: int(row[m]) for m in METERS}}
            for meter in METERS:
                del event[meter]
            events.append(normalize_event(event))
        except (ValueError, TypeError) as exc:
            raise EvidenceError(f"CSV row {line}: {exc}") from exc
    if not events:
        raise EvidenceError("CSV contains no attempts")
    return {"events": events}


def openai_response_bundle(path, tenant, account, received_at, rate_version, customer_id=None):
    """A saved, completed default-tier text Responses object; no network or credentials.

    Supports cached reads only. Cache writes, tools, audio, and other service tiers
    require explicit normalization into the general ledger schema instead.
    """
    content = Path(path).read_bytes()
    raw = json.loads(content, parse_float=Decimal)
    if raw.get("object") != "response" or raw.get("status") != "completed" or raw.get("service_tier") != "default":
        raise EvidenceError("Native adapter requires a completed, explicit default-tier Response")
    if raw.get("tools") or any(item.get("type") != "message" or any(c.get("type") != "output_text" for c in item.get("content", [])) for item in raw.get("output", [])):
        raise EvidenceError("Native adapter supports text output without tools only")
    usage = raw.get("usage") or {}
    details = usage.get("input_tokens_details") or {}
    if any(value for key, value in details.items() if key != "cached_tokens"):
        raise EvidenceError("Nonzero cache-write/audio/unknown meters require explicit normalization")
    if any(value for key, value in (usage.get("output_tokens_details") or {}).items() if key != "reasoning_tokens"):
        raise EvidenceError("Unknown output meter requires explicit normalization")
    total, cached, output = usage.get("input_tokens"), details.get("cached_tokens", 0), usage.get("output_tokens")
    if any(type(v) is not int or v < 0 for v in (total, cached, output)) or cached > total:
        raise EvidenceError("Invalid native token counts or cached tokens exceed input total")
    if type(raw.get("created_at")) is not int:
        raise EvidenceError("created_at must be integral Unix seconds")
    if usage.get("total_tokens") != total + output:
        raise EvidenceError("Native total_tokens does not equal input plus output")
    event = {"tenant_id": tenant, "source": "openai-responses-file", "source_id": required_text(raw, "id"), "kind": "usage", "incurred_at": datetime.fromtimestamp(raw["created_at"], timezone.utc).isoformat(), "received_at": received_at, "currency": "USD", "provider": "openai", "account": account, "customer_id": customer_id, "model": required_text(raw, "model"), "request_id": "response:" + raw["id"], "rate_version": rate_version, "attempt": 1, "outcome": "success", "billable": True, "input_total": total, "meters": {"input_uncached": total - cached, "input_cached": cached, "cache_write": 0, "output": output}, "evidence_sha256": hashlib.sha256(content).hexdigest()}
    return {"events": [normalize_event(event)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=str(Path(__file__).parent / ".local" / "ledger.sqlite"))
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("import-json", "import-csv"):
        p = sub.add_parser(name)
        p.add_argument("path")
    native = sub.add_parser("import-openai-response")
    native.add_argument("path")
    for name in ("tenant", "account", "received-at", "rate-version"):
        native.add_argument("--" + name, required=True)
    native.add_argument("--customer")
    close = sub.add_parser("close")
    for name in ("tenant", "name", "start", "end", "as-of", "currency"):
        close.add_argument("--" + name, required=True)
    close.add_argument("--prior")
    show = sub.add_parser("show")
    show.add_argument("--tenant", required=True)
    show.add_argument("--name", required=True)
    args = parser.parse_args()
    ledger = Ledger(args.db)
    try:
        if args.command == "import-openai-response":
            result = ledger.import_bundle(openai_response_bundle(args.path, args.tenant, args.account, args.received_at, args.rate_version, args.customer))
        elif args.command.startswith("import"):
            result = ledger.import_bundle(read_bundle(args.path) if args.command == "import-json" else usage_csv_bundle(args.path))
        elif args.command == "show":
            result = ledger.snapshot(args.tenant, args.name)
        else:
            result = ledger.create_snapshot(args.tenant, args.name, args.start, args.end, args.as_of, args.currency, args.prior)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except (EvidenceError, OSError, json.JSONDecodeError) as exc:
        parser.exit(2, f"Evidence rejected: {exc}\n")
    finally:
        ledger.close()


if __name__ == "__main__":
    main()
