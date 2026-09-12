import logging
from uuid import uuid4
from fastapi import Request
from fastapi.responses import JSONResponse


def service_error(request: Request, error: Exception):
    trace = str(uuid4())
    logging.getLogger("inffyn.audit").error(
        "Request failed: error_type=%s trace_id=%s", type(error).__name__, trace
    )
    return JSONResponse(
        {
            "detail": {
                "code": "service_error",
                "message": "The audit service could not complete this request. Retry with the same inputs.",
                "trace_id": trace,
            }
        },
        status_code=503,
        headers={"Cache-Control": "no-store"},
    )
