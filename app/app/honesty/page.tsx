import type { Metadata } from "next";
import Link from "next/link";
import { landing } from "@/lib/landing-theme";

export const metadata: Metadata = {
  title: "The honesty layer — InfFyn | How we stay honest about AI margin",
  description:
    "Every number labeled Actual vs Modeled, feature revenue treated as an estimate, sensitivity that tells you which conclusions hold up, and a flattering allocation method we refuse to use. The discipline behind numbers you can defend.",
  alternates: { canonical: "/honesty" },
  openGraph: {
    title: "The honesty layer — InfFyn",
    description:
      "A number you can't trust is worse than no number. The discipline behind InfFyn's margin figures — labeled, tested, and honest about what's modeled.",
    type: "website",
  },
};

const c = landing.color;

const pillars = [
  {
    n: "01",
    title: "Every number carries its evidence basis.",
    body: [
      "Uploaded costs and revenue remain Customer supplied. Reference rates and allocations are Modeled. A connection alone does not verify a number or its attribution; Actual requires observed evidence on both sides.",
      "Contribution means revenue less the costs included in this audit. It is not company-wide gross profit. Missing prices remain visible and withhold complete contribution, rather than becoming zero.",
    ],
  },
  {
    n: "02",
    title: "A revenue association has limits.",
    body: [
      "When a customer pays for a bundle, there is no true, per-feature revenue hiding inside it — the money arrived as one payment for the whole thing. Pretending you can recover an exact number for each feature is the original sin of most “profit per feature” tools.",
      "A directly supported feature association retains its source. A split across features is Modeled and names its method. Unmapped revenue stays visible. Neither association nor allocation proves that AI caused the revenue.",
    ],
  },
  {
    n: "03",
    title: "Sensitivity: we tell you which conclusions hold up.",
    body: [
      "Some conclusions don't care how you split shared revenue — a feature that's deeply underwater is underwater no matter how you slice it. Others flip the moment you change an assumption.",
      "Where shared feature revenue is allocated, we compare request-weighted and equal allocation. The report identifies material changes across those two methods. Stability within that comparison is not a guarantee across every possible assumption.",
    ],
  },
  {
    n: "04",
    title: "Cost does not determine allocated revenue.",
    body: [
      "Splitting revenue in proportion to cost can conceal the differences you wanted to investigate. InfFyn does not offer cost-proportional revenue allocation.",
      "You can retain direct associations, leave revenue unmapped, or explicitly compare the supported allocation methods. The method stays with the saved audit.",
    ],
  },
  {
    n: "05",
    title: "Internal work needs outcome evidence.",
    body: [
      "Internal workflows have no assumed revenue. Cost per accepted outcome requires a complete run cohort and cost boundary, including failed work, retries and human review.",
      "Capacity value uses your supplied effort and labor-rate assumptions. It is an estimate of released capacity, not automatically cash savings or proven return on investment.",
    ],
  },
  {
    n: "06",
    title: "The same honesty applies to your data.",
    body: [
      "The customer Stripe connection reads evidence and is revocable. InfFyn subscription payments use a separate hosted billing flow on InfFyn's own account.",
      "A reviewed revenue CSV is also supported. Saved audits retain their calculation and evidence basis; export and deletion follow the retention terms shown when the workspace is available.",
    ],
  },
];

const refusals = [
  "Present a modeled number as a fact.",
  "Invent a single “true” per-feature revenue where none exists.",
  "Hide which conclusions depend on your assumptions.",
  "Treat internal capacity estimates as cash savings.",
  "Modify billing records through the customer evidence connection.",
];

