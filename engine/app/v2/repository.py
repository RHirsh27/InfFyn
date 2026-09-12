from datetime import datetime, timezone
from uuid import uuid4

from .economics import preview, report


def now():
    return datetime.now(timezone.utc).isoformat()


def optional_data(response):
    # postgrest 2.x returns None for a successful maybe_single with zero rows.
    return response.data if response is not None else None


class AuditRepository:
    def __init__(self, db):
        self.db = db

    def cleanup(self):
        self.db.rpc("expire_economic_evidence").execute()

    def consume_preview(self, bucket):
        return bool(
            self.db.rpc("consume_audit_preview_limit", {"p_bucket": bucket})
            .execute()
            .data
        )

    def consume_quota(self, bucket, limit):
        return bool(
            self.db.rpc("consume_inffyn_quota", {"p_bucket": bucket, "p_limit": limit})
            .execute()
            .data
        )

    def grant(self, tenant):
        return optional_data(
            self.db.table("inffyn_access_grants")
            .select("revoked_at")
            .eq("tenant_id", tenant)
            .maybe_single()
            .execute()
        )

    def is_admin(self, user):
        return bool(
            optional_data(
                self.db.table("inffyn_access_admins")
                .select("user_id")
                .eq("user_id", user)
                .maybe_single()
                .execute()
            )
        )

    def invitations(self):
        return (
            self.db.table("inffyn_invitations")
            .select(
                "id,email,company_name,created_at,expires_at,redeemed_at,revoked_at,tenant_id"
            )
            .order("created_at", desc=True)
            .limit(200)
            .execute()
            .data
            or []
        )

    def issue_invitation(self, actor, email, company, token_hash):
        return (
            self.db.rpc(
                "issue_inffyn_invitation",
                {
                    "p_actor": actor,
                    "p_email": email,
                    "p_company": company,
                    "p_hash": token_hash,
                },
            )
            .execute()
            .data
        )

    def redeem_invitation(self, user, token_hash):
        return (
            self.db.rpc(
                "redeem_inffyn_invitation", {"p_user": user, "p_hash": token_hash}
            )
            .execute()
            .data
        )

    def revoke_invitation(self, actor, invitation):
        return bool(
            self.db.rpc(
                "revoke_inffyn_invitation",
                {"p_actor": actor, "p_invitation": invitation},
            )
            .execute()
            .data
        )

    def create_preview(self, secret_hash, payload, result):
        self.db.table("audit_previews").insert(
            {
                "secret_hash": secret_hash,
                "payload": payload.model_dump(mode="json"),
                "result": result,
            }
        ).execute()

    def claim(self, secret_hash, tenant_id, user_id):
        return (
            self.db.rpc(
                "claim_economic_preview",
                {"p_hash": secret_hash, "p_tenant": tenant_id, "p_user": user_id},
            )
            .execute()
            .data
        )

    def save(self, tenant_id, user_id, payload, result, full):
        access = "full" if full else "preview"
        record = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            "created_by": user_id,
            "fingerprint": result["fingerprint"],
            "title": payload.title,
            "kind": payload.kind,
            "access_level": access,
            "payload": payload.model_dump(mode="json"),
            "result": result,
            "report": report(result) if full else None,
        }
        self.db.table("economic_audits").upsert(
            record,
            on_conflict="tenant_id,fingerprint,access_level",
            ignore_duplicates=True,
        ).execute()
        return (
            self.db.table("economic_audits")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("fingerprint", result["fingerprint"])
            .eq("access_level", access)
            .single()
            .execute()
            .data
        )

    def get(self, tenant_id, audit_id):
        return optional_data(
            self.db.table("economic_audits")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", audit_id)
            .gt("report_expires_at", now())
            .maybe_single()
            .execute()
        )

    def list(self, tenant_id):
        return (
            self.db.table("economic_audits")
            .select(
                "id,title,kind,access_level,created_at,fingerprint,evidence_expires_at,report_expires_at"
            )
            .eq("tenant_id", tenant_id)
            .gt("report_expires_at", now())
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
            or []
        )

    def delete(self, tenant_id, audit_id):
        self.db.table("economic_audits").delete().eq("tenant_id", tenant_id).eq(
            "id", audit_id
        ).execute()

    def subscription(self, tenant_id):
        return optional_data(
            self.db.table("inffyn_subscriptions")
            .select("*")
            .eq("tenant_id", tenant_id)
            .maybe_single()
            .execute()
        ) or {"status": "inactive"}


def present(record):
    full = record["access_level"] == "full"
    return {
        k: record.get(k)
        for k in (
            "id",
            "title",
            "kind",
            "access_level",
            "created_at",
            "evidence_expires_at",
            "report_expires_at",
        )
    } | {
        "result": record["result"] if full else preview(record["result"]),
        "report": record.get("report") if full else None,
    }
