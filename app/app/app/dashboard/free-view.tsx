"use client";

import { theme, fmtUsd } from "@/lib/theme";
import type { FreeProjection } from "@/lib/audit-types";
import { Card, tableStyles } from "./ui";
import { ConnectStripeButton } from "./connect-stripe-button";

export function FreeView({ free }: { free: FreeProjection }) {
  const models = Object.entries(free.spend_per_1m_by_model).sort(
    (a, b) => (b[1] ?? -1) - (a[1] ?? -1)
  );

  return (
    <div>
      <Card style={{ background: theme.color.surfaceAlt }}>
        <p style={{ margin: 0, color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
          Headline finding
        </p>
        <p style={{ margin: `${theme.space(2)} 0 0`, color: theme.color.text, fontSize: theme.fontSize.xl, fontWeight: 600 }}>
          {free.headline_finding}
        </p>
      </Card>

      <Card
        title="Spend per 1M tokens, by model"
        subtitle="What each model actually costs you to run, per million tokens."
      >
        {models.length === 0 ? (
          <p style={{ color: theme.color.textMuted }}>No model spend recorded yet.</p>
        ) : (
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>Model</th>
                <th style={{ ...tableStyles.th, textAlign: "right" }}>Spend / 1M tokens</th>
              </tr>
            </thead>
            <tbody>
              {models.map(([model, spend]) => (
                <tr key={model}>
                  <td style={tableStyles.td}>{model}</td>
                  <td style={{ ...tableStyles.td, textAlign: "right" }}>
                    {spend === null ? "unpriced" : fmtUsd(spend, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        style={{
          background: `${theme.color.volatile}14`,
          border: `1px solid ${theme.color.volatile}`,
        }}
      >
        <h2 style={{ margin: 0, color: theme.color.text, fontSize: theme.fontSize.lg }}>
          {free.flagged_count > 0
            ? `${free.flagged_count} feature${free.flagged_count === 1 ? "" : "s"} flagged as unreliable`
            : "No unreliable features detected yet"}
        </h2>
        <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm, marginTop: theme.space(2) }}>
          {free.flagged_count > 0
            ? "Some features' profitability flips depending on how you split shared revenue — meaning the number you'd quote is an assumption, not a fact. Connect Stripe and upgrade to see which features are affected and the full per-feature, per-customer breakdown."
            : "Once you connect revenue and run a full audit, we'll flag any feature whose profitability depends on how you split shared revenue."}
        </p>
        <div style={{ marginTop: theme.space(3) }}>
          <ConnectStripeButton label="Connect Stripe to unlock the profit view" />
        </div>
      </Card>
    </div>
  );
}
