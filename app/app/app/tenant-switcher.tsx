"use client";

import { useRouter } from "next/navigation";

type MembershipRow = {
  id: string;
  tenant_id: string;
  role: string;
};

export function TenantSwitcher({
  memberships,
  activeTenantId,
}: {
  memberships: MembershipRow[];
  activeTenantId: string;
}) {
  const router = useRouter();

  if (memberships.length <= 1) {
    return null;
  }

  async function switchTenant(tenantId: string) {
    await fetch("/api/tenant/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    router.refresh();
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <label htmlFor="tenant-switch">Switch tenant</label>
      <select
        id="tenant-switch"
        value={activeTenantId}
        onChange={(e) => switchTenant(e.target.value)}
        style={{ display: "block", marginTop: "0.5rem" }}
      >
        {memberships.map((m) => (
          <option key={m.id} value={m.tenant_id}>
            {m.tenant_id.slice(0, 8)}… ({m.role})
          </option>
        ))}
      </select>
    </div>
  );
}
