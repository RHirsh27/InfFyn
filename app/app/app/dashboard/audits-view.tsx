"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AuditResultResponse, Provenance } from "@/lib/audit-types";
import { theme, fmtUsd, fmtPct } from "@/lib/theme";
import { landing } from "@/lib/landing-theme";
import { Button } from "./ui";
import { PaidDashboard } from "./paid-dashboard";

const c = landing.color;

// Accounting format for GPp1M figures: positives plain, losses parenthesized.
function acct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v < 0 ? `(${Math.abs(v).toFixed(2)})` : v.toFixed(2);
}

function fmtRunTime(iso?: string): string {
  if (!iso) return "not yet run";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Shared chip base — one deliberate size/shape for every badge in the ledger.
const chipBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontFamily: theme.font.mono,
  fontSize: "10px",
  letterSpacing: ".07em",
  padding: "0 9px",
  height: "21px",
  borderRadius: "999px",
  whiteSpace: "nowrap",
  lineHeight: 1,
  boxSizing: "border-box",
};

// Provenance chip — keyed off the ENGINE label only (label === "Actual"); modeled
// anything else. Logic unchanged from provenance.py. A filled green dot marks the
// one thing that's observed-real; modeled carries a hollow dot.
function ProvChip({ provenance }: { provenance: Provenance }) {
  const isActual = provenance.label === "Actual";
  return (
    <span
      title={provenance.label}
      style={{ ...chipBase, border: `1px solid ${isActual ? c.chipActualBorder : c.line}`, color: isActual ? c.profit : c.muted }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isActual ? c.profit : "transparent",
          border: isActual ? "none" : `1.5px solid ${c.faint}`,
          flex: "none",
        }}
      />
      {isActual ? "ACTUAL" : "MODELED"}
    </span>
  );
}

// Sensitivity chip — NEUTRAL by design (green is money only, never sensitivity).
function StabilityChip({ stable }: { stable: boolean }) {
  return (
    <span style={{ ...chipBase, border: `1px solid ${stable ? c.lineStrong : c.loss}`, color: stable ? c.muted : c.loss }}>
      {stable ? "STABLE" : "VOLATILE"}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="av-card av-stat">
      <div className="av-eyebrow">{label}</div>
      <div className="av-stat-value">{value}</div>
      <div className="av-stat-sub">{sub}</div>
    </div>
  );
}

const css = `
.av-eyebrow{font-family:${theme.font.mono};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${c.faint};font-weight:500;}
.av-card{background:${theme.color.surface};border:1px solid ${theme.color.border};border-radius:14px;box-shadow:0 1px 2px rgba(27,23,18,.05), 0 14px 34px -22px rgba(27,23,18,.16);}
.av-stat{padding:16px 20px 18px;}
.av-stat-value{font-family:${theme.font.display};font-size:30px;font-weight:600;letter-spacing:-.01em;color:${theme.color.text};margin:9px 0 5px;font-variant-numeric:tabular-nums;}
.av-stat-sub{font-size:12px;color:${theme.color.textMuted};}
.av-sec-title{margin:0;font-family:${theme.font.display};font-size:18px;font-weight:600;letter-spacing:-.01em;color:${theme.color.text};}
.av-sec-sub{margin:6px 0 0;color:${theme.color.textMuted};font-size:13px;line-height:1.5;}
.av-tbl{width:100%;border-collapse:collapse;}
.av-tbl thead th{font-family:${theme.font.mono};font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:${c.faint};font-weight:500;padding:0 0 10px;border-bottom:1px solid ${c.rule};white-space:nowrap;}
.av-tbl thead th.l{text-align:left;}
.av-tbl thead th.r{text-align:right;}
.av-tbl tbody td{padding:13px 0;border-bottom:1px solid ${theme.color.border};vertical-align:middle;}
.av-tbl tbody tr:last-child td{border-bottom:none;}
.av-tbl tbody tr{transition:background .12s ease;}
.av-tbl tbody tr:hover td{background:rgba(27,23,18,.018);}
.av-feat{font-family:${theme.font.body};font-weight:500;color:${theme.color.text};font-size:14px;padding-right:${theme.space(4)};}
.av-num{font-family:${theme.font.mono};font-variant-numeric:tabular-nums;font-weight:600;font-size:14.5px;text-align:right;padding-left:${theme.space(4)};white-space:nowrap;}
.av-cell-sens{padding-right:${theme.space(3)};}
.av-cell-basis{text-align:right;padding-left:${theme.space(4)};}
@media (prefers-reduced-motion: reduce){.av-tbl tbody tr{transition:none;}}
`;

