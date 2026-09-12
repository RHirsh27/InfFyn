"""Tenant-resolver seam (engine). Single choke point for tenant context.

Later: dedicated-DB-per-tenant routing plugs in here (D13).
"""

from fastapi import HTTPException
from supabase import Client

from app.models import TenantContext


def resolve_tenant(supabase: Client, user_id: str, tenant_id: str) -> TenantContext:
    """Validate membership via service-role client, else 403.

    Every engine endpoint touching tenant data MUST call this first and
    filter all queries by the returned tenant_id.
    """
    result = (
        supabase.table("memberships")
        .select("role")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )

    membership = result.data if result is not None else None
    if not membership:
        raise HTTPException(
            status_code=403,
            detail="User is not a member of the requested tenant",
        )

    return TenantContext(
        tenant_id=tenant_id,
        user_id=user_id,
        role=membership["role"],
    )
