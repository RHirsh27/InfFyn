"""Realistic-size SYNTHETIC attempts, full workflow costs and local CFO review.

No network or client data. Rebuilds generated examples only; temporary databases
are reopened during the exercise to prove the journal survives a process owner.
"""
import hashlib
import json
import tempfile
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from prototype.coverage import evaluate_coverage
from prototype.ledger import Ledger, money, normalize_event
from prototype.review import ReviewDesk

TENANT = 'synthetic-workflow-client'
START = '2026-08-01T00:00:00Z'
END = '2026-09-01T00:00:00Z'
FIRST = '2026-09-03T00:00:00Z'
LATER = '2026-09-06T00:00:00Z'


def workflow_bundle():
    rate = dict(tenant_id=TENANT, version='synthetic-contract-v1',
                provider='synthetic-provider', account='synthetic-account',
                model='synthetic-model', currency='USD', effective_start=START,
                effective_end=END, received_at=START,
                source_ref='SYNTHETIC contract, not a current provider price',
                per_million=dict(input_uncached='2', input_cached='0.5', cache_write='3', output='10'))
    events = []
    for i in range(10):
        common = dict(tenant_id=TENANT, incurred_at=f'2026-08-{i+1:02}T12:00:00Z',
                      received_at='2026-09-02T00:00:00Z', currency='USD',
                      customer_id='customer-a' if i < 5 else 'customer-b',
                      workflow_id='reviewed-research-report', run_id=f'run-{i+1:02}')
        for attempt in (1, 2):
            events.append(dict(**common, kind='usage', source='synthetic-attempts',
                               source_id=f'attempt-{i+1:02}-{attempt}',
                               provider=rate['provider'], account=rate['account'],
                               model=rate['model'], request_id=f'request-{i+1:02}',
                               rate_version=rate['version'], attempt=attempt,
                               outcome='error' if attempt == 1 else 'success', billable=True,
                               input_total=4000,
                               meters=dict(input_uncached=4000, input_cached=0, cache_write=0, output=500)))
        events.append(dict(**common, kind='cost_component', source='synthetic-search-charges',
                           source_id=f'search-{i+1:02}', category='search', unit='query', quantity='2',
                           basis='observed', amount='0.10', evidence_ref=f'synthetic-search-log:{i+1}',
                           invoice_coverage='covered_by_supplier_invoice', provider=rate['provider'], account=rate['account']))
        events.append(dict(**common, kind='cost_component', source='synthetic-review-time',
                           source_id=f'review-{i+1:02}', category='human_review', unit='hour', quantity='0.25',
                           basis='rated', amount=None, unit_rate='40', evidence_ref=f'synthetic-timesheet:{i+1}',
                           policy_ref='synthetic-loaded-labor-policy-v1', invoice_coverage='internal'))
        events.append(dict(**common, kind='cost_component', source='synthetic-compute-charges',
                           source_id=f'compute-{i+1:02}', category='compute', unit='hour', quantity='0.1',
                           basis='observed', amount='0.025', evidence_ref=f'synthetic-cloud-charge:{i+1}',
                           invoice_coverage='additional_to_supplier_invoice',
                           provider='synthetic-cloud', account='synthetic-cloud-account'))
        events.append(dict(**common, kind='outcome', source='synthetic-acceptance-register',
                           source_id=f'outcome-{i+1:02}', metric='accepted_report',
                           status='accepted' if i < 8 else 'rejected', quantity=1 if i < 8 else 0,
                           cohort_complete=True, evidence_ref=f'synthetic-review-decision:{i+1}'))
    for customer, amount in [('customer-a', '120'), ('customer-b', '80')]:
        events.append(dict(tenant_id=TENANT, source='synthetic-recognized-revenue', source_id=customer,
                           kind='revenue', incurred_at='2026-08-31T23:00:00Z',
                           received_at='2026-09-02T00:00:00Z', currency='USD',
                           customer_id=customer, amount=amount, basis='recognized'))
    events.append(dict(tenant_id=TENANT, source='synthetic-supplier-invoice', source_id='invoice-august',
                       kind='invoice', incurred_at=END, received_at='2026-09-02T00:00:00Z', currency='USD',
                       provider=rate['provider'], account=rate['account'], amount='1.26',
                       service_start=START, service_end=END))
    return dict(fixture_notice='ALL DATA SYNTHETIC. 10 runs, 20 plausible-size attempts. No demand evidence.',
                rates=[rate], events=events)


