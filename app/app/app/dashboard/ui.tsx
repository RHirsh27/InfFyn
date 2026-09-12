"use client";

import type { CSSProperties, ReactNode } from "react";
import { theme } from "@/lib/theme";
import type { Provenance } from "@/lib/audit-types";

export function Card({
  title,
  subtitle,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        padding: theme.space(6),
        marginBottom: theme.space(5),
        ...style,
      }}
    >
      {title && (
        <h2 style={{ margin: 0, fontSize: theme.fontSize.lg, color: theme.color.text }}>{title}</h2>
      )}
      {subtitle && (
        <p style={{ margin: `${theme.space(1)} 0 ${theme.space(4)}`, color: theme.color.textMuted, fontSize: theme.fontSize.sm }}>
          {subtitle}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Provenance badge (Q4): a modeled split must never read as "Actual". Actual
 * data is green; modeled data is muted and names its method.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  // Key off the engine-emitted label (the single authority's output), not the
  // method name. Actual renders green; every Modeled(...) renders muted.
  const isActual = provenance.label === "Actual";
  return (
    <span
      title={provenance.label}
      style={{
        display: "inline-block",
        fontSize: theme.fontSize.xs,
        fontFamily: theme.font.mono,
        padding: `2px 8px`,
        borderRadius: theme.radius.sm,
        border: `1px solid ${isActual ? theme.color.actual : theme.color.border}`,
        color: isActual ? theme.color.actual : theme.color.modeled,
        whiteSpace: "nowrap",
      }}
    >
      {provenance.label}
    </span>
  );
}

export function StabilityBadge({ stability }: { stability: "stable" | "volatile" }) {
  const volatile = stability === "volatile";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: theme.fontSize.xs,
        fontWeight: 600,
        padding: `2px 10px`,
        borderRadius: "999px",
        background: volatile ? `${theme.color.volatile}22` : `${theme.color.stable}22`,
        color: volatile ? theme.color.volatile : theme.color.stable,
        border: `1px solid ${volatile ? theme.color.volatile : theme.color.stable}`,
      }}
    >
      {volatile ? "Don't bet on this" : "Trust this"}
    </span>
  );
}

export function StateBlock({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: theme.space(10),
        color: theme.color.textMuted,
      }}
    >
      <h2 style={{ color: theme.color.text, margin: 0, fontSize: theme.fontSize.lg }}>{title}</h2>
      <p style={{ maxWidth: 460, margin: `${theme.space(3)} auto ${theme.space(5)}` }}>{message}</p>
      {action}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 18,
            borderRadius: theme.radius.sm,
            background: `linear-gradient(90deg, ${theme.color.surfaceAlt}, ${theme.color.border}, ${theme.color.surfaceAlt})`,
            margin: `${theme.space(2)} 0`,
            width: `${90 - i * 8}%`,
          }}
        />
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? theme.color.accent : "transparent",
        color: primary ? theme.color.accentText : theme.color.text,
        border: `1px solid ${primary ? theme.color.accent : theme.color.border}`,
        borderRadius: theme.radius.md,
        padding: `${theme.space(2)} ${theme.space(4)}`,
        fontSize: theme.fontSize.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export const tableStyles: { table: CSSProperties; th: CSSProperties; td: CSSProperties } = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: theme.fontSize.sm,
    color: theme.color.text,
  },
  th: {
    textAlign: "left",
    padding: `${theme.space(2)} ${theme.space(3)}`,
    borderBottom: `1px solid ${theme.color.border}`,
    color: theme.color.textMuted,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  td: {
    padding: `${theme.space(2)} ${theme.space(3)}`,
    borderBottom: `1px solid ${theme.color.surfaceAlt}`,
    fontFamily: theme.font.mono,
  },
};
