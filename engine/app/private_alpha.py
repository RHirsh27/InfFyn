"""Server-owned private-alpha admission and a positive HTTP surface boundary.

This is additional admission control, never a substitute for verified JWTs,
company membership, per-company queries, or complimentary access grants.
"""

import re
from uuid import UUID

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

UUID_PATH = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
MONTH_PATH = r"\d{4}-\d{2}"


def alpha_requested(value, stage=None):
    """Unknown configured flags select the protected runtime, never preview."""
    if stage is not None and str(stage).strip().lower() not in ("", "standard"):
        return True
    return value is not None and str(value).strip().lower() not in ("", "false")


def is_private_alpha(settings):
    return (
        getattr(settings, "inffyn_private_alpha", False) is True
        or getattr(settings, "inffyn_release_stage", "standard") == "private_alpha"
    )


def release_stage(settings):
    return "private_alpha" if is_private_alpha(settings) else "standard"


def alpha_user_ids(settings):
    if (
        getattr(settings, "inffyn_release_stage", "standard") == "private_alpha"
        and getattr(settings, "inffyn_private_alpha", False) is not True
    ):
        raise HTTPException(503, "Private alpha access is not configured.")
    raw = getattr(settings, "inffyn_alpha_user_ids", "")
    if not isinstance(raw, str) or not raw.strip():
        raise HTTPException(503, "Private alpha access is not configured.")
    items = [item.strip() for item in raw.split(",")]
    if any(not re.fullmatch(UUID_PATH, item) for item in items):
        raise HTTPException(503, "Private alpha access is not configured.")
    return {str(UUID(item)) for item in items}


def enforce_alpha_user(settings, verified_user_id):
    if not is_private_alpha(settings):
        return
    allowed = alpha_user_ids(settings)
    if (
        not isinstance(verified_user_id, str)
        or not re.fullmatch(UUID_PATH, verified_user_id)
        or str(UUID(verified_user_id)) not in allowed
    ):
        raise HTTPException(403, "This account does not have private alpha access.")


def alpha_configuration_valid(settings):
    if not is_private_alpha(settings):
        return True
    try:
        alpha_user_ids(settings)
    except HTTPException:
        return False
    return True


def route_access(method, path):
    """Exact decoded paths; new endpoints are disabled until explicitly admitted."""
    if method == "GET" and (
        path in ("/health", "/v2/status", "/demo/company")
        or re.fullmatch(rf"/demo/company/reports/{UUID_PATH}/evidence", path)
    ):
        return "public"
    if method == "POST" and path in ("/v2/maintenance", "/v2/maintenance/check"):
        return "maintenance"  # Endpoint separately checks its dedicated secret.
    patterns = {
        "GET": (
            r"/tenant/verify",
            r"/v2/billing",
            r"/v2/access/admin",
            r"/v2/access/invitations",
            r"/v2/monthly/(?:workloads|reports|performance|connections|imports)",
            rf"/v2/monthly/drafts/{MONTH_PATH}",
            rf"/v2/monthly/reports/{UUID_PATH}(?:/evidence)?",
            r"/v2/monthly/(?:import-reviews|import-recipes)",
            rf"/v2/monthly/import-reviews/{UUID_PATH}(?:/rows|/export|/original)?",
        ),
        "POST": (
            r"/v2/access/(?:invitations|redeem)",
            rf"/v2/access/invitations/{UUID_PATH}/revoke",
            r"/v2/monthly/(?:prepare|reports|selection)",
            rf"/v2/monthly/workloads/{UUID_PATH}",
            r"/v2/monthly/(?:import-reviews|import-recipes)",
            rf"/v2/monthly/import-reviews/{UUID_PATH}/confirm",
            rf"/v2/monthly/drafts/{MONTH_PATH}/attach-reviewed-import",
        ),
        "PUT": (rf"/v2/monthly/drafts/{MONTH_PATH}", rf"/v2/monthly/import-reviews/{UUID_PATH}/revision"),
        "DELETE": (rf"/v2/monthly/reports/{UUID_PATH}",),
    }
    if any(re.fullmatch(pattern, path) for pattern in patterns.get(method, ())):
        return "authenticated"
    return None


def enforce_alpha_route(settings, method, path):
    if not is_private_alpha(settings):
        return
    access = route_access(method, path)
    if not access:
        raise HTTPException(403, "This operation is unavailable in private alpha.")
    if access != "public":
        alpha_user_ids(settings)


class PrivateAlphaGuard:
    def __init__(self, app, settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket" and is_private_alpha(self.settings):
            await send({"type": "websocket.close", "code": 1008})
            return
        if scope["type"] != "http" or not is_private_alpha(self.settings):
            await self.app(scope, receive, send)
            return
        try:
            path, method = scope.get("path", ""), scope.get("method", "")
            enforce_alpha_route(self.settings, method, path)
            if route_access(method, path) == "authenticated":
                # A direct engine call cannot substitute headers or a frontend session
                # assertion for a cryptographically verified Supabase identity.
                values = [
                    v.decode("latin-1")
                    for k, v in scope.get("headers", ())
                    if k.lower() == b"authorization"
                ]
                if len(values) != 1:
                    raise HTTPException(
                        401, "Missing or malformed Authorization header"
                    )
                scheme, _, token = values[0].partition(" ")
                if scheme.lower() != "bearer" or not token.strip():
                    raise HTTPException(
                        401, "Missing or malformed Authorization header"
                    )
                from app.auth import verify_jwt

                user = await run_in_threadpool(verify_jwt, token.strip())
                enforce_alpha_user(self.settings, user)
                scope.setdefault("state", {})["inffyn_alpha_verified_user"] = user
        except HTTPException as exc:
            await JSONResponse(
                {"detail": exc.detail},
                status_code=exc.status_code,
                headers={"Cache-Control": "no-store"},
            )(scope, receive, send)
            return
        await self.app(scope, receive, send)
