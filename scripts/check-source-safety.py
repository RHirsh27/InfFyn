"""Check Git's indexed source only; never read local environment/credential files.

Reports filenames and categories, never matched values. This is a publication
guard, not a replacement for a full security review or GitHub secret scanning.
"""
import re
import subprocess
from pathlib import PurePosixPath

files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
patterns = {
    "provider_secret": re.compile(rb"(?:sk_live_|sk_test_|sk-ant-|sk-proj-)[A-Za-z0-9_-]{24,}"),
    "github_token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "jwt_literal": re.compile(rb"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}"),
}
failures = []
for name in filter(None, files):
    path = PurePosixPath(name)
    if (path.name.startswith(".env") and path.name != ".env.example") or any(part in {"outputs", ".vercel", ".validation", "node_modules", ".venv"} for part in path.parts) or path.suffix.lower() in {".pem", ".key", ".age", ".dump", ".sqlite", ".sqlite3", ".p12", ".pfx"} or path.name == "pgpass.conf":
        failures.append((name, "private_or_generated_path"))
        continue
    content = subprocess.check_output(["git", "show", ":" + name])
    if len(content) > 10_000_000:
        failures.append((name, "large_artifact_requires_review"))
    for category, pattern in patterns.items():
        if pattern.search(content):
            failures.append((name, category))
for name, category in failures:
    print(f"BLOCKED {category}: {name}")
print(f"Source publication check: {len([f for f in files if f])} indexed files, {len(failures)} findings. Values withheld.")
raise SystemExit(1 if failures else 0)
