import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

from app.tenant import resolve_tenant


def test_resolve_tenant_returns_context_when_member():
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    chain = table.select.return_value
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data={"role": "owner"})

    ctx = resolve_tenant(supabase, "user-1", "tenant-1")

    assert ctx.tenant_id == "tenant-1"
    assert ctx.user_id == "user-1"
    assert ctx.role == "owner"


def test_resolve_tenant_raises_403_when_not_member():
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    chain = table.select.return_value
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data=None)

    with pytest.raises(HTTPException) as exc:
        resolve_tenant(supabase, "user-1", "tenant-other")

    assert exc.value.status_code == 403
