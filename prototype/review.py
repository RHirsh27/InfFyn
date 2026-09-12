"""Local operator review journal. It records review, never accounting approval.

No network, environment-file loading, authentication or provider access. Deploying
this as a shared client service requires a separate authorization boundary.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from prototype.ledger import EvidenceError, canonical, currency, digest, timestamp


def text_value(value, name, limit=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise EvidenceError(f'{name} must be nonempty text of at most {limit} characters')
    return value.strip()


def _hash(value, name):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
        raise EvidenceError(f'{name} must be a SHA-256 digest')
    return value


def bind_coverage(snapshot, coverage):
    """Bind the locally checked active event population, not just its IDs.

    Normalized event hashes must exactly match the ledger snapshot. Retained
    obsolete rows are permitted only through explicit correction links and the
    snapshot's own superseded-ID list. Rates are separate snapshot evidence,
    not event population covered by this source manifest. No authentication or
    independent provider-completeness verification is implied.
    """
    if coverage is None:
        return {'state': 'missing', 'snapshot_hash': snapshot['snapshot_hash'],
                'source_completeness_independently_verified': False}
    if not isinstance(coverage, dict):
        raise EvidenceError('Coverage must be a digest-bearing evaluation object')
    if _hash(coverage.get('evaluation_sha256'), 'coverage digest') != digest({k: v for k, v in coverage.items() if k != 'evaluation_sha256'}):
        raise EvidenceError('Coverage evaluation digest mismatch')
    manifest = coverage.get('manifest')
    if not isinstance(manifest, dict) or _hash(coverage.get('manifest_sha256'), 'manifest digest') != digest(manifest):
        raise EvidenceError('Coverage manifest digest mismatch')
    if coverage.get('schema_version') != '1' or manifest.get('schema_version') != '1' or coverage.get('evaluation_kind') != 'operator_declared_source_coverage':
        raise EvidenceError('Unsupported source-coverage evaluation')
    tenant = snapshot['tenant_id']
    if coverage.get('tenant_id') != tenant or manifest.get('tenant_id') != tenant:
        raise EvidenceError('Coverage belongs to a different tenant')
    cutoff = timestamp(snapshot.get('as_of'))
    if timestamp(coverage.get('as_of')) != cutoff:
        raise EvidenceError('Coverage cutoff must equal the snapshot cutoff')
    start, end = timestamp(snapshot.get('period_start')), timestamp(snapshot.get('period_end'))
    unit = currency(snapshot.get('currency'))
    if start >= end:
        raise EvidenceError('Snapshot interval is invalid')
    blocks, batches = coverage.get('blocks'), coverage.get('batches')
    claims = coverage.get('declared_vs_verified')
    if not isinstance(blocks, list) or not isinstance(batches, list) or not isinstance(claims, dict):
        raise EvidenceError('Coverage checks and assertions are required')
    expected_state = 'blocked' if blocks else 'locally_matched_declared_scope'
    if coverage.get('state') != expected_state or claims.get('all_local_checks_passed') is not (not blocks):
        raise EvidenceError('Coverage state conflicts with its check results')
    if coverage.get('close_approved') is not False or claims.get('external_provider_completeness_verified') is not False or claims.get('provider_to_normalized_conversion_verified') is not False:
        raise EvidenceError('Local coverage cannot assert independent completeness or accounting approval')
    if timestamp(manifest.get('recorded_at')) > cutoff and not any(isinstance(b, dict) and b.get('code') == 'manifest_after_cutoff' for b in blocks):
        raise EvidenceError('Future manifest is missing its coverage exception')
    scopes = manifest.get('expected_sources')
    if not isinstance(scopes, list) or not scopes:
        raise EvidenceError('Coverage requires expected source scopes')
    scope_ids, grouped = set(), {}
    for scope in scopes:
        if not isinstance(scope, dict):
            raise EvidenceError('Invalid expected source scope')
        scope_id = text_value(scope.get('scope_id'), 'scope_id', 200)
        if scope_id in scope_ids:
            raise EvidenceError('Coverage source scopes must be unique')
        scope_ids.add(scope_id)
        if currency(scope.get('currency')) != unit:
            raise EvidenceError('Coverage currency differs from snapshot currency')
        left, right = timestamp(scope.get('start')), timestamp(scope.get('end'))
        if not start <= left < right <= end:
            raise EvidenceError('Coverage expected interval differs from snapshot period')
        key = tuple(scope.get(k) for k in ('source', 'kind', 'provider', 'account', 'currency'))
        grouped.setdefault(key, []).append((left, right))
    # A perfectly matched half-month file is not full-month source coverage.
    for intervals in grouped.values():
        frontier = start
        for left, right in sorted(intervals):
            if left != frontier:
                raise EvidenceError('Coverage expected scope must cover the snapshot period without gaps or overlaps')
            frontier = right
        if frontier != end:
            raise EvidenceError('Coverage expected scope does not cover the full snapshot period')
    event_manifest = snapshot.get('manifest')
    if not isinstance(event_manifest, dict) or not isinstance(event_manifest.get('events'), list):
        raise EvidenceError('Snapshot event manifest is required to bind source coverage')
    expected = {}
    for event in event_manifest['events']:
        if not isinstance(event, dict):
            raise EvidenceError('Invalid snapshot event reference')
        key = (text_value(event.get('source'), 'event source', 200), text_value(event.get('source_id'), 'event source_id', 200))
        if key in expected:
            raise EvidenceError('Snapshot contains duplicate event references')
        expected[key] = _hash(event.get('hash'), 'snapshot event hash')
    superseded = set()
    for item in event_manifest.get('superseded_source_ids', []):
        if not isinstance(item, dict):
            raise EvidenceError('Invalid snapshot correction reference')
        superseded.add((text_value(item.get('source'), 'superseded source', 200), text_value(item.get('source_id'), 'superseded source_id', 200)))
    covered, corrections = {}, {}
    for batch in batches:
        if not isinstance(batch, dict) or not isinstance(batch.get('record_ids'), list):
            raise EvidenceError('Coverage normalized record hashes are required')
        for event in batch['record_ids']:
            if not isinstance(event, dict):
                raise EvidenceError('Invalid coverage event reference')
            if event.get('tenant_id') != tenant:
                raise EvidenceError('Coverage event belongs to another tenant')
            key = (text_value(event.get('source'), 'covered source', 200), text_value(event.get('source_id'), 'covered source_id', 200))
            hashed = _hash(event.get('hash'), 'normalized record hash')
            if key in covered:
                raise EvidenceError('Coverage has duplicate active source references')
            covered[key] = hashed
            if currency(event.get('currency')) != unit or timestamp(event.get('received_at')) > cutoff:
                raise EvidenceError('Covered event currency or cutoff differs from snapshot scope')
            if event.get('kind') == 'invoice':
                in_period = timestamp(event.get('service_start')) < end and timestamp(event.get('service_end')) > start
            else:
                in_period = start <= timestamp(event.get('incurred_at')) < end
            if not in_period:
                raise EvidenceError('Coverage includes an event outside the snapshot period')
            prior = event.get('supersedes')
            if prior is not None:
                if not isinstance(prior, dict):
                    raise EvidenceError('Invalid coverage correction link')
                old_key = (text_value(prior.get('source'), 'correction source', 200), text_value(prior.get('source_id'), 'correction source_id', 200))
                if old_key not in superseded or old_key == key or old_key in corrections:
                    raise EvidenceError('Coverage correction disagrees with snapshot history')
                corrections[old_key] = key
    obsolete = set(covered) & set(corrections)
    # Cycles and disconnected obsolete-only chains cannot count as coverage.
    for old in obsolete:
        current, seen = old, set()
        while current in corrections:
            if current in seen:
                raise EvidenceError('Coverage correction cycle')
            seen.add(current)
            current = corrections[current]
        if current not in expected:
            raise EvidenceError('Coverage correction chain does not end in a snapshot event')
    active = {key: value for key, value in covered.items() if key not in obsolete}
    if active != expected:
        raise EvidenceError('Coverage normalized event population/hash differs from snapshot manifest')
    return {'state': 'bound_with_exceptions' if blocks else 'bound_to_snapshot_event_population',
            'snapshot_hash': snapshot['snapshot_hash'], 'coverage_evaluation_sha256': coverage['evaluation_sha256'],
            'coverage_manifest_sha256': coverage['manifest_sha256'], 'active_event_count': len(active),
            'superseded_covered_event_count': len(obsolete), 'source_completeness_independently_verified': False}


class ReviewDesk:
    """A durable, append-only activity history for an explicitly local operator."""

    def __init__(self, path):
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS review_closes(
            tenant TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL,
            hash TEXT NOT NULL, PRIMARY KEY(tenant,name));
        CREATE TABLE IF NOT EXISTS review_events(
            id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, name TEXT NOT NULL,
            action TEXT NOT NULL, payload TEXT NOT NULL, recorded_at TEXT NOT NULL,
            FOREIGN KEY(tenant,name) REFERENCES review_closes(tenant,name));
        ''')
        for table in ('review_closes', 'review_events'):
            for action in ('UPDATE', 'DELETE'):
                self.db.execute(f"CREATE TRIGGER IF NOT EXISTS {table}_{action} BEFORE {action} ON {table} BEGIN SELECT RAISE(ABORT, 'append-only review history'); END")
        self.db.commit()

    def close(self):
        self.db.close()

    def register(self, snapshot, coverage=None):
        """Freeze an existing ledger snapshot and its available coverage evaluation."""
        tenant = text_value(snapshot.get('tenant_id'), 'tenant_id', 200)
        name = text_value(snapshot.get('name'), 'name', 200)
        raw = {k: v for k, v in snapshot.items() if k != 'snapshot_hash'}
        if digest(raw) != snapshot.get('snapshot_hash'):
            raise EvidenceError('Snapshot does not match its saved digest')
        if snapshot.get('approval_state') != 'not_approved':
            raise EvidenceError('This local desk accepts unapproved review snapshots only')
        binding = bind_coverage(snapshot, coverage)
        payload = {'snapshot': snapshot, 'coverage': coverage,
                   'coverage_binding': binding,
                   'coverage_claim': 'Operator-declared source coverage; no independent provider completeness verification'}
        hashed = digest(payload)
        with self.db:
            prior = self.db.execute('SELECT hash FROM review_closes WHERE tenant=? AND name=?', (tenant, name)).fetchone()
            if prior:
                if prior['hash'] != hashed:
                    raise EvidenceError('Registered close is immutable; use a new ledger close version')
                return self.state(tenant, name)
            prior_close = snapshot.get('prior_snapshot')
            if prior_close:
                prior_state = self.state(tenant, prior_close['name'])
                if prior_state['snapshot_hash'] != prior_close['hash']:
                    raise EvidenceError('Prior close hash differs from the registered history')
            self.db.execute('INSERT INTO review_closes VALUES(?,?,?,?)', (tenant, name, canonical(payload), hashed))
        return self.state(tenant, name)

    def _record(self, tenant, name, action, payload):
        text_value(tenant, 'tenant', 200)
        text_value(name, 'name', 200)
        self.db.execute('BEGIN IMMEDIATE')
        try:
            state = self.state(tenant, name)
            if action == 'review' and not state['owner']:
                raise EvidenceError('Assign a responsible reviewer before recording review')
            self.db.execute('INSERT INTO review_events(tenant,name,action,payload,recorded_at) VALUES(?,?,?,?,?)',
                            (tenant, name, action, canonical(payload), datetime.now(timezone.utc).isoformat()))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self.state(tenant, name)

    def assign(self, tenant, name, owner, next_action):
        return self._record(tenant, name, 'assign', {'owner': text_value(owner, 'owner', 200),
                                                  'next_action': text_value(next_action, 'next_action')})

    def note(self, tenant, name, note):
        return self._record(tenant, name, 'note', {'note': text_value(note, 'note')})

    def review(self, tenant, name, conclusion):
        return self._record(tenant, name, 'review', {'conclusion': text_value(conclusion, 'conclusion')})

    def state(self, tenant, name):
        row = self.db.execute('SELECT payload,hash FROM review_closes WHERE tenant=? AND name=?', (tenant, name)).fetchone()
        if row is None:
            raise EvidenceError('No registered close in this client scope')
        payload = json.loads(row['payload'])
        if digest(payload) != row['hash']:
            raise EvidenceError('Review evidence digest mismatch')
        snapshot, coverage = payload['snapshot'], payload.get('coverage')
        binding = bind_coverage(snapshot, coverage)
        if binding != payload.get('coverage_binding'):
            raise EvidenceError('Stored coverage binding differs from registered snapshot evidence')
        history = [{**dict(r), 'payload': json.loads(r['payload'])} for r in
                   self.db.execute('SELECT action,payload,recorded_at FROM review_events WHERE tenant=? AND name=? ORDER BY id', (tenant, name))]
        owner = next_action = conclusion = None
        status = 'unassigned'
        for event in history:
            if event['action'] == 'assign':
                owner, next_action = event['payload']['owner'], event['payload']['next_action']
                status = 'in_review'
            elif event['action'] == 'note':
                status = 'in_review' if owner else 'unassigned'
            elif event['action'] == 'review':
                conclusion = event['payload']['conclusion']
                # All values are informational. A local review cannot certify
                # source completeness or transform estimates into approved books.
                status = 'reviewed_for_declared_scope' if not snapshot.get('issues') and binding['state'] == 'bound_to_snapshot_event_population' else 'reviewed_with_exceptions'
        return {'tenant_id': tenant, 'name': name, 'snapshot_hash': snapshot['snapshot_hash'],
                'prior_snapshot': snapshot.get('prior_snapshot'), 'status': status,
                'accounting_approval': False, 'operator_identity_verified': False,
                'owner': owner, 'next_action': next_action, 'conclusion': conclusion,
                'ledger_issues': snapshot.get('issues', []), 'coverage_evaluation': coverage,
                'coverage_binding': binding,
                'source_completeness_independently_verified': False,
                'history': history, 'evidence_hash': row['hash']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    sub = parser.add_subparsers(dest='command', required=True)
    register = sub.add_parser('register')
    register.add_argument('snapshot')
    register.add_argument('--coverage')
    for name in ('assign', 'note', 'review', 'show'):
        p = sub.add_parser(name)
        p.add_argument('--tenant', required=True)
        p.add_argument('--name', required=True)
        if name == 'assign':
            p.add_argument('--owner', required=True)
            p.add_argument('--next-action', required=True)
        if name == 'note': p.add_argument('--note', required=True)
        if name == 'review': p.add_argument('--conclusion', required=True)
    args = parser.parse_args()
    desk = ReviewDesk(args.db)
    try:
        if args.command == 'register':
            result = desk.register(json.loads(Path(args.snapshot).read_text(encoding='utf-8')),
                                   json.loads(Path(args.coverage).read_text(encoding='utf-8')) if args.coverage else None)
        elif args.command == 'assign': result = desk.assign(args.tenant, args.name, args.owner, args.next_action)
        elif args.command == 'note': result = desk.note(args.tenant, args.name, args.note)
        elif args.command == 'review': result = desk.review(args.tenant, args.name, args.conclusion)
        else: result = desk.state(args.tenant, args.name)
        print(json.dumps(result, indent=2))
    except (EvidenceError, OSError, json.JSONDecodeError) as exc:
        parser.exit(2, f'Review rejected: {exc}\n')
    finally:
        desk.close()


if __name__ == '__main__':
    main()
