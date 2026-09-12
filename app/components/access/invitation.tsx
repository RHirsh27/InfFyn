"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "../audit/workspace.css";
export function Invitation({
  signedIn,
  privateAlpha = false,
}: {
  signedIn: boolean;
  privateAlpha?: boolean;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const preparation = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let active = true;
    // A second invitation can be opened while this same page is still mounted.
    const changedLink = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener("hashchange", changedLink);
    const token = window.location.hash.slice(1);
    async function prepare() {
      if (token) {
        // Strip the secret before any navigation or referrer can carry it.
        window.history.replaceState(null, "", "/invite");
        const response = await fetch("/api/v2/access/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok)
          throw new Error(
            "This invitation link is invalid. Ask the issuer for a new link.",
          );
      }
    }
    preparation.current ??= prepare();
    preparation.current
      .then(() => active && setReady(true))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
      window.removeEventListener("hashchange", changedLink);
    };
  }, []);
  async function redeem() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v2/access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to accept this invitation.",
        );
      window.location.assign("/app/monthly");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
      setBusy(false);
    }
  }
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 720, margin: "60px auto" }}
      >
        <Link href="/">InfFyn</Link>
        <p className="eyebrow">YOUR INVITATION</p>
        <h1>Full access. Your own workspace.</h1>
        <p>
          Review real usage, customer revenue and internal workflow outcomes.
          Complimentary access remains active until an administrator revokes it.
          No card is required and it never starts a paid subscription
          automatically.
        </p>
        <p>
          Use the verified email address that received the invitation. Each
          company’s evidence stays in its own workspace.
        </p>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {ready &&
          (signedIn ? (
            <button className="primary" disabled={busy} onClick={redeem}>
              {busy ? "Creating your workspace…" : "Accept invitation →"}
            </button>
          ) : (
            <Link className="primary link-button" href="/login?next=/invite">
              {privateAlpha
                ? "Sign in with your alpha account →"
                : "Sign in or create an account →"}
            </Link>
          ))}
        {!ready && !error && <p role="status">Preparing your invitation…</p>}
        <p className="small muted">
          Accepting creates an independent company workspace.{" "}
          <Link href="/privacy">Data retention</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </p>
      </main>
    </div>
  );
}
