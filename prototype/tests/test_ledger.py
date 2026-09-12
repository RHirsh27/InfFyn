import copy
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from prototype.ledger import EvidenceError, Ledger, decimal, usage_csv_bundle, openai_response_bundle


START = "2026-08-01T00:00:00Z"
END = "2026-09-01T00:00:00Z"
ASOF = "2026-09-03T00:00:00Z"


def rate(version="r1", **changes):
    return dict(tenant_id="client-a", version=version, provider="synthetic-provider", account="account-a", model="model-a", currency="USD", effective_start=START, effective_end="2026-10-01T00:00:00Z", received_at=START, source_ref="synthetic-contract-v1", per_million={"input_uncached": "2", "input_cached": "0.5", "cache_write": "3", "output": "10"}, **changes)


def usage(source_id="u1", **changes):
    result = dict(tenant_id="client-a", source="synthetic-usage", source_id=source_id, kind="usage", incurred_at="2026-08-15T12:00:00Z", received_at="2026-08-15T12:00:01Z", currency="USD", provider="synthetic-provider", account="account-a", customer_id="customer-a", model="model-a", request_id=source_id, rate_version="r1", attempt=1, outcome="success", billable=True, input_total=1_000_000, meters={"input_uncached": 1_000_000, "input_cached": 0, "cache_write": 0, "output": 0})
    result.update(changes)
    return result


def invoice(source_id="i1", **changes):
    result = dict(tenant_id="client-a", source="synthetic-invoice", source_id=source_id, kind="invoice", incurred_at=END, received_at="2026-09-02T00:00:00Z", currency="USD", provider="synthetic-provider", account="account-a", amount="2", service_start=START, service_end=END)
    result.update(changes)
    return result


