"""Protected operator checks and retention, independent of the intake switch."""

import hmac
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from app.sentry import scrub_telemetry


def sweep(settings, repo):
    if not settings.audit_v2_enabled or not settings.audit_retention_approved:
        raise HTTPException(503, "Retention maintenance is awaiting policy approval.")
    from app.monthly.repository import MonthlyRepository

    # Pausing uploads must never pause deletion of already-retained evidence.
    repo.cleanup()
    MonthlyRepository(repo.db).cleanup()


def maintenance_router(settings, get_repo):
    def authorize(authorization: str = Header(default="")):
        secret = getattr(settings, "maintenance_secret", None)
        if (
            not secret
            or len(secret) < 32
            or not hmac.compare_digest(
                authorization.encode(), ("Bearer " + secret).encode()
            )
        ):
            raise HTTPException(401, "Unauthorized maintenance request.")

    router = APIRouter(prefix="/maintenance", dependencies=[Depends(authorize)])

    @router.post("")
    def retention():
        run_id = str(uuid4())
        try:
            sweep(settings, get_repo())
        except HTTPException:
            raise
        except Exception:
            logging.getLogger("inffyn.operations").error(
                "inffyn_retention_failed run_id=%s", run_id
            )
            return JSONResponse(
                {"code": "retention_failed", "run_id": run_id},
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        logging.getLogger("inffyn.operations").warning(
            "inffyn_retention_completed run_id=%s", run_id
        )
        return JSONResponse(
            {
                "run_id": run_id,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "scope": "expired audit and import evidence",
                "monthly_included": True,
            },
            headers={"Cache-Control": "no-store"},
        )

    @router.post("/check")
    def monitoring_check():
        # Fixed synthetic event only; never forward caller-supplied evidence.
        event_id = uuid4().hex
        event = scrub_telemetry(
            {
                "event_id": event_id,
                "level": "error",
                "platform": "python",
                "exception": {
                    "values": [
                        {
                            "type": "InfFynOperationalCheck",
                            "value": "SYNTHETIC_PRIVATE_EVIDENCE_MUST_BE_REMOVED",
                        }
                    ]
                },
                "request": {"data": "SYNTHETIC_PRIVATE_EVIDENCE_MUST_BE_REMOVED"},
            }
        )
        logging.getLogger("inffyn.operations").error(
            "inffyn_monitoring_check event_id=%s event=%s", event_id, event
        )
        configured = bool(getattr(settings, "sentry_dsn", None))
        if configured:
            import sentry_sdk

            sentry_sdk.capture_event(event)
            sentry_sdk.flush(timeout=5)
        return JSONResponse(
            {
                "event_id": event_id,
                "check": "synthetic_scrubbed_error",
                "platform_log_emitted": True,
                "external_monitor_configured": configured,
                # A send/flush is not proof that the service received the event.
                "external_delivery_verified": False,
            },
            headers={"Cache-Control": "no-store"},
        )

    return router


def main():
    from app.config import settings
    from supabase import create_client
    from .repository import AuditRepository

    sweep(
        settings,
        AuditRepository(
            create_client(settings.supabase_url, settings.supabase_service_role_key)
        ),
    )
    print("Audit and monthly retention sweep completed; no customer payload logged.")


if __name__ == "__main__":
    main()
