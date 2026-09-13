import base64
import copy
import json
from datetime import UTC, datetime

from fastapi import HTTPException

from app.v2.repository import optional_data

from .core import HEADERS, digest


class ImportStore:
    def __init__(self, db, tenant, actor):
        self.db, self.tenant, self.actor = db, tenant, actor

    def query(self, table):
        return (
            self.db.table("inffyn_import_" + table)
            .select("*")
            .eq("tenant_id", self.tenant)
        )

    def source(self, identity):
        row = optional_data(
            self.query("sources")
            .eq("id", str(identity))
            .gt("expires_at", datetime.now(UTC).isoformat())
            .maybe_single()
            .execute()
        )
        if not row:
            raise HTTPException(
                404,
                "Source unavailable or expired in this company. Re-upload if needed.",
            )
        return row

    def revision(self, source, revision=None):
        row = optional_data(
            self.query("revisions")
            .eq("source_id", source["id"])
            .eq("revision", revision or source["revision"])
            .maybe_single()
            .execute()
        )
        if not row:
            raise HTTPException(404, "Reviewed revision unavailable.")
        return row

    def confirmation(self, identity):
        row = optional_data(
            self.query("confirmations").eq("id", str(identity)).maybe_single().execute()
        )
        if not row:
            raise HTTPException(404, "Confirmation unavailable in this company.")
        return row

    def current_confirmation(self, source, canonical_hash):
        """Resume only a retained confirmation of this exact source revision."""
        row = optional_data(
            self.query("confirmations")
            .eq("source_id", source["id"])
            .eq("revision", source["revision"])
            .eq("source_hash", source["sha256"])
            .eq("canonical_hash", canonical_hash)
            .gt("expires_at", datetime.now(UTC).isoformat())
            .maybe_single()
            .execute()
        )
        return {key: row[key] for key in ("id", "created_at")} if row else None

    def list(self, table, month=None):
        fields = (
            "id,month,kind,account,filename,sha256,revision,created_at,expires_at"
            if table == "sources"
            else "*"
        )
        query = (
            self.db.table("inffyn_import_" + table)
            .select(fields)
            .eq("tenant_id", self.tenant)
            .gt("expires_at", datetime.now(UTC).isoformat())
        )
        if month:
            query = query.eq("month", month)
        rows = query.order("created_at", desc=True).limit(100).execute().data or []
        return [{k: v for k, v in row.items() if k != "original"} for row in rows]

    def write(self, operation, identity=None, expected=0, data=None):
        if len(json.dumps(data or {}).encode()) > 3_800_000:
            raise HTTPException(
                413,
                "Original plus review history exceeds the request limit. Aggregate source rows or remove unused narrative columns.",
            )
        try:
            return (
                self.db.rpc(
                    "write_inffyn_import",
                    {
                        "p_tenant": self.tenant,
                        "p_actor": self.actor,
                        "p_operation": operation,
                        "p_id": str(identity) if identity else None,
                        "p_expected": expected,
                        "p_data": data or {},
                    },
                )
                .execute()
                .data
            )
        except Exception as exc:  # noqa: BLE001 -- scrub database errors that may include source values
            if any(
                s in str(exc).lower()
                for s in ("revision changed", "confirmation", "not ready")
            ):
                raise HTTPException(
                    409,
                    "Preparation changed. Reload the saved review and confirm again; your current edits are still visible.",
                ) from None
            raise HTTPException(
                503,
                "Reviewed import storage is unavailable. Retry after storage activation; no local-only save is substituted.",
            ) from None


def source_bytes(source):
    value = source["original"]
    return (
        bytes.fromhex(value[2:])
        if isinstance(value, str) and value.startswith("\\x")
        else bytes(value)
    )


def create_data(raw, body, profile):
    return {
        "month": body.month,
        "kind": body.kind,
        "account": body.account,
        "filename": body.filename,
        "sha256": digest(raw),
        "original": base64.b64encode(raw).decode(),
        "rules": body.rules.model_dump(),
        "decisions": [],
        "profile": profile,
    }


