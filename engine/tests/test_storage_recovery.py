"""Synthetic Storage transport and restoration checks; never uses credentials."""
import base64
import hashlib
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("storage_recovery", Path(__file__).resolve().parents[2] / "scripts/backup/storage.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


def fixture_payload():
    content = b"synthetic uploaded evidence\n"
    return {"project_ref": s.PROJECT, "version": 1, "buckets": [{"id": "ingest"}],
            "total_bytes": len(content), "objects": [{"bucket": "ingest", "path": "company/example.csv",
            "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
            "content_base64": base64.b64encode(content).decode(), "metadata": {}}]}


def test_restore_preserves_bytes_and_lineage_without_interpreting_remote_filenames(tmp_path):
    payload = fixture_payload()
    result = s.restore_payload(payload, tmp_path / "isolated")
    assert result["object_count"] == 1
    assert result["release_ready"] is False
    assert result["hosted_storage_restore_verified"] is False
    assert (tmp_path / "isolated/object-000000.bin").read_bytes() == b"synthetic uploaded evidence\n"
    assert "company/example.csv" in (tmp_path / "isolated/private-object-map.json").read_text()


@pytest.mark.parametrize("path", ["../escape", "/absolute", "nested/../../escape", "C:\\escape", "a//b", "a/\x00b"])
def test_rejects_unsafe_paths_before_writing(tmp_path, path):
    payload = fixture_payload()
    payload["objects"][0]["path"] = path
    with pytest.raises(ValueError):
        s.restore_payload(payload, tmp_path / "isolated")
    assert not (tmp_path / "isolated").exists()


@pytest.mark.parametrize("mutation", ["hash", "count", "duplicate", "project"])
def test_bad_archive_fails_before_any_plaintext_write(tmp_path, mutation):
    payload = fixture_payload()
    if mutation == "hash":
        payload["objects"][0]["sha256"] = "0" * 64
    elif mutation == "count":
        payload["total_bytes"] += 1
    elif mutation == "duplicate":
        payload["objects"] *= 2
    else:
        payload["project_ref"] = "different-project"
    with pytest.raises(ValueError):
        s.restore_payload(payload, tmp_path / "isolated")
    assert not (tmp_path / "isolated").exists()


def test_inventory_paginates_and_descends_folders():
    calls = []
    def request(method, path, body=None):
        calls.append((method, path, body))
        if path == "/bucket":
            return [{"id": "ingest"}]
        if body["prefix"] == "nested":
            return [{"name": "child.csv", "id": "child"}]
        if body["offset"] == 0:
            return [{"name": f"{i:03}.csv", "id": str(i)} for i in range(99)] + [{"name": "nested", "id": None}]
        return [{"name": "last.csv", "id": "last"}]
    result = s.inventory(request)
    assert len(result["objects"]) == 101
    assert any(c[2] and c[2]["offset"] == 100 for c in calls)
    assert any(e["path"] == "nested/child.csv" for e in result["objects"])


def test_capture_rejects_changed_metadata_or_wrong_database_count():
    reads = 0
    def request(method, path, body=None, binary=False):
        nonlocal reads
        if path == "/bucket":
            return [{"id": "ingest"}]
        if binary:
            return b"abc"
        reads += 1
        return [{"name": "fixture.csv", "id": "one", "updated_at": str(reads), "metadata": {"size": 3}}]
    with pytest.raises(ValueError, match="database_storage_count_mismatch"):
        s.capture_payload(request, 2)
    with pytest.raises(ValueError, match="storage_changed_during_capture"):
        s.capture_payload(request, 1)


def test_capture_keeps_content_inside_payload_and_checks_size():
    def request(method, path, body=None, binary=False):
        if path == "/bucket":
            return [{"id": "ingest"}]
        if binary:
            return b"abc"
        return [{"name": "fixture.csv", "id": "one", "metadata": {"size": 3}}]
    payload = s.capture_payload(request, 1)
    assert payload["total_bytes"] == 3
    assert base64.b64decode(payload["objects"][0]["content_base64"]) == b"abc"
