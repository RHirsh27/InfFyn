"""Synthetic deployment configuration checks; no hosted credentials or requests."""

import pytest

from app import render_config
from app.render_config import DISABLED_FLAGS, PROJECT_URL, configure_render


def safe_environment():
    return {"INFFYN_PRIVATE_ALPHA": "true", "INFFYN_RELEASE_STAGE": "private_alpha"}


def credentials():
    return {"SUPABASE_URL": PROJECT_URL, "SUPABASE_SERVICE_ROLE_KEY": "synthetic-test-only"}


def test_server_configuration_does_not_grant_admission_or_approve_retention():
    env = safe_environment()
    configure_render(env, credentials())
    assert env["SUPABASE_URL"] == PROJECT_URL
    assert "INFFYN_ALPHA_USER_IDS" not in env
    assert "AUDIT_RETENTION_APPROVED" not in env


@pytest.mark.parametrize("flag", DISABLED_FLAGS)
@pytest.mark.parametrize("value", ["true", "unknown"])
def test_render_rejects_preview_billing_and_provider_enablement(flag, value):
    env = {**safe_environment(), flag: value}
    with pytest.raises(RuntimeError, match="safeguards"):
        configure_render(env, credentials())
    assert "SUPABASE_SERVICE_ROLE_KEY" not in env


@pytest.mark.parametrize("key", ["INFFYN_PRIVATE_ALPHA", "INFFYN_RELEASE_STAGE"])
def test_missing_alpha_marker_cannot_open_standard_runtime(key):
    env = safe_environment()
    del env[key]
    with pytest.raises(RuntimeError, match="safeguards"):
        configure_render(env, credentials())


@pytest.mark.parametrize("change", [
    {"SUPABASE_URL": "https://another-project.supabase.co"},
    {"SUPABASE_SERVICE_ROLE_KEY": ""},
    {"UNEXPECTED_SECRET": "never-echo-this"},
])
def test_wrong_project_or_unexpected_secrets_fail_without_printing_values(change):
    with pytest.raises(RuntimeError, match="configuration is invalid") as error:
        configure_render(safe_environment(), {**credentials(), **change})
    assert "never-echo-this" not in str(error.value)
    assert "synthetic-test-only" not in str(error.value)


def test_unexpected_secret_file_path_is_not_read():
    with pytest.raises(RuntimeError, match="location"):
        configure_render({**safe_environment(), "INFFYN_SECRETS_FILE": "/untrusted/path"})


def test_secret_file_preserves_literal_dollar_expressions(tmp_path, monkeypatch):
    path = tmp_path / "synthetic.env"
    path.write_text(
        f"SUPABASE_URL={PROJECT_URL}\nSUPABASE_SERVICE_ROLE_KEY=synthetic-${{EXPAND_ME}}\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("EXPAND_ME", "must-not-be-substituted")
    monkeypatch.setattr(render_config, "SECRET_FILE", str(path))
    env = {**safe_environment(), "INFFYN_SECRETS_FILE": str(path)}
    configure_render(env)
    assert env["SUPABASE_SERVICE_ROLE_KEY"] == "synthetic-${EXPAND_ME}"


def test_missing_secret_file_has_a_safe_error(tmp_path, monkeypatch):
    path = str(tmp_path / "absent.env")
    monkeypatch.setattr(render_config, "SECRET_FILE", path)
    with pytest.raises(RuntimeError, match="configuration is unavailable") as error:
        configure_render({**safe_environment(), "INFFYN_SECRETS_FILE": path})
    assert path not in str(error.value)
