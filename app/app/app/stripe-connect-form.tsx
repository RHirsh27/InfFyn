"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme } from "@/lib/theme";

type StripeConnection = {
  stripe_account_id: string;
  scope: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
};

const btn = (primary: boolean): React.CSSProperties => ({
  background: primary ? theme.color.accent : "transparent",
  color: primary ? theme.color.accentText : theme.color.text,
  border: `1px solid ${primary ? theme.color.accent : theme.color.border}`,
  borderRadius: theme.radius.md,
  padding: `${theme.space(2)} ${theme.space(4)}`,
  fontSize: theme.fontSize.sm,
  fontWeight: 600,
  fontFamily: theme.font.body,
  cursor: "pointer",
});

export function StripeConnectForm({ tenantId }: { tenantId?: string }) {
  const [connection, setConnection] = useState<StripeConnection | null>(null);
  const [loading, setLoading] = useState(!!tenantId);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(async () => {
    if (!tenantId) {
      setConnection(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: qErr } = await supabase
      .from("stripe_connections")
      .select("stripe_account_id, scope, status, last_sync_at, last_error")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (qErr) {
      setError(qErr.message);
    } else {
      setConnection(data);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadConnection();
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "connected") {
      setMessage("Stripe connected successfully.");
      window.history.replaceState({}, "", "/app");
      loadConnection();
    }
  }, [loadConnection]);

  async function connectStripe() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/stripe/connect", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail ?? data.error ?? "Failed to start Stripe connect");
      return;
    }
    window.location.href = data.authorize_url;
  }

  async function syncStripe() {
    setError(null);
    setMessage("Syncing revenue from Stripe…");
    const res = await fetch("/api/stripe/sync?background=false", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail ?? data.error ?? "Sync failed");
      setMessage(null);
      await loadConnection();
      return;
    }
    setMessage(`Synced ${data.rows_synced ?? 0} revenue events.`);
    await loadConnection();
  }

  if (loading) {
    return <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>Loading Stripe connection…</p>;
  }

  return (
    <section style={{ marginTop: theme.space(6), paddingTop: theme.space(5), borderTop: `1px solid ${theme.color.border}` }}>
      <h2 style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 600, fontSize: theme.fontSize.lg, color: theme.color.text }}>
        Stripe <span style={{ color: theme.color.textMuted, fontFamily: theme.font.body, fontWeight: 400 }}>(read-only)</span>
      </h2>
      <p style={{ fontSize: theme.fontSize.sm, color: theme.color.textMuted, margin: `${theme.space(2)} 0 ${theme.space(4)}`, maxWidth: "52ch" }}>
        Connect your Stripe account with one click. InfFyn requests read-only access only — we never write to your Stripe.
      </p>

      {!connection ? (
        <button type="button" onClick={connectStripe} style={btn(true)}>
          Connect Stripe
        </button>
      ) : (
        <div style={{ display: "grid", gap: theme.space(2), fontSize: theme.fontSize.sm, color: theme.color.text }}>
          <p style={{ margin: 0, color: theme.color.textMuted }}>
            Account:{" "}
            <code style={{ fontFamily: theme.font.mono, color: theme.color.text }}>{connection.stripe_account_id}</code>
          </p>
          <p style={{ margin: 0, color: theme.color.textMuted }}>
            Status: <strong style={{ color: theme.color.text }}>{connection.status}</strong> · Scope: {connection.scope}
          </p>
          {connection.last_sync_at && (
            <p style={{ margin: 0, color: theme.color.textMuted }}>Last sync: {connection.last_sync_at}</p>
          )}
          {connection.last_error && (
            <p style={{ margin: 0, color: theme.color.danger }}>Error: {connection.last_error}</p>
          )}
          <div style={{ marginTop: theme.space(2), display: "flex", gap: theme.space(2), flexWrap: "wrap" }}>
            {(connection.status === "connected" || connection.status === "error") && (
              <button type="button" onClick={syncStripe} style={btn(true)}>
                Sync revenue
              </button>
            )}
            {(connection.status === "needs_reauth" || connection.status === "disconnected") && (
              <button type="button" onClick={connectStripe} style={btn(true)}>
                Reconnect Stripe
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          style={{
            marginTop: theme.space(3),
            fontSize: theme.fontSize.sm,
            color: theme.color.text,
            background: theme.color.surfaceAlt,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            padding: `${theme.space(2)} ${theme.space(3)}`,
          }}
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ marginTop: theme.space(3), fontSize: theme.fontSize.sm, color: theme.color.danger }}>
          {error}
        </p>
      )}
    </section>
  );
}
