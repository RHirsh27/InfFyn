from __future__ import annotations

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.company_demo import router as company_demo_router
from app.config import settings
from app.ingest.jobs import (
    get_job_for_tenant,
    process_csv_ingest_job,
    start_csv_ingest,
)
from app.metrics.audit import run_audit
from app.metrics.board_report import generate_board_report
from app.metrics.projection import get_projected_result
from app.private_alpha import PrivateAlphaGuard, is_private_alpha, release_stage
from app.sentry import init_sentry
from app.stripe.oauth import (
    build_authorize_url,
    disconnect_connection,
    exchange_code_for_tokens,
    upsert_connection,
)
from app.stripe.oauth_state import verify_oauth_state
from app.stripe.sync import sync_stripe_revenue
from app.tenant import resolve_tenant
from app.v2.body_limit import AuditBodyLimit
from app.v2.errors import service_error
from app.v2.preview_guard import PreviewGuard
from app.v2.router import build_router

init_sentry()

app = FastAPI(title="InfFyn Engine")


def get_supabase_client():
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


app.add_middleware(AuditBodyLimit)
app.add_middleware(
    PreviewGuard,
    enabled=settings.inffyn_preview_mode and not is_private_alpha(settings),
)
app.add_middleware(PrivateAlphaGuard, settings=settings)
app.add_exception_handler(Exception, service_error)
app.include_router(company_demo_router)
app.include_router(
    build_router(settings, get_supabase_client, get_current_user, resolve_tenant)
)


@app.get("/health")
def health():
    return {"status": "ok", "release_stage": release_stage(settings)}


class TenantVerifyResponse(BaseModel):
    tenant_id: str
    user_id: str
    role: str


@app.get("/tenant/verify", response_model=TenantVerifyResponse)
def verify_tenant_endpoint(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    """Protected tenant guard — identity from verified JWT, then membership check."""
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    return TenantVerifyResponse(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        role=ctx.role,
    )


class IngestCsvRequest(BaseModel):
    storage_path: str = Field(..., min_length=1)


class IngestJobResponse(BaseModel):
    job_id: str
    status: str
    rows_ingested: int = 0
    rows_rejected: int = 0
    error_detail: list[str] | None = None
    storage_path: str | None = None


def _schedule_csv_ingest(job_id: str, records: list[dict]) -> None:
    supabase = get_supabase_client()
    process_csv_ingest_job(supabase, job_id, records)


@app.post("/ingest/csv", response_model=IngestJobResponse)
def ingest_csv(
    body: IngestCsvRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    """Validate JWT + membership, then queue async CSV → usage_events ingest."""
    if settings.audit_v2_enabled:
        raise HTTPException(410, "New uploads use the reviewed /v2/audits workflow.")
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)

    result = start_csv_ingest(supabase, ctx, body.storage_path)

    if result["status"] == "completed":
        return IngestJobResponse(
            **{k: v for k, v in result.items() if not k.startswith("_")}
        )

    records = result.pop("_records")
    job_id = result["job_id"]
    background_tasks.add_task(_schedule_csv_ingest, job_id, records)

    return IngestJobResponse(**result)


@app.get("/ingest/jobs/{job_id}", response_model=IngestJobResponse)
def get_ingest_job(
    job_id: str,
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    return IngestJobResponse(**get_job_for_tenant(supabase, job_id, ctx.tenant_id))


class StripeConnectStartResponse(BaseModel):
    authorize_url: str
    scope: str = "read_only"


@app.post("/stripe/connect/start", response_model=StripeConnectStartResponse)
def stripe_connect_start(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    url = build_authorize_url(ctx.tenant_id, ctx.user_id)
    return StripeConnectStartResponse(authorize_url=url)


@app.get("/stripe/connect/callback")
def stripe_connect_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    payload = verify_oauth_state(settings, state)
    tenant_id = payload["tid"]
    user_id = payload["uid"]
    supabase = get_supabase_client()
    resolve_tenant(supabase, user_id, tenant_id)
    tokens = exchange_code_for_tokens(code)
    upsert_connection(
        supabase, tenant_id, tokens["stripe_account_id"], tokens["refresh_token"]
    )
    return RedirectResponse(
        url=f"{settings.app_base_url.rstrip('/')}/app?stripe=connected",
        status_code=302,
    )


class StripeSyncResponse(BaseModel):
    status: str
    rows_synced: int
    last_cursor: str | None = None
    last_sync_at: str | None = None


def _run_stripe_sync(tenant_id: str) -> None:
    supabase = get_supabase_client()
    sync_stripe_revenue(supabase, tenant_id)


@app.post("/stripe/sync", response_model=StripeSyncResponse)
def stripe_sync(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    background: bool = Query(True),
):
    if settings.audit_v2_enabled:
        raise HTTPException(
            410,
            "Use /v2/stripe/evidence and review the billing basis before importing.",
        )
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)

    if background:
        background_tasks.add_task(_run_stripe_sync, ctx.tenant_id)
        return StripeSyncResponse(status="queued", rows_synced=0)

    result = sync_stripe_revenue(supabase, ctx.tenant_id)
    return StripeSyncResponse(**result)


@app.post("/stripe/disconnect")
def stripe_disconnect(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    # Tenant-scoped: resolve_tenant verifies the caller is a member of x_tenant_id,
    # so a tenant can only ever disconnect its OWN Stripe connection.
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    return disconnect_connection(supabase, ctx.tenant_id)


@app.post("/audit/run")
def audit_run(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    """Compute the full allocation + sensitivity audit for the tenant.

    Reads only canonical events + reference pricing (tenant-scoped), persists
    the result to audit_runs, writes a zero-PII row to audit_aggregates, and
    returns the full computed result.
    """
    if settings.audit_v2_enabled:
        raise HTTPException(
            410, "New audits use /v2/audits. Historical reports remain readable."
        )
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    return run_audit(supabase, ctx.tenant_id)


@app.get("/audit/result")
def audit_result(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
    run_id: str | None = Query(None),
):
    """Tier-gated projection of a persisted audit run.

    Free tenants receive only the teaser projection (spend/1M by model,
    headline, flagged count); paid tenants receive the full result + history.
    Gating is enforced here, server-side — never in the client.
    """
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    return get_projected_result(supabase, ctx.tenant_id, run_id)


class BoardReportResponse(BaseModel):
    status: str  # "ok" | "needs_stripe" | "no_run"
    report: str | None = None
    source: str | None = None  # "ai" | "baseline"
    notice: str | None = None


@app.post("/board-report", response_model=BoardReportResponse)
def board_report(
    user_id: str = Depends(get_current_user),
    x_tenant_id: str = Header(..., alias="X-Tenant-Id"),
):
    """Generate an honest, board-ready narrative from the tenant's latest audit.

    Tenant-scoped (resolve_tenant) and Stripe-gated: the exact figures come from the
    paid, Stripe-joined result, so a non-paid tenant is asked to connect Stripe rather
    than being handed a fabricated report. The Anthropic key stays engine-side.
    """
    supabase = get_supabase_client()
    ctx = resolve_tenant(supabase, user_id, x_tenant_id)
    projected = get_projected_result(supabase, ctx.tenant_id)

    if not projected.get("has_run"):
        return BoardReportResponse(status="no_run")
    if not projected.get("paid") or not projected.get("result"):
        return BoardReportResponse(status="needs_stripe")

    out = generate_board_report(
        projected["result"], settings.anthropic_api_key, settings.anthropic_model
    )
    return BoardReportResponse(status="ok", **out)
