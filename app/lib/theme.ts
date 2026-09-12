/**
 * App design tokens.
 *
 * These now map to the CREAM system (single source of truth: landing-theme.ts),
 * so the whole app — onboarding + dashboard — renders in the same finance-grade
 * cream language as the landing page. Components keep reading `theme.*`; only the
 * values changed (dark → cream). Fonts resolve to the CSS variables loaded once in
 * the root layout (Inter / IBM Plex Mono / Fraunces).
 *
 * Semantic colour discipline (matches the landing page):
 *   green  = MONEY only (profit / actual)
 *   clay   = loss / caution
 *   ink+muted = everything else, incl. the sensitivity "trust" cue (NOT green).
 */
import { landing } from "./landing-theme";

const c = landing.color;

export const theme = {
  color: {
    bg: c.cream,
    surface: c.creamCard,
    surfaceAlt: c.creamFoot,
    border: c.line,
    text: c.ink,
    textMuted: c.muted,
    accent: c.ink, // primary buttons/links — dark ink on cream, like the landing CTAs
    accentText: c.creamCard,
    // Money (green ONLY here):
    profit: c.profit,
    loss: c.loss,
    danger: c.loss,
    // Provenance badges — match the landing chips:
    actual: c.profit, // ACTUAL → green
    modeled: c.muted, // MODELED → muted
    // Sensitivity cue — NEUTRAL, because green is reserved for money:
    stable: c.ink, // "Trust this" → neutral ink
    volatile: c.loss, // "Don't bet on this" → clay caution
  },
  radius: { sm: "6px", md: "10px", lg: "12px" },
  space: (n: number) => `${n * 4}px`,
  font: {
    body: "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "var(--font-mono), ui-monospace, Menlo, Consolas, monospace",
    display: "var(--font-display), Georgia, 'Times New Roman', serif",
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.75rem",
    xxl: "2.5rem",
  },
} as const;

export type Theme = typeof theme;

/** USD formatting helpers shared across audit views. */
export function fmtUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}
