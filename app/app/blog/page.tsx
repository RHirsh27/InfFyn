import type { Metadata } from "next";
import Link from "next/link";
import { landing } from "@/lib/landing-theme";

export const metadata: Metadata = {
  title: "Blog — InfFyn | Profit per token, AI unit economics",
  description:
    "Field notes on the profitability of AI inference: profit per token, per-feature and per-customer margin, honest allocation methods, and why cost is only half the ledger.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "InfFyn Blog — the economics of AI inference",
    description:
      "Profit per token, not just cost per token. Notes on measuring the real margin of AI features.",
    type: "website",
  },
};

const c = landing.color;

const posts = [
  {
    title: "Everyone tracks cost per token. Nobody tracks profit per token.",
    excerpt:
      "Your provider bill is the easy half of the ledger. The half that actually decides whether a feature is worth running is the one nobody instruments — margin per token.",
    date: "Coming soon",
  },
  {
    title: "A feature can be your most-used and your least-profitable at once.",
    excerpt:
      "High usage feels like success. But usage is a cost driver, not a profit signal. Here's how a flagship feature quietly runs underwater — and how to see it.",
    date: "Coming soon",
  },
  {
    title: "Actual vs Modeled: why an honest margin beats a confident one.",
    excerpt:
      "When revenue is shared across features, any single profit number is an assumption. We label every figure and show its sensitivity — so you know what to trust.",
    date: "Coming soon",
  },
];

const css = `
.bl{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;min-height:100vh;}
.bl *{box-sizing:border-box;}
.bl-top{max-width:820px;margin:0 auto;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;}
.bl-brand{display:flex;align-items:center;gap:9px;font-family:var(--font-display),serif;font-weight:600;font-size:20px;letter-spacing:-.01em;color:${c.ink};text-decoration:none;}
.bl-brand .fyn{color:${c.profit};}
.bl-back{color:${c.ink2};text-decoration:none;font-size:14.5px;}
.bl-head{max-width:820px;margin:0 auto;padding:44px 32px 8px;}
.bl-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${c.muted};margin-bottom:20px;}
.bl-h1{font-family:var(--font-display),Georgia,serif;font-size:48px;line-height:1.05;letter-spacing:-.03em;font-weight:500;margin:0;max-width:18ch;}
.bl-intro{font-size:18px;line-height:1.6;color:${c.ink2};margin:22px 0 0;max-width:60ch;}
.bl-list{max-width:820px;margin:0 auto;padding:44px 32px 96px;display:grid;gap:16px;}
.bl-card{background:${c.creamCard};border:1px solid ${c.line};border-radius:12px;padding:24px 26px;}
.bl-date{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.12em;font-size:10px;color:${c.faint};margin-bottom:10px;}
.bl-title{font-family:var(--font-display),serif;font-weight:600;font-size:22px;line-height:1.2;letter-spacing:-.01em;margin:0;}
.bl-ex{color:${c.ink2};font-size:15.5px;line-height:1.6;margin:10px 0 0;max-width:64ch;}
.bl-foot{max-width:820px;margin:0 auto;padding:24px 32px;border-top:1px solid ${c.line};display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.bl-fnote{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.04em;}
.bl-cta{color:${c.ink};font-weight:600;text-decoration:none;font-size:14.5px;}
@media (max-width:640px){.bl-h1{font-size:34px;}.bl-top,.bl-head,.bl-list,.bl-foot{padding-left:20px;padding-right:20px;}}
`;

export default function BlogIndexPage() {
  return (
    <div className="bl">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="bl-top">
        <Link className="bl-brand" href="/">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={c.ink} />
            <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={c.profit} />
          </svg>
          <span>Inf<span className="fyn">Fyn</span></span>
        </Link>
        <Link className="bl-back" href="/">← Back to home</Link>
      </header>

      <div className="bl-head">
        <p className="bl-eyebrow">The ledger — field notes</p>
        <h1 className="bl-h1">The economics of AI inference.</h1>
        <p className="bl-intro">
          Notes on measuring what your AI features actually earn — profit per token, per-feature and per-customer margin, honest allocation when revenue is shared, and why cost is only half the ledger. Written for founders and finance leads who think in unit economics.
        </p>
      </div>

      <main className="bl-list">
        {posts.map((p) => (
          <article className="bl-card" key={p.title}>
            <p className="bl-date">{p.date}</p>
            <h2 className="bl-title">{p.title}</h2>
            <p className="bl-ex">{p.excerpt}</p>
          </article>
        ))}
      </main>

      <footer className="bl-foot">
        <span className="bl-fnote">The financial controller for AI inference</span>
        <Link className="bl-cta" href="/login">See your margin — free →</Link>
      </footer>
    </div>
  );
}
