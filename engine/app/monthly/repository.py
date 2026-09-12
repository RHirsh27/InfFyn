from datetime import UTC, datetime
from uuid import uuid4

from app.v2.repository import optional_data

TABLES = {
    "workloads": "inffyn_workloads",
    "reports": "inffyn_monthly_reports",
    "selections": "inffyn_monthly_selections",
    "events": "inffyn_selection_events",
    "connections": "inffyn_provider_connections",
    "imports": "inffyn_provider_imports",
    "drafts": "inffyn_monthly_drafts",
}
LIST_FIELDS = {
    "reports": "id,month,fingerprint,created_at,evidence_expires_at,report_expires_at",
    "imports": "id,provider,month,state,step,error,counts,created_at,evidence_expires_at",
}


def now():
    return datetime.now(UTC).isoformat()


class MonthlyRepository:
    def __init__(self, db):
        self.db = db

    def get(self, table, tenant, identity):
        query = (
            self.db.table(TABLES[table])
            .select("*")
            .eq("tenant_id", tenant)
            .eq("id", identity)
        )
        if table == "reports":
            query = query.gt("report_expires_at", now())
        if table == "imports":
            query = query.gt("evidence_expires_at", now())
        return optional_data(query.maybe_single().execute())

    def list(self, table, tenant):
        query = (
            self.db.table(TABLES[table])
            .select(LIST_FIELDS.get(table, "*"))
            .eq("tenant_id", tenant)
        )
        if table == "reports":
            query = query.gt("report_expires_at", now()).order("created_at", desc=True)
        if table == "imports":
            query = query.gt("evidence_expires_at", now()).order(
                "created_at", desc=True
            )
        if table in ("imports", "reports", "events"):
            return query.limit(100).execute().data or []
        return query.limit(500).execute().data or []

    def workload(self, tenant, actor, identity, definition):
        return (
            self.db.rpc(
                "save_inffyn_workload",
                {
                    "p_tenant": tenant,
                    "p_actor": actor,
                    "p_id": identity,
                    "p_definition": definition,
                },
            )
            .execute()
            .data
        )

    def draft(self, tenant, month):
        return optional_data(
            self.db.table(TABLES["drafts"])
            .select("*")
            .eq("tenant_id", tenant)
            .eq("month", month)
            .gt("evidence_expires_at", now())
            .maybe_single()
            .execute()
        )

    def save_draft(
        self, tenant, actor, month, expected, content, basis, invalidations, expires_at
    ):
        return (
            self.db.rpc(
                "save_inffyn_monthly_draft",
                {
                    "p_tenant": tenant,
                    "p_actor": actor,
                    "p_month": month,
                    "p_expected": expected,
                    "p_content": content,
                    "p_definition_basis": basis,
                    "p_invalidations": invalidations,
                    "p_evidence_expiry": expires_at,
                },
            )
            .execute()
            .data
        )

    def save_report(self, tenant, actor, payload, result, evidence_expiry=None):
        row = {
            "tenant_id": tenant,
            "created_by": actor,
            "month": result["month"],
            "fingerprint": result["fingerprint"],
            "payload": payload,
            "result": result,
        }
        if evidence_expiry is not None:
            row["evidence_expires_at"] = evidence_expiry
        self.db.table(TABLES["reports"]).upsert(
            row, on_conflict="tenant_id,fingerprint", ignore_duplicates=True
        ).execute()
        return (
            self.db.table(TABLES["reports"])
            .select("*")
            .eq("tenant_id", tenant)
            .eq("fingerprint", result["fingerprint"])
            .single()
            .execute()
            .data
        )

    def select(self, tenant, actor, report, expected, reason):
        return (
            self.db.rpc(
                "select_inffyn_month",
                {
                    "p_tenant": tenant,
                    "p_actor": actor,
                    "p_report": report,
                    "p_expected": expected,
                    "p_reason": reason,
                },
            )
            .execute()
            .data
        )

    def connect(self, tenant, provider, label, encrypted):
        self.db.table(TABLES["connections"]).upsert(
            {
                "tenant_id": tenant,
                "provider": provider,
                "label": label,
                "encrypted_credential": encrypted,
                "generation": str(uuid4()),
                "status": "unverified",
            },
            on_conflict="tenant_id,provider",
        ).execute()

    def disconnect(self, tenant, provider):
        self.db.table(TABLES["connections"]).delete().eq("tenant_id", tenant).eq(
            "provider", provider
        ).execute()

    def verified_connection(self, tenant, identity, encrypted):
        # A credential replaced during an import must not inherit verification.
        self.db.table(TABLES["connections"]).update(
            {"status": "connected", "verified_at": now()}
        ).eq("tenant_id", tenant).eq("id", identity).eq(
            "encrypted_credential", encrypted
        ).execute()

    def create_import(self, tenant, provider, month, request_id, source_identity):
        self.db.table(TABLES["imports"]).upsert(
            {
                "id": str(uuid4()),
                "tenant_id": tenant,
                "provider": provider,
                "month": month,
                "request_id": request_id,
                "source_identity": source_identity,
                "state": "pending",
                "evidence": {"costs": [], "usage": [], "revenue": []},
            },
            on_conflict="tenant_id,request_id",
            ignore_duplicates=True,
        ).execute()
        return (
            self.db.table(TABLES["imports"])
            .select("*")
            .eq("tenant_id", tenant)
            .eq("request_id", request_id)
            .single()
            .execute()
            .data
        )

    def step_import(self, tenant, identity, previous_step, changes):
        return (
            self.db.table(TABLES["imports"])
            .update({**changes, "step": previous_step + 1})
            .eq("tenant_id", tenant)
            .eq("id", identity)
            .eq("step", previous_step)
            .execute()
            .data
        )

    def delete_report(self, tenant, identity):
        self.db.table(TABLES["reports"]).delete().eq("tenant_id", tenant).eq(
            "id", identity
        ).execute()

    def cleanup(self):
        self.db.rpc("expire_inffyn_monthly_evidence").execute()
