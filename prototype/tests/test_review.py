import copy
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from prototype.coverage import evaluate_coverage
from prototype.ledger import EvidenceError, Ledger, digest
from prototype.review import ReviewDesk
from prototype.tests.test_ledger import ASOF, END, START, invoice, rate, revenue, usage


def snapshot(tenant='client-a', name='initial', **overrides):
    value = {'tenant_id': tenant, 'name': name, 'approval_state': 'not_approved',
             'issues': [{'code': 'missing_invoice'}], 'prior_snapshot': None,
             'totals': {'known_cost': '10', 'cost_total': None}}
    value.update(overrides)
    return {**value, 'snapshot_hash': digest(value)}


def coverage_fixture(events=None, as_of=ASOF, period_end=END):
    events = [usage(), invoice(), revenue()] if events is None else events
    ledger = Ledger(':memory:')
    try:
        ledger.import_bundle({'rates': [rate()], 'events': events})
        snap = ledger.create_snapshot('client-a', 'actual-ledger', START, period_end, as_of, 'USD')
    finally:
        ledger.close()
    manifest = dict(schema_version='1', manifest_id='actual-source-population', version=1,
                    tenant_id='client-a', recorded_at=period_end, expected_sources=[])
    groups = {}
    for event in events:
        groups.setdefault(event['source'], []).append(event)
    batches = []
    for source, rows in sorted(groups.items()):
        first = rows[0]
        scope = dict(scope_id=source, source=source, kind=first['kind'], currency='USD', start=START, end=period_end)
        if 'provider' in first:
            scope.update(provider=first['provider'], account=first['account'])
        manifest['expected_sources'].append(scope)
        payload = json.dumps(rows)
        field = 'input_total' if first['kind'] == 'usage' else 'amount'
        from decimal import Decimal
        total = sum((Decimal(str(r[field])) for r in rows), Decimal(0))
        batches.append(dict(batch_id=source, version=1, scope_id=source, received_at=as_of,
                            start=START, end=period_end, completeness='complete', declared_count=len(rows),
                            declared_totals={field: str(total)}, records_json=payload,
                            source_sha256=hashlib.sha256(payload.encode()).hexdigest()))
    return snap, manifest, batches


