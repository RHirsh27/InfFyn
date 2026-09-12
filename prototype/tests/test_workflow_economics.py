"""Economic invariants beyond token spend, using only synthetic local evidence."""
import copy
import tempfile
import unittest
from pathlib import Path

from prototype.ledger import EvidenceError, Ledger
from prototype.tests.test_ledger import START, END, ASOF, rate, usage, invoice, revenue


def attempt(source_id="u1", run="run-1", **changes):
    return usage(source_id, workflow_id="outreach", run_id=run, **changes)


def component(source_id="labor-1", run="run-1", **changes):
    result = {"tenant_id": "client-a", "source": "synthetic-expenses", "source_id": source_id, "kind": "cost_component", "incurred_at": "2026-08-15T13:00:00Z", "received_at": "2026-08-15T14:00:00Z", "currency": "USD", "customer_id": "customer-a", "workflow_id": "outreach", "run_id": run, "category": "human_review", "unit": "hour", "quantity": "0.25", "basis": "rated", "unit_rate": "40", "amount": "10", "evidence_ref": "synthetic-timesheet:1", "policy_ref": "synthetic-loaded-labor-v1", "invoice_coverage": "internal"}
    result.update(changes)
    if result["basis"] != "rated":
        result.pop("unit_rate", None)
    return result


def supplier_component(source_id="search-1", run="run-1", **changes):
    result = component(source_id, run, category="search", unit="search", quantity="1", basis="observed", amount="3", evidence_ref="synthetic-search-invoice-line:1", invoice_coverage="covered_by_supplier_invoice", provider="synthetic-provider", account="account-a")
    result.update(changes)
    return result


def outcome(source_id="accepted-1", run="run-1", **changes):
    result = {"tenant_id": "client-a", "source": "synthetic-business-review", "source_id": source_id, "kind": "outcome", "incurred_at": "2026-08-16T00:00:00Z", "received_at": "2026-08-16T00:01:00Z", "currency": "USD", "workflow_id": "outreach", "run_id": run, "customer_id": "customer-a", "metric": "qualified_reply", "status": "accepted", "quantity": 1, "cohort_complete": True, "evidence_ref": "synthetic-acceptance-review:1"}
    result.update(changes)
    return result


class WorkflowEconomicsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "economics.sqlite"
        self.ledger = Ledger(self.path)

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def load(self, *events, rates=None):
        return self.ledger.import_bundle({"rates": [rate()] if rates is None else rates, "events": list(events)})

    def close_period(self, name="august", tenant="client-a", cutoff=ASOF, prior=None):
        return self.ledger.create_snapshot(tenant, name, START, END, cutoff, "USD", prior)

    def test_token_tool_and_labor_total_without_double_counted_supplier_invoice(self):
        self.load(attempt(), supplier_component(), component(), invoice(amount="5"), outcome(), revenue())
        result = self.close_period()
        self.assertEqual(result["totals"]["known_cost"], "15")
        self.assertEqual(result["totals"]["additional_component_known_cost"], "10")
        self.assertEqual(result["reconciliation"][0]["known_attribution_subtotal"], "5")
        self.assertEqual(result["reconciliation"][0]["signed_unallocated_difference"], "0")
        self.assertEqual(result["workflow_economics"][0]["cost_per_accepted_outcome"], "15")
        customer = result["customers"]["customer-a"]
        self.assertEqual(customer["known_usage_cost"], "2")
        self.assertEqual(customer["known_component_cost"], "13")
        self.assertEqual(customer["economic_cost"], "15")
        self.assertEqual(customer["profit_estimate"], "85")
        self.assertEqual({b["basis"] for b in customer["cost_basis_composition"]}, {"rated", "observed"})

    def test_rejected_runs_failures_and_retries_remain_in_workflow_numerator(self):
        self.load(attempt(request_id="logical-1", outcome="error"), attempt("retry", request_id="logical-1", attempt=2), attempt("rejected-call", run="run-2"), component(), supplier_component(run="run-2"), invoice(amount="9"), outcome(), outcome("rejected-1", run="run-2", status="rejected"))
        workflow = self.close_period()["workflow_economics"][0]
        self.assertEqual(workflow["known_cost"], "19")
        self.assertEqual(workflow["accepted_outcomes"], 1)
        self.assertEqual(workflow["cost_per_accepted_outcome"], "19")
        self.assertEqual(workflow["usage_attempts"], 3)
        self.assertEqual(workflow["failed_usage_attempts"], 1)
        rejected = next(r for r in workflow["runs"] if r["run_id"] == "run-2")
        self.assertEqual(rejected["known_cost"], "5")
        self.assertIsNone(rejected["cost_per_accepted_outcome"])
        self.assertEqual(rejected["blockers"], [])

    def test_unknown_non_token_cost_never_becomes_zero_profit_or_unit_cost(self):
        self.load(attempt(), component(unit_rate=None, amount=None), invoice(), outcome(), revenue())
        result = self.close_period()
        self.assertEqual(result["totals"]["known_cost"], "2")
        self.assertIsNone(result["totals"]["cost_total"])
        self.assertIsNone(result["customers"]["customer-a"]["profit_estimate"])
        self.assertIsNone(result["workflow_economics"][0]["cost_per_accepted_outcome"])
        self.assertIsNone(result["cost_components"][0]["cost"])

    def test_unknown_covered_component_invoice_bounds_total_but_not_workflow(self):
        self.load(attempt(), supplier_component(amount=None), invoice(amount="5"), outcome())
        result = self.close_period()
        self.assertEqual(result["totals"]["cost_total"], "5")
        self.assertEqual(result["totals"]["signed_invoice_residual"], "3")
        self.assertIsNone(result["workflow_economics"][0]["cost_per_accepted_outcome"])

    def test_unexplained_invoice_residual_does_not_get_assigned_to_workflows(self):
        self.load(attempt(), supplier_component(), invoice(amount="7"), outcome())
        result = self.close_period()
        self.assertEqual(result["totals"]["unallocated_cost"], "2")
        self.assertEqual(result["workflow_economics"][0]["known_cost"], "5")
        self.assertIsNone(result["workflow_economics"][0]["cost_per_accepted_outcome"])
        self.assertIn("unallocated_supplier_difference", result["workflow_economics"][0]["blockers"])

    def test_external_additional_and_internal_costs_stay_outside_invoice_pool(self):
        self.load(attempt(), invoice(), supplier_component(invoice_coverage="additional_to_supplier_invoice"), component(category="shared", basis="allocated", amount="20", quantity="0.2", policy_ref="documented-shared-storage-allocation-v1"), outcome())
        result = self.close_period()
        self.assertEqual(result["reconciliation"][0]["selected_known_cost"], "2")
        self.assertEqual(result["totals"]["known_cost"], "25")
        self.assertEqual(result["workflow_economics"][0]["cost_per_accepted_outcome"], "25")
        self.assertIn("allocated", {r["basis"] for r in result["attributed_cost_basis_composition"]})

    def test_component_only_workflow_and_zero_observed_cost_are_explicit(self):
        self.load(component(basis="observed", amount="0", quantity="0", unit="review"), outcome(), rates=[])
        result = self.close_period()
        self.assertEqual(result["totals"]["cost_total"], "0")
        self.assertEqual(result["workflow_economics"][0]["cost_per_accepted_outcome"], "0")
        self.assertEqual(result["reconciliation"], [])

    def test_observed_outcome_without_cost_evidence_is_unknown_not_free(self):
        self.load(outcome(), rates=[])
        workflow = self.close_period()["workflow_economics"][0]
        self.assertIsNone(workflow["economic_cost"])
        self.assertIsNone(workflow["cost_per_accepted_outcome"])

    def test_no_accepted_outcomes_or_no_business_evidence_has_no_ratio(self):
        for status, quantity in (("rejected", 1), ("accepted", 0), ("unknown", None)):
            with self.subTest(status=status):
                tenant = "tenant-" + status
                self.load(component(tenant_id=tenant), outcome(tenant_id=tenant, status=status, quantity=quantity), rates=[])
                self.assertIsNone(self.close_period(tenant=tenant)["workflow_economics"][0]["cost_per_accepted_outcome"])
        self.load(attempt(), invoice())
        workflow = self.close_period()["workflow_economics"][0]
        self.assertIsNone(workflow["accepted_outcomes"])
        self.assertIsNone(workflow["cost_per_accepted_outcome"])

    def test_unknown_or_incomplete_run_blocks_aggregate_instead_of_becoming_zero(self):
        self.load(component(), outcome(), component("review-2", run="run-2"), outcome("unknown", run="run-2", status="unknown", quantity=None))
        workflow = self.close_period()["workflow_economics"][0]
        self.assertEqual(workflow["known_cost"], "20")
        self.assertIsNone(workflow["accepted_outcomes"])
        self.assertIsNone(workflow["cost_per_accepted_outcome"])
        self.load(outcome("fixed", run="run-2", cohort_complete=False, received_at="2026-09-04T00:00:00Z", supersedes={"source": "synthetic-business-review", "source_id": "unknown"}))
        revised = self.close_period("later", cutoff="2026-09-05T00:00:00Z")["workflow_economics"][0]
        self.assertEqual(revised["accepted_outcomes"], 2)
        self.assertIsNone(revised["cost_per_accepted_outcome"])

    def test_period_boundary_and_mixed_currency_runs_do_not_mix_cohorts(self):
        self.load(component(), component("previous-month", incurred_at="2026-07-31T23:00:00Z", received_at=START), outcome())
        workflow = self.close_period()["workflow_economics"][0]
        self.assertIn("run_spans_period_boundary", workflow["blockers"])
        self.assertIsNone(workflow["cost_per_accepted_outcome"])
        self.load(component("euro-cost", currency="EUR"))
        self.assertIn("run_spans_currencies", self.close_period("mixed")["workflow_economics"][0]["blockers"])

    def test_different_business_metrics_are_never_added_into_one_denominator(self):
        self.load(component(), outcome(), component("other", run="run-2"), outcome("other", run="run-2", metric="booked_meeting"))
        workflow = self.close_period()["workflow_economics"][0]
        self.assertIsNone(workflow["accepted_outcomes"])
        self.assertIn("mixed_outcome_metrics", workflow["blockers"])

    def test_component_policy_evidence_coverage_and_exact_arithmetic_validation(self):
        for bad in (component(policy_ref=""), component(evidence_ref=""), component(amount="11"), component(provider="internal-must-not-be-a-supplier"), component(invoice_coverage="unspecified"), component(unit_rate="NaN"), component(quantity="-1")):
            with self.subTest(bad=bad), self.assertRaises(EvidenceError):
                self.load(bad)
        self.load(component(quantity="0.1", unit_rate="0.2", amount="0.02"), outcome())
        self.assertEqual(self.close_period()["workflow_economics"][0]["cost_per_accepted_outcome"], "0.02")

    def test_all_supported_component_categories_preserve_basis_and_evidence(self):
        categories = ("tool", "search", "compute", "storage", "human_review", "shared")
        self.load(*(component(category, category=category, basis="observed", amount="1", unit="item", quantity="1") for category in categories), outcome())
        result = self.close_period()
        self.assertEqual(result["totals"]["known_cost"], "6")
        self.assertEqual({c["category"] for c in result["cost_components"]}, set(categories))
        self.assertTrue(all(c["evidence_ref"] for c in result["cost_components"]))

    def test_unassigned_components_conserve_without_fake_customer_revenue(self):
        self.load(component(customer_id=None), outcome(), revenue())
        result = self.close_period()
        self.assertEqual(result["totals"]["unassigned_component_cost"], "10")
        self.assertEqual(result["totals"]["unallocated_cost"], "10")
        self.assertIsNone(result["customers"]["customer-a"]["profit_estimate"])
        self.assertNotIn("revenue", result["workflow_economics"][0])
        self.assertIn("noncausal", result["workflow_economics"][0]["revenue_attribution"])

    def test_business_outcome_duplicate_and_cross_tenant_isolation(self):
        self.load(component(), outcome())
        with self.assertRaises(EvidenceError):
            self.load(outcome("other-capture", source="other-review"))
        self.load(component(tenant_id="client-b", amount="10"), outcome(tenant_id="client-b", quantity=5), rates=[])
        self.assertEqual(self.close_period()["workflow_economics"][0]["cost_per_accepted_outcome"], "10")
        self.assertEqual(self.close_period(tenant="client-b")["workflow_economics"][0]["cost_per_accepted_outcome"], "2")

    def test_late_component_correction_changes_only_linked_later_snapshot(self):
        self.load(component(), outcome())
        original = self.close_period()
        self.load(component("corrected", quantity="0.5", amount="20", received_at="2026-09-04T00:00:00Z", supersedes={"source": "synthetic-expenses", "source_id": "labor-1"}))
        revised = self.close_period("updated", cutoff="2026-09-05T00:00:00Z", prior="august")
        self.assertEqual(revised["workflow_economics"][0]["cost_per_accepted_outcome"], "20")
        self.assertEqual(revised["adjustment"]["known_cost_change"], "10")
        self.assertEqual(self.ledger.snapshot("client-a", "august"), original)

    def test_import_preloads_once_and_indexes_interleaved_batches_atomically(self):
        queries = []
        self.ledger.db.set_trace_callback(queries.append)
        self.load(*(attempt(str(i), run="run-" + str(i)) for i in range(30)))
        scans = [q for q in queries if q.startswith("SELECT payload,hash FROM events WHERE tenant=")]
        self.assertEqual(len(scans), 1)
        second = Ledger(self.path)
        try:
            second.import_bundle({"events": [outcome()]})
            self.load(component())
            with self.assertRaises(EvidenceError):
                second.import_bundle({"events": [component("will-rollback"), outcome("overlap")]})
            count = self.ledger.db.execute("SELECT count(*) FROM events").fetchone()[0]
            self.assertEqual(count, 32)
            self.assertEqual(self.load(attempt("0", run="run-0"))["duplicates"], 2)
        finally:
            second.close()

    def test_historical_capture_cannot_be_reused_outside_its_correction_chain(self):
        self.load(attempt(request_id="request-A"))
        self.load(attempt("corrected", request_id="request-B", received_at="2026-09-04T00:00:00Z", supersedes={"source": "synthetic-usage", "source_id": "u1"}))
        with self.assertRaises(EvidenceError):
            self.load(attempt("backfill", source="gateway", request_id="request-A", received_at="2026-08-16T00:00:00Z"))
        historical = self.close_period()
        self.assertEqual(len(historical["rated_usage"]), 1)
        self.assertEqual(historical["rated_usage"][0]["cost"], "2")
        self.load(attempt("corrected-again", request_id="request-A", received_at="2026-09-05T00:00:00Z", supersedes={"source": "synthetic-usage", "source_id": "corrected"}))
        self.assertEqual(len(self.close_period("later", cutoff="2026-09-06T00:00:00Z")["rated_usage"]), 1)

    def test_unmapped_known_shared_cost_blocks_all_in_workflow_ratio(self):
        shared = supplier_component("unmapped", category="shared", basis="allocated", policy_ref="shared-v1", amount="100")
        del shared["workflow_id"]
        del shared["run_id"]
        self.load(attempt(), shared, invoice(amount="102"), outcome())
        result = self.close_period()
        workflow = result["workflow_economics"][0]
        self.assertEqual(result["totals"]["known_cost"], "102")
        self.assertEqual(workflow["known_cost"], "2")
        self.assertIsNone(workflow["cost_per_accepted_outcome"])
        self.assertIn("unassigned_workflow_cost", workflow["blockers"])


if __name__ == "__main__":
    unittest.main()