def validate_references(content, store):
    """Client claims are never trusted: compare the canonical bytes and scope."""
    metadata, seen, business_keys = [], set(), set()
    for workload in content.get("workloads", []):
        for field, identity in workload.get("reviewed_imports", {}).items():
            if field not in HEADERS:
                raise HTTPException(422, "Unsupported reviewed evidence field.")
            confirmation = store.confirmation(identity)
            source = store.source(confirmation["source_id"])
            revision = store.revision(source, confirmation["revision"])
            profile = revision["profile"]
            if (
                source["kind"] != field
                or source["month"] != content["month"]
                or source["sha256"] != confirmation["source_hash"]
                or digest(profile["canonical_csv"].encode())
                != confirmation["canonical_hash"]
                or workload["audit"].get(field) != profile["canonical_csv"]
            ):
                raise HTTPException(
                    409,
                    "Reviewed evidence changed. Reattach the confirmed dataset or remove its reviewed designation.",
                )
            if source["id"] in seen:
                raise HTTPException(
                    422,
                    "One source cannot be charged to multiple workloads. Prepare non-overlapping exports before assignment.",
                )
            seen.add(source["id"])
            for row in profile["rows"]:
                if row["disposition"] != "included":
                    continue
                key = (
                    source["account"],
                    field,
                    row["normalized"][HEADERS[field].split(",")[0]],
                )
                if key in business_keys:
                    raise HTTPException(
                        422,
                        "Reviewed exports overlap on source account and business ID. Resolve the duplicate before calculating.",
                    )
                business_keys.add(key)
            metadata.append(
                {
                    "workload_id": workload["workload_id"],
                    "field": field,
                    "confirmation_id": confirmation["id"],
                    "source_hash": confirmation["source_hash"],
                    "canonical_hash": confirmation["canonical_hash"],
                    "rules_hash": confirmation["rules_hash"],
                    "confirmed_at": confirmation["created_at"],
                    "basis": "customer_supplied_reviewed",
                    "counts": profile["counts"],
                    "controls": profile["controls"],
                    "limitations": profile["limitations"],
                }
            )
    return metadata


def reference_expiry(content, store, default):
    expiry = default
    for workload in content.get("workloads", []):
        for identity in workload.get("reviewed_imports", {}).values():
            c = store.confirmation(identity)
            source = store.source(c["source_id"])
            expiry = min(
                expiry,
                datetime.fromisoformat(source["expires_at"].replace("Z", "+00:00")),
            )
    return expiry


def attach_content(draft, workload_id, source, confirmation, revision):
    content = copy.deepcopy(draft["content"])
    matches = [w for w in content["workloads"] if w["workload_id"] == str(workload_id)]
    if len(matches) != 1:
        raise HTTPException(
            422, "Save this workload in monthly preparation before assigning evidence."
        )
    item = matches[0]
    field = source["kind"]
    if field == "revenue_csv" and item["audit"]["kind"] == "internal":
        raise HTTPException(422, "Assign revenue to a revenue-producing workload.")
    if (
        item["audit"].get(field, "").strip()
        and item.get("reviewed_imports", {}).get(field) != confirmation["id"]
    ):
        raise HTTPException(
            409,
            "This evidence slot already contains data. Export and explicitly clear it before assigning a replacement.",
        )
    item["audit"][field] = revision["profile"]["canonical_csv"]
    item.setdefault("reviewed_imports", {})[field] = confirmation["id"]
    if field == "revenue_csv":
        item["audit"]["revenue_source"] = "reviewed_file"
    for key in ("revenue_reviewed", "cost_scope_complete", "outcome_cohort_complete"):
        item["audit"][key] = False
    for key in ("method_reviewed", "revenue_scope_complete", "outcome_method_reviewed"):
        item["review"][key] = False
    content["company_scope_complete"] = False
    return content
