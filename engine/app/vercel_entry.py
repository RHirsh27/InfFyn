import os

from app.private_alpha import alpha_requested

__all__ = ["app"]

if (
    os.environ.get("INFFYN_PREVIEW_MODE") == "true"
    and os.environ.get("INFFYN_PREVIEW_STORAGE") == "browser"
    and not alpha_requested(
        os.environ.get("INFFYN_PRIVATE_ALPHA"), os.environ.get("INFFYN_RELEASE_STAGE")
    )
):
    from app.v2.review_host import app
else:
    from app.main import app
