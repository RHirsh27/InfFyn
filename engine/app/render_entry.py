"""Native Python deployment on Render; no Docker or migration-on-start behavior."""

from app.render_config import configure_render

configure_render()

from app.main import app  # noqa: E402

__all__ = ["app"]
