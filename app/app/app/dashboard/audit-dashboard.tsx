"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { theme } from "@/lib/theme";
import type { AuditResultResponse } from "@/lib/audit-types";
import { Button, Card, Skeleton, StateBlock } from "./ui";
import { FreeView } from "./free-view";
import { DashboardShell, type TabKey } from "./dashboard-shell";
import { AuditsView } from "./audits-view";
import { ConnectionsView } from "./connections-view";
import { BoardReportView } from "./board-report-view";

export function AuditDashboard({
  tenantName,
  userEmail = "",
  tenantId,
}: {
  tenantName: string;
  userEmail?: string;
  tenantId: string;
}) {
  const [data, setData] = useState<AuditResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<TabKey>("audits");

  // ── data fetching + audit run: UNCHANGED from before ─────────────────────
  const load = useCallback(async (runId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = runId
        ? `/api/audit/result?run_id=${encodeURIComponent(runId)}`
        : "/api/audit/result";
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json()) as AuditResultResponse;
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAudit = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/audit/run", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.detail ?? body.error ?? `Audit failed (${res.status})`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit");
    } finally {
      setRunning(false);
    }
  }, [load]);
  // ─────────────────────────────────────────────────────────────────────────

  const connected = !!data?.paid;
  const planLabel = `${(data?.tier ?? "growth").toString().toUpperCase()} PLAN`;

  function AuditsTab() {
    if (loading) {
      return (
        <Card>
          <Skeleton rows={6} />
        </Card>
      );
    }
    if (error) {
      return (
        <Card>
          <StateBlock title="We couldn't load your audit" message={error} action={<Button onClick={() => load()}>Try again</Button>} />
        </Card>
      );
    }
    if (!data?.has_run) {
      return (
        <Card>
          <StateBlock
            title="No audit yet"
            message="Upload a usage CSV or connect Stripe, then run an audit to see where your margin actually goes."
            action={
              <div style={{ display: "flex", gap: theme.space(2), justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  href="/app?setup=1"
                  style={{ background: theme.color.accent, color: theme.color.accentText, textDecoration: "none", padding: `${theme.space(2)} ${theme.space(5)}`, borderRadius: theme.radius.md, fontSize: theme.fontSize.sm }}
                >
                  Upload CSV / connect Stripe
                </Link>
                <Button variant="ghost" onClick={runAudit} disabled={running}>
                  {running ? "Running…" : "Run audit"}
                </Button>
              </div>
            }
          />
        </Card>
      );
    }
    if (data.paid && data.result) {
      return <AuditsView data={data} running={running} onReRun={runAudit} onSelectRun={(runId) => load(runId)} onOpenBoard={() => setTab("board")} />;
    }
    if (data.free) {
      return (
        <div>
          <h1 style={{ margin: `0 0 ${theme.space(4)}`, fontFamily: theme.font.display, fontSize: "26px", fontWeight: 600 }}>
            Profit audit
          </h1>
          <FreeView free={data.free} />
        </div>
      );
    }
    return (
      <Card>
        <StateBlock title="Nothing to show" message="This run returned no data. Try re-running the audit." action={<Button onClick={runAudit}>Run audit</Button>} />
      </Card>
    );
  }

  function ConnectionsTab() {
    return <ConnectionsView tenantId={tenantId} />;
  }

  function SettingsTab() {
    return (
      <div>
        <h1 style={{ margin: `0 0 ${theme.space(4)}`, fontFamily: theme.font.display, fontSize: "26px", fontWeight: 600 }}>Settings</h1>
        <Card title="Account">
          <p style={{ margin: `0 0 ${theme.space(1)}`, fontSize: theme.fontSize.sm, color: theme.color.text }}>{tenantName}</p>
          <p style={{ margin: `0 0 ${theme.space(4)}`, fontSize: theme.fontSize.sm, color: theme.color.textMuted }}>{userEmail}</p>
          <div style={{ display: "flex", gap: theme.space(2), flexWrap: "wrap" }}>
            <form action="/auth/signout" method="post" style={{ margin: 0 }}>
              <button
                type="submit"
                style={{ background: "transparent", border: `1px solid ${theme.color.border}`, color: theme.color.textMuted, padding: `${theme.space(2)} ${theme.space(4)}`, borderRadius: theme.radius.md, fontSize: theme.fontSize.sm, cursor: "pointer" }}
              >
                Sign out
              </button>
            </form>
          </div>
        </Card>
      </div>
    );
  }

  let content: React.ReactNode;
  if (tab === "audits") content = <AuditsTab />;
  else if (tab === "board") content = <BoardReportView />;
  else if (tab === "connections") content = <ConnectionsTab />;
  else content = <SettingsTab />;

  return (
    <DashboardShell
      planLabel={planLabel}
      userEmail={userEmail}
      connected={connected}
      active={tab}
      onSelect={setTab}
    >
      {content}
    </DashboardShell>
  );
}
