"""Async CSV ingest job runner."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from supabase import Client

from app.config import settings
from app.ingest.csv import CsvValidationError, parse_token_usage_csv, to_usage_event_records
from app.models import TenantContext

logger = logging.getLogger(__name__)


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def assert_storage_path_for_tenant(storage_path: str, tenant_id: str) -> str:
    normalized = storage_path.strip().lstrip("/")
    prefix = f"{tenant_id}/"
    if not normalized.startswith(prefix):
        raise HTTPException(
            status_code=403,
            detail="Storage path does not belong to the requested tenant",
        )
    return normalized


def download_storage_file(supabase: Client, storage_path: str) -> bytes:
    bucket = settings.supabase_storage_bucket
    try:
        data = supabase.storage.from_(bucket).download(storage_path)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Could not read file from storage: {storage_path}",
        ) from exc

    if isinstance(data, bytes):
        return data
    if isinstance(data, str):
        return data.encode("utf-8")
    raise HTTPException(status_code=500, detail="Unexpected storage response type")


def get_existing_job(supabase: Client, tenant_id: str, file_hash: str) -> dict[str, Any] | None:
    result = (
        supabase.table("ingest_jobs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("content_hash", file_hash)
        .maybe_single()
        .execute()
    )
    if result is None:
        return None
    return result.data


def create_job(
    supabase: Client,
    tenant_id: str,
    file_hash: str,
    storage_path: str,
) -> dict[str, Any]:
    result = (
        supabase.table("ingest_jobs")
        .insert(
            {
                "tenant_id": tenant_id,
                "content_hash": file_hash,
                "storage_path": storage_path,
                "status": "pending",
            }
        )
        .execute()
    )
    if result is None or not result.data:
        raise HTTPException(status_code=500, detail="Failed to create ingest job")
    return result.data[0]


def update_job(
    supabase: Client,
    job_id: str,
    *,
    status: str,
    rows_ingested: int = 0,
    rows_rejected: int = 0,
    error_detail: list[str] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "status": status,
        "rows_ingested": rows_ingested,
        "rows_rejected": rows_rejected,
    }
    if status in ("completed", "failed"):
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()
    if error_detail is not None:
        payload["error_detail"] = error_detail

    supabase.table("ingest_jobs").update(payload).eq("id", job_id).execute()


def job_response(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["id"],
        "status": job["status"],
        "rows_ingested": job.get("rows_ingested", 0),
        "rows_rejected": job.get("rows_rejected", 0),
        "error_detail": job.get("error_detail"),
        "storage_path": job.get("storage_path"),
    }


def start_csv_ingest(
    supabase: Client,
    ctx: TenantContext,
    storage_path: str,
) -> dict[str, Any]:
    """Validate path + CSV synchronously; create job. Caller queues insert."""
    normalized_path = assert_storage_path_for_tenant(storage_path, ctx.tenant_id)
    file_bytes = download_storage_file(supabase, normalized_path)
    file_hash = content_hash(file_bytes)

    existing = get_existing_job(supabase, ctx.tenant_id, file_hash)
    if existing:
        if existing["status"] == "completed":
            return job_response(existing)
        if existing["status"] in ("pending", "processing"):
            return job_response(existing)
        supabase.table("ingest_jobs").delete().eq("id", existing["id"]).execute()

    try:
        parsed = parse_token_usage_csv(file_bytes, normalized_path)
    except CsvValidationError as exc:
        raise HTTPException(status_code=400, detail={"errors": exc.errors}) from exc

    records = to_usage_event_records(parsed, ctx.tenant_id)

    try:
        job = create_job(supabase, ctx.tenant_id, file_hash, normalized_path)
    except Exception:
        existing = get_existing_job(supabase, ctx.tenant_id, file_hash)
        if existing:
            return job_response(existing)
        raise

    return {**job_response(job), "_records": records}


def process_csv_ingest_job(
    supabase: Client,
    job_id: str,
    records: list[dict[str, Any]],
) -> None:
    update_job(supabase, job_id, status="processing")

    try:
        supabase.table("usage_events").insert(records).execute()
        update_job(
            supabase,
            job_id,
            status="completed",
            rows_ingested=len(records),
            rows_rejected=0,
        )
    except Exception as exc:
        logger.exception("Ingest job %s failed", job_id)
        update_job(
            supabase,
            job_id,
            status="failed",
            rows_ingested=0,
            rows_rejected=0,
            error_detail=[str(exc)],
        )


def get_job_for_tenant(
    supabase: Client, job_id: str, tenant_id: str
) -> dict[str, Any]:
    result = (
        supabase.table("ingest_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if result is None or not result.data:
        raise HTTPException(status_code=404, detail="Ingest job not found")
    return job_response(result.data)
