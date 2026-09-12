import { IBM_Plex_Mono, Inter } from "next/font/google";
import { landing } from "@/lib/landing-theme";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

const c = landing.color;

const css = `
.hw{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;padding:100px 46px 108px;border-top:1px solid ${c.line};}
.hw *{box-sizing:border-box;}
.hw-inner{max-width:1108px;margin:0 auto;}
.hw-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${c.muted};font-weight:500;margin-bottom:22px;}
.hw-h{font-family:var(--font-display),Georgia,serif;font-size:42px;line-height:1.05;letter-spacing:-.025em;font-weight:500;margin:0 0 18px;max-width:19ch;}
.hw-lead{font-size:18px;line-height:1.62;color:${c.ink2};margin:0 0 28px;max-width:56ch;}
.hw-lead b{color:${c.ink};font-weight:600;}
.hw-rule{height:1px;background:${c.line};margin:0 0 44px;max-width:760px;}

.hw-steps{list-style:none;margin:0;padding:0;max-width:760px;}
.hw-step{display:grid;grid-template-columns:56px 1fr;gap:26px;padding-bottom:46px;}
.hw-step:last-child{padding-bottom:0;}
.hw-rail{position:relative;}
.hw-num{width:40px;height:40px;border:1px solid ${c.lineStrong};border-radius:10px;background:${c.creamCard};display:flex;align-items:center;justify-content:center;font-family:var(--font-mono),monospace;font-size:12px;font-weight:600;color:${c.ink2};letter-spacing:.05em;}
.hw-step:not(:last-child) .hw-rail::after{content:"";position:absolute;left:20px;top:48px;bottom:-6px;width:1px;background:${c.line};}
.hw-kick{font-family:var(--font-mono),monospace;font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:${c.faint};margin:8px 0 6px;}
.hw-t{font-family:var(--font-display),serif;font-size:22px;font-weight:600;letter-spacing:-.01em;margin:0 0 10px;}
.hw-d{font-size:16px;line-height:1.64;color:${c.ink2};margin:0;max-width:52ch;}
.hw-d b{color:${c.ink};font-weight:600;}

.hw-detail{margin-top:16px;}
.hw-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.hw-chip{display:inline-flex;font-family:var(--font-mono),monospace;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;padding:5px 10px;border-radius:7px;border:1px solid ${c.lineStrong};color:${c.muted};background:${c.creamCard};}
.hw-micro{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.03em;margin:10px 0 0;}
.hw-formula{font-family:var(--font-mono),monospace;font-size:12.5px;color:${c.ink2};background:${c.creamCard};border:1px solid ${c.line};border-radius:9px;padding:12px 14px;letter-spacing:.01em;overflow-x:auto;white-space:nowrap;}
.hw-formula .op,.hw-formula .arrow{color:${c.faint};}
.hw-method{font-family:var(--font-mono),monospace;font-size:11px;color:${c.muted};letter-spacing:.02em;margin:9px 2px 0;}
.hw-method b{color:${c.ink2};font-weight:600;}

.hw-out{border:1px solid ${c.line};border-radius:10px;overflow:hidden;background:${c.creamCard};}
.hw-ohead{display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid ${c.line};font-family:var(--font-mono),monospace;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:${c.faint};}
.hw-outrow{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid ${c.line};flex-wrap:wrap;}
.hw-outrow:last-child{border-bottom:none;}
.hw-outfeat{font-family:var(--font-inter),sans-serif;font-size:13px;font-weight:600;color:${c.ink};flex:1 1 160px;min-width:130px;}
.hw-outfeat .m{display:block;font-family:var(--font-mono),monospace;font-size:10px;color:${c.faint};font-weight:400;margin-top:2px;}
.hw-fig{font-family:var(--font-mono),monospace;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;}
.hw-fig em{font-style:normal;color:${c.faint};font-weight:400;font-size:11px;}
.hw-pos{color:${c.profit};}
.hw-neg{color:${c.loss};}
.hw-pchip{display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono),monospace;font-size:9.5px;letter-spacing:.04em;padding:2px 7px;border-radius:999px;border:1px solid ${c.lineStrong};color:${c.muted};}
.hw-pchip .cd{width:6px;height:6px;border-radius:50%;}
.hw-pchip.act{border-color:${c.chipActualBorder};color:${c.profit};}
.hw-pchip.act .cd{background:${c.profit};}
.hw-pchip.mod .cd{border:1.5px solid ${c.faint};}
.hw-basis{font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.03em;color:${c.faint};white-space:nowrap;}
.hw-ofoot{padding:9px 14px;font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.04em;color:${c.muted};background:${c.cream};border-top:1px solid ${c.line};}

@media (max-width:720px){
  .hw{padding:64px 22px 72px;}
  .hw-h{font-size:29px;}
  .hw-lead,.hw-d{font-size:16px;}
  .hw-step{grid-template-columns:44px 1fr;gap:18px;}
  .hw-num{width:36px;height:36px;}
  .hw-step:not(:last-child) .hw-rail::after{left:18px;top:44px;}
  .hw-outfeat{flex:1 1 100%;}
}
`;