const css = `
.hl{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;min-height:100vh;}
.hl *{box-sizing:border-box;}
.hl .serif{font-family:var(--font-display),Georgia,serif;}
.hl .mono{font-family:var(--font-mono),ui-monospace,Menlo,monospace;}
.hl-top{max-width:860px;margin:0 auto;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;}
.hl-brand{display:flex;align-items:center;gap:9px;font-family:var(--font-display),serif;font-weight:600;font-size:20px;letter-spacing:-.01em;color:${c.ink};text-decoration:none;}
.hl-brand .fyn{color:${c.profit};}
.hl-back{color:${c.ink2};text-decoration:none;font-size:14.5px;}
.hl-head{max-width:860px;margin:0 auto;padding:40px 32px 8px;}
.hl-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${c.muted};margin-bottom:22px;}
.hl-h1{font-family:var(--font-display),Georgia,serif;font-size:46px;line-height:1.06;letter-spacing:-.03em;font-weight:500;margin:0;max-width:16ch;}
.hl-h1 .u{box-shadow:inset 0 -2px 0 ${c.profitWash};}
.hl-intro{font-size:18px;line-height:1.62;color:${c.ink2};margin:24px 0 0;max-width:62ch;}
.hl-intro b{color:${c.ink};font-weight:600;}

.hl-illus{max-width:860px;margin:36px auto 0;padding:0 32px;}
.hl-card{background:${c.creamCard};border:1px solid ${c.line};border-radius:12px;overflow:hidden;}
.hl-ch{padding:14px 20px;border-bottom:1px solid ${c.line};display:flex;align-items:center;justify-content:space-between;gap:12px;}
.hl-ct{font-family:var(--font-display),serif;font-weight:600;font-size:15px;}
.hl-illlbl{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.13em;font-size:10px;color:${c.faint};border:1px solid ${c.lineStrong};border-radius:999px;padding:3px 9px;}
.hl-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 20px;border-bottom:1px solid ${c.line};}
.hl-row:last-child{border-bottom:none;}
.hl-rl{font-size:14px;color:${c.ink};font-weight:500;}
.hl-rr{display:flex;align-items:center;gap:14px;}
.hl-num{font-family:var(--font-mono),monospace;font-variant-numeric:tabular-nums;font-size:14px;color:${c.ink2};}
.hl-num.pos{color:${c.ink};font-weight:600;}
.hl-num.neg{color:${c.loss};font-weight:600;}
.hl-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.05em;padding:3px 8px;border-radius:999px;border:1px solid ${c.lineStrong};color:${c.muted};white-space:nowrap;}
.hl-chip .cd{width:6px;height:6px;border-radius:50%;}
.hl-chip.act{border-color:${c.chipActualBorder};color:${c.profit};}
.hl-chip.act .cd{background:${c.profit};}
.hl-chip.mod .cd{border:1.5px solid ${c.faint};}
.hl-capt{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};margin:12px 2px 0;letter-spacing:.03em;}

.hl-list{max-width:860px;margin:0 auto;padding:52px 32px 8px;display:grid;gap:6px;}
.hl-p{display:grid;grid-template-columns:64px 1fr;gap:8px;padding:30px 0;border-top:1px solid ${c.line};}
.hl-p:first-child{border-top:1px solid ${c.rule};}
.hl-pn{font-family:var(--font-mono),monospace;font-size:13px;color:${c.faint};letter-spacing:.06em;padding-top:5px;}
.hl-pt{font-family:var(--font-display),serif;font-size:23px;line-height:1.22;letter-spacing:-.01em;font-weight:600;margin:0 0 12px;}
.hl-pb{font-size:15.5px;line-height:1.62;color:${c.ink2};margin:0 0 12px;max-width:64ch;}
.hl-pb:last-child{margin-bottom:0;}

.hl-refuse{max-width:860px;margin:24px auto 0;padding:0 32px;}
.hl-rbox{background:${c.creamCard};border:1px solid ${c.lineStrong};border-radius:12px;padding:28px 30px;}
.hl-rk{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:${c.muted};margin:0 0 16px;}
.hl-rt{font-family:var(--font-display),serif;font-size:22px;letter-spacing:-.01em;font-weight:600;margin:0 0 18px;}
.hl-rul{list-style:none;margin:0;padding:0;display:grid;gap:11px;}
.hl-rul li{display:flex;align-items:flex-start;gap:11px;font-size:15px;color:${c.ink};line-height:1.5;}
.hl-x{color:${c.loss};font-family:var(--font-mono),monospace;font-weight:600;flex:none;line-height:1.5;}

.hl-close{max-width:860px;margin:0 auto;padding:56px 32px 40px;}
.hl-crule{border-top:2px solid ${c.rule};box-shadow:0 3px 0 -1px ${c.rule};height:0;margin-bottom:30px;}
.hl-cq{font-family:var(--font-display),serif;font-size:27px;line-height:1.24;letter-spacing:-.01em;font-weight:500;margin:0 0 24px;max-width:22ch;}
.hl-cq .g{color:${c.profit};}
.hl-cta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.hl-btn{background:${c.ink};color:${c.creamCard};border:none;border-radius:10px;padding:15px 24px;font-family:var(--font-inter),sans-serif;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;}
.hl-btn2{background:transparent;border:1px solid ${c.lineStrong};border-radius:10px;padding:15px 22px;font-size:15px;font-weight:500;color:${c.ink};text-decoration:none;display:inline-block;}
.hl-trust{margin-top:22px;color:${c.muted};font-family:var(--font-mono),monospace;font-size:12px;letter-spacing:.08em;}

.hl-foot{max-width:860px;margin:0 auto;padding:22px 32px 60px;border-top:1px solid ${c.line};display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.hl-fnote{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.04em;}

.hl a:focus-visible,.hl-btn:focus-visible,.hl-btn2:focus-visible{outline:2px solid ${c.profit};outline-offset:3px;border-radius:6px;}
@media (prefers-reduced-motion: reduce){.hl *{transition:none !important;animation:none !important;}}
@media (max-width:640px){
  .hl-h1{font-size:33px;}
  .hl-top,.hl-head,.hl-illus,.hl-list,.hl-refuse,.hl-close,.hl-foot{padding-left:20px;padding-right:20px;}
  .hl-p{grid-template-columns:1fr;gap:2px;}
  .hl-pn{padding-top:0;}
  .hl-back{display:none;}
  .hl-row{flex-direction:column;align-items:flex-start;gap:8px;}
}
`;

