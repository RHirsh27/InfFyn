"use client";
import { useState } from "react";
import Link from "next/link";
import "../audit/workspace.css";

export function PreviewEntry() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function enter() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/review/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok)
        throw new Error(
          "The preview could not open. Please retry in a moment.",
        );
      window.location.assign("/app/audits");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open preview.");
      setBusy(false);
    }
  }
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 800, margin: "70px auto" }}
      >
        <Link href="/">InfFyn</Link>
        <p className="eyebrow">FOUNDER REVIEW PREVIEW</p>
        <h1>Try the complete audit.</h1>
        <p>
          Explore customer contribution and internal workflow economics. Start
          with the sample datasets or upload anonymized test CSV files, then
          inspect the calculations and export a report.
        </p>
        <p>
          No email or payment is needed. Your preview gets its own workspace.
          Return in the same browser to reopen saved audits; clearing browser
          data or using another device starts a separate preview.
        </p>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy} onClick={enter}>
          {busy ? "Opening your workspace…" : "Open my preview →"}
        </button>
        <p className="small muted">
          Stripe and email delivery are disabled. This is a review environment;
          use test data without confidential information.
        </p>
      </main>
    </div>
  );
}
