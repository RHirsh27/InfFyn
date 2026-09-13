import hashlib
import secrets
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.private_alpha import (
    alpha_configuration_valid,
    enforce_alpha_route,
    enforce_alpha_user,
    is_private_alpha,
    release_stage,
)

from . import billing
from .access import access_router, access_state
from .computation import compute
from .contract import AuditInput
from .economics import preview
from .repository import AuditRepository, present
from .throttle import quota, visitor_bucket
from .maintenance import maintenance_router


class ClaimInput(BaseModel):
    token: str = Field(min_length=40, max_length=100)


class StripePeriod(BaseModel):
    period_start: date
    period_end: date


def build_router(settings, get_db, get_user, resolve_tenant, get_repo=None):
    def alpha_boundary(request: Request):
        enforce_alpha_route(settings, request.method, request.url.path)

    router = APIRouter(prefix="/v2", dependencies=[Depends(alpha_boundary)])

    def repository():
        return get_repo() if get_repo else AuditRepository(get_db())

    router.include_router(access_router(settings, repository, get_user), prefix="")
    router.include_router(maintenance_router(settings, repository))

    def workspace_access(repo, tenant):
        if getattr(settings, "inffyn_preview_mode", False) and not is_private_alpha(
            settings
        ):
            return {
                "entitled": True,
                "access_source": "preview",
                "complimentary": False,
            }
        return access_state(repo, tenant, settings.stripe_billing_price_id)

    def enabled():
        if not settings.audit_v2_enabled or not settings.audit_retention_approved:
            raise HTTPException(
                503,
                "The new audit workspace is awaiting release and data-retention approval.",
            )

    def context(
        user_id=Depends(get_user), tenant: UUID = Header(..., alias="X-Tenant-Id")
    ):
        enforce_alpha_user(settings, user_id)
        enabled()
        db = get_db()
        ctx = resolve_tenant(db, user_id, str(tenant))
        return ctx, get_repo() if get_repo else AuditRepository(db)

    @router.get("/status")
    def status():
        configured = alpha_configuration_valid(settings)
        alpha = is_private_alpha(settings)
        available = (
            settings.audit_v2_enabled
            and settings.audit_retention_approved
            and configured
        )
        return {
            "release_stage": release_stage(settings),
            "monthly_available": bool(getattr(settings, "monthly_enabled", False))
            and available,
            "available": available,
            "billing_available": settings.billing_enabled
            and settings.billing_price_approved
            and not alpha,
            "monthly_price_usd": 349
            if settings.billing_price_approved and not alpha
            else None,
            "currency": "USD",
            "raw_retention_days": 90 if settings.audit_retention_approved else None,
            "report_retention_months": 12
            if settings.audit_retention_approved
            else None,
        }

    @router.post("/preview")
    def cost_preview(body: AuditInput, request: Request):
        enabled()
        repo = repository()
        # Only the separate local harness injects a repository and synthetic identity.
        bucket = (
            "local-preview"
            if get_repo
            else visitor_bucket(request, settings.audit_proxy_secret)
        )
        quota(repo, bucket, 20)
        quota(repo, "preview:global", 200)
        repo.cleanup()
        result = compute(body)
        token = secrets.token_urlsafe(48)
        repo.create_preview(hashlib.sha256(token.encode()).hexdigest(), body, result)
        return {
            "preview": preview(result),
            "claim_token": token,
            "expires_in_seconds": 3600,
        }

    @router.post("/previews/claim")
    def claim(body: ClaimInput, pair=Depends(context)):
        ctx, repo = pair
        audit_id = repo.claim(
            hashlib.sha256(body.token.encode()).hexdigest(), ctx.tenant_id, ctx.user_id
        )
        if not audit_id:
            raise HTTPException(
                410,
                "This preview has expired or was already claimed. Upload it again to save a new audit.",
            )
        return present(repo.get(ctx.tenant_id, audit_id))

    @router.get("/audits")
    def history(pair=Depends(context)):
        ctx, repo = pair
        return {"audits": repo.list(ctx.tenant_id)}

    @router.post("/audits")
    def run(body: AuditInput, pair=Depends(context)):
        ctx, repo = pair
        quota(repo, "audit:" + ctx.tenant_id, 60)
        quota(repo, "audit:global", 1000)
        full = workspace_access(repo, ctx.tenant_id)["entitled"]
        result = compute(body)
        return present(repo.save(ctx.tenant_id, ctx.user_id, body, result, full))

    @router.get("/audits/{audit_id}")
    def get_audit(audit_id: UUID, pair=Depends(context)):
        ctx, repo = pair
        record = repo.get(ctx.tenant_id, str(audit_id))
        if not record:
            raise HTTPException(404, "Audit not found.")
        return present(record)

    @router.get("/audits/{audit_id}/evidence")
    def evidence(audit_id: UUID, pair=Depends(context)):
        ctx, repo = pair
        record = repo.get(ctx.tenant_id, str(audit_id))
        if not record:
            raise HTTPException(404, "Audit not found.")
        from datetime import datetime, timezone

        if not record.get("payload") or datetime.fromisoformat(
            record["evidence_expires_at"].replace("Z", "+00:00")
        ) <= datetime.now(timezone.utc):
            raise HTTPException(
                410,
                "The evidence retention period has ended. The saved report remains available until its report expiry.",
            )
        return {"payload": record["payload"]}

    @router.post("/audits/{audit_id}/rerun")
    def rerun(audit_id: UUID, pair=Depends(context)):
        ctx, repo = pair
        if not workspace_access(repo, ctx.tenant_id)["entitled"]:
            raise HTTPException(
                402, "Full audit access is required to create this report."
            )
        payload = evidence(audit_id, pair)["payload"]
        quota(repo, "audit:" + ctx.tenant_id, 60)
        quota(repo, "audit:global", 1000)
        body = AuditInput.model_validate(payload)
        return present(repo.save(ctx.tenant_id, ctx.user_id, body, compute(body), True))

    @router.delete("/audits/{audit_id}")
    def delete(audit_id: UUID, pair=Depends(context)):
        ctx, repo = pair
        if ctx.role != "owner":
            raise HTTPException(403, "Only the company owner can delete a saved audit.")
        if not repo.get(ctx.tenant_id, str(audit_id)):
            raise HTTPException(404, "Audit not found.")
        repo.delete(ctx.tenant_id, str(audit_id))
        return {"deleted": True}

    @router.get("/billing")
    def billing_status(pair=Depends(context)):
        ctx, repo = pair
        state = repo.subscription(ctx.tenant_id)
        return {
            "status": state["status"],
            **workspace_access(repo, ctx.tenant_id),
            "is_access_admin": repo.is_admin(ctx.user_id),
            "current_period_end": state.get("current_period_end"),
            "cancel_at_period_end": state.get("cancel_at_period_end", False),
            "is_owner": ctx.role == "owner",
            "has_customer": bool(state.get("customer_id")),
            **status(),
        }

    @router.post("/billing/{action}")
    def billing_action(action: str, pair=Depends(context)):
        ctx, repo = pair
        if ctx.role != "owner":
            raise HTTPException(
                403, "Only the company owner can manage the subscription."
            )
        if action not in ("checkout", "portal"):
            raise HTTPException(404, "Unknown billing action.")
        quota(repo, "billing:" + ctx.tenant_id, 20)
        return getattr(billing, action)(repo, ctx.tenant_id, settings)

    @router.post("/billing-webhook")
    async def webhook(request: Request):
        return billing.apply_webhook(
            await request.body(),
            request.headers.get("stripe-signature", ""),
            repository(),
            settings,
        )

    @router.post("/stripe/evidence")
    def stripe_evidence(body: StripePeriod, pair=Depends(context)):
        from .stripe_evidence import collect

        ctx, repo = pair
        if (
            body.period_end < body.period_start
            or (body.period_end - body.period_start).days > 366
        ):
            raise HTTPException(422, "Choose an ordered period of at most 367 days.")
        quota(repo, "stripe-evidence:" + ctx.tenant_id, 10)
        return collect(repo, ctx.tenant_id, body.period_start, body.period_end)

    from app.monthly.router import build_monthly_router

    router.include_router(build_monthly_router(settings, context, workspace_access))
    return router
