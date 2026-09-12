from typing import Literal

from pydantic import BaseModel

TenantRole = Literal["owner", "member", "internal"]


class TenantContext(BaseModel):
    tenant_id: str
    user_id: str
    role: TenantRole
