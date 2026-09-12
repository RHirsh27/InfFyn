import { IBM_Plex_Mono, Inter } from "next/font/google";
import { landing } from "@/lib/landing-theme";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

type Row = {
  feature: string;
  model: string;
  cost: string;
  revenue: string;
  margin: string; // parentheses = loss (accounting convention)
  basis: "ACTUAL" | "MODELED";
  loss?: boolean;
};

// Illustrative sample — realistic GPp1M-by-feature shape, two features underwater.
const ROWS: Row[] = [
  { feature: "Enterprise Search API", model: "gpt-4o", cost: "18.20", revenue: "95.00", margin: "76.80", basis: "ACTUAL" },
  { feature: "Support Copilot", model: "claude-3-5-sonnet", cost: "9.40", revenue: "42.00", margin: "32.60", basis: "ACTUAL" },
  { feature: "Doc Summarization", model: "gpt-4o-mini", cost: "6.10", revenue: "9.30", margin: "3.20", basis: "MODELED" },
  { feature: "Free-tier Autocomplete", model: "gpt-4o", cost: "12.75", revenue: "4.10", margin: "(8.65)", basis: "MODELED", loss: true },
  { feature: "Bulk Embeddings · SMB", model: "text-embedding-3-large", cost: "2.90", revenue: "1.80", margin: "(1.10)", basis: "ACTUAL", loss: true },
];

const c = landing.color;

const css = `
html,body{margin:0;padding:0;background:${c.cream};}
.lp{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;min-height:100vh;}
.lp .serif{font-family:var(--font-display),Georgia,serif;}
.lp .mono{font-family:var(--font-mono),ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;}
.lp-top{max-width:1200px;margin:0 auto;padding:28px 46px;display:flex;align-items:center;justify-content:space-between;}
.lp-brand{display:flex;align-items:center;gap:10px;font-family:var(--font-display),serif;font-weight:600;font-size:22px;letter-spacing:-.01em;}
.lp-brand .fyn{color:${c.profit};}
.lp-nav{display:flex;gap:30px;align-items:center;}
.lp-nav a{color:${c.ink2};text-decoration:none;font-size:14.5px;}
.lp-nav .ghost{border:1px solid ${c.lineStrong};border-radius:8px;padding:9px 15px;color:${c.ink};}
.lp-hero{max-width:1200px;margin:0 auto;padding:30px 46px 64px;display:grid;grid-template-columns:1.04fr 1.1fr;gap:66px;align-items:center;}
.lp-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.18em;font-size:11px;color:${c.muted};font-weight:500;margin-bottom:22px;}
.lp h1{font-family:var(--font-display),serif;font-size:${landing.fontSize.h1};line-height:1.03;letter-spacing:-.02em;font-weight:500;margin:0 0 22px;}
.lp h1 .u{color:${c.profit};box-shadow:inset 0 -2px 0 ${c.profitWash};}
.lp-sub{font-size:18px;line-height:1.6;color:${c.ink2};max-width:47ch;margin:0 0 32px;}
.lp-sub b{color:${c.ink};font-weight:600;}
.lp-cta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.lp-btn{background:${c.ink};color:${c.creamCard};border:none;border-radius:10px;padding:16px 26px;font-family:var(--font-inter),sans-serif;font-size:15.5px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;}
.lp-btn2{background:transparent;border:1px solid ${c.lineStrong};border-radius:10px;padding:16px 22px;font-size:15px;font-weight:500;color:${c.ink};cursor:pointer;text-decoration:none;display:inline-block;}
.lp-trust{margin-top:20px;color:${c.muted};font-family:var(--font-mono),monospace;font-size:12px;letter-spacing:.08em;}
.lp-unlock{margin-top:9px;color:${c.faint};font-size:12.5px;max-width:46ch;}
.lp-stmt{background:${c.creamCard};border:1px solid ${c.line};border-radius:12px;overflow:hidden;box-shadow:0 30px 60px -40px rgba(60,48,24,.42);}
.lp-sh{padding:18px 22px 14px;border-bottom:1px solid ${c.line};}
.lp-st{font-family:var(--font-display),serif;font-weight:600;font-size:16px;letter-spacing:-.01em;}
.lp-sm{margin-top:4px;display:flex;align-items:center;justify-content:space-between;}
.lp-lbl{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.13em;font-size:10.5px;color:${c.faint};font-weight:500;}
.lp table{width:100%;border-collapse:collapse;}
.lp thead th{text-align:right;padding:12px 22px 9px;border-bottom:1px solid ${c.line};font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.1em;font-size:9.5px;font-weight:500;color:${c.faint};}
.lp thead th.l{text-align:left;}
.lp tbody td{padding:13px 22px;border-bottom:1px solid ${c.line};font-size:13.5px;text-align:right;font-family:var(--font-mono),monospace;font-variant-numeric:tabular-nums;color:${c.ink2};}
.lp tbody td.feat{text-align:left;font-family:var(--font-inter),sans-serif;color:${c.ink};font-weight:600;}
.lp tbody td.feat .m{display:block;font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};font-weight:400;margin-top:2px;}
.lp .pos{color:${c.profit};font-weight:600;}
.lp .neg{color:${c.loss};font-weight:600;}
.lp tr.rowloss{background:${c.lossBg};}
.lp tr.rowloss td.feat{color:${c.loss};}
.lp tr.total td{border-bottom:none;border-top:2px solid ${c.rule};padding-top:14px;font-weight:600;color:${c.ink};}
.lp tr.total td.feat{font-family:var(--font-inter),sans-serif;}
.lp tr.total .dbl{box-shadow:0 3px 0 -1px ${c.rule};padding-bottom:2px;}
.lp-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid ${c.lineStrong};color:${c.muted};}
.lp-chip .cd{width:6px;height:6px;border-radius:50%;}
.lp-chip.act{border-color:${c.chipActualBorder};color:${c.profit};}
.lp-chip.act .cd{background:${c.profit};}
.lp-chip.mod .cd{border:1.5px solid ${c.faint};}
.lp-sf{padding:14px 22px;border-top:1px solid ${c.line};background:${c.creamFoot};display:flex;align-items:center;justify-content:space-between;gap:16px;}
.lp-fn{color:${c.muted};font-size:12px;max-width:50ch;}
.lp-fn b{color:${c.ink2};font-weight:600;}
.lp-verdict{font-family:var(--font-mono),monospace;font-size:12px;color:${c.loss};text-align:right;white-space:nowrap;}
.lp-verdict b{font-size:16px;font-weight:600;}
@media (max-width:980px){.lp-hero{grid-template-columns:1fr;gap:36px;padding-top:10px;}.lp h1{font-size:${landing.fontSize.h1Mobile};}.lp-nav{display:none;}}
`;

