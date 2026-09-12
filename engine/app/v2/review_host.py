"""Stateless, real economics preview. No database, provider, billing or email clients."""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .body_limit import AuditBodyLimit
from .computation import compute
from .contract import AuditInput
from .economics import report
from .errors import service_error
from .throttle import visitor_bucket
from app.company_demo import router as company_demo_router

app = FastAPI(
    title="InfFyn review calculations", docs_url=None, redoc_url=None, openapi_url=None
)
app.add_middleware(AuditBodyLimit)
app.add_exception_handler(Exception, service_error)
app.include_router(company_demo_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": "stateless-review",
        "storage": "reviewer-browser",
        "stripe": "disabled",
        "email": "disabled",
    }


@app.post("/v2/review/calculate")
def calculate_review(body: AuditInput, request: Request):
    visitor_bucket(request, os.environ.get("AUDIT_PROXY_SECRET"))
    result = compute(body)
    created = datetime.now(timezone.utc)
    # Server computes only. The browser receives and owns the saved record.
    record = {
        "id": str(uuid4()),
        "fingerprint": result["fingerprint"],
        "title": body.title,
        "kind": body.kind,
        "access_level": "full",
        "created_at": created.isoformat(),
        "evidence_expires_at": (created + timedelta(days=90)).isoformat(),
        "report_expires_at": created.replace(
            year=created.year + 1,
            day=min(created.day, 28) if created.month == 2 else created.day,
        ).isoformat(),
        "result": result,
        "report": report(result),
    }
    return JSONResponse(record, headers={"Cache-Control": "no-store"})
