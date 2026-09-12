"""Disposable SQLite repository used only by the existing loopback validation harness."""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from .repository import LIST_FIELDS


class LocalMonthlyRepository:
    def __init__(self, connection):
        self.connection = connection
        with self.connection() as db:
            db.execute(
                "create table if not exists monthly_records(kind text,tenant text,id text,record text,primary key(kind,tenant,id))"
            )

    def _list(self, db, kind, tenant):
        return [
            json.loads(x[0])
            for x in db.execute(
                "select record from monthly_records where kind=? and tenant=? order by rowid desc",
                (kind, tenant),
            )
        ]

    def _put(self, db, kind, tenant, row):
        db.execute(
            "insert or replace into monthly_records values(?,?,?,?)",
            (kind, tenant, row["id"], json.dumps(row)),
        )
        return row

    def list(self, kind, tenant, full=False):
        with self.connection() as db:
            rows = self._list(db, kind, tenant)
        current = datetime.now(UTC).isoformat()
        return [
            r
            if full or kind not in LIST_FIELDS
            else {k: r.get(k) for k in LIST_FIELDS[kind].split(",")}
            for r in rows
            if r.get("report_expires_at", r.get("evidence_expires_at", "9999"))
            > current
        ]

    def get(self, kind, tenant, identity):
        return next(
            (x for x in self.list(kind, tenant, full=True) if x["id"] == identity), None
        )

    def workload(self, tenant, actor, identity, definition):
        with self.connection() as db:
            db.execute("begin immediate")
            for other in self._list(db, "workloads", tenant):
                if other["id"] == identity:
                    continue
                d = other["definition"]
                if d["name"].lower() == definition["name"].lower() or any(
                    set(v) & set(d.get("mappings", {}).get(k, []))
                    for k, v in definition.get("mappings", {}).items()
                ):
                    raise ValueError("Workload name or mapping already assigned")
            return self._put(
                db,
                "workloads",
                tenant,
                {
                    "id": identity,
                    "tenant_id": tenant,
                    "definition": definition,
                    "created_at": datetime.now(UTC).isoformat(),
                },
            )

    def draft(self, tenant, month):
        return next(
            (r for r in self.list("drafts", tenant, full=True) if r["month"] == month),
            None,
        )

    def save_draft(
        self, tenant, actor, month, expected, content, basis, invalidations, expires_at
    ):
        with self.connection() as db:
            db.execute("begin immediate")
            current = datetime.now(UTC)
            existing = next(
                (
                    r
                    for r in self._list(db, "drafts", tenant)
                    if r["month"] == month
                    and r["evidence_expires_at"] > current.isoformat()
                ),
                None,
            )
            if (existing["revision"] if existing else 0) != expected:
                raise ValueError("Draft revision changed")
            # Reset expired content but never extend the lifetime of retained evidence.
            expiry = min(
                expires_at,
                existing["evidence_expires_at"]
                if existing
                else (current + timedelta(days=90)).isoformat(),
            )
            return self._put(
                db,
                "drafts",
                tenant,
                {
                    "id": month,
                    "month": month,
                    "tenant_id": tenant,
                    "revision": expected + 1,
                    "content": content,
                    "definition_basis": basis,
                    "invalidations": invalidations,
                    "updated_by": actor,
                    "updated_at": current.isoformat(),
                    "evidence_expires_at": expiry,
                },
            )

    def save_report(self, tenant, actor, payload, result):
        with self.connection() as db:
            db.execute("begin immediate")
            for row in self._list(db, "reports", tenant):
                if row["fingerprint"] == result["fingerprint"]:
                    return row
            now = datetime.now(UTC)
            return self._put(
                db,
                "reports",
                tenant,
                {
                    "id": str(uuid4()),
                    "tenant_id": tenant,
                    "created_by": actor,
                    "month": result["month"],
                    "fingerprint": result["fingerprint"],
                    "payload": payload,
                    "result": result,
                    "created_at": now.isoformat(),
                    "evidence_expires_at": (now + timedelta(days=90)).isoformat(),
                    "report_expires_at": (now + timedelta(days=365)).isoformat(),
                },
            )

    def select(self, tenant, actor, report, expected, reason):
        with self.connection() as db:
            db.execute("begin immediate")
            r = next(
                (
                    x
                    for x in self._list(db, "reports", tenant)
                    if x["id"] == report
                    and x["report_expires_at"] > datetime.now(UTC).isoformat()
                ),
                None,
            )
            if not r:
                raise ValueError("Report unavailable")
            old = next(
                (
                    x
                    for x in self._list(db, "selections", tenant)
                    if x["month"] == r["month"]
                ),
                None,
            )
            if old and old["report_id"] == report:
                return old
            if (old["report_id"] if old else None) != expected:
                raise ValueError("Selection changed")
            now = datetime.now(UTC).isoformat()
            row = {
                "id": old["id"] if old else str(uuid4()),
                "tenant_id": tenant,
                "month": r["month"],
                "report_id": report,
                "selected_by": actor,
                "selected_at": now,
            }
            self._put(
                db,
                "events",
                tenant,
                {
                    "id": str(uuid4()),
                    "tenant_id": tenant,
                    "month": r["month"],
                    "report_id": report,
                    "previous_report_id": expected,
                    "actor": actor,
                    "reason": reason,
                    "created_at": now,
                },
            )
            return self._put(db, "selections", tenant, row)

    def connect(self, tenant, provider, label, encrypted):
        with self.connection() as db:
            db.execute("begin immediate")
            old = next(
                (
                    x
                    for x in self._list(db, "connections", tenant)
                    if x["provider"] == provider
                ),
                None,
            )
            return self._put(
                db,
                "connections",
                tenant,
                {
                    "id": old["id"] if old else str(uuid4()),
                    "tenant_id": tenant,
                    "provider": provider,
                    "label": label,
                    "encrypted_credential": encrypted,
                    "generation": str(uuid4()),
                    "status": "unverified",
                },
            )

    def disconnect(self, tenant, provider):
        with self.connection() as db:
            for row in self._list(db, "connections", tenant):
                if row["provider"] == provider:
                    db.execute(
                        "delete from monthly_records where kind='connections' and tenant=? and id=?",
                        (tenant, row["id"]),
                    )

    def verified_connection(self, tenant, identity, encrypted):
        with self.connection() as db:
            db.execute("begin immediate")
            for row in self._list(db, "connections", tenant):
                if row["id"] == identity and row["encrypted_credential"] == encrypted:
                    self._put(
                        db,
                        "connections",
                        tenant,
                        {
                            **row,
                            "status": "connected",
                            "verified_at": datetime.now(UTC).isoformat(),
                        },
                    )

    def create_import(self, tenant, provider, month, request_id, source_identity):
        with self.connection() as db:
            db.execute("begin immediate")
            for row in self._list(db, "imports", tenant):
                if row["request_id"] == request_id:
                    return row
            now = datetime.now(UTC)
            return self._put(
                db,
                "imports",
                tenant,
                {
                    "id": str(uuid4()),
                    "tenant_id": tenant,
                    "request_id": request_id,
                    "source_identity": source_identity,
                    "provider": provider,
                    "month": month,
                    "step": 0,
                    "state": "pending",
                    "error": None,
                    "cursor": {},
                    "evidence": {"costs": [], "usage": [], "revenue": []},
                    "counts": {"costs": 0, "usage": 0, "revenue": 0},
                    "created_at": now.isoformat(),
                    "evidence_expires_at": (now + timedelta(days=90)).isoformat(),
                },
            )

    def step_import(self, tenant, identity, previous_step, changes):
        with self.connection() as db:
            db.execute("begin immediate")
            row = next(
                (x for x in self._list(db, "imports", tenant) if x["id"] == identity),
                None,
            )
            if not row or row["step"] != previous_step:
                return []
            return [
                self._put(
                    db, "imports", tenant, {**row, **changes, "step": previous_step + 1}
                )
            ]

    def delete_report(self, tenant, identity):
        with self.connection() as db:
            db.execute("begin immediate")
            db.execute(
                "delete from monthly_records where kind='reports' and tenant=? and id=?",
                (tenant, identity),
            )
            for kind in ("selections", "events"):
                for row in self._list(db, kind, tenant):
                    if row["report_id"] == identity:
                        db.execute(
                            "delete from monthly_records where kind=? and tenant=? and id=?",
                            (kind, tenant, row["id"]),
                        )

    def cleanup(self):
        current = datetime.now(UTC).isoformat()
        with self.connection() as db:
            db.execute("begin immediate")
            for kind, tenant, identity, payload in db.execute(
                "select kind,tenant,id,record from monthly_records"
            ).fetchall():
                row = json.loads(payload)
                if (
                    kind in ("drafts", "imports")
                    and row["evidence_expires_at"] <= current
                ) or (kind == "reports" and row["report_expires_at"] <= current):
                    db.execute(
                        "delete from monthly_records where kind=? and tenant=? and id=?",
                        (kind, tenant, identity),
                    )
                elif (
                    kind == "reports"
                    and row["evidence_expires_at"] <= current
                    and row.get("payload")
                ):
                    self._put(db, kind, tenant, {**row, "payload": None})
            db.execute(
                "delete from monthly_records where kind in ('selections','events') and not exists(select 1 from monthly_records r where r.kind='reports' and r.tenant=monthly_records.tenant and r.id=json_extract(monthly_records.record,'$.report_id'))"
            )
