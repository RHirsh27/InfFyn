"""Validate the dedicated Render alpha entry point before loading the application."""

import os
from collections.abc import Mapping, MutableMapping
from pathlib import Path

from dotenv import dotenv_values

PROJECT_URL = "https://jmfzmoqdvweeixxwzlma.supabase.co"
SECRET_FILE = "/etc/secrets/inffyn-engine.env"
DISABLED_FLAGS = (
    "INFFYN_PREVIEW_MODE",
    "BILLING_ENABLED",
    "BILLING_PRICE_APPROVED",
    "BILLING_LIVE_APPROVED",
    "OPENAI_IMPORT_ENABLED",
    "ANTHROPIC_IMPORT_ENABLED",
    "STRIPE_IMPORT_ENABLED",
)


def configure_render(
    environment: MutableMapping[str, str] | None = None,
    credentials: Mapping[str, str | None] | None = None,
) -> None:
    env = os.environ if environment is None else environment
    if (
        env.get("INFFYN_RELEASE_STAGE") != "private_alpha"
        or env.get("INFFYN_PRIVATE_ALPHA") != "true"
        or any(env.get(key, "false") != "false" for key in DISABLED_FLAGS)
    ):
        raise RuntimeError("Render private-alpha safeguards are not configured.")
    if credentials is None:
        if env.get("INFFYN_SECRETS_FILE") != SECRET_FILE:
            raise RuntimeError("The Render secret-file location is not configured.")
        try:
            if not Path(SECRET_FILE).is_file():
                raise OSError()
            credentials = dotenv_values(SECRET_FILE, interpolate=False)
        except Exception:
            raise RuntimeError("The Render server configuration is unavailable.") from None
    if (
        set(credentials) != {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"}
        or credentials.get("SUPABASE_URL") != PROJECT_URL
        or not credentials.get("SUPABASE_SERVICE_ROLE_KEY")
    ):
        raise RuntimeError("The Render server configuration is invalid.")
    # Never print these values, accept caller-provided paths, or fall back to a
    # stateless preview. The existing UUID and membership guards remain mandatory.
    for key, value in credentials.items():
        env[key] = value
