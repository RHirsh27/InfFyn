"""Local-only validation harness. Uses the production router/math with SQLite storage.

Run from engine: python -m app.v2.local_validation
No .env, provider credentials, real users, email or payments are loaded.
"""

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request

from .repository import report
from .router import build_router
from .body_limit import AuditBodyLimit

TENANT = "11111111-1111-4111-8111-111111111111"
USER = "22222222-2222-4222-8222-222222222222"


class LocalRepository:
    def __init__(self, path):
        self.path = str(path)
        with self.connection() as db:
            db.executescript("""create table if not exists audits(id text primary key,tenant text not null,fingerprint text not null,access text not null,record text not null,unique(tenant,fingerprint,access));
            create table if not exists previews(hash text primary key,payload text,result text,expires text);
            create table if not exists quotas(bucket text primary key,requests integer,expires text);
            create table if not exists state(tenant text primary key,paid integer not null);""")
        from app.monthly.local import LocalMonthlyRepository

        self.monthly = LocalMonthlyRepository(self.connection)

    def connection(self):
        return sqlite3.connect(self.path, timeout=15)

    def cleanup(self):
        self.monthly.cleanup()
        current = datetime.now(timezone.utc).isoformat()
        with self.connection() as db:
            db.execute("delete from previews where expires<=?", (current,))
            for identity, record in db.execute(
                "select id,record from audits"
            ).fetchall():
                record = json.loads(record)
                if record["report_expires_at"] <= current:
                    db.execute("delete from audits where id=?", (identity,))
                elif record["evidence_expires_at"] <= current:
                    record["payload"] = None
                    db.execute(
                        "update audits set record=? where id=?",
                        (json.dumps(record), identity),
                    )

    def grant(self, tenant):
        return None

    def is_admin(self, user):
        return False

    def consume_preview(self, bucket):
        return self.consume_quota(bucket, 10)

    def consume_quota(self, bucket, limit):
        current = datetime.now(timezone.utc)
        with self.connection() as db:
            db.execute("begin immediate")
            row = db.execute(
                "select requests,expires from quotas where bucket=?", (bucket,)
            ).fetchone()
            n = row[0] + 1 if row and row[1] > current.isoformat() else 1
            expiry = (
                row[1]
                if row and row[1] > current.isoformat()
                else (current + timedelta(hours=1)).isoformat()
            )
            db.execute(
                "insert or replace into quotas values(?,?,?)", (bucket, n, expiry)
            )
            return n <= limit

    def create_preview(self, secret_hash, payload, result):
        with self.connection() as db:
            db.execute(
                "insert into previews values(?,?,?,?)",
                (
                    secret_hash,
                    payload.model_dump_json(),
                    json.dumps(result),
                    (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                ),
            )

    def _save(self, db, tenant, user, payload, result, full):
        access = "full" if full else "preview"
        found = db.execute(
            "select record from audits where tenant=? and fingerprint=? and access=?",
            (tenant, result["fingerprint"], access),
        ).fetchone()
        if found:
            return json.loads(found[0])
        now = datetime.now(timezone.utc)
        record = {
            "id": str(uuid4()),
            "tenant_id": tenant,
            "created_by": user,
            "fingerprint": result["fingerprint"],
            "title": payload.title,
            "kind": payload.kind,
            "access_level": access,
            "payload": payload.model_dump(mode="json"),
            "result": result,
            "report": report(result) if full else None,
            "created_at": now.isoformat(),
            "evidence_expires_at": (now + timedelta(days=90)).isoformat(),
            "report_expires_at": (now + timedelta(days=365)).isoformat(),
        }
        db.execute(
            "insert into audits values(?,?,?,?,?)",
            (record["id"], tenant, result["fingerprint"], access, json.dumps(record)),
        )
        return record

    def save(self, tenant, user, payload, result, full):
        with self.connection() as db:
            db.execute("begin immediate")
            return self._save(db, tenant, user, payload, result, full)

    def claim(self, secret_hash, tenant, user):
        from .contract import AuditInput

        with self.connection() as db:
            db.execute("begin immediate")
            row = db.execute(
                "select payload,result from previews where hash=? and expires>?",
                (secret_hash, datetime.now(timezone.utc).isoformat()),
            ).fetchone()
            if not row:
                return None
            result = self._save(
                db,
                tenant,
                user,
                AuditInput.model_validate_json(row[0]),
                json.loads(row[1]),
                False,
            )
            db.execute("delete from previews where hash=?", (secret_hash,))
            return result["id"]

    def get(self, tenant, audit_id):
        with self.connection() as db:
            row = db.execute(
                "select record from audits where tenant=? and id=?", (tenant, audit_id)
            ).fetchone()
        record = json.loads(row[0]) if row else None
        return (
            record
            if record
            and record["report_expires_at"] > datetime.now(timezone.utc).isoformat()
            else None
        )

    def list(self, tenant):
        with self.connection() as db:
            rows = db.execute(
                "select record from audits where tenant=? order by rowid desc limit 100",
                (tenant,),
            ).fetchall()
        current = datetime.now(timezone.utc).isoformat()
        return [
            {
                k: v
                for k, v in record.items()
                if k
                in (
                    "id",
                    "title",
                    "kind",
                    "access_level",
                    "created_at",
                    "fingerprint",
                    "evidence_expires_at",
                    "report_expires_at",
                )
            }
            for row in rows
            if (record := json.loads(row[0]))["report_expires_at"] > current
        ]

    def delete(self, tenant, audit_id):
        with self.connection() as db:
            db.execute("delete from audits where tenant=? and id=?", (tenant, audit_id))

    def subscription(self, tenant):
        with self.connection() as db:
            row = db.execute(
                "select paid from state where tenant=?", (tenant,)
            ).fetchone()
        return {
            "status": "active" if not row or row[0] else "inactive",
            "price_id": "price_synthetic_validation",
            "current_period_end": (
                datetime.now(timezone.utc) + timedelta(days=30)
            ).isoformat(),
        }

    def set_paid(self, tenant, paid):
        with self.connection() as db:
            db.execute("insert or replace into state values(?,?)", (tenant, int(paid)))


def create_validation_app(path):
    repo = LocalRepository(path)
    settings = SimpleNamespace(
        audit_v2_enabled=True,
        audit_retention_approved=True,
        billing_enabled=False,
        billing_price_approved=False,
        stripe_billing_price_id="price_synthetic_validation",
        monthly_enabled=True,
    )
    app = FastAPI(title="InfFyn LOCAL SYNTHETIC validation")
    from app.company_demo import router as company_demo_router

    app.include_router(company_demo_router)
    app.add_middleware(AuditBodyLimit)

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        if request.client and request.client.host not in (
            "127.0.0.1",
            "::1",
            "testclient",
        ):
            from fastapi.responses import JSONResponse

            return JSONResponse(
                {"detail": "Local validation is loopback-only."}, status_code=403
            )
        if (
            request.url.path.startswith("/v2/stripe/")
            or request.url.path.startswith("/v2/billing/")
            or request.url.path == "/v2/billing-webhook"
        ):
            from fastapi.responses import JSONResponse

            return JSONResponse(
                {"detail": "Provider operations are disabled in local validation."},
                status_code=503,
            )
        return await call_next(request)

    def get_user():
        return USER

    def resolve(db, user, tenant):
        if tenant != TENANT:
            raise HTTPException(403, "Synthetic tenant membership denied.")
        return SimpleNamespace(tenant_id=tenant, user_id=user, role="owner")

    app.include_router(
        build_router(settings, lambda: None, get_user, resolve, lambda: repo)
    )

    @app.get("/health")
    def health():
        return {"status": "ok", "mode": "LOCAL_SYNTHETIC_ONLY"}

    return app


if __name__ == "__main__":
    import uvicorn

    directory = Path(__file__).resolve().parents[3] / ".validation"
    directory.mkdir(exist_ok=True)
    uvicorn.run(
        create_validation_app(directory / "audits.sqlite"),
        host="127.0.0.1",
        port=8012,
        access_log=False,
    )
