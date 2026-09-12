import copy
import hashlib
import json
import unittest

from prototype.coverage import CoverageError, evaluate_coverage
from prototype.ledger import digest, normalize_event


START = "2026-08-01T00:00:00Z"
MID = "2026-08-16T00:00:00Z"
END = "2026-09-01T00:00:00Z"
ASOF = "2026-09-03T00:00:00Z"
LATE = "2026-09-06T00:00:00Z"


def row(source_id="invoice-1", **changes):
    result = dict(tenant_id="tenant-a", source="supplier-export", source_id=source_id,
                  kind="invoice", provider="provider-a", account="account-a", currency="USD",
                  incurred_at=END, received_at="2026-09-02T00:00:00Z", amount="10.25",
                  service_start=START, service_end=END, document_type="invoice")
    result.update(changes)
    return result


def manifest():
    return dict(schema_version="1", manifest_id="august-sources", version=1, tenant_id="tenant-a",
                recorded_at="2026-09-02T00:00:00Z", expected_sources=[
                    dict(scope_id="provider-cost", source="supplier-export", kind="invoice",
                         provider="provider-a", account="account-a", currency="USD", start=START, end=END)])


def batch(rows=None, **changes):
    rows = [row()] if rows is None else rows
    payload = json.dumps(rows, indent=2)
    result = dict(batch_id="export-1", version=1, scope_id="provider-cost", received_at=ASOF,
                  start=START, end=END, completeness="complete", declared_count=1,
                  declared_totals={"amount": "10.25"}, records_json=payload,
                  source_sha256=hashlib.sha256(payload.encode("utf-8")).hexdigest())
    result.update(changes)
    return result


def codes(result):
    return {b["code"] for b in result["blocks"]}


