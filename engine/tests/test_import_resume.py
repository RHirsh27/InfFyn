"""Repository filtering checks on synthetic rows; not hosted RLS acceptance."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from app.import_review.service import ImportStore


class Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, _):
        return self

    def eq(self, key, value):
        self.rows = [row for row in self.rows if row[key] == value]
        return self

    def gt(self, key, value):
        self.rows = [row for row in self.rows if row[key] > value]
        return self

    def maybe_single(self):
        return self

    def execute(self):
        assert len(self.rows) <= 1
        return SimpleNamespace(data=self.rows[0] if self.rows else None)


def row(**changes):
    return {
        "id": "retained-confirmation",
        "tenant_id": "company-a",
        "source_id": "source-a",
        "revision": 2,
        "source_hash": "original",
        "canonical_hash": "organized",
        "created_at": "2026-09-01T00:00:00Z",
        "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "actor": "synthetic-owner",
        **changes,
    }


def resume(records):
    db = SimpleNamespace(
        table=lambda table: (
            Query(records) if table == "inffyn_import_confirmations" else None
        )
    )
    return ImportStore(db, "company-a", "synthetic-owner").current_confirmation(
        {"id": "source-a", "revision": 2, "sha256": "original"}, "organized"
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"tenant_id": "company-b"},
        {"source_id": "source-b"},
        {"revision": 1},
        {"source_hash": "different original"},
        {"canonical_hash": "different amount"},
        {"expires_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat()},
    ],
)
def test_resume_never_reuses_another_company_revision_or_expired_confirmation(changes):
    assert resume([row(**changes)]) is None


def test_resume_returns_only_confirmation_metadata_for_exact_retained_version():
    assert resume([row(tenant_id="company-b"), row(revision=1), row()]) == {
        "id": "retained-confirmation",
        "created_at": "2026-09-01T00:00:00Z",
    }
