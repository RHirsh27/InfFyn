"""The operator preflight must catch configuration failures before upload."""

import json
from pathlib import Path
import subprocess
import sys

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check-render-secret-file.py"
VALID = "SUPABASE_URL=https://jmfzmoqdvweeixxwzlma.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=synthetic-test-only\n"


@pytest.mark.parametrize("extra, expected", [
    ("", True),
    ("UNEXPECTED=never-echo-this\n", False),
    ("unexpected:entry=never-echo-this\n", False),
    ('BROKEN="never-echo-this\n', False),
])
def test_preflight_is_strict_read_only_and_does_not_echo(tmp_path, extra, expected):
    path = tmp_path / "synthetic.env"
    path.write_text(VALID + extra, encoding="utf-8")
    before = path.read_bytes()
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--file", str(path)],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == (0 if expected else 1)
    assert json.loads(result.stdout)["valid"] is expected
    assert "never-echo-this" not in result.stdout + result.stderr
    assert "synthetic-test-only" not in result.stdout + result.stderr
    assert path.read_bytes() == before
