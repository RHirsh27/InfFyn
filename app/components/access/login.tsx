"use client";
import { authReturnPath } from "@/lib/auth-return";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { theme } from "@/lib/theme";

export function LoginForm({
  privateAlpha = false,
}: {
  privateAlpha?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error) {
      setIsError(true);
      setMessage(
        error === "alpha_access_required"
          ? "This account does not have private-alpha access. Use your provisioned work email."
          : "The sign-in link could not be verified. Request a new link.",
      );
    }
  }, []);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setIsError(false);

    const supabase = createClient();
    const requested =
      new URLSearchParams(window.location.search).get("next") ?? "/app/monthly";
    const next = authReturnPath(requested);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: !privateAlpha },
    });

    setLoading(false);
    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }
    setSent(true);
    setMessage(`Check your email — we sent a magic link to ${email}.`);
  }

  const label: React.CSSProperties = {
    display: "block",
    fontFamily: theme.font.mono,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    fontSize: "11px",
    color: theme.color.textMuted,
    marginBottom: theme.space(2),
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: theme.space(6),
        background: theme.color.bg,
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space(2),
            marginBottom: theme.space(6),
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={theme.color.text} />
            <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={theme.color.profit} />
          </svg>
          <span
            style={{
              fontFamily: theme.font.display,
              fontWeight: 600,
              fontSize: "20px",
              letterSpacing: "-0.01em",
            }}
          >
            Inf<span style={{ color: theme.color.profit }}>Fyn</span>
          </span>
        </div>

        <h1
          style={{
            fontFamily: theme.font.display,
            fontWeight: 500,
            fontSize: "34px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {privateAlpha ? "Private alpha sign-in" : "Sign in"}
        </h1>
        <p
          style={{
            color: theme.color.textMuted,
            fontSize: theme.fontSize.md,
            margin: `${theme.space(3)} 0 ${theme.space(6)}`,
          }}
        >
          {privateAlpha
            ? "Use your provisioned work email. Access is limited to named alpha participants."
            : "We’ll email you a magic link — no password to remember."}
        </p>

        <form onSubmit={handleMagicLink}>
          <label htmlFor="email" style={label}>
            Work email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
            disabled={sent}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              background: theme.color.surface,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
              padding: `${theme.space(3)} ${theme.space(4)}`,
              fontSize: theme.fontSize.md,
              color: theme.color.text,
              fontFamily: theme.font.body,
              marginBottom: theme.space(4),
            }}
          />
          <button
            type="submit"
            disabled={loading || sent}
            style={{
              width: "100%",
              background: theme.color.accent,
              color: theme.color.accentText,
              border: "none",
              borderRadius: theme.radius.md,
              padding: `${theme.space(4)} ${theme.space(5)}`,
              fontSize: "15px",
              fontWeight: 600,
              fontFamily: theme.font.body,
              cursor: loading || sent ? "not-allowed" : "pointer",
              opacity: loading || sent ? 0.6 : 1,
            }}
          >
            {loading ? "Sending…" : sent ? "Link sent" : "Send magic link"}
          </button>
        </form>

        {message && (
          <p
            role={isError ? "alert" : "status"}
            style={{
              marginTop: theme.space(4),
              fontSize: theme.fontSize.sm,
              color: isError ? theme.color.danger : theme.color.text,
              background: isError ? undefined : theme.color.surfaceAlt,
              border: isError ? undefined : `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
              padding: isError ? 0 : `${theme.space(3)} ${theme.space(4)}`,
            }}
          >
            {message}
          </p>
        )}

        <p
          style={{
            marginTop: theme.space(6),
            fontFamily: theme.font.mono,
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: theme.color.textMuted,
          }}
        >
          {privateAlpha
            ? "CSV WORKSPACE · PROVIDER CONNECTIONS DEFERRED"
            : "READ-ONLY · REVOCABLE · WE NEVER WRITE TO YOUR STRIPE"}
        </p>
      </div>
    </main>
  );
}
