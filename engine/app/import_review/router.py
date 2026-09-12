# ruff: noqa: B008 -- FastAPI dependency declarations
import base64
import binascii
import json
from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.monthly.preparation import definition_basis
from app.v2.economics import AuditError
from app.v2.throttle import quota

from .core import Decision, Rules, digest, profile, spreadsheet_csv
from .service import (
    ImportStore,
    attach_content,
    create_data,
    source_bytes,
    validate_references,
)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Upload(Strict):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    kind: Literal["usage_csv", "costs_csv", "revenue_csv"]
    account: str = Field(min_length=1, max_length=200)
    filename: str = Field(min_length=1, max_length=200)
    original_base64: str = Field(max_length=2_666_668)
    rules: Rules = Field(default_factory=Rules)


class BulkDecision(Strict):
    issue: str = Field(min_length=1, max_length=100)
    expected_count: int = Field(ge=1, le=20000)
    action: Literal["exclude", "amend"]
    reason: str = Field(min_length=3, max_length=300)
    field: str = Field(default="", max_length=40)
    value: str = Field(default="", max_length=2000)


class Revision(Strict):
    expected_revision: int = Field(ge=1)
    rules: Rules
    decisions: list[Decision] = Field(default_factory=list, max_length=20000)
    bulk: list[BulkDecision] = Field(default_factory=list, max_length=20)


class Confirmation(Strict):
    expected_revision: int = Field(ge=1)
    canonical_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    accepted_limitations: Literal[True]


class Recipe(Strict):
    source_id: UUID
    expected_revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=100)


class Attach(Strict):
    confirmation_id: UUID
    workload_id: UUID
    expected_revision: int = Field(ge=1)


