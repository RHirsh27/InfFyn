"use client";

import { useState, type ReactNode } from "react";
import { theme } from "@/lib/theme";
import { Button, Card } from "./ui";
import { ConnectStripeButton } from "./connect-stripe-button";

type BoardReport = {
  status: "ok" | "needs_stripe" | "no_run";
  report?: string;
  source?: "ai" | "baseline";
  notice?: string | null;
};

// Minimal, safe markdown renderer for the engine-generated report.
function inline(text: string, kp: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={`${kp}-${i}`}>{m[1]}</strong>);
    else parts.push(<em key={`${kp}-${i}`}>{m[2]}</em>);
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderReport(text: string): ReactNode {
  const out: ReactNode[] = [];
  const lines = text.split("\n");
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={key} style={{ margin: `0 0 ${theme.space(3)}`, paddingLeft: theme.space(5), display: "grid", gap: theme.space(2) }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ fontSize: theme.fontSize.md, lineHeight: 1.55, color: theme.color.text }}>
              {inline(b, `${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      return;
    }
    flush(`ul-${idx}`);
    if (!line.trim()) return;
    if (line.startsWith("### ")) {
      out.push(
        <h3 key={idx} style={{ margin: `${theme.space(4)} 0 ${theme.space(2)}`, fontSize: theme.fontSize.md, fontFamily: theme.font.mono, letterSpacing: ".06em", textTransform: "uppercase", color: theme.color.textMuted }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      out.push(
        <h2 key={idx} style={{ margin: `0 0 ${theme.space(3)}`, fontFamily: theme.font.display, fontSize: "22px", fontWeight: 600, color: theme.color.text }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      out.push(
        <p key={idx} style={{ margin: `${theme.space(3)} 0 0`, fontSize: theme.fontSize.xs, color: theme.color.textMuted, lineHeight: 1.5 }}>
          {line.slice(1, -1)}
        </p>
      );
    } else {
      out.push(
        <p key={idx} style={{ margin: `0 0 ${theme.space(3)}`, fontSize: theme.fontSize.md, lineHeight: 1.6, color: theme.color.text }}>
          {inline(line, `p-${idx}`)}
        </p>
      );
    }
  });
  flush("ul-end");
  return out;
}

export function BoardReportView() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BoardReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/board-report", { method: "POST" });
      const body = (await res.json()) as BoardReport & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't generate the report");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate the report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: `0 0 ${theme.space(2)}`, fontFamily: theme.font.display, fontSize: "26px", fontWeight: 600 }}>
        Board report
      </h1>
      <p style={{ margin: `0 0 ${theme.space(5)}`, color: theme.color.textMuted, fontSize: theme.fontSize.sm, maxWidth: "64ch" }}>
        A plain-language summary of your latest audit — written from your Stripe-audited figures, with every number carrying its basis. Actual figures stated plainly, modeled figures marked as estimates, method-dependent conclusions hedged.
      </p>

      {!data && !error && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: theme.space(3), flexWrap: "wrap" }}>
            <Button onClick={generate} disabled={loading}>
              {loading ? "Writing your board report…" : "Generate board report"}
            </Button>
            <span style={{ fontSize: theme.fontSize.sm, color: theme.color.textMuted }}>
              Generated fresh from your latest audit.
            </span>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <p style={{ margin: `0 0 ${theme.space(3)}`, color: theme.color.danger, fontSize: theme.fontSize.sm }}>{error}</p>
          <Button onClick={generate} disabled={loading}>
            {loading ? "Retrying…" : "Try again"}
          </Button>
        </Card>
      )}

      {data?.status === "needs_stripe" && (
        <Card title="Connect Stripe to generate a board report" subtitle="The board report uses your exact, Stripe-joined figures — we won't generate one from estimates alone.">
          <ConnectStripeButton label="Connect Stripe" />
        </Card>
      )}

      {data?.status === "no_run" && (
        <Card title="Run an audit first" subtitle="There's no audit to summarize yet.">
          <p style={{ margin: 0, fontSize: theme.fontSize.sm, color: theme.color.textMuted }}>
            Run an audit from the Audits tab, then come back to generate the board report.
          </p>
        </Card>
      )}

      {data?.status === "ok" && data.report && (
        <>
          <Card>{renderReport(data.report)}</Card>
          <div style={{ display: "flex", alignItems: "center", gap: theme.space(3), flexWrap: "wrap", marginTop: `-${theme.space(3)}`, marginBottom: theme.space(4) }}>
            <span style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>
              {data.source === "ai" ? "Written by Claude from your audited figures — checked against the numbers." : "Verified baseline report — generated directly from your audited figures."}
            </span>
            <Button variant="ghost" onClick={generate} disabled={loading}>
              {loading ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
          {data.notice && (
            <p style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted, marginTop: `-${theme.space(2)}` }}>{data.notice}</p>
          )}
          <p style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, letterSpacing: ".1em", color: theme.color.textMuted, textAlign: "center", marginTop: theme.space(4) }}>
            READ-ONLY · REVOCABLE ANYTIME · WE CAN NEVER TOUCH YOUR MONEY
          </p>
        </>
      )}
    </div>
  );
}
