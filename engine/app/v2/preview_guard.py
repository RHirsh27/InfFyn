"""A hosted review deployment cannot invoke payments, email or legacy ingestion."""

from starlette.responses import JSONResponse


class PreviewGuard:
    def __init__(self, app, enabled=False):
        self.app = app
        self.enabled = enabled

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if (
            self.enabled
            and scope["type"] == "http"
            and (
                path.startswith(
                    (
                        "/stripe",
                        "/ingest",
                        "/audit/",
                        "/board-report",
                        "/v2/stripe",
                        "/v2/access",
                    )
                )
                or path.startswith("/v2/billing/")
                or path == "/v2/billing-webhook"
            )
        ):
            await JSONResponse(
                {"detail": "This integration is disabled in the review preview."},
                status_code=403,
            )(scope, receive, send)
            return
        await self.app(scope, receive, send)