def reseal(coverage):
    coverage['evaluation_sha256'] = digest({k: v for k, v in coverage.items() if k != 'evaluation_sha256'})
    return coverage


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'review.sqlite'
        self.desk = ReviewDesk(self.path)

    def tearDown(self):
        self.desk.close()
        self.temp.cleanup()

    def test_review_preserves_open_financial_exceptions(self):
        source = snapshot()
        self.desk.register(source)
        self.desk.assign('client-a', 'initial', 'CFO reviewer', 'Obtain principal supplier invoice')
        self.desk.note('client-a', 'initial', 'Requested missing evidence; supplier total remains unknown')
        state = self.desk.review('client-a', 'initial', 'Reviewed the partial data; do not post as final')
        self.assertEqual(state['status'], 'reviewed_with_exceptions')
        self.assertFalse(state['accounting_approval'])
        self.assertFalse(state['operator_identity_verified'])
        self.assertEqual(state['snapshot_hash'], source['snapshot_hash'])
        self.assertEqual(len(state['history']), 3)

    def test_review_requires_responsible_owner(self):
        self.desk.register(snapshot())
        with self.assertRaises(EvidenceError): self.desk.review('client-a', 'initial', 'Reviewed')
        self.assertEqual(self.desk.state('client-a', 'initial')['history'], [])

    def test_client_scopes_are_separate_after_durable_reopen(self):
        self.desk.register(snapshot())
        self.desk.register(snapshot(tenant='client-b'))
        self.desk.assign('client-a', 'initial', 'Reviewer A', 'Investigate')
        self.desk.close()
        self.desk = ReviewDesk(self.path)
        self.assertEqual(self.desk.state('client-b', 'initial')['status'], 'unassigned')
        self.assertEqual(self.desk.state('client-a', 'initial')['owner'], 'Reviewer A')
        with self.assertRaises(EvidenceError): self.desk.state('client-c', 'initial')

    def test_close_integrity_and_conflict_reject(self):
        s = snapshot()
        self.desk.register(s)
        self.assertEqual(self.desk.register(s)['name'], 'initial')
        changed = copy.deepcopy(s)
        changed['totals']['known_cost'] = '11'
        with self.assertRaises(EvidenceError): self.desk.register(changed)
        with self.assertRaises(EvidenceError): self.desk.register(snapshot(issues=[]))

    def test_revision_preserves_prior_review_and_requires_prior_hash(self):
        initial = snapshot()
        self.desk.register(initial)
        self.desk.assign('client-a', 'initial', 'CFO', 'Missing invoice')
        revision = snapshot(name='revised', issues=[], prior_snapshot={'name': 'initial', 'hash': initial['snapshot_hash']})
        self.desk.register(revision)
        self.assertEqual(self.desk.state('client-a', 'revised')['status'], 'unassigned')
        self.assertEqual(self.desk.state('client-a', 'initial')['owner'], 'CFO')
        wrong = snapshot(name='bad', prior_snapshot={'name': 'initial', 'hash': 'wrong'})
        with self.assertRaises(EvidenceError): self.desk.register(wrong)

    def test_immutable_journal_records_and_missing_coverage_not_complete(self):
        self.desk.register(snapshot(issues=[]))
        self.desk.assign('client-a', 'initial', 'CFO', 'Check coverage')
        state = self.desk.review('client-a', 'initial', 'Checked local rows')
        self.assertEqual(state['status'], 'reviewed_with_exceptions')
        with self.assertRaises(sqlite3.IntegrityError):
            self.desk.db.execute('DELETE FROM review_events')
        self.desk.db.rollback()
        self.assertEqual(len(self.desk.state('client-a', 'initial')['history']), 2)

    def test_new_notes_reopen_review_without_erasing_conclusion(self):
        self.desk.register(snapshot())
        self.desk.assign('client-a', 'initial', 'CFO', 'Investigate')
        self.desk.review('client-a', 'initial', 'Reviewed with exception')
        state = self.desk.note('client-a', 'initial', 'Additional evidence arrived; recalculate version')
        self.assertEqual(state['status'], 'in_review')
        self.assertEqual(state['conclusion'], 'Reviewed with exception')

    def test_real_snapshot_exact_hash_population_binds_and_stays_unapproved(self):
        snap, manifest, batches = coverage_fixture()
        cov = evaluate_coverage(manifest, batches, ASOF)
        self.assertFalse(snap['issues'])
        self.desk.register(snap, cov)
        self.desk.assign('client-a', 'actual-ledger', 'CFO', 'Review the declared scope')
        state = self.desk.review('client-a', 'actual-ledger', 'Local evidence reviewed')
        self.assertEqual(state['status'], 'reviewed_for_declared_scope')
        self.assertEqual(state['coverage_binding']['active_event_count'], 3)
        self.assertFalse(state['accounting_approval'])
        self.assertFalse(state['source_completeness_independently_verified'])

    def test_valid_subset_coverage_cannot_clear_full_snapshot(self):
        snap, manifest, batches = coverage_fixture()
        source = batches[0]['scope_id']
        manifest['expected_sources'] = [s for s in manifest['expected_sources'] if s['scope_id'] != source]
        cov = evaluate_coverage(manifest, batches[1:], ASOF)
        self.assertEqual(cov['state'], 'locally_matched_declared_scope')
        with self.assertRaisesRegex(EvidenceError, 'population/hash'):
            self.desk.register(snap, cov)

    def test_same_ids_with_changed_normalized_content_cannot_bind(self):
        snap, _, _ = coverage_fixture()
        _, manifest, batches = coverage_fixture([usage(), invoice(amount='3'), revenue()])
        cov = evaluate_coverage(manifest, batches, ASOF)
        self.assertFalse(cov['blocks'])
        with self.assertRaisesRegex(EvidenceError, 'population/hash'):
            self.desk.register(snap, cov)

    def test_tampered_evaluation_or_manifest_digest_rejects(self):
        snap, manifest, batches = coverage_fixture()
        cov = evaluate_coverage(manifest, batches, ASOF)
        cov['state'] = 'arbitrary'
        with self.assertRaisesRegex(EvidenceError, 'evaluation digest'):
            self.desk.register(snap, cov)
        cov = evaluate_coverage(manifest, batches, ASOF)
        cov['manifest']['version'] = 2
        reseal(cov)
        with self.assertRaisesRegex(EvidenceError, 'manifest digest'):
            self.desk.register(snap, cov)
        with self.assertRaises(EvidenceError):
            self.desk.register(snap, {})

    def test_unrelated_tenant_cutoff_currency_and_partial_period_reject(self):
        snap, manifest, batches = coverage_fixture()
        base = evaluate_coverage(manifest, batches, ASOF)
        for field, value, expected in [('tenant_id', 'other-client', 'tenant'), ('as_of', '2026-09-06T00:00:00Z', 'cutoff')]:
            cov = copy.deepcopy(base)
            cov[field] = value
            reseal(cov)
            with self.subTest(field=field), self.assertRaisesRegex(EvidenceError, expected):
                self.desk.register(snap, cov)
        cov = copy.deepcopy(base)
        cov['manifest']['expected_sources'][0]['currency'] = 'EUR'
        cov['manifest_sha256'] = digest(cov['manifest'])
        reseal(cov)
        with self.assertRaisesRegex(EvidenceError, 'currency'):
            self.desk.register(snap, cov)
        midpoint = '2026-08-16T00:00:00Z'
        _, half_manifest, half_batches = coverage_fixture([usage(), invoice(service_end=midpoint), revenue(incurred_at='2026-08-15T00:00:00Z')], period_end=midpoint)
        half_coverage = evaluate_coverage(half_manifest, half_batches, ASOF)
        self.assertFalse(half_coverage['blocks'])
        with self.assertRaisesRegex(EvidenceError, 'full snapshot period'):
            self.desk.register(snap, half_coverage)

    def test_missing_record_hash_cannot_fall_back_to_identity_only(self):
        snap, manifest, batches = coverage_fixture()
        cov = evaluate_coverage(manifest, batches, ASOF)
        del cov['batches'][0]['record_ids'][0]['hash']
        reseal(cov)
        with self.assertRaisesRegex(EvidenceError, 'normalized record hash'):
            self.desk.register(snap, cov)

    def test_bound_blocked_coverage_remains_reviewed_with_exceptions(self):
        snap, manifest, batches = coverage_fixture()
        batches[0]['completeness'] = 'partial'
        cov = evaluate_coverage(manifest, batches, ASOF)
        self.desk.register(snap, cov)
        self.desk.assign('client-a', 'actual-ledger', 'CFO', 'Obtain complete export')
        state = self.desk.review('client-a', 'actual-ledger', 'Reviewed partial source')
        self.assertEqual(state['status'], 'reviewed_with_exceptions')
        self.assertEqual(state['coverage_binding']['state'], 'bound_with_exceptions')

    def test_explicit_superseded_rows_do_not_count_as_active_population(self):
        late = '2026-09-06T00:00:00Z'
        corrected = usage('u2', received_at=late, supersedes={'source': 'synthetic-usage', 'source_id': 'u1'})
        snap, manifest, batches = coverage_fixture([usage(), invoice(), revenue(), corrected], as_of=late)
        cov = evaluate_coverage(manifest, batches, late)
        self.assertFalse(cov['blocks'])
        state = self.desk.register(snap, cov)
        self.assertEqual(state['coverage_binding']['active_event_count'], 3)
        self.assertEqual(state['coverage_binding']['superseded_covered_event_count'], 1)
        # A random extra row cannot be dismissed merely because IDs are distinct.
        unrelated = copy.deepcopy(cov)
        for b in unrelated['batches']:
            for r in b['record_ids']:
                r.pop('supersedes', None)
        reseal(unrelated)
        with self.assertRaisesRegex(EvidenceError, 'population/hash'):
            self.desk.register(snap, unrelated)


if __name__ == '__main__': unittest.main()
