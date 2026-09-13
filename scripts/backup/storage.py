"""Bounded, operator-run Storage recovery; no writes to hosted Supabase.

Credentials are read only by the HTTP client. Object names and content are kept
inside the encrypted archive. Console receipts contain counts and hashes only.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote

PROJECT = "jmfzmoqdvweeixxwzlma"
ORIGIN = f"https://{PROJECT}.supabase.co"
ROOT = Path(__file__).resolve().parents[2]
MAX_OBJECT = 25_000_000
MAX_TOTAL = 100_000_000
MAX_ENTRIES = 10_000


def require(value, code):
    if not value:
        raise ValueError(code)


def digest_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def private_path(value, existing=True):
    p = Path(value)
    require(p.is_absolute(), "absolute_private_path_required")
    p = p.resolve()
    require(not p.is_relative_to(ROOT), "external_private_path_required")
    require(not any(x.lower() in {"onedrive", "dropbox", "google drive", "my drive"} for x in p.parts), "unsynced_path_required")
    if existing:
        require(p.is_file(), "private_file_required")
        if os.name != "nt":
            require(p.stat().st_mode & 0o077 == 0, "owner_only_file_required")
    return p


def component(value):
    require(isinstance(value, str) and value not in {"", ".", ".."}, "invalid_storage_component")
    require(not any(c in value for c in "/\\\x00") and not any(ord(c) < 32 for c in value), "invalid_storage_component")
    return value


def inventory(request):
    buckets = request("GET", "/bucket")
    require(isinstance(buckets, list) and len(buckets) <= MAX_ENTRIES, "invalid_bucket_inventory")
    objects, seen, folders = [], set(), set()
    for bucket in buckets:
        bid = component(bucket["id"])
        require((bid, "") not in folders, "duplicate_bucket")
        pending = [""]
        while pending:
            prefix = pending.pop()
            require((bid, prefix) not in folders, "duplicate_folder")
            folders.add((bid, prefix))
            require(len(folders) + len(objects) <= MAX_ENTRIES, "inventory_limit")
            offset = 0
            while True:
                rows = request("POST", "/object/list/" + quote(bid, safe=""), {
                    "prefix": prefix, "limit": 100, "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                })
                require(isinstance(rows, list) and len(rows) <= 100, "invalid_storage_page")
                for row in rows:
                    name = "/".join(filter(None, [prefix, component(row["name"])]))
                    require((bid, name) not in seen, "duplicate_storage_entry")
                    seen.add((bid, name))
                    require(len(seen) <= MAX_ENTRIES, "inventory_limit")
                    if row.get("id") is None:
                        pending.append(name)
                    else:
                        objects.append({"bucket": bid, "path": name, "metadata": row})
                if len(rows) < 100:
                    break
                offset += len(rows)
    return {"buckets": sorted(buckets, key=lambda b: b["id"]),
            "objects": sorted(objects, key=lambda o: (o["bucket"], o["path"]))}


def capture_payload(request, expected_count):
    before = inventory(request)
    require(len(before["objects"]) == expected_count, "database_storage_count_mismatch")
    total = 0
    for entry in before["objects"]:
        content = request("GET", "/object/" + quote(entry["bucket"], safe="") + "/" + quote(entry["path"], safe="/"), binary=True)
        require(len(content) <= MAX_OBJECT, "object_size_limit")
        total += len(content)
        require(total <= MAX_TOTAL, "total_size_limit")
        expected_size = entry["metadata"].get("metadata", {}).get("size")
        require(expected_size is not None and int(expected_size) == len(content), "object_size_mismatch")
        entry["sha256"] = hashlib.sha256(content).hexdigest()
        entry["bytes"] = len(content)
        entry["content_base64"] = base64.b64encode(content).decode("ascii")
    after = inventory(request)
    original = {"buckets": before["buckets"], "objects": [
        {k: e[k] for k in ("bucket", "path", "metadata")} for e in before["objects"]]}
    require(original == after, "storage_changed_during_capture")
    return {"version": 1, "project_ref": PROJECT, **before, "total_bytes": total,
            "scope": "api_visible_objects_and_bucket_metadata",
            "limitations": ["Physical objects absent from Storage API metadata cannot be enumerated.",
                            "Database dump separately preserves Storage policies and object records."]}


def restore_payload(payload, target):
    require(payload.get("project_ref") == PROJECT and payload.get("version") == 1, "archive_target_mismatch")
    entries = payload.get("objects")
    require(isinstance(entries, list) and len(entries) <= MAX_ENTRIES, "archive_count_limit")
    decoded, seen, total = [], set(), 0
    for index, entry in enumerate(entries):
        component(entry["bucket"])
        require(isinstance(entry["path"], str), "invalid_object_path")
        for part in entry["path"].split("/"):
            component(part)
        identity = (entry["bucket"], entry["path"])
        require(identity not in seen, "duplicate_archive_object")
        seen.add(identity)
        content = base64.b64decode(entry["content_base64"], validate=True)
        require(len(content) == entry["bytes"] <= MAX_OBJECT, "restored_size_mismatch")
        total += len(content)
        require(total <= MAX_TOTAL, "total_size_limit")
        require(hashlib.sha256(content).hexdigest() == entry["sha256"], "restored_hash_mismatch")
        decoded.append(content)
    require(total == payload["total_bytes"], "restored_total_mismatch")
    # Opaque local filenames avoid interpreting untrusted customer paths on Windows.
    # The local manifest retains the exact bucket/object mapping for an operator.
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    for index, content in enumerate(decoded):
        p = target / f"object-{index:06d}.bin"
        with p.open("xb") as f:
            f.write(content)
        require(digest_file(p) == entries[index]["sha256"], "disk_restore_mismatch")
    manifest = {k: v for k, v in payload.items() if k != "objects"}
    manifest["objects"] = [{k: v for k, v in e.items() if k != "content_base64"} for e in entries]
    (target / "private-object-map.json").write_text(json.dumps(manifest), encoding="utf-8")
    return {"status": "STORAGE_BYTES_RESTORED_AND_HASHED", "object_count": len(entries), "total_bytes": total,
            "hosted_storage_restore_verified": False, "release_ready": False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=["capture", "restore"])
    p.add_argument("--execute", action="store_true")
    p.add_argument("--private-directory-confirmed", action="store_true")
    p.add_argument("--age", required=True)
    p.add_argument("--key-file", required=True, help="Public recipient for capture; private identity for restore")
    p.add_argument("--archive", required=True)
    p.add_argument("--expected-count", type=int)
    p.add_argument("--expected-sha256")
    p.add_argument("--credentials-file")
    p.add_argument("--restore-directory")
    a = p.parse_args()
    if not a.execute:
        print(json.dumps({"status": "OFFLINE_PLAN_NO_NETWORK", "release_ready": False}))
        return
    require(a.private_directory_confirmed, "private_directory_confirmation_required")
    key = private_path(a.key_file)
    archive = private_path(a.archive, existing=a.command == "restore")
    require(not key.is_relative_to(archive.parent), "key_must_be_separate")
    age = Path(a.age)
    require(age.is_absolute() and age.name.lower() in {"age", "age.exe"} and age.is_file(), "native_age_required")
    if a.command == "capture":
        from dotenv import dotenv_values
        import httpx
        credential_path = private_path(a.credentials_file)
        require(not credential_path.is_relative_to(archive.parent), "credentials_must_be_separate")
        credentials = dotenv_values(credential_path, interpolate=False)
        require(set(credentials) == {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"} and credentials["SUPABASE_URL"] == ORIGIN, "credential_target_mismatch")
        require(a.expected_count is not None and 0 <= a.expected_count <= MAX_ENTRIES, "database_count_required")
        require(not archive.exists(), "archive_already_exists")
        with httpx.Client(base_url=ORIGIN + "/storage/v1", headers={"apikey": credentials["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + credentials["SUPABASE_SERVICE_ROLE_KEY"]}, follow_redirects=False, timeout=45) as client:
            def request(method, path, body=None, binary=False):
                with client.stream(method, ORIGIN + "/storage/v1" + path, json=body) as response:
                    require(response.status_code == 200, "storage_http_failure")
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        require(size <= MAX_OBJECT, "response_size_limit")
                        chunks.append(chunk)
                    raw = b"".join(chunks)
                    return raw if binary else json.loads(raw)
            payload = capture_payload(request, a.expected_count)
        # No plaintext export file, native stdout/stderr, or credential in argv.
        with archive.open("xb") as output:
            result = subprocess.run([str(age), "--encrypt", "--recipients-file", str(key)], input=json.dumps(payload).encode(), stdout=output, stderr=subprocess.DEVNULL)
        require(result.returncode == 0, "encryption_failed_archive_incomplete")
        result = {"status": "ENCRYPTED_STORAGE_CAPTURE", "project_ref": PROJECT,
                  "object_count": len(payload["objects"]), "total_bytes": payload["total_bytes"],
                  "sha256": digest_file(archive),
                  "retrieval_verified": False, "restore_verified": False, "release_ready": False}
    else:
        require(digest_file(archive) == a.expected_sha256, "archive_hash_mismatch")
        require(archive.stat().st_size <= MAX_TOTAL * 2, "archive_size_limit")
        result = subprocess.run([str(age), "--decrypt", "--identity", str(key), str(archive)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
        require(result.returncode == 0 and len(result.stdout) <= MAX_TOTAL * 2, "archive_decryption_failed")
        result = restore_payload(json.loads(result.stdout), private_path(a.restore_directory, existing=False))
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # HTTP/native exceptions can contain object names, credentials or content.
        print(json.dumps({"status": "STORAGE_RECOVERY_FAILED", "release_ready": False}), file=sys.stderr)
        sys.exit(1)
