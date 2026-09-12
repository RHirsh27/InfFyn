"""Offline checks of an operator-declared source population, never provider certification.

evaluate_coverage(manifest, batches, as_of) returns detached, digest-bearing JSON
evidence for an append-only close wrapper to persist. It does not persist anything
or authenticate the operator. The caller must preserve old manifest/evaluation
versions. A hash does not prevent a privileged operator from rewriting evidence.

Manifest version 1 (all dates timezone-aware; intervals half-open):
  {schema_version: "1", manifest_id, version: positive int, tenant_id, recorded_at,
   expected_sources: [{scope_id, source, kind, provider?, account?, currency,
                       start, end}]}
Batch:
  {batch_id, version: positive int, scope_id, received_at, start, end,
   completeness: "complete"|"partial"|"unknown", declared_count: nonnegative int,
   declared_totals: {"amount"|"quantity"|"input_total"|"meters.<meter>": decimal string},
   source_sha256, records_json: exact JSON string containing normalized rows,
   supersedes?: {batch_id, version}}

source_sha256 hashes the actual UTF-8 records_json bytes supplied, including
whitespace. This establishes the normalized-file identity, not the correctness
of a transformation from a provider-native file. Declared receipt/completeness
and the expected account list remain unverified operator assertions.
"""
from __future__ import annotations

import hashlib
import json
import re
from decimal import Decimal

from prototype.ledger import EvidenceError, canonical, currency, decimal, digest, money, normalize_event, required_text, timestamp


class CoverageError(EvidenceError):
    """The coverage contract itself is malformed or ambiguous."""


TOTAL_FIELDS = {"amount", "quantity", "input_total", "meters.input_uncached", "meters.input_cached", "meters.cache_write", "meters.output"}
RECORD_KINDS = {"usage", "invoice", "revenue", "cost_component", "outcome"}
MANIFEST_FIELDS = {"schema_version", "manifest_id", "version", "tenant_id", "recorded_at", "expected_sources"}
SCOPE_FIELDS = {"scope_id", "source", "kind", "provider", "account", "currency", "start", "end"}
BATCH_FIELDS = {"batch_id", "version", "scope_id", "received_at", "start", "end", "completeness", "declared_count", "declared_totals", "source_sha256", "records_json", "supersedes"}


def _keys(obj, allowed, name):
    if not isinstance(obj, dict) or set(obj) - allowed:
        raise CoverageError(f"{name} contains unsupported fields or is not an object")


def _version(obj):
    value = obj.get("version")
    if type(value) is not int or value < 1:
        raise CoverageError("version must be a positive integer")
    return value


def _interval(obj):
    start, end = timestamp(obj.get("start")), timestamp(obj.get("end"))
    if start >= end:
        raise CoverageError("Coverage interval must be nonempty")
    return start, end


def _json_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CoverageError("Duplicate JSON object keys are ambiguous")
        result[key] = value
    return result


def _numeric_at(record, field):
    value = record
    for key in field.split("."):
        if not isinstance(value, dict) or key not in value:
            raise CoverageError(f"Declared total field {field} is absent from a record")
        value = value[key]
    return decimal(value)


