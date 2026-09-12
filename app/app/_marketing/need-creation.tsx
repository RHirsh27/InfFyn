import { IBM_Plex_Mono, Inter } from "next/font/google";
import { landing } from "@/lib/landing-theme";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

// Same feature rows as the hero — the answer exists, it's just out of focus.
const ROWS: { feature: string; model: string; cost: string; revenue: string; margin: string }[] = [
  { feature: "Enterprise Search API", model: "gpt-4o", cost: "18.20", revenue: "95.00", margin: "76.80" },
  { feature: "Support Copilot", model: "claude-3-5-sonnet", cost: "9.40", revenue: "42.00", margin: "32.60" },
  { feature: "Doc Summarization", model: "gpt-4o-mini", cost: "6.10", revenue: "9.30", margin: "3.20" },
  { feature: "Free-tier Autocomplete", model: "gpt-4o", cost: "12.75", revenue: "4.10", margin: "(8.65)" },
  { feature: "Bulk Embeddings · SMB", model: "text-embedding-3-large", cost: "2.90", revenue: "1.80", margin: "(1.10)" },
];

const c = landing.color;

const css = `
.nc{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;padding:96px 46px 104px;border-top:1px solid ${c.line};}
.nc *{box-sizing:border-box;}
.nc-inner{max-width:1108px;margin:0 auto;}
.nc-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.18em;font-size:11px;color:${c.muted};font-weight:500;margin-bottom:20px;}
.nc-h{font-family:var(--font-display),Georgia,serif;font-size:40px;line-height:1.06;letter-spacing:-.02em;font-weight:500;margin:0 0 20px;max-width:18ch;}
.nc-lead{font-size:18px;line-height:1.6;color:${c.ink2};margin:0 0 40px;max-width:56ch;}
.nc-lead b{color:${c.ink};font-weight:600;}

.nc-stmt{background:${c.creamCard};border:1px solid ${c.line};border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(27,23,18,.05),0 18px 40px -26px rgba(27,23,18,.20);max-width:840px;margin:0;}
.nc-sh{padding:18px 22px 14px;border-bottom:1px solid ${c.line};display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.nc-st{font-family:var(--font-display),serif;font-weight:600;font-size:16px;letter-spacing:-.01em;}
.nc-shlbl{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.13em;font-size:10.5px;color:${c.faint};font-weight:500;}
.nc-scroll{overflow-x:auto;}
.nc table{width:100%;border-collapse:collapse;min-width:520px;}
.nc thead th{text-align:right;padding:12px 22px 9px;border-bottom:1px solid ${c.line};font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.1em;font-size:9.5px;font-weight:500;color:${c.faint};}
.nc thead th.l{text-align:left;}
.nc thead th.dim{color:${c.lineStrong};}
.nc tbody td{padding:13px 22px;border-bottom:1px solid ${c.line};font-size:13.5px;text-align:right;font-family:var(--font-mono),monospace;font-variant-numeric:tabular-nums;color:${c.ink2};}
.nc tbody td.feat{text-align:left;font-family:var(--font-inter),sans-serif;color:${c.ink};font-weight:600;}
.nc tbody td.feat .m{display:block;font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};font-weight:400;margin-top:2px;}
.nc tbody td.cost{color:${c.ink};}
.nc .redact{filter:blur(5.5px);color:${c.muted};user-select:none;-webkit-user-select:none;}
.nc tr.total td{border-bottom:none;border-top:2px solid ${c.rule};padding-top:14px;font-weight:600;color:${c.ink};}
.nc tr.total td.feat{font-family:var(--font-inter),sans-serif;}
.nc-q{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;border:1px solid ${c.lineStrong};color:${c.muted};font-family:var(--font-mono),monospace;font-size:12px;font-weight:600;vertical-align:-4px;}
.nc-qnote{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.02em;margin-left:8px;}
.nc-cap{font-family:var(--font-mono),monospace;font-size:11.5px;color:${c.muted};letter-spacing:.02em;margin:14px 2px 0;line-height:1.6;}

.nc-fear{font-size:18px;line-height:1.65;color:${c.ink2};margin:44px 0 0;max-width:58ch;}
.nc-fear b{color:${c.ink};font-weight:600;}
.nc-close{font-family:var(--font-display),serif;font-size:24px;line-height:1.3;letter-spacing:-.01em;color:${c.ink};margin:28px 0 0;max-width:24ch;}

@media (max-width:720px){
  .nc{padding:64px 22px 72px;}
  .nc-h{font-size:30px;}
  .nc-lead,.nc-fear{font-size:16px;}
  .nc-close{font-size:20px;}
  .nc tbody td,.nc thead th{padding-left:16px;padding-right:16px;}
}
`;

export function NeedCreation() {
  return (
    <section id="why" className={`nc ${mono.variable} ${inter.variable}`} aria-labelledby="nc-title">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="nc-inner">
        <p className="nc-eyebrow">The other half of the ledger</p>
        <h2 id="nc-title" className="nc-h">Cost is the half you can already see.</h2>
        <p className="nc-lead">
          Your provider bill shows what inference <b>costs</b>. It says nothing about what each feature <b>earns</b> — so it can&rsquo;t tell you which ones actually make money.
        </p>

        <figure
          className="nc-stmt"
          role="img"
          aria-label="A profit statement by feature. The cost column is filled in with real numbers, but the revenue and margin columns are blurred and unreadable, and the bottom-line blended margin is shown as a question mark — the information a cost report cannot give you."
        >
          <div className="nc-sh">
            <div className="nc-st">Profit per 1,000,000 tokens</div>
            <div className="nc-shlbl">What a cost report leaves out</div>
          </div>
          <div className="nc-scroll">
            <table>
              <thead>
                <tr>
                  <th className="l">Feature / model</th>
                  <th>Cost</th>
                  <th className="dim">Revenue</th>
                  <th className="dim">Margin</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.feature}>
                    <td className="feat">{r.feature}<span className="m">{r.model}</span></td>
                    <td className="cost">{r.cost}</td>
                    <td><span className="redact" aria-hidden="true">{r.revenue}</span></td>
                    <td><span className="redact" aria-hidden="true">{r.margin}</span></td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="feat">Blended margin <span style={{ fontWeight: 400, color: c.muted, fontSize: 12 }}>/ 1M (weighted)</span></td>
                  <td className="cost" />
                  <td />
                  <td><span className="nc-q" aria-hidden="true">?</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <figcaption className="nc-cap">A cost report fills the left column. The columns that decide whether you&rsquo;re profitable stay out of focus.</figcaption>
        </figure>

        <p className="nc-fear">
          That blur is where the surprises hide. A feature with soaring usage can lose money on every call. A customer you&rsquo;re proud of can cost more to serve than they pay. A cost report flags <b>neither</b> — a loss looks exactly like a win until you set revenue beside it, feature by feature.
        </p>
        <p className="nc-close">The margin is knowable. You just can&rsquo;t see it yet.</p>
      </div>
    </section>
  );
}
