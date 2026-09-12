# ruff: noqa: B008
# FastAPI intentionally evaluates dependency declarations in function signatures.
import copy
import json
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.responses import JSONResponse

from app.private_alpha import is_private_alpha
from app.v2.economics import AuditError
from app.v2.throttle import quota

from .contract import (
    Adoption,
    Credential,
    DraftWrite,
    ImportRequest,
    MonthlyInput,
    Preparation,
    Selection,
    Workload,
)
from .economics import calculate_month, compare
from .preparation import definition_basis, invalidate_draft, prepare, retained_import
from .providers import (
    NOTICES,
    merge_page,
    provider_page,
    stripe_page,
)
from .repository import MonthlyRepository


class SafeRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handle(request: Request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                # Pydantic's default errors echo the input, which may contain credentials.
                return JSONResponse(
                    {
                        "detail": [
                            {
                                "loc": error["loc"],
                                "msg": error["msg"],
                                "type": error["type"],
                            }
                            for error in exc.errors()
                        ]
                    },
                    status_code=422,
                )

        return handle


def public_report(row, include_result=True):
    fields = (
        "id",
        "month",
        "fingerprint",
        "created_at",
        "evidence_expires_at",
        "report_expires_at",
    )
    return {k: row[k] for k in fields} | (
        {"result": row["result"]} if include_result else {}
    )


def performance_report(row):
    report = public_report(row)
    result = report["result"]
    fields = ("workload", "summary", "outcomes", "confidence", "cost_components")
    return {
        **report,
        "result": {
            **result,
            "workloads": [{k: w[k] for k in fields} for w in result["workloads"]],
        },
    }


def public_import(row, evidence=False):
    result = {
        k: row.get(k)
        for k in (
            "id",
            "provider",
            "month",
            "state",
            "step",
            "error",
            "created_at",
            "evidence_expires_at",
        )
    }
    result["notice"] = NOTICES[row["provider"]]
    result["counts"] = row.get("counts") or {
        key: len(rows) for key, rows in (row.get("evidence") or {}).items()
    }
    if evidence and row["state"] == "complete":
        result["evidence"] = row["evidence"]
    return result


def build_monthly_router(settings, context, workspace_access):
    router = APIRouter(prefix="/monthly", route_class=SafeRoute)

    def access(pair=Depends(context)):
        if not getattr(settings, "monthly_enabled", False):
            raise HTTPException(
                503, "Monthly reporting is awaiting release verification."
            )
        ctx, audits = pair
        repo = getattr(audits, "monthly", None) or MonthlyRepository(audits.db)
        return ctx, audits, repo

    def paid(triple):
        ctx, audits, _ = triple
        if not workspace_access(audits, ctx.tenant_id)["entitled"]:
            raise HTTPException(
                402,
                "An active subscription or complimentary access is required to create monthly reports and import data.",
            )

    def owner(triple):
        if triple[0].role != "owner":
            raise HTTPException(
                403, "Only the company owner can manage connections or delete reports."
            )

    def provider_enabled(provider):
        if is_private_alpha(settings):
            raise HTTPException(
                403,
                "Provider connections are unavailable in private alpha. Use CSV evidence.",
            )
        if provider not in NOTICES:
            raise HTTPException(404, "Unknown provider.")
        if not getattr(settings, provider + "_import_enabled", False):
            raise HTTPException(
                503,
                "This connector is not enabled for the release. CSV uploads remain available.",
            )

    def encryption():
        key = getattr(settings, "provider_token_enc_key", None)
        if not key:
            raise HTTPException(503, "Connector credential storage is not configured.")
        try:
            return Fernet(key.encode())
        except (ValueError, TypeError):
            raise HTTPException(
                503, "Connector credential storage is unavailable."
            ) from None

    def definitions(repo, tenant):
        return {
            r["id"]: {**r["definition"], "id": r["id"]}
            for r in repo.list("workloads", tenant)
        }

    def connected_source(triple, provider):
        ctx, audits, repo = triple
        if provider == "stripe":
            from app.stripe.oauth import get_connection_for_tenant

            row = get_connection_for_tenant(audits.db, ctx.tenant_id)
            if not row or row["status"] != "connected":
                raise HTTPException(424, "Connect this provider before importing.")
            return row, row["stripe_account_id"]
        row = next(
            (
                c
                for c in repo.list("connections", ctx.tenant_id)
                if c["provider"] == provider
            ),
            None,
        )
        if not row:
            raise HTTPException(424, "Connect this provider before importing.")
        return row, row["generation"]

    def import_records(repo, tenant, ids):
        if is_private_alpha(settings) and ids:
            raise HTTPException(
                403,
                "Provider import evidence is unavailable in private alpha. Use CSV evidence.",
            )
        return {
            str(identity): repo.get("imports", tenant, str(identity))
            for identity in ids
        }

    def draft_view(row, defs):
        if not row:
            return {"draft": None}
        row = copy.deepcopy(row)
        if row["definition_basis"] != definition_basis(defs):
            row["content"], row["invalidations"] = invalidate_draft(
                row["content"], row["content"], True
            )
        return {
            "draft": {
                k: row[k]
                for k in (
                    "id",
                    "month",
                    "revision",
                    "content",
                    "updated_at",
                    "evidence_expires_at",
                    "invalidations",
                )
            }
        }

    @router.get("/drafts/{month}")
    def get_draft(month: str, triple=Depends(access)):
        try:
            date.fromisoformat(month + "-01")
        except ValueError:
            raise HTTPException(422, "Choose a calendar month as YYYY-MM.") from None
        ctx, _, repo = triple
        return draft_view(
            repo.draft(ctx.tenant_id, month), definitions(repo, ctx.tenant_id)
        )

    @router.put("/drafts/{month}")
    def put_draft(month: str, body: DraftWrite, triple=Depends(access)):
        paid(triple)
        ctx, audits, repo = triple
        quota(audits, "monthly-draft:" + ctx.tenant_id, 120)
        if month != body.content.month:
            raise HTTPException(422, "Draft month and route must match.")
        if date.fromisoformat(month + "-01") > datetime.now(UTC).date().replace(day=1):
            raise HTTPException(422, "Future reporting months are not supported.")
        content = body.content.model_dump(mode="json")
        if any(w.get("reviewed_imports") for w in content["workloads"]):
            from app.import_review.service import ImportStore, validate_references
            validate_references(content, ImportStore(audits.db, ctx.tenant_id, ctx.user_id))
        if len(json.dumps(content).encode()) > 3_500_000:
            raise HTTPException(
                413,
                "Draft exceeds the retained evidence limit. Aggregate source records.",
            )
        defs = definitions(repo, ctx.tenant_id)
        ids = [str(w.workload_id) for w in body.content.workloads]
        if len(ids) != len(set(ids)) or any(wid not in defs for wid in ids):
            raise HTTPException(422, "Include each company workload once in the draft.")
        if any(
            str(a.workload_id) not in defs for a in body.content.cost_assignments
        ) or any(
            a.workload_id and str(a.workload_id) not in defs
            for inv in body.content.invoice_allocations
            for a in inv.allocations
        ):
            raise HTTPException(
                422, "Assignments must refer to this company's workloads."
            )
        refs = (
            set(body.content.import_ids)
            | {i for w in body.content.workloads for i in w.import_ids}
            | {a.import_id for a in body.content.invoice_allocations}
        )
        imported = import_records(repo, ctx.tenant_id, refs)
        expiry = datetime.now(UTC) + timedelta(days=90)
        if any(w.get("reviewed_imports") for w in content["workloads"]):
            from app.import_review.service import reference_expiry
            expiry = reference_expiry(content, ImportStore(audits.db, ctx.tenant_id, ctx.user_id), expiry)
        for identity in refs:
            job = retained_import(imported, identity, month)
            expiry = min(
                expiry,
                datetime.fromisoformat(
                    job["evidence_expires_at"].replace("Z", "+00:00")
                ),
            )
        old = repo.draft(ctx.tenant_id, month)
        basis = definition_basis(defs)
        content, invalidations = invalidate_draft(
            content,
            old["content"] if old else None,
            bool(old and old["definition_basis"] != basis),
        )
        try:
            row = repo.save_draft(
                ctx.tenant_id,
                ctx.user_id,
                month,
                body.expected_revision,
                content,
                basis,
                invalidations,
                expiry.isoformat(),
            )
        except Exception as exc:  # noqa: BLE001 -- database exceptions must not expose financial evidence
            if "draft revision changed" in str(exc).lower():
                raise HTTPException(
                    409,
                    "This draft changed in another session. Reload the saved draft before applying your edits.",
                ) from None
            raise HTTPException(
                503,
                "Draft storage is temporarily unavailable. Retry without discarding your current preparation.",
            ) from None
        return draft_view(row, defs)

    @router.post("/prepare")
    def prepare_imports(body: Preparation, triple=Depends(access)):
        paid(triple)
        ctx, audits, repo = triple
        quota(audits, "monthly-prepare:" + ctx.tenant_id, 60)
        refs = set(body.import_ids) | {a.import_id for a in body.invoice_allocations}
        return prepare(
            body,
            definitions(repo, ctx.tenant_id),
            import_records(repo, ctx.tenant_id, refs),
        )

    @router.get("/workloads")
    def workloads(triple=Depends(access)):
        ctx, _, repo = triple
        return {"workloads": list(definitions(repo, ctx.tenant_id).values())}

    @router.post("/workloads/{identity}")
    def save_workload(identity: UUID, body: Workload, triple=Depends(access)):
        paid(triple)
        ctx, audits, repo = triple
        quota(audits, "monthly-workload:" + ctx.tenant_id, 100)
        existing = definitions(repo, ctx.tenant_id)
        if len(existing) >= 100 and str(identity) not in existing:
            raise HTTPException(422, "This company has reached the 100-workload limit.")
        try:
            record = repo.workload(
                ctx.tenant_id, ctx.user_id, str(identity), body.model_dump(mode="json")
            )
            return {**record["definition"], "id": record["id"]}
        except Exception as exc:
            if "already" in str(exc):
                raise HTTPException(
                    409,
                    "A workload name or provider project is already assigned. Review existing workloads.",
                ) from None
            raise

    @router.post("/reports")
    def calculate(body: MonthlyInput, triple=Depends(access)):
        paid(triple)
        ctx, audits, repo = triple
        quota(audits, "monthly-calculate:" + ctx.tenant_id, 30)
        quota(audits, "monthly-calculate:global", 1000)
        try:
            refs = (
                set(body.import_ids)
                | {i for w in body.workloads for i in w.import_ids}
                | {a.import_id for a in body.invoice_allocations}
            )
            imports = import_records(repo, ctx.tenant_id, refs)
            result = calculate_month(
                body,
                definitions(repo, ctx.tenant_id),
                imports,
                release_context={"stage": "private_alpha"}
                if is_private_alpha(settings)
                else None,
            )
            if any(w.reviewed_imports for w in body.workloads):
                from app.import_review.core import digest
                from app.import_review.service import ImportStore, validate_references
                result["reviewed_imports"] = validate_references(body.model_dump(mode="json"), ImportStore(audits.db, ctx.tenant_id, ctx.user_id))
                result["fingerprint"] = digest({"calculation": result["fingerprint"], "reviewed_imports": result["reviewed_imports"], "version": "reviewed-csv-1"})
        except AuditError as error:
            raise HTTPException(
                422, {"code": error.code, "message": str(error)}
            ) from None
        report_options = {}
        if any(w.reviewed_imports for w in body.workloads):
            from app.import_review.service import reference_expiry
            report_options["evidence_expiry"] = reference_expiry(body.model_dump(mode="json"), ImportStore(audits.db, ctx.tenant_id, ctx.user_id), datetime.now(UTC) + timedelta(days=90)).isoformat()
        return public_report(
            repo.save_report(
                ctx.tenant_id, ctx.user_id, body.model_dump(mode="json"), result, **report_options
            )
        )

    @router.post("/adopt")
    def adopt(body: Adoption, triple=Depends(access)):
        paid(triple)
        ctx, audits, _ = triple
        original = audits.get(ctx.tenant_id, str(body.audit_id))
        if not original or original["access_level"] != "full":
            raise HTTPException(404, "Full audit not found in this company.")
        if not original.get("payload") or datetime.fromisoformat(
            original["evidence_expires_at"]
        ) <= datetime.now(UTC):
            raise HTTPException(
                410,
                "The original evidence expired. Upload source files to create a new period.",
            )
        from pydantic import ValidationError

        try:
            converted = MonthlyInput.model_validate(
                {
                    "month": original["payload"]["period_start"][:7],
                    "workloads": [
                        {"workload_id": body.workload_id, "audit": original["payload"]}
                    ],
                }
            )
        except ValidationError:
            raise HTTPException(
                422,
                "Only complete calendar-month audits can be adopted. Create a new monthly report with the required period.",
            ) from None
        return calculate(converted, triple)

    @router.get("/reports")
    def reports(triple=Depends(access)):
        ctx, _, repo = triple
        return {
            "reports": [
                public_report(r, False) for r in repo.list("reports", ctx.tenant_id)
            ],
            "selections": repo.list("selections", ctx.tenant_id),
            "limit": 100,
        }

    @router.get("/reports/{identity}")
    def report(identity: UUID, triple=Depends(access)):
        row = triple[2].get("reports", triple[0].tenant_id, str(identity))
        if not row:
            raise HTTPException(404, "Monthly report not found.")
        return public_report(row)

    @router.get("/reports/{identity}/evidence")
    def evidence(identity: UUID, triple=Depends(access)):
        row = triple[2].get("reports", triple[0].tenant_id, str(identity))
        if not row:
            raise HTTPException(404, "Monthly report not found.")
        if not row.get("payload") or datetime.fromisoformat(
            row["evidence_expires_at"]
        ) <= datetime.now(UTC):
            raise HTTPException(
                410,
                "Raw evidence has expired. The historical report retains its calculation basis.",
            )
        return {"payload": row["payload"]}

    @router.delete("/reports/{identity}")
    def delete_report(identity: UUID, triple=Depends(access)):
        owner(triple)
        report(identity, triple)
        triple[2].delete_report(triple[0].tenant_id, str(identity))
        return {"deleted": True}

    @router.post("/selection")
    def select_report(body: Selection, triple=Depends(access)):
        paid(triple)
        ctx, _, repo = triple
        try:
            return repo.select(
                ctx.tenant_id,
                ctx.user_id,
                str(body.report_id),
                str(body.expected_report_id) if body.expected_report_id else None,
                body.reason,
            )
        except Exception:  # noqa: BLE001 -- redact any provider exception before persisting it
            raise HTTPException(
                409,
                "Selection could not be applied. Refresh the report history and check the selected version.",
            ) from None

    @router.get("/performance")
    def performance(triple=Depends(access)):
        ctx, _, repo = triple
        selected = sorted(
            repo.list("selections", ctx.tenant_id), key=lambda r: r["month"]
        )[-12:]
        result, previous = [], None
        for selection in selected:
            record = repo.get("reports", ctx.tenant_id, selection["report_id"])
            if not record:
                continue
            current = record["result"]
            result.append(
                {
                    "report": performance_report(record),
                    "comparison": compare(current, previous),
                }
            )
            previous = current
        return {"months": result}

    @router.get("/connections")
    def connections(triple=Depends(access)):
        ctx, audits, repo = triple
        if is_private_alpha(settings):
            return {
                "connections": [
                    {
                        "provider": provider,
                        "available": False,
                        "status": "unavailable",
                        "label": provider,
                        "notice": "Provider connections are deferred during private alpha. Upload CSV evidence.",
                    }
                    for provider in NOTICES
                ],
                "is_owner": ctx.role == "owner",
            }
        stored = {r["provider"]: r for r in repo.list("connections", ctx.tenant_id)}
        result = []
        for provider in NOTICES:
            enabled = bool(getattr(settings, provider + "_import_enabled", False))
            row = stored.get(provider)
            state = row["status"] if row else "not_connected"
            if provider == "stripe" and enabled:
                from app.stripe.oauth import get_connection_for_tenant

                row = get_connection_for_tenant(audits.db, ctx.tenant_id)
                state = row["status"] if row else "not_connected"
            result.append(
                {
                    "provider": provider,
                    "available": enabled,
                    "status": state if enabled else "unavailable",
                    "label": row.get("label", provider) if row else provider,
                    "notice": NOTICES[provider],
                }
            )
        return {"connections": result, "is_owner": ctx.role == "owner"}

    @router.post("/connections/{provider}")
    def connect(provider: str, body: Credential, triple=Depends(access)):
        paid(triple)
        owner(triple)
        provider_enabled(provider)
        if provider == "stripe":
            raise HTTPException(422, "Use the read-only Stripe authorization flow.")
        ctx, audits, repo = triple
        quota(audits, "monthly-credentials:" + ctx.tenant_id, 10)
        cipher = (
            encryption().encrypt(body.credential.get_secret_value().encode()).decode()
        )
        repo.connect(ctx.tenant_id, provider, body.label, cipher)
        return {
            "status": "unverified",
            "notice": "Credential stored securely. Import a period to verify access.",
        }

    @router.delete("/connections/{provider}")
    def disconnect(provider: str, triple=Depends(access)):
        owner(triple)
        if provider not in NOTICES:
            raise HTTPException(404, "Unknown provider.")
        if provider == "stripe":
            from app.stripe.oauth import disconnect_connection

            disconnect_connection(triple[1].db, triple[0].tenant_id)
        else:
            triple[2].disconnect(triple[0].tenant_id, provider)
        return {
            "disconnected": True,
            "notice": "Stored access removed. Revoke the credential at the provider if it is no longer needed. Historical reports remain.",
        }

    @router.get("/imports")
    def imports(triple=Depends(access)):
        if is_private_alpha(settings):
            return {
                "imports": [],
                "limit": 100,
                "notice": "Provider imports are unavailable in private alpha. Use CSV evidence.",
            }
        return {
            "imports": [
                public_import(r) for r in triple[2].list("imports", triple[0].tenant_id)
            ],
            "limit": 100,
        }

    @router.post("/imports/{provider}")
    def create_import(provider: str, body: ImportRequest, triple=Depends(access)):
        paid(triple)
        provider_enabled(provider)
        ctx, audits, repo = triple
        quota(audits, "monthly-import:" + ctx.tenant_id, 20)
        quota(audits, "monthly-import:global", 1000)
        _, source = connected_source(triple, provider)
        row = repo.create_import(
            ctx.tenant_id, provider, body.month, str(body.request_id), source
        )
        if (
            row["provider"] != provider
            or row["month"] != body.month
            or row["source_identity"] != source
        ):
            raise HTTPException(
                409, "This import request ID belongs to a different source or month."
            )
        return public_import(row)

    @router.get("/imports/{identity}/evidence")
    def import_evidence(identity: UUID, triple=Depends(access)):
        row = triple[2].get("imports", triple[0].tenant_id, str(identity))
        if not row:
            raise HTTPException(404, "Import not found or evidence expired.")
        return public_import(row, True)

    @router.post("/imports/{identity}/advance")
    def advance(identity: UUID, triple=Depends(access)):
        paid(triple)
        ctx, audits, repo = triple
        quota(audits, "monthly-import-step:" + ctx.tenant_id, 500)
        row = repo.get("imports", ctx.tenant_id, str(identity))
        if not row:
            raise HTTPException(404, "Import not found or evidence expired.")
        if row["state"] == "complete":
            return public_import(row)
        provider = row["provider"]
        provider_enabled(provider)
        try:
            connection, source = connected_source(triple, provider)
            if row["source_identity"] != source:
                raise HTTPException(
                    409,
                    "This connection changed after the import started. Start a fresh import to avoid mixing sources.",
                )
            if row["step"] >= 200:
                raise HTTPException(
                    413,
                    "Provider history exceeds the import limit. Use a scoped CSV export.",
                )
            if provider == "stripe":
                from app.stripe.oauth import get_access_token_for_tenant
                from app.v2.billing import billing_lock

                with billing_lock(audits, ctx.tenant_id):
                    token = get_access_token_for_tenant(audits.db, ctx.tenant_id)
                    phase, records, cursor = stripe_page(
                        token, row["month"], row["cursor"], source
                    )
            else:
                credential = (
                    encryption()
                    .decrypt(connection["encrypted_credential"].encode())
                    .decode()
                )
                phase, records, cursor = provider_page(
                    provider, credential, row["month"], row["cursor"], connection["id"]
                )
            if connected_source(triple, provider)[1] != source:
                raise HTTPException(
                    409,
                    "This connection changed during the import. Start a fresh import to avoid mixing sources.",
                )
            merged = merge_page(row["evidence"], phase, records)
            progressed = repo.step_import(
                ctx.tenant_id,
                str(identity),
                row["step"],
                {
                    "state": "complete" if cursor.get("phase") == "done" else "pending",
                    "cursor": cursor,
                    "evidence": merged,
                    "counts": {k: len(v) for k, v in merged.items()},
                    "error": None,
                },
            )
            if progressed and cursor.get("phase") == "done" and provider != "stripe":
                repo.verified_connection(
                    ctx.tenant_id, connection["id"], connection["encrypted_credential"]
                )
        except HTTPException as exc:
            repo.step_import(
                ctx.tenant_id,
                str(identity),
                row["step"],
                {"state": "failed", "error": str(exc.detail)},
            )
        except Exception:  # noqa: BLE001 -- credentials must not reach error persistence
            # Never retain provider errors, headers, credentials, or arbitrary response bodies.
            repo.step_import(
                ctx.tenant_id,
                str(identity),
                row["step"],
                {
                    "state": "failed",
                    "error": "Import could not complete. Check permissions, supported currency, and source format, then resume or use CSV.",
                },
            )
        return public_import(repo.get("imports", ctx.tenant_id, str(identity)))

    from app.import_review.router import register
    register(router, access, paid, definitions, draft_view)
    return router
