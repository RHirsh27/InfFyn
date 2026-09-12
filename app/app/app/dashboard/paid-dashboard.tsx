"use client";

import type {
  AuditResult,
  AuditResultResponse,
  SensitivityFeature,
} from "@/lib/audit-types";
import { theme, fmtUsd, fmtPct } from "@/lib/theme";
import { Card, ProvenanceBadge, StabilityBadge, tableStyles } from "./ui";

function gpp1mRange(feature: SensitivityFeature): { min: number | null; max: number | null } {
  const vals = Object.values(feature.gpp1m_by_method).filter(
    (v): v is number => v !== null && v !== undefined
  );
  if (vals.length === 0) return { min: null, max: null };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function methodLabel(method: string): string {
  return method.replace(/_/g, " ");
}

function SensitivityPanel({ result }: { result: AuditResult }) {
  const { per_feature, volatile_features, verdict } = result.sensitivity;
  // Volatile first — the honesty layer must be prominent, not buried (Q4).
  const features = Object.entries(per_feature).sort((a, b) => {
    if (a[1].stability_class === b[1].stability_class) return b[1].rank_range - a[1].rank_range;
    return a[1].stability_class === "volatile" ? -1 : 1;
  });

  return (
    <Card
      title="Can you trust these numbers?"
      subtitle={verdict}
    >
      <div style={{ display: "grid", gap: theme.space(3) }}>
        {features.map(([name, feature]) => {
          const { min, max } = gpp1mRange(feature);
          const volatile = feature.stability_class === "volatile";
          return (
            <div
              key={name}
              style={{
                border: `1px solid ${volatile ? theme.color.volatile : theme.color.border}`,
                background: volatile ? `${theme.color.volatile}12` : theme.color.surfaceAlt,
                borderRadius: theme.radius.md,
                padding: theme.space(4),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: theme.space(3),
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: theme.space(2) }}>
                  <strong style={{ fontSize: theme.fontSize.md }}>{name}</strong>
                  <StabilityBadge stability={feature.stability_class} />
                </div>
                <p style={{ margin: `${theme.space(1)} 0 0`, color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
                  {volatile
                    ? `Profitability depends on how you split shared revenue — GPp1M swings from ${fmtUsd(min)} to ${fmtUsd(max)} across methods. Don't quote a single number here.`
                    : `Consistent across every allocation method (GPp1M ${fmtUsd(min)}–${fmtUsd(max)}). Safe to rely on.`}
                </p>
              </div>
              <div style={{ textAlign: "right", fontFamily: theme.font.mono, color: theme.color.textMuted, fontSize: theme.fontSize.xs }}>
                rank spread {feature.rank_range}
              </div>
            </div>
          );
        })}
      </div>
      {volatile_features.length === 0 && (
        <p style={{ color: theme.color.stable, fontSize: theme.fontSize.sm, marginTop: theme.space(3) }}>
          No volatile features — your per-feature profitability is stable across allocation methods.
        </p>
      )}
    </Card>
  );
}

function FeatureGpp1mMatrix({ result }: { result: AuditResult }) {
  const methods = Object.keys(result.allocation.methods);
  const features = result.allocation.features;
  const volatileSet = new Set(result.sensitivity.volatile_features);

  return (
    <Card
      title="Gross profit per 1M tokens, by feature"
      subtitle="The same feature under each way of splitting shared revenue. Where the number moves, the split is an assumption — that's why we show all of them."
    >
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              <th style={tableStyles.th}>Feature</th>
              {methods.map((m) => (
                <th key={m} style={{ ...tableStyles.th, textAlign: "right" }}>
                  <div>{methodLabel(m)}</div>
                  <div style={{ marginTop: 4 }}>
                    <ProvenanceBadge
                      provenance={
                        result.allocation.methods[m].by_feature[features[0]]?.provenance ?? {
                          method: m,
                          label: `Modeled (${methodLabel(m)})`,
                        }
                      }
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const isVolatile = volatileSet.has(f);
              return (
                <tr key={f} style={isVolatile ? { background: `${theme.color.volatile}12` } : undefined}>
                  <td style={{ ...tableStyles.td, fontFamily: theme.font.body }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: theme.space(2) }}>
                      {f}
                      {isVolatile && <StabilityBadge stability="volatile" />}
                    </span>
                  </td>
                  {methods.map((m) => {
                    const cell = result.allocation.methods[m].by_feature[f];
                    const val = cell?.gpp1m;
                    const money = typeof val === "number" ? (val >= 0 ? theme.color.profit : theme.color.loss) : undefined;
                    return (
                      <td key={m} style={{ ...tableStyles.td, textAlign: "right", color: money, fontWeight: money ? 600 : undefined }}>
                        {cell ? fmtUsd(cell.gpp1m) : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ModelGpp1mTable({ result }: { result: AuditResult }) {
  const rows = Object.entries(result.gpp1m_by_model.by_model).sort(
    (a, b) => (b[1].gpp1m ?? -Infinity) - (a[1].gpp1m ?? -Infinity)
  );
  return (
    <Card title="Gross profit per 1M tokens, by model">
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyles.table}>
          <thead>
            <tr>
              <th style={tableStyles.th}>Model</th>
              <th style={{ ...tableStyles.th, textAlign: "right" }}>GPp1M</th>
              <th style={{ ...tableStyles.th, textAlign: "right" }}>Gross profit</th>
              <th style={{ ...tableStyles.th, textAlign: "right" }}>Cost</th>
              <th style={tableStyles.th}>Provenance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([model, m]) => (
              <tr key={model}>
                <td style={{ ...tableStyles.td, fontFamily: theme.font.body }}>{model}</td>
                <td style={{ ...tableStyles.td, textAlign: "right" }}>{fmtUsd(m.gpp1m)}</td>
                <td style={{ ...tableStyles.td, textAlign: "right" }}>{fmtUsd(m.gross_profit)}</td>
                <td style={{ ...tableStyles.td, textAlign: "right" }}>{fmtUsd(m.cost)}</td>
                <td style={tableStyles.td}>
                  <ProvenanceBadge provenance={m.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerCustomerTable({ result }: { result: AuditResult }) {
  const { by_customer, coverage } = result.per_customer_profit;
  const rows = Object.entries(by_customer).sort((a, b) => b[1].profit - a[1].profit);

  return (
    <Card
      title="Profit by customer"
      subtitle="Exact where usage and revenue both reference the same customer. Coverage tells you how much of your book that actually is."
    >
      <div
        style={{
          display: "flex",
          gap: theme.space(4),
          flexWrap: "wrap",
          marginBottom: theme.space(4),
        }}
      >
        <Coverage label="Revenue matched" value={coverage.revenue_matched_pct} />
        <Coverage label="Usage matched" value={coverage.usage_matched_pct} />
        <Coverage label="Customers matched" value={coverage.customers_matched} isCount />
      </div>

      {rows.length === 0 ? (
        <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
          No customers where usage and revenue reference the same customer yet — connect Stripe and
          tag usage with a customer reference to unlock this.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                <th style={tableStyles.th}>Customer</th>
                <th style={{ ...tableStyles.th, textAlign: "right" }}>Revenue</th>
                <th style={{ ...tableStyles.th, textAlign: "right" }}>Attributed cost</th>
                <th style={{ ...tableStyles.th, textAlign: "right" }}>Profit</th>
                <th style={tableStyles.th}>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([cust, c]) => (
                <tr key={cust}>
                  <td style={{ ...tableStyles.td, fontFamily: theme.font.body }}>{cust}</td>
                  <td style={{ ...tableStyles.td, textAlign: "right" }}>{fmtUsd(c.revenue)}</td>
                  <td style={{ ...tableStyles.td, textAlign: "right" }}>{fmtUsd(c.attributed_cost)}</td>
                  <td
                    style={{
                      ...tableStyles.td,
                      textAlign: "right",
                      fontWeight: 600,
                      color: c.profit >= 0 ? theme.color.profit : theme.color.loss,
                    }}
                  >
                    {fmtUsd(c.profit)}
                  </td>
                  <td style={tableStyles.td}>
                    <ProvenanceBadge provenance={c.provenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Coverage({ label, value, isCount }: { label: string; value: number; isCount?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: theme.fontSize.xl, fontWeight: 600, fontFamily: theme.font.mono }}>
        {isCount ? value : fmtPct(value, 1)}
      </div>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>{label}</div>
    </div>
  );
}

function History({
  data,
  onSelectRun,
}: {
  data: AuditResultResponse;
  onSelectRun: (runId: string) => void;
}) {
  const history = data.history ?? [];
  if (history.length <= 1) return null;
  return (
    <Card title="Run history" subtitle="Every audit we've kept for this tenant.">
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {history.map((h) => {
          const current = h.id === data.run_id;
          return (
            <li
              key={h.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: `${theme.space(2)} 0`,
                borderBottom: `1px solid ${theme.color.surfaceAlt}`,
              }}
            >
              <span style={{ fontSize: theme.fontSize.sm }}>
                {new Date(h.created_at).toLocaleString()}
                <span style={{ color: theme.color.textMuted }}> · {methodLabel(h.default_method)}</span>
              </span>
              {current ? (
                <span style={{ color: theme.color.textMuted, fontSize: theme.fontSize.xs }}>viewing</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelectRun(h.id)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${theme.color.border}`,
                    color: theme.color.text,
                    borderRadius: theme.radius.sm,
                    padding: `2px 10px`,
                    fontSize: theme.fontSize.xs,
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function PaidDashboard({
  data,
  onSelectRun,
}: {
  data: AuditResultResponse;
  onSelectRun: (runId: string) => void;
}) {
  const result = data.result;
  if (!result) return null;

  const unpriced = result.cost_by_model.unpriced_models;

  return (
    <div>
      {unpriced.length > 0 && (
        <Card style={{ background: `${theme.color.volatile}12`, border: `1px solid ${theme.color.volatile}` }}>
          <p style={{ margin: 0, color: theme.color.text, fontSize: theme.fontSize.sm }}>
            {unpriced.length} model{unpriced.length === 1 ? "" : "s"} had no reference price and were
            excluded from cost: <code>{unpriced.join(", ")}</code>.
          </p>
        </Card>
      )}

      <SensitivityPanel result={result} />
      <FeatureGpp1mMatrix result={result} />
      <PerCustomerTable result={result} />
      <ModelGpp1mTable result={result} />
      <History data={data} onSelectRun={onSelectRun} />

      <p style={{ color: theme.color.textMuted, fontSize: theme.fontSize.xs, marginTop: theme.space(4) }}>
        {result.methodology}
      </p>
    </div>
  );
}
