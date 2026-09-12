"""Bound request memory before JSON parsing, including chunked requests."""

from starlette.responses import JSONResponse


class AuditBodyLimit:
    def __init__(self, app, maximum=4_000_000):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/v2/"):
            return await self.app(scope, receive, send)
        data = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            data.extend(message.get("body", b""))
            if len(data) > self.maximum:
                return await JSONResponse(
                    {
                        "detail": {
                            "code": "upload_limit",
                            "message": "The combined audit upload is limited to 4 MB. Reduce the period or aggregate usage while preserving customer and workflow dimensions.",
                        }
                    },
                    status_code=413,
                )(scope, receive, send)
            if not message.get("more_body", False):
                break
        consumed = False

        async def bounded_receive():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
