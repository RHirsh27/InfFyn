"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme } from "@/lib/theme";
import { Card } from "./ui";
import { ConnectStripeButton } from "./connect-stripe-button";
import { CsvUploadForm } from "../csv-upload-form";

type StripeConnection = {
  stripe_account_id: string;
  scope: string;
  status: string;
  last_sync_at: string | null;
  created_at: string | null;
  last_error: string | null;
};

const TRUST = "READ-ONLY · REVOCABLE ANYTIME · WE NEVER WRITE TO YOUR STRIPE";

export function ConnectionsView({ tenantId }: { tenantId: string }) {
  const [connection, setConnection] = useState<StripeConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // RLS-scoped read; note the encrypted token column is NOT selected (and is not
    // even grantable to the authenticated role per migration 0009).
    const { data, error: qErr } = await supabase
      .from("stripe_connections")
      .select("stripe_account_id, scope, status, last_sync_at, created_at, last_error")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (qErr) setError(qErr.message);
    else setConnection(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  async function disconnect() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/stripe/disconnect", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "Disconnect failed");
      setMessage("Stripe disconnected. Your stored access has been cleared — reconnect anytime.");
      setConfirming(false);
      await loadConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  const status = connection?.status;
  const isConnected = status === "connected";
  const needsReauth = status === "needs_reauth" || status === "error";
  const hasLiveConnection = !!connection && status !== "disconnected";

  const dotColor = isConnected
    ? theme.color.profit
    : needsReauth
      ? theme.color.loss
      : theme.color.textMuted;
  const statusText = isConnected
    ? "Connected — read-only"
    : needsReauth
      ? "Needs reconnect"
      : "Not connected";

  return (
    <div>
      <h1 style={{ margin: `0 0 ${theme.space(2)}`, fontFamily: theme.font.display, fontSize: "26px", fontWeight: 600 }}>
        Connections
      </h1>
      <p style={{ margin: `0 0 ${theme.space(5)}`, color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
        Connect your revenue and usage sources. Each control below is exactly what it says.
      </p>

      {/* 1 — Stripe connection + connect/reconnect */}
      <Card title="Stripe connection" subtitle="Your revenue source. Read-only — we never write to your Stripe.">
        {loading ? (
          <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>Loading connection…</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: theme.space(2), marginBottom: theme.space(3) }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flex: "none" }} />
              <strong style={{ fontSize: theme.fontSize.sm, color: theme.color.text }}>{statusText}</strong>
            </div>

            {hasLiveConnection && connection && (
              <div style={{ display: "grid", gap: theme.space(1), fontSize: theme.fontSize.sm, color: theme.color.textMuted, marginBottom: theme.space(4) }}>
                <span>
                  Account <code style={{ fontFamily: theme.font.mono, color: theme.color.text }}>{connection.stripe_account_id}</code> · scope {connection.scope}
                </span>
                {connection.created_at && <span>Connected {new Date(connection.created_at).toLocaleDateString()}</span>}
                {connection.last_sync_at && <span>Last sync {new Date(connection.last_sync_at).toLocaleString()}</span>}
                {connection.last_error && <span style={{ color: theme.color.danger }}>Last error: {connection.last_error}</span>}
              </div>
            )}

            <div style={{ display: "flex", gap: theme.space(2), alignItems: "center", flexWrap: "wrap" }}>
              {!hasLiveConnection && <ConnectStripeButton label="Connect Stripe" />}
              {hasLiveConnection && (
                <ConnectStripeButton label={needsReauth ? "Reconnect Stripe" : "Reconnect"} />
              )}
            </div>
          </>
        )}

        <p style={{ marginTop: theme.space(4), fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, letterSpacing: ".08em", color: theme.color.textMuted }}>
          {TRUST}
        </p>
      </Card>

      {/* 2 — Disconnect (only when there is a live connection to drop) */}
      {hasLiveConnection && (
        <Card title="Disconnect Stripe" subtitle="Removes the connection and clears your stored access. The profit view returns to cost-only. You can reconnect anytime.">
          {!confirming ? (
            <button
              type="button"
              onClick={() => {
                setConfirming(true);
                setMessage(null);
                setError(null);
              }}
              style={{
                background: "transparent",
                border: `1px solid ${theme.color.loss}`,
                color: theme.color.loss,
                borderRadius: theme.radius.md,
                padding: `${theme.space(2)} ${theme.space(4)}`,
                fontSize: theme.fontSize.sm,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: theme.font.body,
              }}
            >
              Disconnect Stripe
            </button>
          ) : (
            <div style={{ display: "grid", gap: theme.space(3) }}>
              <p style={{ margin: 0, fontSize: theme.fontSize.sm, color: theme.color.text }}>
                Disconnect Stripe? This clears your stored read-only access token and drops the profit view back to cost-only.
              </p>
              <div style={{ display: "flex", gap: theme.space(2), flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={busy}
                  style={{
                    background: theme.color.loss,
                    border: `1px solid ${theme.color.loss}`,
                    color: theme.color.accentText,
                    borderRadius: theme.radius.md,
                    padding: `${theme.space(2)} ${theme.space(4)}`,
                    fontSize: theme.fontSize.sm,
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                    fontFamily: theme.font.body,
                  }}
                >
                  {busy ? "Disconnecting…" : "Confirm disconnect"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  style={{
                    background: "transparent",
                    border: `1px solid ${theme.color.border}`,
                    color: theme.color.textMuted,
                    borderRadius: theme.radius.md,
                    padding: `${theme.space(2)} ${theme.space(4)}`,
                    fontSize: theme.fontSize.sm,
                    cursor: "pointer",
                    fontFamily: theme.font.body,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 3 — CSV upload (existing ingestion, surfaced + labeled) */}
      <Card title="Upload usage data" subtitle="No connector for your usage yet? Drop a token-usage CSV — same ingestion, nothing changes about how it's validated.">
        <div style={{ marginTop: `-${theme.space(4)}` }}>
          <CsvUploadForm onSuccess={() => setMessage("Usage CSV ingested.")} />
        </div>
      </Card>

      {message && (
        <p role="status" style={{ fontSize: theme.fontSize.sm, color: theme.color.text, background: theme.color.surfaceAlt, border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, padding: `${theme.space(2)} ${theme.space(3)}` }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: theme.fontSize.sm, color: theme.color.danger, marginTop: theme.space(2) }}>
          {error}
        </p>
      )}
    </div>
  );
}
