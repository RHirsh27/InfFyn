"""Shared canonical Pydantic models — tenancy (E1)."""

from pydantic import BaseModel
from typing import Literal

TenantRole = Literal["owner", "member", "internal"]


class Profile(BaseModel):
    id: str
    email: str | None = None
    created_at: str


class Tenant(BaseModel):
    id: str
    name: str
    created_at: str


class Membership(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    role: TenantRole
    created_at: str


class TenantContext(BaseModel):
    tenant_id: str
    user_id: str
    role: TenantRole