def register(router, access, paid, definitions, draft_view):
    def store(triple):
        ctx, audits, _ = triple
        if not getattr(audits, "db", None):
            raise HTTPException(
                503, "Reviewed imports require the persistent company database."
            )
        return ImportStore(audits.db, ctx.tenant_id, ctx.user_id)

    def checked(raw, kind, month, rules, decisions=()):
        try:
            return profile(raw, kind, month, rules, decisions)
        except (AuditError, ValueError) as exc:
            raise HTTPException(
                422,
                {
                    "code": getattr(exc, "code", "invalid_import"),
                    "message": str(exc)
                    if isinstance(exc, AuditError)
                    else "Invalid import period or interpretation.",
                },
            ) from None

    def view(s, source):
        revision = s.revision(source)
        p = revision["profile"]
        return {
            "source": {k: v for k, v in source.items() if k != "original"},
            "rules": revision["rules"],
            "decisions": revision["decisions"],
            "profile": {
                k: v for k, v in p.items() if k not in {"rows", "canonical_csv"}
            },
        }

    @router.get("/import-reviews")
    def listing(month: str, triple=Depends(access)):
        return {"sources": store(triple).list("sources", month)}

    @router.post("/import-reviews")
    def upload(body: Upload, triple=Depends(access)):
        paid(triple)
        quota(triple[1], "reviewed-upload:" + triple[0].tenant_id, 40)
        try:
            raw = base64.b64decode(body.original_base64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(
                422, "File encoding is invalid. Select the CSV again."
            ) from None
        try:
            period = date.fromisoformat(body.month + "-01")
        except ValueError:
            raise HTTPException(422, "Choose a valid calendar month.") from None
        if period > datetime.now(UTC).date().replace(day=1):
            raise HTTPException(422, "Use the current or an earlier reporting month.")
        p = checked(raw, body.kind, body.month, body.rules)
        s = store(triple)
        record = s.write("create", data=create_data(raw, body, p))
        return view(s, record)

    @router.get("/import-reviews/{identity}")
    def get_review(identity: UUID, triple=Depends(access)):
        s = store(triple)
        return view(s, s.source(identity))

    @router.get("/import-reviews/{identity}/rows")
    def get_rows(
        identity: UUID, cursor: int = Query(default=0, ge=0), triple=Depends(access)
    ):
        s = store(triple)
        rows = s.revision(s.source(identity))["profile"]["rows"]
        return {
            "rows": rows[cursor : cursor + 50],
            "next_cursor": cursor + 50 if cursor + 50 < len(rows) else None,
        }

    @router.get("/import-reviews/{identity}/original")
    def original(identity: UUID, triple=Depends(access)):
        source = store(triple).source(identity)
        return {
            "filename": source["filename"],
            "sha256": source["sha256"],
            "original_base64": base64.b64encode(source_bytes(source)).decode(),
        }

    @router.put("/import-reviews/{identity}/revision")
    def revise(identity: UUID, body: Revision, triple=Depends(access)):
        paid(triple)
        quota(triple[1], "reviewed-revise:" + triple[0].tenant_id, 90)
        s = store(triple)
        source = s.source(identity)
        decisions = list(body.decisions)
        if body.bulk:
            previous = s.revision(source)
            if previous["rules"] != body.rules.model_dump():
                raise HTTPException(
                    409,
                    "Save interpretation changes before resolving an exception group.",
                )
            for group in body.bulk:
                matches = [
                    r
                    for r in previous["profile"]["rows"]
                    if r["disposition"] == "quarantined" and group.issue in r["issues"]
                ]
                if len(matches) != group.expected_count:
                    raise HTTPException(
                        409,
                        "Exception counts changed. Reload and review the group again.",
                    )
                selected = {r["row"] for r in matches}
                decisions = [
                    d
                    for d in decisions
                    if d.row not in selected
                    or (
                        d.action == "amend"
                        and (group.action != "amend" or d.field != group.field)
                    )
                ]
                decisions.extend(
                    Decision(
                        row=r["row"],
                        action=group.action,
                        reason=group.reason,
                        field=group.field,
                        value=group.value,
                    )
                    for r in matches
                )
        p = checked(
            source_bytes(source),
            source["kind"],
            source["month"],
            body.rules,
            decisions,
        )
        s.write(
            "revise",
            identity,
            body.expected_revision,
            {
                "rules": body.rules.model_dump(),
                "decisions": [d.model_dump() for d in decisions],
                "profile": p,
            },
        )
        return view(s, s.source(identity))

    @router.post("/import-reviews/{identity}/confirm")
    def confirm(identity: UUID, body: Confirmation, triple=Depends(access)):
        paid(triple)
        s = store(triple)
        revision = s.revision(s.source(identity))
        return s.write(
            "confirm",
            identity,
            body.expected_revision,
            {
                "canonical_hash": body.canonical_hash,
                "rules_hash": digest(revision["rules"]),
            },
        )

    @router.get("/import-recipes")
    def recipes(triple=Depends(access)):
        return {"recipes": store(triple).list("recipes")}

    @router.post("/import-recipes")
    def save_recipe(body: Recipe, triple=Depends(access)):
        paid(triple)
        s = store(triple)
        revision = s.revision(s.source(body.source_id))
        return s.write(
            "recipe",
            body.source_id,
            body.expected_revision,
            {"name": body.name, "rules_hash": digest(revision["rules"])},
        )

    @router.get("/import-reviews/{identity}/export")
    def export(identity: UUID, confirmation_id: UUID, triple=Depends(access)):
        s = store(triple)
        source = s.source(identity)
        c = s.confirmation(confirmation_id)
        if c["source_id"] != str(identity):
            raise HTTPException(404, "Confirmation does not belong to this source.")
        p = s.revision(source, c["revision"])["profile"]
        return {
            "canonical_csv": p["canonical_csv"],
            "spreadsheet_csv": spreadsheet_csv(p["canonical_csv"], source["kind"]),
            "manifest": c
            | {
                "basis": "customer_supplied_reviewed",
                "limitations": p["limitations"],
                "controls": p["controls"],
                "controls_by_currency": p["controls_by_currency"],
            },
            "exceptions": [
                {
                    "row": r["row"],
                    "disposition": r["disposition"],
                    "issues": r["issues"],
                    "decisions": r["decisions"],
                }
                for r in p["rows"]
                if r["disposition"] != "included"
            ],
            "notice": "Canonical CSV is machine evidence. Spreadsheet CSV prefixes formula-like text without modifying canonical evidence.",
        }

    @router.post("/drafts/{month}/attach-reviewed-import")
    def attach(month: str, body: Attach, triple=Depends(access)):
        paid(triple)
        ctx, _, repo = triple
        s = store(triple)
        confirmation = s.confirmation(body.confirmation_id)
        source = s.source(confirmation["source_id"])
        if source["month"] != month:
            raise HTTPException(
                422, "Source and monthly draft must cover the same month."
            )
        draft = repo.draft(ctx.tenant_id, month)
        if draft and draft["revision"] != body.expected_revision:
            attached = [
                w
                for w in draft["content"]["workloads"]
                if w["workload_id"] == str(body.workload_id)
                and w.get("reviewed_imports", {}).get(source["kind"])
                == confirmation["id"]
            ]
            if attached:
                validate_references(draft["content"], s)
                return draft_view(draft, definitions(repo, ctx.tenant_id))
        if not draft or draft["revision"] != body.expected_revision:
            raise HTTPException(
                409, "Save or reload the monthly draft before assigning evidence."
            )
        defs = definitions(repo, ctx.tenant_id)
        if str(body.workload_id) not in defs:
            raise HTTPException(404, "Workload unavailable in this company.")
        revision = s.revision(source, confirmation["revision"])
        content = attach_content(
            draft, body.workload_id, source, confirmation, revision
        )
        validate_references(content, s)
        if len(json.dumps(content).encode()) > 3_500_000:
            raise HTTPException(
                413, "Combined preparation exceeds 3.5 MB. Aggregate evidence."
            )
        record = s.write(
            "attach",
            source["id"],
            confirmation["revision"],
            {
                "confirmation_id": confirmation["id"],
                "draft_revision": body.expected_revision,
                "content": content,
                "definition_basis": definition_basis(defs),
                "invalidations": [
                    "Reviewed CSV attached; review workload scope and financial basis."
                ],
                "evidence_expiry": draft["evidence_expires_at"],
            },
        )
        return draft_view(record, defs)