export default function HonestyPage() {
  return (
    <div className="hl">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="hl-top">
        <Link className="hl-brand" href="/">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={c.ink} />
            <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={c.profit} />
          </svg>
          <span>
            Inf<span className="fyn">Fyn</span>
          </span>
        </Link>
        <Link className="hl-back" href="/">
          ← Back to home
        </Link>
      </header>

      <section className="hl-head">
        <p className="hl-eyebrow">The honesty layer</p>
        <h1 className="hl-h1">
          A number you can&rsquo;t trust is{" "}
          <span className="u">worse than no number.</span>
        </h1>
        <p className="hl-intro">
          InfFyn brings AI usage, included costs and outcome evidence into a
          reviewed audit. Each result shows the sources, mappings and
          assumptions you need to <b>explain the number</b>. These are the
          limits behind the figures.
        </p>
      </section>

      {/* Illustrative ledger — labeled ILLUSTRATIVE, because we practice what we preach */}
      <div className="hl-illus">
        <div className="hl-card">
          <div className="hl-ch">
            <span className="hl-ct">How a line reads</span>
            <span className="hl-illlbl">Illustrative</span>
          </div>
          <div className="hl-row">
            <span className="hl-rl">
              Enterprise Search API &mdash; supplied revenue &amp; cost
            </span>
            <span className="hl-rr">
              <span className="hl-num pos">+$76.80</span>
              <span className="hl-chip">
                <span className="cd" />
                Customer supplied
              </span>
            </span>
          </div>
          <div className="hl-row">
            <span className="hl-rl">
              Support Copilot &mdash; revenue split from a bundle
            </span>
            <span className="hl-rr">
              <span className="hl-num pos">+$32.60</span>
              <span className="hl-chip mod">
                <span className="cd" />
                Modeled
              </span>
            </span>
          </div>
          <div className="hl-row">
            <span className="hl-rl">
              Free-tier Autocomplete &mdash; runs underwater
            </span>
            <span className="hl-rr">
              <span className="hl-num neg">($8.65)</span>
              <span className="hl-chip mod">
                <span className="cd" />
                Modeled
              </span>
            </span>
          </div>
        </div>
        <p className="hl-capt">
          Illustrative figures. A supplied record is distinct from independently
          observed evidence, and both are distinct from an estimate.
        </p>
      </div>

      <main className="hl-list" aria-label="Trust principles">
        {pillars.map((p) => (
          <article className="hl-p" key={p.n}>
            <div className="hl-pn">{p.n}</div>
            <div>
              <h2 className="hl-pt">{p.title}</h2>
              {p.body.map((para, i) => (
                <p className="hl-pb" key={i}>
                  {para}
                </p>
              ))}
            </div>
          </article>
        ))}
      </main>

      <div className="hl-refuse">
        <div className="hl-rbox">
          <p className="hl-rk">The short version</p>
          <h2 className="hl-rt">What we refuse to do.</h2>
          <ul className="hl-rul">
            {refusals.map((r) => (
              <li key={r}>
                <span className="hl-x" aria-hidden="true">
                  &times;
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="hl-close">
        <div className="hl-crule" aria-hidden="true" />
        <p className="hl-cq">
          Review your AI economics, with the evidence and assumptions beside the
          numbers.
        </p>
        <div className="hl-cta">
          <Link className="hl-btn" href="/audit">
            Start a free cost preview
          </Link>
          <Link className="hl-btn2" href="/app/audits">
            Open your workspace
          </Link>
        </div>
        <p className="hl-trust">
          REVIEWABLE INPUTS · EXPLICIT ASSUMPTIONS · SAVED VERSIONS
        </p>
      </section>

      <footer className="hl-foot">
        <span className="hl-fnote">AI economics, with evidence</span>
        <Link className="hl-back" href="/blog">
          Read the blog →
        </Link>
      </footer>
    </div>
  );
}
