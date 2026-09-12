"""Run unit tests without loading project .env files or contacting providers."""

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "engine"))
import pydantic_settings

original = pydantic_settings.BaseSettings.__init__


def isolated(self, *args, **kwargs):
    kwargs["_env_file"] = None
    return original(self, *args, **kwargs)


pydantic_settings.BaseSettings.__init__ = isolated
for key in list(os.environ):
    if any(
        part in key.upper()
        for part in (
            "SUPABASE",
            "STRIPE",
            "SENTRY",
            "ANTHROPIC",
            "OPENAI",
            "AUDIT_",
            "BILLING_",
        )
    ):
        del os.environ[key]
os.environ.update(
    SUPABASE_URL="https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY="local-test-not-a-real-key",
)
import socket

original_connect = socket.socket.connect


def blocked_connect(self, address):
    if isinstance(address, tuple) and address[0] not in (
        "127.0.0.1",
        "::1",
        "localhost",
    ):
        raise RuntimeError("External network is disabled in unit tests")
    return original_connect(self, address)


socket.socket.connect = blocked_connect
import pytest

arguments = sys.argv[1:]
if not arguments:
    arguments = [str(root / "engine" / "tests"), "-q"]
elif all(argument.startswith("-") for argument in arguments):
    arguments.insert(0, str(root / "engine" / "tests"))
raise SystemExit(pytest.main(arguments))
