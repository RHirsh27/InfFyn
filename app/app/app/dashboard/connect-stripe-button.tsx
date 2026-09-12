"use client";

import { useState } from "react";
import { theme } from "@/lib/theme";

/**
 * Connect-Stripe entry point (Gap B).
 *
 * Decoupled from the connect *mechanism* on purpose: this only POSTs to the
 * existing /api/stripe/connect route and redirects to whatever URL the route
 * returns (`authorize_url`). The backend connect flow is mid-migration —
 * Stripe removed read-only Connect OAuth and a Stripe App flow is coming. When
 * that swap lands, only the route/engine changes; this button is unchanged as
 * long as the route keeps returning `{ authorize_url }`. The ONLY coupling to
 * preserve across the swap is that response field name.
 */
export function ConnectStripeButton({
  variant = "primary",
  label = "Connect Stripe",
}: {
  variant?: "primary" | "ghost";
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorize_url) {
        throw new Error(data.detail ?? data.error ?? "Couldn't start the Stripe connection.");
      }
      window.location.href = data.authorize_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the Stripe connection.");
      setLoading(false);
    }
  }

  const primary = variant === "primary";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: theme.space(1) }}>
      <button
        type="button"
        onClick={connect}
        disabled={loading}
        aria-label="Connect your Stripe account (read-only)"
        style={{
          background: primary ? theme.color.accent : "transparent",
          color: primary ? theme.color.accentText : theme.color.text,
          border: `1px solid ${primary ? theme.color.accent : theme.color.border}`,
          borderRadius: theme.radius.md,
          padding: `${theme.space(2)} ${theme.space(4)}`,
          fontSize: theme.fontSize.sm,
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Starting…" : label}
      </button>
      {error && (
        <span style={{ color: theme.color.danger, fontSize: theme.fontSize.xs, maxWidth: 280 }}>
          {error}
        </span>
      )}
    </span>
  );
}