export function LandingHero({ signedIn = false }: { signedIn?: boolean }) {
  const primaryHref = signedIn ? "/app" : "/login";
  const primaryLabel = signedIn ? "Open your dashboard" : "See your margin — free";

  return (
    <div className={`lp ${mono.variable} ${inter.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="lp-top">
        <div className="lp-brand">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={c.ink} />
            <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={c.profit} />
          </svg>
          <span>Inf<span className="fyn">Fyn</span></span>
        </div>
        <nav className="lp-nav">
          <a href="#how">How it works</a>
          <a href="/honesty">The honesty layer</a>
          <a href="#pricing">Pricing</a>
          <a href="/blog">Blog</a>
          <a className="ghost" href="/login">Sign in</a>
        </nav>
      </header>

      <main className="lp-hero">
        <section>
          <div className="lp-eyebrow">The financial controller for AI inference</div>
          <h1>Know the <span className="u">profit</span> on every token you serve.</h1>
          <p className="lp-sub">
            You can already see the bill. InfFyn shows the other half of the ledger — <b>cost, revenue, and margin</b> — feature by feature, customer by customer. Cost is the easy half.
          </p>
          <div className="lp-cta">
            <a className="lp-btn" href={primaryHref}>{primaryLabel}</a>
            <a className="lp-btn2" href="#why">View a sample statement</a>
          </div>
          <div className="lp-trust">READ-ONLY&nbsp;·&nbsp;REVOCABLE&nbsp;·&nbsp;WE NEVER WRITE TO YOUR STRIPE</div>
          <div className="lp-unlock">Free cost audit from your usage. The profit view unlocks with a read-only Stripe connection.</div>
        </section>

        <section id="sample">
          <div className="lp-stmt" role="img" aria-label="Sample profit statement by feature; two features shown at a loss in parentheses">
            <div className="lp-sh">
              <div className="lp-st">Profit per 1,000,000 tokens</div>
              <div className="lp-sm">
                <span className="lp-lbl">By feature · trailing 30 days</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono),monospace",
                    fontSize: "9.5px",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: c.muted,
                    border: `1px solid ${c.lineStrong}`,
                    borderRadius: "999px",
                    padding: "3px 9px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Illustrative
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono),monospace",
                  fontSize: "10px",
                  letterSpacing: ".04em",
                  color: c.faint,
                  marginTop: "6px",
                }}
              >
                Illustrative example — not customer data.
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="l">Feature / model</th>
                  <th>Cost</th>
                  <th>Revenue</th>
                  <th>Margin</th>
                  <th style={{ textAlign: "right" }}>Basis</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.feature} className={r.loss ? "rowloss" : undefined}>
                    <td className="feat">{r.feature}<span className="m">{r.model}</span></td>
                    <td>{r.cost}</td>
                    <td>{r.revenue}</td>
                    <td className={r.loss ? "neg" : "pos"}>{r.margin}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`lp-chip ${r.basis === "ACTUAL" ? "act" : "mod"}`}><span className="cd" />{r.basis}</span>
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="feat">Blended margin <span style={{ fontWeight: 400, color: c.muted, fontSize: 12 }}>/ 1M (weighted)</span></td>
                  <td />
                  <td />
                  <td className="pos"><span className="dbl">$18.90</span></td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="lp-sf">
              <div className="lp-fn">Cost is <b>modeled</b> from reference prices until you connect actuals — every figure is labeled, and modeled lines carry a sensitivity range.</div>
              <div className="lp-verdict"><b>2 of 5</b><br />features underwater</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