export function HowItWorks() {
  return (
    <section id="how" className={`hw ${mono.variable} ${inter.variable}`} aria-labelledby="hw-title">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="hw-inner">
        <p className="hw-eyebrow">The method</p>
        <h2 id="hw-title" className="hw-h">A margin you can audit — from token to bottom line.</h2>
        <p className="hw-lead">
          Three moves take you from raw usage to labeled profit. Every number traces back to the inputs behind it — so you can <b>check our work</b>.
        </p>
        <div className="hw-rule" />

        <ol className="hw-steps">
          <li className="hw-step">
            <div className="hw-rail"><span className="hw-num" aria-hidden="true">01</span></div>
            <div className="hw-body">
              <p className="hw-kick">Connect</p>
              <h3 className="hw-t">Usage and revenue, in.</h3>
              <p className="hw-d">
                Token usage in; revenue in through <b>read-only</b> Stripe. It works on day one and sharpens as you add sources — no integration project, revocable in a click.
              </p>
              <div className="hw-detail">
                <div className="hw-chips">
                  <span className="hw-chip">Usage in</span>
                  <span className="hw-chip">Revenue · Stripe (read-only)</span>
                </div>
                <p className="hw-micro">Read-only · revocable anytime · minutes</p>
              </div>
            </div>
          </li>

          <li className="hw-step">
            <div className="hw-rail"><span className="hw-num" aria-hidden="true">02</span></div>
            <div className="hw-body">
              <p className="hw-kick">Allocate</p>
              <h3 className="hw-t">Attribute margin — and show the method.</h3>
              <p className="hw-d">
                We set usage against live model prices and your revenue, then attribute margin per feature and per customer. Shared revenue is split by an explicit, inspectable method — <b>never collapsed into one convenient number</b>.
              </p>
              <div className="hw-detail">
                <div className="hw-formula" aria-label="usage times live price, set against revenue, allocated to margin per feature and per customer">
                  usage <span className="op">×</span> live price <span className="op">×</span> revenue <span className="arrow">→</span> margin · per feature · per customer
                </div>
                <p className="hw-method">allocation method: <b>usage-weighted token share</b> — shown, not hidden</p>
              </div>
            </div>
          </li>

          <li className="hw-step" id="honesty">
            <div className="hw-rail"><span className="hw-num" aria-hidden="true">03</span></div>
            <div className="hw-body">
              <p className="hw-kick">Read</p>
              <h3 className="hw-t">Margin you can trust.</h3>
              <p className="hw-d">
                Profit per feature and per customer — each figure labeled <b>Actual</b> or <b>Modeled</b>, each conclusion carrying a sensitivity read. Where a split is assumption-driven, we say so, and show how far it could move the answer.
              </p>
              <div className="hw-detail">
                <div className="hw-out" role="img" aria-label="Sample labeled output. Contract Review API on gpt-4o: plus 61.40 dollars margin per 1M tokens, actual basis (exact join), sensitivity stable. Ticket Autoresponder on gpt-4o-mini: minus 3.95 dollars per 1M tokens, modeled basis (usage-weighted), sensitivity volatile. Every figure traces back to its inputs.">
                  <div className="hw-ohead"><span>Feature · margin /1M</span><span>Basis · sensitivity</span></div>
                  <div className="hw-outrow">
                    <span className="hw-outfeat">Contract Review API<span className="m">gpt-4o</span></span>
                    <span className="hw-fig hw-pos">+$61.40 <em>/1M</em></span>
                    <span className="hw-pchip act"><span className="cd" />ACTUAL</span>
                    <span className="hw-basis">exact join · stable</span>
                  </div>
                  <div className="hw-outrow">
                    <span className="hw-outfeat">Ticket Autoresponder<span className="m">gpt-4o-mini</span></span>
                    <span className="hw-fig hw-neg">−$3.95 <em>/1M</em></span>
                    <span className="hw-pchip mod"><span className="cd" />MODELED</span>
                    <span className="hw-basis">usage-weighted · volatile</span>
                  </div>
                  <div className="hw-ofoot">Every figure traces back to its inputs.</div>
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