def coverage_inputs(bundle):
    groups = defaultdict(list)
    for raw in bundle['events']:
        e = normalize_event(raw)
        groups[(e['source'], e['kind'], e.get('provider'), e.get('account'))].append(e)
    scopes, batches = [], []
    for (source, kind, provider, account), rows in sorted(groups.items()):
        scope = dict(scope_id=source, source=source, kind=kind, currency='USD', start=START, end=END)
        if provider is not None:
            scope.update(provider=provider, account=account)
        scopes.append(scope)
        text = json.dumps(rows, sort_keys=True)
        field = 'input_total' if kind == 'usage' else 'quantity' if kind == 'outcome' else 'amount'
        total = sum((Decimal(str(row[field])) for row in rows), Decimal(0))
        batch = dict(batch_id=source, version=1, scope_id=source, start=START, end=END,
                     received_at='2026-09-02T01:00:00Z', completeness='complete',
                     declared_count=len(rows), declared_totals={field: money(total)},
                     source_sha256=hashlib.sha256(text.encode('utf-8')).hexdigest(), records_json=text)
        if kind == 'outcome':
            batch['completeness'] = 'partial'
            batches.append(batch)
            batches.append(dict(**{k:v for k,v in batch.items() if k not in ('version','received_at','completeness')},
                                version=2, received_at='2026-09-05T00:00:00Z', completeness='complete',
                                supersedes=dict(batch_id=source, version=1)))
        else:
            batches.append(batch)
    return dict(schema_version='1', manifest_id='synthetic-august-population', version=1,
                tenant_id=TENANT, recorded_at='2026-09-02T00:00:00Z', expected_sources=scopes), batches


def main():
    bundle = workflow_bundle()
    manifest, batches = coverage_inputs(bundle)
    initial_coverage = evaluate_coverage(manifest, batches, FIRST)
    final_coverage = evaluate_coverage(manifest, batches, LATER)
    assert initial_coverage['state'] == 'blocked'
    assert final_coverage['state'] == 'locally_matched_declared_scope'
    with tempfile.TemporaryDirectory() as directory:
        ledger = Ledger(Path(directory) / 'ledger.sqlite')
        ledger.import_bundle(bundle)
        first = ledger.create_snapshot(TENANT, 'August incomplete source declaration', START, END, FIRST, 'USD')
        final = ledger.create_snapshot(TENANT, 'August source declaration updated', START, END, LATER, 'USD', first['name'])
        workflow = final['workflow_economics'][0]
        assert final['totals']['known_cost'] == '101.51'
        assert workflow['accepted_outcomes'] == 8
        assert workflow['cost_per_accepted_outcome'] == '12.68875'
        assert workflow['usage_attempts'] == 20 and workflow['failed_usage_attempts'] == 10
        journal = Path(directory) / 'review.sqlite'
        desk = ReviewDesk(journal)
        desk.register(first, initial_coverage)
        desk.assign(TENANT, first['name'], 'Synthetic CFO', 'Confirm the complete acceptance register')
        desk.note(TENANT, first['name'], 'Local rows tie, but the acceptance source is declared partial.')
        earlier_review = desk.review(TENANT, first['name'], 'Exceptions remain; do not approve this close.')
        assert earlier_review['status'] == 'reviewed_with_exceptions'
        desk.register(final, final_coverage)
        desk.assign(TENANT, final['name'], 'Synthetic CFO', 'Review the revised source declaration')
        desk.review(TENANT, final['name'], 'Supplied rows match the declared source population. No accounting approval.')
        desk.close()
        desk = ReviewDesk(journal)
        later_review = desk.state(TENANT, final['name'])
        assert later_review['status'] == 'reviewed_for_declared_scope'
        assert desk.state(TENANT, first['name'])['snapshot_hash'] == first['snapshot_hash']
        assert later_review['accounting_approval'] is False
        desk.close()
        ledger.close()
    output = dict(synthetic=True, fixture_notice=bundle['fixture_notice'],
                  initial_snapshot=first, final_snapshot=final,
                  initial_review=earlier_review, final_review=later_review,
                  cost_per_outcome_notice='Estimate for supplied, operator-declared complete runs. Initial source coverage is partial; do not use its cohort ratio as a complete-period KPI.',
                  business_notice='Revenue is associated with customers, not attributed causally to AI.')
    destination = Path(__file__).parent / 'examples'
    destination.mkdir(exist_ok=True)
    for filename, value in [('workflow-input.json', bundle), ('workflow-coverage-manifest.json', manifest),
                            ('workflow-coverage-batches.json', batches), ('workflow-evidence.json', output)]:
        (destination / filename).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    print('Synthetic workflow: $101.51 total / 8 accepted reports = $12.68875; 10 failed attempts included.')
    print('Persistent review reopened; initial exceptions and subsequent declared-scope review preserved. No accounting approval.')


if __name__ == '__main__':
    main()