def revenue(source_id="r1", **changes):
    result = dict(tenant_id="client-a", source="synthetic-recognized-revenue", source_id=source_id, kind="revenue", incurred_at="2026-08-31T00:00:00Z", received_at="2026-09-02T00:00:00Z", currency="USD", customer_id="customer-a", amount="100", basis="recognized")
    result.update(changes)
    return result


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "test.sqlite"
        self.ledger = Ledger(self.path)

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def load(self, *events, rates=None):
        return self.ledger.import_bundle({"rates": [rate()] if rates is None else rates, "events": list(events)})

    def snap(self, name="august", tenant="client-a", asof=ASOF, curr="USD", prior=None):
        return self.ledger.create_snapshot(tenant, name, START, END, asof, curr, prior)

    def test_matching_invoice_is_not_added_to_usage(self):
        self.load(usage(), invoice(), revenue())
        result = self.snap()
        self.assertEqual(result["totals"]["known_cost"], "2")
        self.assertEqual(result["totals"]["profit_estimate"], "98")
        self.assertEqual(result["arithmetic_state"], "matched_within_imported_scope")
        self.assertEqual(result["approval_state"], "not_approved")
        self.assertEqual(result["customers"]["customer-a"]["cost_basis"], "usage_rated_estimate")

    def test_duplicate_source_is_noop_conflict_is_atomic(self):
        self.load(usage())
        self.assertEqual(self.load(usage())["duplicates"], 2)
        with self.assertRaises(EvidenceError):
            self.load(usage("new"), usage(input_total=2_000_000, meters={"input_uncached": 2_000_000}))
        self.assertEqual(self.ledger.db.execute("SELECT count(*) FROM events").fetchone()[0], 1)

    def test_tenant_scoped_identical_ids_and_read_isolation(self):
        self.load(usage(), invoice(), revenue())
        b_rate = rate()
        b_rate["tenant_id"] = "client-b"
        self.load(usage(tenant_id="client-b"), invoice(tenant_id="client-b", amount="8"), revenue(tenant_id="client-b", amount="900"), rates=[b_rate])
        a = self.snap()
        b = self.snap(tenant="client-b")
        self.assertEqual(a["totals"]["recognized_revenue"], "100")
        self.assertEqual(b["totals"]["recognized_revenue"], "900")
        with self.assertRaises(EvidenceError):
            self.ledger.snapshot("unknown-tenant", "august")
        self.assertEqual(self.ledger.snapshot("client-a", "august")["snapshot_hash"], a["snapshot_hash"])

    def test_missing_price_stays_unknown_and_blocks_margin(self):
        self.load(usage(rate_version="missing"), revenue())
        result = self.snap()
        self.assertIsNone(result["totals"]["cost_total"])
        self.assertIsNone(result["totals"]["profit_estimate"])
        self.assertIsNone(result["customers"]["customer-a"]["usage_cost"])
        self.assertIsNone(result["customers"]["customer-a"]["profit_estimate"])
        self.assertEqual(result["rated_usage"][0]["cost"], None)

    def test_invoice_can_bound_total_with_unknown_customer_attribution(self):
        self.load(usage(rate_version="missing"), invoice(amount="12"), revenue())
        result = self.snap()
        self.assertEqual(result["totals"]["cost_total"], "12")
        self.assertEqual(result["totals"]["unallocated_cost"], "12")
        self.assertIsNone(result["customers"]["customer-a"]["profit_estimate"])
        self.assertEqual(result["arithmetic_state"], "needs_review")

    def test_cache_partition_and_retry_attempts_are_both_charged(self):
        first = usage(request_id="logical-1", outcome="error", input_total=1_000_000, meters={"input_uncached": 500_000, "input_cached": 500_000, "output": 100_000})
        retry = usage("u2", request_id="logical-1", attempt=2, input_total=1_000_000, meters={"input_uncached": 500_000, "cache_write": 500_000})
        self.load(first, retry, invoice(amount="4.75"))
        result = self.snap()
        self.assertEqual(result["totals"]["known_cost"], "4.75")
        self.assertEqual([r["cost"] for r in result["rated_usage"]], ["2.25", "2.5"])
        self.assertEqual(len(result["rated_usage"]), 2)
        with self.assertRaises(EvidenceError):
            self.load(usage("bad", input_total=1_000_000, meters={"input_uncached": 1_000_000, "input_cached": 100}))

    def test_missing_nonzero_meter_price_unknown(self):
        r = rate()
        del r["per_million"]["input_cached"]
        self.load(usage(meters={"input_cached": 1_000_000}), rates=[r])
        self.assertIsNone(self.snap()["rated_usage"][0]["cost"])

    def test_explicit_nonbillable_error_has_zero_cost(self):
        self.load(usage(outcome="error", billable=False, rate_version="missing"), invoice(amount="0"))
        result = self.snap()
        self.assertEqual(result["rated_usage"][0]["cost"], "0")
        self.assertEqual(result["rated_usage"][0]["cost_basis"], "source_declared_nonbillable")

    def test_rate_version_effective_and_received_time(self):
        old = rate()
        old["effective_end"] = "2026-08-16T00:00:00Z"
        new = copy.deepcopy(old)
        new.update(version="r2", effective_start="2026-08-16T00:00:00Z", effective_end=END, received_at="2026-08-16T00:00:00Z")
        new["per_million"]["input_uncached"] = "3"
        self.load(usage(), usage("u2", incurred_at="2026-08-16T00:00:00Z", received_at="2026-08-16T00:00:01Z", rate_version="r2"), rates=[old, new])
        result = self.snap()
        self.assertEqual([r["cost"] for r in result["rated_usage"]], ["2", "3"])
        self.assertEqual(len(result["manifest"]["rates"]), 2)
        with self.assertRaises(EvidenceError):
            self.load(rates=[rate()])

    def test_rate_received_after_cutoff_is_not_historical_knowledge(self):
        r = rate()
        r["received_at"] = "2026-09-04T00:00:00Z"
        self.load(usage(), rates=[r])
        self.assertIsNone(self.snap()["totals"]["cost_total"])

    def test_half_open_period_and_timezone_conversion(self):
        self.load(usage("first", incurred_at=START, received_at=START), usage("next-month", incurred_at=END, received_at=END), usage("prior-month", incurred_at="2026-08-01T01:00:00+02:00", received_at="2026-08-01T01:00:01+02:00"))
        result = self.snap()
        self.assertEqual([r["source_id"] for r in result["rated_usage"]], ["first"])

    def test_asof_inclusive_and_late_invoice_preserves_frozen_snapshot(self):
        self.load(usage(), revenue())
        original = self.snap(asof="2026-09-02T00:00:00Z")
        original_json = json.dumps(original, sort_keys=True)
        self.load(invoice(amount="3", received_at="2026-09-04T00:00:00Z"))
        later = self.snap("revision-2", asof="2026-09-05T00:00:00Z", prior="august")
        self.assertEqual(later["adjustment"]["known_cost_change"], "1")
        self.assertEqual(later["totals"]["signed_invoice_residual"], "1")
        self.assertEqual(json.dumps(self.ledger.snapshot("client-a", "august"), sort_keys=True), original_json)
        self.assertEqual(original["totals"]["recognized_revenue"], "100")

    def test_append_correction_only_changes_later_asof(self):
        self.load(usage(), invoice(), revenue())
        original = self.snap()
        corrected = usage("u-corrected", input_total=2_000_000, meters={"input_uncached": 2_000_000}, received_at="2026-09-04T00:00:00Z", supersedes={"source": "synthetic-usage", "source_id": "u1"})
        self.load(corrected)
        historical = self.snap("historical")
        updated = self.snap("updated", asof="2026-09-05T00:00:00Z", prior="august")
        self.assertEqual(historical["rated_usage"], original["rated_usage"])
        self.assertEqual(updated["rated_usage"][0]["cost"], "4")
        self.assertEqual(updated["totals"]["signed_invoice_residual"], "-2")
        with self.assertRaises(EvidenceError):
            self.load(usage("bad-correction", supersedes={"source": "synthetic-usage", "source_id": "u1"}))

    def test_mixed_currencies_are_separate_and_disclosed(self):
        self.load(usage(), invoice(), revenue(), revenue("eur", amount="75", currency="EUR"))
        usd = self.snap()
        eur = self.snap("euro", curr="EUR")
        self.assertEqual(usd["totals"]["recognized_revenue"], "100")
        self.assertEqual(eur["totals"]["recognized_revenue"], "75")
        self.assertEqual(usd["manifest"]["other_currency_events_excluded"], 1)

    def test_no_revenue_and_revenue_only_never_imply_margin(self):
        self.load(usage(), invoice())
        result = self.snap()
        self.assertIsNone(result["totals"]["profit_estimate"])
        self.assertIsNone(result["customers"]["customer-a"]["profit_estimate"])
        self.load(revenue(customer_id="customer-b"))
        result = self.snap("with-revenue")
        self.assertIsNone(result["customers"]["customer-b"]["profit_estimate"])

    def test_unattributed_positive_and_negative_residual_conserve(self):
        self.load(usage(), usage("unassigned", customer_id=None), invoice(amount="3"), revenue(customer_id=None))
        result = self.snap()
        totals = result["totals"]
        self.assertEqual(totals["customer_attributed_known_cost"], "2")
        self.assertEqual(totals["unassigned_usage_cost"], "2")
        self.assertEqual(totals["signed_invoice_residual"], "-1")
        self.assertEqual(totals["unallocated_cost"], "1")
        self.assertEqual(totals["known_cost"], "3")
        self.assertEqual(totals["unassigned_revenue"], "100")

    def test_provider_account_scopes_never_cover_each_other(self):
        self.load(usage(), invoice(account="other", amount="7"))
        result = self.snap()
        self.assertEqual(len(result["reconciliation"]), 2)
        self.assertEqual(result["totals"]["known_cost"], "9")
        self.assertEqual(result["totals"]["unallocated_cost"], "7")

    def test_partial_invoice_period_is_blocked_never_prorated(self):
        self.load(usage(), invoice(service_start="2026-08-15T00:00:00Z", amount="999"))
        result = self.snap()
        self.assertIsNone(result["totals"]["cost_total"])
        self.assertIn("invoice_period_mismatch", [i["code"] for i in result["issues"]])
        self.assertEqual(result["issues"][0]["amount_not_allocated"], "999")

    def test_credit_is_signed_invoice_adjustment(self):
        self.load(usage(), invoice(amount="4"), invoice("credit", amount="-2", document_type="credit"))
        self.assertEqual(self.snap()["totals"]["known_cost"], "2")

    def test_credit_without_principal_cannot_establish_complete_cost(self):
        self.load(usage(), invoice("credit", amount="-1", document_type="credit"), revenue())
        result = self.snap()
        self.assertEqual(result["totals"]["known_cost"], "1")
        self.assertIsNone(result["totals"]["cost_total"])
        self.assertIsNone(result["totals"]["profit_estimate"])
        self.assertFalse(result["totals"]["cost_complete_within_imported_scope"])
        self.assertIn("credit_without_principal_invoice", [i["code"] for i in result["issues"]])

    def test_duplicate_billable_attempt_across_sources_rejected(self):
        self.load(usage(request_id="provider-request-1"))
        with self.assertRaises(EvidenceError):
            self.load(usage("gateway-copy", source="gateway", request_id="provider-request-1"))
        self.load(usage("retry", source="gateway", request_id="provider-request-1", attempt=2))
        self.assertEqual(len(self.snap()["rated_usage"]), 2)

    def test_missing_revenue_baseline_is_not_zero_in_revision(self):
        self.load(usage(), invoice())
        self.snap()
        self.load(revenue(received_at="2026-09-04T00:00:00Z"))
        result = self.snap("revenue-added", asof="2026-09-05T00:00:00Z", prior="august")
        self.assertIsNone(result["adjustment"]["recognized_revenue_change"])
        self.assertEqual(result["adjustment"]["revenue_evidence_state"], "incomplete_comparison")

    def test_snapshot_reads_events_and_rates_within_one_transaction(self):
        self.load(usage(), invoice())
        connection = self.ledger.db
        observations = []
        class Probe:
            def __getattr__(self, name):
                return getattr(connection, name)
            def execute(self, sql, parameters=()):
                if sql.startswith("SELECT payload") and ("FROM events" in sql or "FROM rates" in sql):
                    observations.append(connection.in_transaction)
                return connection.execute(sql, parameters)
        self.ledger.db = Probe()
        self.snap()
        self.assertGreaterEqual(len(observations), 2)
        self.assertTrue(all(observations))
        self.ledger.db = connection

    def test_unsupported_coverage_or_aggregation_fields_are_rejected(self):
        with self.assertRaises(EvidenceError):
            self.load(invoice(model="only-one-of-many-models"))
        with self.assertRaises(EvidenceError):
            self.load(usage(is_aggregate=True))

    def test_nonfinite_float_timezone_and_cash_rejected(self):
        for value in ("NaN", "Infinity", "-Infinity", 0.1, "1e999", "0.0000000000001"):
            with self.subTest(value=value), self.assertRaises(EvidenceError):
                decimal(value)
        with self.assertRaises(EvidenceError):
            self.load(usage(incurred_at="2026-08-10T00:00:00"))
        with self.assertRaises(EvidenceError):
            self.load(revenue(basis="cash"))

    def test_exact_decimal_does_not_round_cents_or_mix_token_directions(self):
        r = rate()
        r["per_million"] = {"input_uncached": "0.1", "output": "0.2"}
        self.load(usage(input_total=1, meters={"input_uncached": 1, "output": 1}), rates=[r])
        self.assertEqual(self.snap()["rated_usage"][0]["cost"], "0.0000003")

    def test_append_only_database_and_durable_reopen(self):
        self.load(usage(), invoice())
        original = self.snap()
        for table in ("events", "rates", "snapshots"):
            with self.assertRaises(sqlite3.IntegrityError):
                self.ledger.db.execute(f"DELETE FROM {table}")
            self.ledger.db.rollback()
        self.ledger.close()
        self.ledger = Ledger(self.path)
        self.assertEqual(self.ledger.snapshot("client-a", "august"), original)
        with self.assertRaises(EvidenceError):
            self.snap()

    def test_csv_normalization_requires_disjoint_meters_and_explicit_billability(self):
        cols = ["tenant_id", "source", "source_id", "incurred_at", "received_at", "currency", "provider", "account", "customer_id", "model", "request_id", "rate_version", "attempt", "outcome", "billable", "input_total", "input_uncached", "input_cached", "cache_write", "output"]
        event = usage()
        flat = {**event, **event["meters"], "billable": "true"}
        path = Path(self.temp.name) / "attempts.csv"
        path.write_text(",".join(cols) + "\n" + ",".join(str(flat[c]) for c in cols) + "\n", encoding="utf8")
        self.ledger.import_bundle({"rates": [rate()], **usage_csv_bundle(path)})
        self.assertEqual(self.snap()["rated_usage"][0]["cost"], "2")
        path.write_text(path.read_text().replace(",true,", ",maybe,"))
        with self.assertRaises(EvidenceError):
            usage_csv_bundle(path)

    def test_native_response_file_adapter_extracts_usage_not_output(self):
        raw = {"id": "resp_synthetic", "object": "response", "status": "completed", "service_tier": "default", "created_at": 1786795200, "model": "model-a", "tools": [], "output": [{"type": "message", "content": [{"type": "output_text", "text": "THIS CONTENT MUST NOT BE STORED"}]}], "usage": {"input_tokens": 1000, "input_tokens_details": {"cached_tokens": 200}, "output_tokens": 100, "output_tokens_details": {"reasoning_tokens": 50}, "total_tokens": 1100}}
        path = Path(self.temp.name) / "response.json"
        path.write_text(json.dumps(raw), encoding="utf8")
        bundle = openai_response_bundle(path, "client-a", "account-a", "2026-09-02T00:00:00Z", "r1", "customer-a")
        event = bundle["events"][0]
        self.assertEqual(event["meters"]["input_uncached"], 800)
        self.assertEqual(event["meters"]["input_cached"], 200)
        self.assertEqual(event["meters"]["output"], 100)
        self.assertNotIn("THIS CONTENT MUST NOT BE STORED", json.dumps(bundle))
        self.assertEqual(len(event["evidence_sha256"]), 64)
        native_rate = rate()
        native_rate["provider"] = "openai"
        self.ledger.import_bundle({"rates": [native_rate], "events": bundle["events"]})
        result = self.snap()
        self.assertEqual(result["rated_usage"][0]["cost"], "0.0027")
        raw["usage"]["input_tokens_details"]["cache_write_tokens"] = 1
        path.write_text(json.dumps(raw))
        with self.assertRaises(EvidenceError):
            openai_response_bundle(path, "client-a", "account-a", ASOF, "r1")
        raw["usage"]["input_tokens_details"]["cache_write_tokens"] = 0
        raw["service_tier"] = "priority"
        path.write_text(json.dumps(raw))
        with self.assertRaises(EvidenceError):
            openai_response_bundle(path, "client-a", "account-a", ASOF, "r1")


if __name__ == "__main__":
    unittest.main()