def evaluate_coverage(manifest: dict, batches: list[dict], as_of: str) -> dict:
    """Validate local bytes/rows against declared scope; never approve a close.

    Malformed contracts raise CoverageError/EvidenceError. Data discrepancies
    produce structured blocks. Future batches are absent from the evaluation,
    so appending a later replacement cannot change an earlier as-of digest.
    Batch replacements must be a linear chain of versions of the same batch ID.
    """
    cutoff = timestamp(as_of)
    _keys(manifest, MANIFEST_FIELDS, "Manifest")
    if manifest.get("schema_version") != "1":
        raise CoverageError("Only coverage schema_version '1' is supported")
    manifest_id = required_text(manifest, "manifest_id")
    version = _version(manifest)
    tenant = required_text(manifest, "tenant_id")
    recorded_at = timestamp(manifest.get("recorded_at"))
    raw_scopes = manifest.get("expected_sources")
    if not isinstance(raw_scopes, list) or not raw_scopes:
        raise CoverageError("At least one expected source scope is required")
    if not isinstance(batches, list):
        raise CoverageError("batches must be a list")
    blocks, scopes = [], {}

    def block(code, **details):
        blocks.append({"code": code, **details})

    for raw in raw_scopes:
        _keys(raw, SCOPE_FIELDS, "Expected source")
        scope = {key: required_text(raw, key) for key in ("scope_id", "source", "kind")}
        if scope["kind"] not in RECORD_KINDS:
            raise CoverageError("Expected source kind must be a supported normalized record kind")
        scope.update(currency=currency(raw.get("currency")))
        scope["start"], scope["end"] = _interval(raw)
        if ("provider" in raw) != ("account" in raw):
            raise CoverageError("Provider and account must be supplied together")
        if scope["kind"] in ("usage", "invoice") and "provider" not in raw:
            raise CoverageError("Usage/invoice source scopes require provider and account")
        if "provider" in raw:
            scope.update(provider=required_text(raw, "provider"), account=required_text(raw, "account"))
        if scope["scope_id"] in scopes:
            raise CoverageError("scope_id must be unique")
        scopes[scope["scope_id"]] = scope
    normalized_manifest = dict(schema_version="1", manifest_id=manifest_id, version=version,
                               tenant_id=tenant, recorded_at=recorded_at,
                               expected_sources=sorted(scopes.values(), key=lambda s: s["scope_id"]))
    if recorded_at > cutoff:
        block("manifest_after_cutoff", recorded_at=recorded_at)
    # Duplicate expectations for the same actual source cannot conceal overlaps.
    ordered_scopes = list(scopes.values())
    for i, left in enumerate(ordered_scopes):
        for right in ordered_scopes[i + 1:]:
            identity = ("source", "kind", "provider", "account", "currency")
            if all(left.get(k) == right.get(k) for k in identity) and max(left["start"], right["start"]) < min(left["end"], right["end"]):
                block("overlapping_expected_scopes", scope_ids=sorted([left["scope_id"], right["scope_id"]]))

    eligible = {}
    for raw in batches:
        if not isinstance(raw, dict):
            raise CoverageError("Batch must be an object")
        received_at = timestamp(raw.get("received_at"))
        if received_at > cutoff:
            continue
        _keys(raw, BATCH_FIELDS, "Batch")
        batch = {key: required_text(raw, key) for key in ("batch_id", "scope_id", "source_sha256")}
        batch.update(version=_version(raw), received_at=received_at)
        batch["start"], batch["end"] = _interval(raw)
        completeness = raw.get("completeness")
        if completeness not in ("complete", "partial", "unknown"):
            raise CoverageError("completeness must be complete, partial, or unknown")
        count = raw.get("declared_count")
        if type(count) is not int or count < 0:
            raise CoverageError("declared_count must be a nonnegative integer")
        totals = raw.get("declared_totals")
        if not isinstance(totals, dict) or not totals or set(totals) - TOTAL_FIELDS:
            raise CoverageError("declared_totals requires supported numeric field names")
        batch.update(completeness=completeness, declared_count=count,
                     declared_totals={k: money(decimal(v)) for k, v in totals.items()})
        if not re.fullmatch(r"[0-9a-f]{64}", batch["source_sha256"]):
            raise CoverageError("source_sha256 must be a lowercase SHA-256 digest")
        payload = raw.get("records_json")
        if not isinstance(payload, str):
            raise CoverageError("records_json must be the exact normalized-source JSON text")
        batch["actual_source_sha256"] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        try:
            rows = json.loads(payload, object_pairs_hook=_json_pairs)
        except (ValueError, TypeError) as exc:
            raise CoverageError("records_json must contain unambiguous JSON") from exc
        if not isinstance(rows, list):
            raise CoverageError("records_json must contain a record array")
        batch["records"] = rows
        prior = raw.get("supersedes")
        if prior is not None:
            _keys(prior, {"batch_id", "version"}, "Replacement reference")
            batch["supersedes"] = {"batch_id": required_text(prior, "batch_id"), "version": _version(prior)}
        key = (batch["batch_id"], batch["version"])
        if key in eligible and eligible[key] != batch:
            raise CoverageError("Conflicting batch identity; use a new replacement version")
        eligible[key] = batch  # Identical repeated delivery has one effect.

    replaced, children = set(), {}
    for key, batch in sorted(eligible.items()):
        prior = batch.get("supersedes")
        if prior is None:
            if batch["version"] != 1:
                block("replacement_reference_missing", batch_id=key[0], version=key[1])
            continue
        prior_key = (prior["batch_id"], prior["version"])
        previous = eligible.get(prior_key)
        if previous is None or prior_key[0] != key[0] or prior_key[1] >= key[1]:
            block("invalid_replacement_reference", batch_id=key[0], version=key[1])
            continue
        if any(batch[k] != previous[k] for k in ("scope_id", "start", "end")) or batch["received_at"] < previous["received_at"]:
            block("replacement_scope_or_time_changed", batch_id=key[0], version=key[1])
            continue
        children.setdefault(prior_key, []).append(key)
        replaced.add(prior_key)
    for prior_key, versions in children.items():
        if len(versions) > 1:
            block("replacement_fork", batch_id=prior_key[0], prior_version=prior_key[1], versions=sorted(k[1] for k in versions))
    selected = [(key, batch) for key, batch in sorted(eligible.items()) if key not in replaced]
    checks, intervals, seen_records = [], {key: [] for key in scopes}, set()
    for key, batch in selected:
        context = {"batch_id": key[0], "version": key[1], "scope_id": batch["scope_id"]}
        scope = scopes.get(batch["scope_id"])
        if scope is None:
            block("unexpected_source_scope", **context)
        else:
            intervals[scope["scope_id"]].append((batch["start"], batch["end"], key))
            if batch["start"] < scope["start"] or batch["end"] > scope["end"]:
                block("batch_outside_expected_interval", **context)
        if batch["completeness"] != "complete":
            block("source_completeness_not_asserted", **context, completeness=batch["completeness"])
        if batch["actual_source_sha256"] != batch["source_sha256"]:
            block("source_checksum_mismatch", **context)
        rows = batch["records"]
        if len(rows) != batch["declared_count"]:
            block("record_count_mismatch", **context, declared=batch["declared_count"], actual=len(rows))
        normalized, record_ids = [], []
        for index, raw in enumerate(rows):
            try:
                record = normalize_event(raw)
            except (EvidenceError, TypeError, AttributeError) as exc:
                block("invalid_normalized_record", **context, row=index, reason=str(exc))
                continue
            normalized.append(record)
            record_id = (record["tenant_id"], record["source"], record["source_id"])
            record_ids.append({"tenant_id": record_id[0], "source": record_id[1], "source_id": record_id[2],
                               "hash": digest(record), "kind": record["kind"], "currency": record["currency"],
                               "incurred_at": record["incurred_at"], "received_at": record["received_at"],
                               **{k: record[k] for k in ("provider", "account", "service_start", "service_end", "supersedes") if k in record}})
            if record_id in seen_records:
                block("duplicate_source_record", **context, source=record_id[1], source_id=record_id[2])
            seen_records.add(record_id)
            if record["tenant_id"] != tenant:
                block("record_tenant_mismatch", **context, row=index)
            if scope is not None:
                for field in ("source", "kind", "currency", "provider", "account"):
                    if record.get(field) != scope.get(field):
                        block("record_scope_mismatch", **context, row=index, field=field)
            if record["received_at"] > batch["received_at"]:
                block("record_after_batch_receipt", **context, row=index)
            if record["kind"] == "invoice":
                in_period = batch["start"] <= record["service_start"] and record["service_end"] <= batch["end"]
            else:
                in_period = batch["start"] <= record["incurred_at"] < batch["end"]
            if not in_period:
                block("record_outside_batch_interval", **context, row=index)
        actual_totals = {}
        for field, declared in batch["declared_totals"].items():
            try:
                actual = sum((_numeric_at(row, field) for row in normalized), Decimal(0))
            except EvidenceError as exc:
                block("total_field_unavailable", **context, field=field, reason=str(exc))
                actual_totals[field] = None
                continue
            actual_totals[field] = money(actual)
            if actual != decimal(declared):
                block("declared_total_mismatch", **context, field=field, declared=declared, actual=money(actual))
        checks.append({**context, "start": batch["start"], "end": batch["end"],
                       "received_at_operator_declared": batch["received_at"],
                       "completeness_operator_declared": batch["completeness"],
                       "source_sha256_declared": batch["source_sha256"],
                       "source_sha256_computed": batch["actual_source_sha256"],
                       "record_count_declared": batch["declared_count"], "record_count_observed": len(rows),
                       "totals_declared": batch["declared_totals"], "totals_computed": actual_totals,
                       "record_ids": record_ids, "supersedes": batch.get("supersedes")})
    for scope_id, scope in sorted(scopes.items()):
        spans = sorted(intervals[scope_id])
        if not spans:
            block("expected_source_missing", scope_id=scope_id, source=scope["source"], account=scope.get("account"))
            continue
        frontier = scope["start"]
        for start, end, key in spans:
            if start > frontier:
                block("expected_interval_gap", scope_id=scope_id, start=frontier, end=start)
            if start < frontier:
                block("overlapping_batches", scope_id=scope_id, batch_id=key[0], version=key[1])
            frontier = max(frontier, end)
        if frontier < scope["end"]:
            block("expected_interval_gap", scope_id=scope_id, start=frontier, end=scope["end"])
    result = {"schema_version": "1", "evaluation_kind": "operator_declared_source_coverage",
              "tenant_id": tenant, "as_of": cutoff, "manifest": normalized_manifest,
              "manifest_sha256": digest(normalized_manifest),
              "state": "blocked" if blocks else "locally_matched_declared_scope",
              "close_approved": False, "blocks": sorted(blocks, key=canonical), "batches": checks,
              "declared_vs_verified": {
                  "local_checks_performed": ["normalized_payload_sha256", "parsed_record_count", "declared_numeric_totals", "row_scope_and_intervals", "declared_interval_coverage", "stable_record_id_uniqueness"],
                  "all_local_checks_passed": not blocks,
                  "operator_declared": ["expected_source_population", "source_completeness", "receipt_times", "normalization_and_economic_semantics"],
                  "external_provider_completeness_verified": False,
                  "provider_to_normalized_conversion_verified": False},
              "limitation": "A local match only checks supplied normalized records against operator declarations; omitted providers, source rows, or incorrect declarations cannot be discovered without independent evidence."}
    result["evaluation_sha256"] = digest(result)
    return json.loads(canonical(result))  # No mutable references to caller inputs.
