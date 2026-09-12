"use client";

import { useState, type ReactNode } from "react";
import { theme } from "@/lib/theme";
import { landing } from "@/lib/landing-theme";

const c = landing.color;

export type TabKey = "audits" | "board" | "connections" | "settings";

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Brandmark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={c.ink} />
      <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={c.profit} />
    </svg>
  );
}

const css = `
.ds-root{display:flex;min-height:100vh;background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;}
.ds-side{width:248px;flex:none;background:${c.creamFoot};border-right:1px solid ${c.line};display:flex;flex-direction:column;padding:22px 14px 16px;position:sticky;top:0;height:100vh;}
.ds-brand{display:flex;align-items:center;gap:9px;padding:4px 8px 2px;}
.ds-brandname{font-family:var(--font-display),Georgia,serif;font-weight:600;font-size:19px;letter-spacing:-.01em;}
.ds-plan{font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.18em;color:${c.muted};margin:2px 0 18px 8px;text-transform:uppercase;}
.ds-sec{font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.16em;color:${c.faint};text-transform:uppercase;margin:16px 8px 6px;}
.ds-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:none;border-radius:8px;padding:9px 10px;font-size:14px;color:${c.ink2};cursor:pointer;font-family:inherit;transition:background .12s ease,color .12s ease;}
.ds-item:hover{background:${c.cream};color:${c.ink};}
.ds-item.active{background:${c.creamCard};color:${c.ink};font-weight:600;box-shadow:inset 2px 0 0 ${c.ink};}
.ds-item:focus-visible{outline:2px solid ${c.profit};outline-offset:1px;}
.ds-item.locked{color:${c.faint};cursor:not-allowed;}
.ds-item.locked:hover{background:transparent;color:${c.faint};}
.ds-spacer{flex:1;}
.ds-dot{width:7px;height:7px;border-radius:50%;flex:none;margin-left:auto;}
.ds-soon{margin-left:auto;font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.1em;color:${c.faint};border:1px solid ${c.line};border-radius:999px;padding:1px 6px;}
.ds-user{border-top:1px solid ${c.line};margin-top:12px;padding:12px 8px 2px;}
.ds-email{font-size:12.5px;color:${c.ink};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ds-billing{font-family:var(--font-mono),monospace;font-size:10.5px;color:${c.muted};margin-top:3px;letter-spacing:.02em;}
.ds-main{flex:1;min-width:0;padding:34px 40px 64px;max-width:1080px;}
.ds-top{display:none;}
.ds-overlay{display:none;}
@media (max-width:900px){
  .ds-side{position:fixed;z-index:40;left:0;top:0;transform:translateX(-100%);transition:transform .2s ease;box-shadow:0 0 40px rgba(60,48,24,.18);}
  .ds-side.open{transform:none;}
  .ds-top{display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:30;background:${c.cream};border-bottom:1px solid ${c.line};padding:12px 16px;}
  .ds-burger{background:transparent;border:1px solid ${c.lineStrong};border-radius:8px;padding:7px 9px;cursor:pointer;color:${c.ink};display:inline-flex;}
  .ds-overlay.open{display:block;position:fixed;inset:0;background:rgba(27,23,18,.28);z-index:35;}
  .ds-main{padding:20px 18px 56px;}
  .ds-rootcol{flex-direction:column;}
}
@media (prefers-reduced-motion: reduce){.ds-side,.ds-item{transition:none !important;}}
`;

type NavItem = { key: TabKey; label: string };

export function DashboardShell({
  planLabel,
  userEmail,
  billingLine,
  connected,
  active,
  onSelect,
  children,
}: {
  planLabel: string;
  userEmail: string;
  billingLine?: string;
  connected: boolean;
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const analysis: NavItem[] = [
    { key: "audits", label: "Audits" },
    { key: "board", label: "Board report" },
  ];
  const account: NavItem[] = [
    { key: "connections", label: "Connections" },
    { key: "settings", label: "Settings" },
  ];

  function pick(tab: TabKey) {
    onSelect(tab);
    setMenuOpen(false);
  }

  const nav = (
    <>
      <div className="ds-brand">
        <Brandmark />
        <span className="ds-brandname">
          Inf<span style={{ color: c.profit }}>Fyn</span>
        </span>
      </div>
      <div className="ds-plan">{planLabel}</div>

      <div className="ds-sec">Analysis</div>
      {analysis.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`ds-item${active === it.key ? " active" : ""}`}
          aria-current={active === it.key ? "page" : undefined}
          onClick={() => pick(it.key)}
        >
          <span>{it.label}</span>
        </button>
      ))}

      <div className="ds-sec">Coming in build 2</div>
      {[
        { label: "Monitoring" },
        { label: "KPIs / Opex" },
      ].map((it) => (
        <button
          key={it.label}
          type="button"
          className="ds-item locked"
          aria-disabled="true"
          disabled
          title="Coming in Build 2"
        >
          <LockIcon />
          <span>{it.label}</span>
        </button>
      ))}

      <div className="ds-sec">Account</div>
      {account.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`ds-item${active === it.key ? " active" : ""}`}
          aria-current={active === it.key ? "page" : undefined}
          onClick={() => pick(it.key)}
        >
          <span>{it.label}</span>
          {it.key === "connections" && (
            <span
              className="ds-dot"
              title={connected ? "Stripe connected" : "Not connected"}
              style={{ background: connected ? c.profit : c.faint }}
            />
          )}
        </button>
      ))}

      <div className="ds-spacer" />
      <div className="ds-user">
        <div className="ds-email">{userEmail || "—"}</div>
        {billingLine && <div className="ds-billing">{billingLine}</div>}
      </div>
    </>
  );

  return (
    <div className="ds-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Mobile top bar */}
      <div className="ds-top">
        <button
          type="button"
          className="ds-burger"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="ds-brandname" style={{ fontSize: 17 }}>
          Inf<span style={{ color: c.profit }}>Fyn</span>
        </span>
      </div>

      <div
        className={`ds-overlay${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside className={`ds-side${menuOpen ? " open" : ""}`} aria-label="Dashboard navigation">
        {nav}
      </aside>

      <main className="ds-main">{children}</main>
    </div>
  );
}
