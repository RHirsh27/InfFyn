import { IBM_Plex_Mono, Inter } from "next/font/google";
import { landing } from "@/lib/landing-theme";

const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });

const c = landing.color;

const css = `
.cc{background:${c.cream};color:${c.ink};font-family:var(--font-inter),system-ui,sans-serif;line-height:1.5;padding:120px 46px 132px;border-top:1px solid ${c.line};text-align:center;}
.cc *{box-sizing:border-box;}
.cc-inner{max-width:680px;margin:0 auto;}
.cc-eyebrow{font-family:var(--font-mono),monospace;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:${c.faint};font-weight:500;margin-bottom:26px;}
.cc-h{font-family:var(--font-display),Georgia,serif;font-size:52px;line-height:1.04;letter-spacing:-.03em;font-weight:500;margin:0 auto;max-width:16ch;}
.cc-h .g{color:${c.profit};}
.cc-rule{width:66px;height:0;border-top:1.5px solid ${c.rule};box-shadow:0 4px 0 -2.5px ${c.rule};margin:34px auto 0;}
.cc-low{font-size:17px;line-height:1.6;color:${c.ink2};margin:34px auto 0;max-width:52ch;}
.cc-low b{color:${c.ink};font-weight:600;}
.cc-cta{margin:36px 0 0;display:flex;justify-content:center;}
.cc-btn{display:inline-block;background:${c.ink};color:${c.creamCard};border:none;border-radius:11px;padding:17px 30px;font-family:var(--font-inter),sans-serif;font-size:16px;font-weight:600;letter-spacing:-.005em;cursor:pointer;text-decoration:none;}
.cc-btn:focus-visible{outline:2px solid ${c.ink};outline-offset:3px;}
.cc-trust{font-family:var(--font-mono),monospace;font-size:12px;color:${c.muted};letter-spacing:.06em;margin:20px 0 0;}

.cc-foot{max-width:680px;margin:96px auto 0;padding-top:22px;border-top:1px solid ${c.line};display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.cc-brand{display:flex;align-items:center;gap:9px;font-family:var(--font-display),serif;font-weight:600;font-size:18px;letter-spacing:-.01em;color:${c.ink};}
.cc-brand .fyn{color:${c.profit};}
.cc-fnote{font-family:var(--font-mono),monospace;font-size:11px;color:${c.faint};letter-spacing:.04em;}

@media (max-width:720px){
  .cc{padding:80px 22px 88px;}
  .cc-h{font-size:36px;}
  .cc-low{font-size:16px;}
  .cc-foot{margin-top:64px;justify-content:center;text-align:center;}
}
`;

export function ClosingCta({ signedIn = false }: { signedIn?: boolean }) {
  const href = signedIn ? "/app" : "/login";
  const label = signedIn ? "Open your dashboard" : "See your margin — free";

  return (
    <section className={`cc ${mono.variable} ${inter.variable}`} aria-labelledby="cc-title">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="cc-inner">
        <p className="cc-eyebrow">The bottom line</p>
        <h2 id="cc-title" className="cc-h">Know the <span className="g">profit</span> on every token you serve.</h2>
        <div className="cc-rule" aria-hidden="true" />
        <p className="cc-low">
          Free to start. Cost insight with <b>no Stripe</b>; the profit view when you connect — read-only.
        </p>
        <div className="cc-cta">
          <a className="cc-btn" href={href}>{label}</a>
        </div>
        <p className="cc-trust">Read-only &middot; revocable &middot; we never write to your Stripe</p>
      </div>

      <div className="cc-foot">
        <div className="cc-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 21 L11 3 L13 9 L6 21 Z" fill={c.ink} />
            <path d="M13 9 L15 3 L21 3 L15.5 15 Z" fill={c.profit} />
          </svg>
          <span>Inf<span className="fyn">Fyn</span></span>
        </div>
        <p className="cc-fnote">The financial controller for AI inference</p>
      </div>
    </section>
  );
}
