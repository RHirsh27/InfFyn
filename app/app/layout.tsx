import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Fraunces, Libre_Franklin } from "next/font/google";
import { landing } from "@/lib/landing-theme";
import { releaseStage } from "@/lib/private-alpha";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});
const workspace = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-workspace",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
// Display / headline typeface — SINGLE SOURCE for the whole app, exposed as --font-display.
// Changing the signature face (P1) is now a one-line change: swap Fraunces below for any
// other next/font face; nothing else in the app references the concrete font.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InfFyn — AI economics, with evidence",
  description:
    "Review AI costs, customer contribution and internal workflow outcomes with explicit sources and assumptions.",
  robots:
    process.env.INFFYN_PREVIEW_MODE === "true" || releaseStage() === "private_alpha"
      ? { index: false, follow: false }
      : undefined,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} ${display.variable} ${workspace.variable}`}
    >
      <body
        style={{
          margin: 0,
          background: landing.color.cream,
          color: landing.color.ink,
          fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif",
        }}
      >
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html{scroll-behavior:smooth}:target{scroll-margin-top:24px}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
