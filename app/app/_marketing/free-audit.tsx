import { IBM_Plex_Mono, Inter } from "next/font/google";
import { landing } from "@/lib/landing-theme";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

const c = landing.color;

const css = `
.fa{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;padding:100px 46px 108px;border-top:1px solid ${c.line};}
.fa *{box-sizing:border-box;}
.fa-inner{max-width:1108px;margin:0 auto;}
.fa-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${c.muted};font-weight:500;margin-bottom:22px;}
.fa-h{font-family:var(--font-display),Georgia,serif;font-size:42px;line-height:1.05;letter-spacing:-.025em;font-weight:500;margin:0 0 18px;max-width:20ch;}
.fa-lead{font-size:18px;line-height:1.62;color:${c.ink2};margin:0 0 44px;max-width:60ch;}
.fa-lead b{color:${c.ink};font-weight:600;}

.fa-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:stretch;max-width:940px;}
.fa-card{background:${c.creamCard};border:1px solid ${c.line};border-radius:12px;padding:24px 24px 22px;display:flex;flex-direction:column;}
.fa-profit{border-color:${c.lineStrong};box-shadow:0 1px 2px rgba(27,23,18,.05),0 18px 40px -26px rgba(27,23,18,.22);}
.fa-chead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;border-bottom:1px solid ${c.line};padding-bottom:14px;margin-bottom:18px;}
.fa-tier{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.11em;font-size:11px;color:${c.ink2};font-weight:600;}
.fa-sub{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.1em;font-size:10px;color:${c.faint};}

.fa-list{list-style:none;margin:0;padding:0;}
.fa-list li{font-size:15px;line-height:1.5;color:${c.ink2};padding:12px 0;border-top:1px solid ${c.line};}
.fa-list li:first-child{border-top:none;padding-top:0;}
.fa-list b{color:${c.ink};font-weight:600;}
.fa-unlock li{color:${c.ink2};}

.fa-illus{display:inline-block;font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${c.faint};margin-top:14px;}

.fa-teaser{margin-top:16px;border:1px dashed ${c.lineStrong};border-radius:9px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:${c.cream};}
.fa-tfeat{font-family:var(--font-inter),sans-serif;font-size:13px;font-weight:600;color:${c.ink};flex:1 1 auto;}
.fa-tfig{font-family:var(--font-mono),monospace;font-size:16px;font-weight:600;color:${c.profit};white-space:nowrap;}
.fa-tfig .blur{filter:blur(5px);user-select:none;-webkit-user-select:none;}
.fa-tfig em{font-style:normal;color:${c.faint};font-weight:400;font-size:11px;}
.fa-tag{font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:${c.muted};border:1px solid ${c.lineStrong};border-radius:999px;padding:3px 9px;white-space:nowrap;}

.fa-cfoot{margin-top:auto;padding-top:22px;}
.fa-btn{display:inline-block;background:${c.ink};color:${c.creamCard};border:none;border-radius:10px;padding:14px 22px;font-family:var(--font-inter),sans-serif;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;}
.fa-btn2{display:inline-block;background:transparent;border:1px solid ${c.lineStrong};border-radius:10px;padding:13px 20px;font-family:var(--font-inter),sans-serif;font-size:14.5px;font-weight:600;color:${c.ink};cursor:pointer;text-decoration:none;}
.fa-btn:focus-visible,.fa-btn2:focus-visible{outline:2px solid ${c.ink};outline-offset:2px;}
.fa-note{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.03em;margin:12px 0 0;}
.fa-trust{font-family:var(--font-mono),monospace;font-size:11px;color:${c.muted};letter-spacing:.05em;margin:12px 0 0;}

.fa-close{font-family:var(--font-display),serif;font-size:22px;line-height:1.4;letter-spacing:-.01em;color:${c.ink};text-align:center;margin:44px auto 0;max-width:34ch;}

@media (max-width:760px){
  .fa{padding:64px 22px 72px;}
  .fa-h{font-size:29px;}
  .fa-lead{font-size:16px;}
  .fa-cols{grid-template-columns:1fr;gap:16px;}
  .fa-close{font-size:19px;}
}
`;

export function FreeAudit() {
  return (
    <section id="pricing" className={`fa ${mono.variable} ${inter.variable}`} aria-labelledby="fa-title">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="fa-inner">
        <p className="fa-eyebrow">Start free</p>
        <h2 id="fa-title" className="fa-h">A free spend audit that&rsquo;s actually worth sharing.</h2>
        <p className="fa-lead">
          Connect your usage and get a specific, comparative read on where your inference money goes — <b>no Stripe, no commitment</b>. The profit view unlocks when you connect Stripe, read-only.
        </p>

        <div className="fa-cols">
          <div className="fa-card fa-free">
            <div className="fa-chead">
              <span className="fa-tier">Free</span>
              <span className="fa-sub">from your usage</span>
            </div>
            <ul className="fa-list">
              <li>GPT-4o costs <b>3.2&times;</b> more per output token than Claude 3.5 Sonnet on your workload.</li>
              <li>One feature — <b>Doc Search</b> — is <b>61%</b> of your inference spend.</li>
              <li>Priciest model by real usage: <b>gpt-4o</b> — 44% of tokens, 68% of cost.</li>
            </ul>
            <span className="fa-illus">Illustrative</span>
            <div className="fa-cfoot">
              <a className="fa-btn" href="/login">Get your free audit</a>
              <p className="fa-note">No Stripe. No commitment.</p>
            </div>
          </div>

          <div className="fa-card fa-profit">
            <div className="fa-chead">
              <span className="fa-tier">With read-only Stripe</span>
              <span className="fa-sub">the profit view</span>
            </div>
            <ul className="fa-list fa-unlock">
              <li>Profit per feature — every figure <b>Actual</b> or <b>Modeled</b>.</li>
              <li>Profit per customer.</li>
              <li>Which features quietly run at a loss.</li>
            </ul>
            <div className="fa-teaser" role="img" aria-label="Your profit per feature, a green figure that is blurred and unlocks when you connect Stripe.">
              <span className="fa-tfeat">Your profit per feature</span>
              <span className="fa-tfig">+$<span className="blur" aria-hidden="true">00.00</span> <em>/1M</em></span>
              <span className="fa-tag">Unlocks with Stripe</span>
            </div>
            <div className="fa-cfoot">
              {/* P5: Stripe brand cue at the conversion moment. Uses Stripe's brand
                  purple (#635BFF) on the wordmark. For full brand compliance, swap this
                  span for the official Stripe wordmark SVG from stripe.com/newsroom/brand-assets. */}
              <a className="fa-btn2" href="/login">
                Connect <span style={{ color: "#635BFF", fontWeight: 700 }}>Stripe</span> &mdash; read-only
              </a>
              <p className="fa-trust">Read-only &middot; revocable &middot; we never write to your Stripe</p>
            </div>
          </div>
        </div>

        <p className="fa-close">Start with what you&rsquo;re spending. See what you&rsquo;re earning when you&rsquo;re ready.</p>
      </div>
    </section>
  );
}