class CoverageTests(unittest.TestCase):
    def test_matching_payload_is_reproducible_but_never_external_completeness(self):
        inputs = manifest(), [batch()]
        result = evaluate_coverage(*inputs, ASOF)
        self.assertEqual(result["state"], "locally_matched_declared_scope")
        self.assertFalse(result["close_approved"])
        self.assertFalse(result["declared_vs_verified"]["external_provider_completeness_verified"])
        self.assertEqual(result["batches"][0]["record_ids"][0]["hash"], digest(normalize_event(row())))
        claimed = result.pop("evaluation_sha256")
        self.assertEqual(claimed, digest(result))
        inputs[0]["expected_sources"][0]["account"] = "changed"
        self.assertEqual(result["manifest"]["expected_sources"][0]["account"], "account-a")

    def test_missing_expected_account_and_unexpected_scope(self):
        m = manifest()
        second = copy.deepcopy(m["expected_sources"][0])
        second.update(scope_id="other-account", account="account-b")
        m["expected_sources"].append(second)
        result = evaluate_coverage(m, [batch(), batch(batch_id="wrong", scope_id="unlisted")], ASOF)
        self.assertIn("expected_source_missing", codes(result))
        self.assertIn("unexpected_source_scope", codes(result))

    def test_partial_unknown_and_interval_gap_block(self):
        for declaration in ("partial", "unknown"):
            b = batch([row(service_end=MID)], end=MID, completeness=declaration)
            result = evaluate_coverage(manifest(), [b], ASOF)
            self.assertIn("source_completeness_not_asserted", codes(result))
            self.assertIn("expected_interval_gap", codes(result))

    def test_checksum_count_and_decimal_total_are_independently_verified(self):
        b = batch(declared_count=2, declared_totals={"amount": "10.250000000001"})
        b["records_json"] += " "  # Valid JSON; byte checksum changes.
        result = evaluate_coverage(manifest(), [b], ASOF)
        self.assertTrue({"source_checksum_mismatch", "record_count_mismatch", "declared_total_mismatch"} <= codes(result))
        self.assertEqual(result["batches"][0]["totals_computed"], {"amount": "10.25"})

    def test_row_tenant_account_currency_and_service_interval_checked(self):
        b = batch([row(tenant_id="tenant-b", account="wrong", currency="EUR", service_start="2026-07-31T00:00:00Z")])
        result = evaluate_coverage(manifest(), [b], ASOF)
        self.assertTrue({"record_tenant_mismatch", "record_scope_mismatch", "record_outside_batch_interval"} <= codes(result))
        self.assertEqual({b.get("field") for b in result["blocks"] if b["code"] == "record_scope_mismatch"}, {"account", "currency"})

    def test_disjoint_batches_cover_period_and_duplicate_record_ids_do_not(self):
        first = batch([row(service_end=MID)], end=MID)
        second = batch([row("invoice-2", service_start=MID)], batch_id="export-2", start=MID)
        self.assertFalse(evaluate_coverage(manifest(), [second, first], ASOF)["blocks"])
        duplicated = batch([row(service_start=MID)], batch_id="export-2", start=MID)
        self.assertIn("duplicate_source_record", codes(evaluate_coverage(manifest(), [first, duplicated], ASOF)))
        overlap = batch([row("invoice-3")], batch_id="export-3")
        self.assertIn("overlapping_batches", codes(evaluate_coverage(manifest(), [first, overlap], ASOF)))

    def test_late_replacement_preserves_earlier_digest_and_new_version(self):
        m, original = manifest(), batch()
        revised = batch([row(amount="12", received_at=LATE)], version=2, received_at=LATE,
                        declared_totals={"amount": "12"}, supersedes={"batch_id": "export-1", "version": 1})
        before = evaluate_coverage(m, [original], ASOF)
        self.assertEqual(before, evaluate_coverage(m, [original, revised], ASOF))
        after = evaluate_coverage(m, [original, revised], LATE)
        self.assertFalse(after["blocks"])
        self.assertEqual(after["batches"][0]["version"], 2)
        self.assertEqual(after["batches"][0]["totals_computed"], {"amount": "12"})
        self.assertNotEqual(before["evaluation_sha256"], after["evaluation_sha256"])

    def test_replacement_forks_and_scope_change_block(self):
        original = batch()
        v2 = batch(version=2, received_at=LATE, supersedes={"batch_id": "export-1", "version": 1})
        v3 = batch(version=3, received_at=LATE, supersedes={"batch_id": "export-1", "version": 1})
        self.assertIn("replacement_fork", codes(evaluate_coverage(manifest(), [original, v2, v3], LATE)))
        v2["end"] = MID
        self.assertIn("replacement_scope_or_time_changed", codes(evaluate_coverage(manifest(), [original, v2], LATE)))

    def test_duplicate_delivery_is_idempotent_but_changed_identity_rejects(self):
        b = batch()
        self.assertEqual(evaluate_coverage(manifest(), [b], ASOF), evaluate_coverage(manifest(), [b, copy.deepcopy(b)], ASOF))
        changed = copy.deepcopy(b)
        changed["declared_count"] = 4
        with self.assertRaises(CoverageError):
            evaluate_coverage(manifest(), [b, changed], ASOF)

    def test_ambiguous_json_and_overlapping_manifest_scopes_reject(self):
        b = batch(records_json='[{"tenant_id":"a","tenant_id":"b"}]')
        with self.assertRaises(CoverageError):
            evaluate_coverage(manifest(), [b], ASOF)
        m = manifest()
        duplicate = copy.deepcopy(m["expected_sources"][0])
        duplicate["scope_id"] = "same-source-alias"
        m["expected_sources"].append(duplicate)
        self.assertIn("overlapping_expected_scopes", codes(evaluate_coverage(m, [batch()], ASOF)))

    def test_manifest_and_record_receipt_are_not_backdated_by_evaluator(self):
        m = manifest()
        m["recorded_at"] = LATE
        result = evaluate_coverage(m, [batch([row(received_at=LATE)])], ASOF)
        self.assertIn("manifest_after_cutoff", codes(result))
        self.assertIn("record_after_batch_receipt", codes(result))

    def test_empty_source_requires_explicit_zero_assertion_and_no_float_totals(self):
        b = batch([], declared_count=0, declared_totals={"amount": "0"})
        result = evaluate_coverage(manifest(), [b], ASOF)
        self.assertEqual(result["state"], "locally_matched_declared_scope")
        self.assertFalse(result["declared_vs_verified"]["external_provider_completeness_verified"])
        b["declared_totals"] = {"amount": 0.0}
        with self.assertRaises(ValueError):
            evaluate_coverage(manifest(), [b], ASOF)

    def test_unknown_record_kind_rejects_and_outcome_quantity_is_verified(self):
        m = manifest()
        m['expected_sources'][0]['kind'] = 'invented-kind'
        with self.assertRaises(CoverageError):
            evaluate_coverage(m, [], ASOF)
        outcome = dict(tenant_id='tenant-a', source='outcomes', source_id='outcome-1', kind='outcome',
                       currency='USD', incurred_at='2026-08-15T00:00:00Z', received_at=ASOF,
                       customer_id='customer-a', workflow_id='workflow-a', run_id='run-a',
                       metric='accepted_document', status='accepted', quantity=1,
                       cohort_complete=True, evidence_ref='synthetic-review-1')
        m['expected_sources'][0] = dict(scope_id='provider-cost', source='outcomes', kind='outcome',
                                       currency='USD', start=START, end=END)
        b = batch([outcome], declared_totals={'quantity': '1'})
        result = evaluate_coverage(m, [b], ASOF)
        self.assertFalse(result['blocks'])
        self.assertEqual(result['batches'][0]['totals_computed'], {'quantity': '1'})


if __name__ == "__main__":
    unittest.main()
