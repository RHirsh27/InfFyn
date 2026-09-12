"""Real complimentary grants are independent of Stripe subscription state."""

import hashlib
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.private_alpha import enforce_alpha_user

from .billing import entitled


def access_state(repo, tenant, price_id):
    subscription = repo.subscription(tenant)
    paid = entitled(subscription, price_id)
    grant = repo.grant(tenant)
    complimentary = bool(grant and not grant.get("revoked_at"))
    return {
        "entitled": paid or complimentary,
        "access_source": "subscription"
        if paid
        else "complimentary"
        if complimentary
        else "free",
        "complimentary": complimentary,
    }


class InvitationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(
        min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    company_name: str = Field(min_length=1, max_length=120, pattern=r"\S")


class RedemptionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=64, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


def access_router(settings, get_repo, get_user):
    router = APIRouter()

    def admitted_user(user=Depends(get_user)):
        enforce_alpha_user(settings, user)
        return user

    def admin(user=Depends(admitted_user)):
        repo = get_repo()
        if not repo.is_admin(user):
            raise HTTPException(403, "Access administrator required.")
        return user, repo

    @router.get("/access/admin")
    def admin_status(user=Depends(admitted_user)):
        return {"is_admin": get_repo().is_admin(user)}

    @router.get("/access/invitations")
    def invitations(pair=Depends(admin)):
        _, repo = pair
        return {"invitations": repo.invitations()}

    @router.post("/access/invitations")
    def issue(body: InvitationInput, pair=Depends(admin)):
        user, repo = pair
        if not settings.audit_v2_enabled or not settings.audit_retention_approved:
            raise HTTPException(
                503, "Invitation activation requires the released audit workspace."
            )
        if not repo.consume_quota("invitations:" + user, 60):
            raise HTTPException(429, "Invitation limit reached. Retry in an hour.")
        token = secrets.token_urlsafe(48)
        identity = repo.issue_invitation(
            user,
            body.email.lower(),
            body.company_name.strip(),
            hashlib.sha256(token.encode()).hexdigest(),
        )
        # Secret exists only in this response, never invitation history or logs.
        return {
            "id": identity,
            "url": settings.app_base_url.rstrip("/") + "/invite#" + token,
            "expires_in_days": 7,
        }

    @router.post("/access/invitations/{invitation_id}/revoke")
    def revoke(invitation_id: UUID, pair=Depends(admin)):
        user, repo = pair
        return {"revoked": repo.revoke_invitation(user, str(invitation_id))}

    @router.post("/access/redeem")
    def redeem(body: RedemptionInput, user=Depends(admitted_user)):
        if not settings.audit_v2_enabled or not settings.audit_retention_approved:
            raise HTTPException(503, "The audit workspace is not available yet.")
        repo = get_repo()
        if not repo.consume_quota("redemption:" + user, 20):
            raise HTTPException(429, "Too many invitation attempts. Retry in an hour.")
        try:
            tenant = repo.redeem_invitation(
                user, hashlib.sha256(body.token.encode()).hexdigest()
            )
        except Exception as error:
            # PostgREST raises P0001 for our deliberately generic policy exceptions.
            if getattr(error, "code", None) == "P0001":
                raise HTTPException(
                    403,
                    "Invitation unavailable. Use the invited, verified email or ask the issuer for a new link.",
                ) from None
            raise
        return {"tenant_id": tenant, "access_source": "complimentary"}

    return router
