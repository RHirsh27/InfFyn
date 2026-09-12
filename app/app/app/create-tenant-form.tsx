"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateTenantForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/tenant/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create tenant");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="tenant-name">Tenant name</label>
      <input
        id="tenant-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem" }}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Create tenant"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </form>
  );
}
