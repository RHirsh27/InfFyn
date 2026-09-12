/**
 * Landing (marketing) design tokens — the "cream, CFO-grade" direction.
 *
 * Deliberately SEPARATE from `theme.ts` (the dark product/dashboard theme):
 * the public site is warm paper + ink, the signed-in app stays dark. Green is
 * SEMANTIC here — it only ever means money/profit. Losses use a warm brick red.
 */
export const landing = {
  color: {
    cream: "#F7F5EF", // page background — "executive cardstock": barely off-white, faint warm (not rosy) undertone
    creamCard: "#FDFCF8", // raised surface (statement card) — near-white warm
    creamFoot: "#F1EFE7", // card footer / sidebar wash
    ink: "#1B1712", // primary text (warm near-black)
    ink2: "#4A443B", // secondary text
    muted: "#877E6E", // supporting text
    faint: "#AFA48F", // captions / mono labels
    line: "#E6E1D6", // hairline — de-rosied to match the cardstock paper
    lineStrong: "#CBBFA4", // emphasized border
    rule: "#8B8266", // accounting rule (subtotal underline)
    profit: "#1E7A46", // GREEN = money only
    profitWash: "rgba(30,122,70,0.28)", // headline underline
    loss: "#A2402C", // warm brick = loss / thin margin
    lossBg: "#F1E8E3", // loss row tint — de-rosied to a cool, neutral clay wash (not peachy/pink)
    chipActualBorder: "#A6CBB4",
  },
  radius: { sm: "6px", md: "10px", card: "12px" },
  space: (n: number) => `${n * 4}px`,
  fontSize: {
    label: "11px",
    xs: "12px",
    sm: "13px",
    md: "16px",
    lg: "18px",
    h1: "56px",
    h1Mobile: "40px",
  },
} as const;

export type Landing = typeof landing;
