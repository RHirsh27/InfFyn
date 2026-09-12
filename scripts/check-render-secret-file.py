"""Read-only preflight for the dedicated Render secret file; never echo values."""

import argparse
import contextlib
import io
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))

from dotenv import dotenv_values
from app.render_config import configure_render


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, type=Path)
    args = parser.parse_args()
    try:
        if not args.file.is_file():
            raise ValueError()
        diagnostics = io.StringIO()
        with contextlib.redirect_stderr(diagnostics):
            values = dotenv_values(args.file, interpolate=False)
        if diagnostics.getvalue():
            raise ValueError()
        configure_render(
            {"INFFYN_PRIVATE_ALPHA": "true", "INFFYN_RELEASE_STAGE": "private_alpha"},
            values,
        )
    except Exception:
        print(json.dumps({"valid": False, "error": "Expected only the approved Supabase URL and nonempty server credential in a valid dotenv file."}))
        return 1
    print(json.dumps({"valid": True, "setting_count": 2, "file_modified": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
