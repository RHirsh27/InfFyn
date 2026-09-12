import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import settings


def scrub_telemetry(event, hint=None):
    """Keep error grouping and code locations, never provider data or messages."""
    clean = {
        key: event[key]
        for key in (
            "event_id",
            "timestamp",
            "platform",
            "level",
            "release",
            "environment",
        )
        if key in event
    }
    clean["message"] = (
        "Application error. Use the event ID and error type for diagnosis."
    )
    clean["exception"] = {
        "values": [
            {
                "type": value.get("type", "ApplicationError"),
                "value": clean["message"],
                "stacktrace": {
                    "frames": [
                        {
                            key: frame[key]
                            for key in ("filename", "function", "lineno", "in_app")
                            if key in frame
                        }
                        for frame in value.get("stacktrace", {}).get("frames", [])
                    ]
                },
            }
            for value in event.get("exception", {}).get("values", [])
        ]
    }
    return clean


def init_sentry() -> None:
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
        ],
        traces_sample_rate=0,
        before_send=scrub_telemetry,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
    )