export function AuditsView({
  data,
  running,
  onReRun,
  onSelectRun,
  onOpenBoard,
}: {
  data: AuditResultResponse;
  running: boolean;
  onReRun: () => void;
  onSelectRun: (runId: string) => void;
  onOpenBoard: () => void;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const result = data.result!;

  const derived = useMemo(() => {
    const methodKey = result.default_method in result.allocation.methods
      ? result.default_method
      : Object.keys(result.allocation.methods)[0];
    const byFeature = result.allocation.methods[methodKey]?.by_feature ?? {};
    const volatileSet = new Set(result.sensitivity.volatile_features);

    const rows = result.allocation.features
      .map((name) => ({
        name,
        gpp1m: byFeature[name]?.gpp1m ?? null,
        provenance: byFeature[name]?.provenance ?? { method: methodKey, label: "Modeled" },
        stable: !volatileSet.has(name),
      }))
      .filter((r) => r.gpp1m !== null)
      .sort((a, b) => (b.gpp1m as number) - (a.gpp1m as number));

    const totalRev = result.gpp1m_by_model?.total_revenue ?? 0;
    const totalCost = result.cost_by_model?.total_cost ?? 0;
    const totalTokens = result.gpp1m_by_model?.total_tokens ?? 0;
    const blended = totalTokens > 0 ? ((totalRev - totalCost) / totalTokens) * 1e6 : null;

    const cov = result.per_customer_profit.coverage;
    const total = rows.length;
    const underwater = rows.filter((r) => (r.gpp1m as number) < 0);
    const stableAcross = underwater.every((r) => r.stable);

    const best = rows[0];
    const worst = rows[rows.length - 1];

    return {
      rows,
      blended,
      revenueMatchedPct: cov.revenue_matched_pct,
      customersMatched: cov.customers_matched,
      underwaterCount: underwater.length,
      total,
      stableAcross,
      best,
      worst,
    };
  }, [result]);

  const { rows, blended, revenueMatchedPct, customersMatched, underwaterCount, total, stableAcross, best, worst } =
    derived;

  const green = { color: theme.color.profit, fontWeight: 600 } as const;
  const clay = { color: theme.color.loss, fontWeight: 600 } as const;

  let headline: ReactNode;
  if (best && worst && (best.gpp1m as number) > 0 && (worst.gpp1m as number) < 0) {
    const ratio = (best.gpp1m as number) / Math.abs(worst.gpp1m as number);
    headline = (
      <>
        Your <strong>{best.name}</strong> earns <span style={green}>{ratio.toFixed(1)}×</span> more per token than{" "}
        <strong>{worst.name}</strong> loses.{" "}
        <span style={clay}>
          {underwaterCount} of {total}
        </span>{" "}
        features are underwater.
      </>
    );
  } else if (underwaterCount === 0 && best) {
    headline = (
      <>
        All <strong>{total}</strong> features are above water — <strong>{best.name}</strong> leads at{" "}
        <span style={green}>{acct(best.gpp1m)}</span> per 1M tokens.
      </>
    );
  } else {
    headline = (
      <>
        <span style={clay}>
          {underwaterCount} of {total}
        </span>{" "}
        features are underwater.
      </>
    );
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Header — anchored with a hairline for a considered top edge */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: theme.space(3),
          flexWrap: "wrap",
          paddingBottom: theme.space(4),
          marginBottom: theme.space(6),
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontFamily: theme.font.display, fontSize: "27px", fontWeight: 600, letterSpacing: "-.01em", color: theme.color.text }}>
            Profit audit
          </h1>
          <p style={{ margin: `${theme.space(2)} 0 0`, color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
            Trailing 30 days · last run {fmtRunTime(data.created_at)}
          </p>
        </div>
        <div style={{ display: "flex", gap: theme.space(2), alignItems: "center" }}>
          <Button variant="ghost" onClick={() => setBreakdownOpen((o) => !o)}>
            History
          </Button>
          <Button onClick={onReRun} disabled={running}>
            {running ? "Running…" : "Re-run audit"}
          </Button>
        </div>
      </header>

      {/* Headline finding — the dominant element */}
      <div style={{ marginBottom: theme.space(6) }}>
        <div className="av-eyebrow" style={{ marginBottom: theme.space(3) }}>
          Headline finding
        </div>
        <div
          className="av-card"
          style={{
            padding: `${theme.space(6)} ${theme.space(7)}`,
            fontSize: "22px",
            lineHeight: 1.42,
            fontFamily: theme.font.display,
            color: theme.color.text,
          }}
        >
          {headline}
        </div>
      </div>

      {/* Three summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: theme.space(4),
          marginBottom: theme.space(6),
        }}
      >
        <StatCard label="Blended margin / 1M" value={fmtUsd(blended)} sub="Weighted across features" />
        <StatCard label="Revenue matched" value={fmtPct(revenueMatchedPct, 0)} sub={`Via Stripe · ${customersMatched} customers`} />
        <StatCard label="Features underwater" value={`${underwaterCount} of ${total}`} sub={stableAcross ? "Stable across methods" : "Varies by method"} />
      </div>

      {/* Profit per 1M tokens, by feature — the centerpiece ledger */}
      <section className="av-card" style={{ padding: `${theme.space(6)} ${theme.space(7)}`, marginBottom: theme.space(6) }}>
        <div style={{ marginBottom: theme.space(5) }}>
          <h2 className="av-sec-title">Profit per 1,000,000 tokens · by feature</h2>
          <p className="av-sec-sub">Every figure carries its basis. Only Stripe-joined revenue is labeled actual.</p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="av-tbl">
            <thead>
              <tr>
                <th className="l">Feature</th>
                <th className="l">Sensitivity</th>
                <th className="r">GP · 1M</th>
                <th className="r">Basis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const positive = (r.gpp1m as number) >= 0;
                return (
                  <tr key={r.name}>
                    <td className="av-feat">{r.name}</td>
                    <td className="av-cell-sens">
                      <StabilityChip stable={r.stable} />
                    </td>
                    <td className="av-num" style={{ color: positive ? theme.color.profit : theme.color.loss }}>
                      {acct(r.gpp1m)}
                    </td>
                    <td className="av-cell-basis">
                      <ProvChip provenance={r.provenance} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Full breakdown — the existing deeper analysis, one click away (History toggles it) */}
        <details open={breakdownOpen} style={{ marginTop: theme.space(5) }}>
          <summary
            onClick={(e) => {
              e.preventDefault();
              setBreakdownOpen((o) => !o);
            }}
            style={{ cursor: "pointer", fontSize: "12px", color: theme.color.textMuted, fontFamily: theme.font.mono, letterSpacing: ".06em", listStyle: "none" }}
          >
            {breakdownOpen ? "▾ Hide full breakdown" : "▸ Full breakdown — sensitivity, per-customer, per-model, run history"}
          </summary>
          {breakdownOpen && (
            <div style={{ marginTop: theme.space(4) }}>
              <PaidDashboard data={data} onSelectRun={onSelectRun} />
            </div>
          )}
        </details>
      </section>

      {/* Board report card */}
      <section
        className="av-card"
        style={{
          background: theme.color.surfaceAlt,
          padding: `${theme.space(6)} ${theme.space(7)}`,
          marginBottom: theme.space(6),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space(5),
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: "58ch" }}>
          <h2 className="av-sec-title">Board report</h2>
          <p className="av-sec-sub" style={{ maxWidth: "58ch" }}>
            A live statement view and downloadable snapshot, refreshed with every audit. Your Stripe connection powers the exact figures.
          </p>
        </div>
        <Button variant="ghost" onClick={onOpenBoard}>
          Open board report
        </Button>
      </section>

      {/* Trust footer — set off with a hairline */}
      <div style={{ borderTop: `1px solid ${theme.color.border}`, paddingTop: theme.space(5) }}>
        <p style={{ fontFamily: theme.font.mono, fontSize: "11px", letterSpacing: ".14em", color: theme.color.textMuted, textAlign: "center", margin: 0 }}>
          READ-ONLY · REVOCABLE ANYTIME · WE CAN NEVER TOUCH YOUR MONEY
        </p>
      </div>
    </div>
  );
}
