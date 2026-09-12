import Link from "next/link";
import "./workspace.css";

export function AuditHome({
  hostedPreview = false,
}: {
  hostedPreview?: boolean;
}) {
  return (
    <div className="audit-shell">
      <div className="audit-main">
        <header className="audit-top">
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display),Georgia,serif",
              fontSize: 29,
              letterSpacing: "-.06em",
            }}
          >
            InfFyn
          </Link>
          <div>
            <Link href="/pricing">Pricing</Link>
            <Link href="/honesty">Our evidence standard</Link>
            <Link href={hostedPreview ? "/demo/monthly" : "/login?next=/app/monthly"}>
              {hostedPreview ? "Explore company demo ↗" : "Sign in ↗"}
            </Link>
          </div>
        </header>
        <main
          className="audit-content"
          style={{ maxWidth: 1190, paddingTop: 85 }}
        >
          <div className="eyebrow">AI ECONOMICS FOR YOUR COMPANY</div>
          <h1
            style={{
              fontSize: "clamp(40px,5.2vw,72px)",
              maxWidth: 850,
              marginTop: 20,
            }}
          >
            Your AI spend deserves
            <br />
            a financial explanation.
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "var(--muted)",
              maxWidth: 670,
              margin: "26px 0 30px",
            }}
          >
            Know what AI costs your company, which products and internal workflows
            justify that cost, and what changed this month. Built for finance teams
            managing thousands to tens of thousands in monthly AI expenditure.
          </p>
          <div className="file-actions">
            <Link
              className="primary link-button"
              href={hostedPreview ? "/demo/monthly" : "/login?next=/app/monthly"}
            >
              {hostedPreview
                ? "Explore the company workspace →"
                : "Start your company workspace →"}
            </Link>
            <Link className="text-button" href={hostedPreview ? "/review" : "/demo/monthly"}>
              {hostedPreview ? "Try an individual CSV audit ↗" : "Explore the synthetic company demo ↗"}
            </Link>
          </div>
          <p className="small muted">
            {hostedPreview
              ? "Explore six months of clearly labeled synthetic company data. The demonstration is isolated from customer accounts and never connects to live providers."
              : "Start with your existing exports and supported provider reports. Your company owns its workspace; no FynScale OS account is required."}
          </p>
          <p className="small muted">
            <Link href="/privacy">Data retention</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </p>
          <div className="result-columns" style={{ marginTop: 60 }}>
            <section className="paper">
              <span className="eyebrow">01 / CUSTOMER PRODUCTS</span>
              <h2>Find the customers and features that erode contribution.</h2>
              <p className="muted">
                Join reviewed revenue to the costs of serving a customer. Keep
                ambiguous feature allocations visible, and test whether the
                conclusion changes with the method.
              </p>
              <p className="small">
                Revenue association is not proof that AI caused revenue.
              </p>
            </section>
            <section className="paper">
              <span className="eyebrow">02 / INTERNAL WORKFLOWS</span>
              <h2>See the cost of an accepted outcome.</h2>
              <p className="muted">
                Include inference, tools, compute, failed work and human review.
                Compare those costs with accepted results and clearly modeled
                capacity value.
              </p>
              <p className="small">
                Time released is not automatically money saved.
              </p>
            </section>
          </div>
          <section className="paper" style={{ margin: "26px 0 45px" }}>
            <div className="eyebrow">A REVIEWABLE RECORD, EVERY TIME</div>
            <h2>Useful conclusions start with honest inputs.</h2>
            <div className="evidence-cards">
              <div className="evidence-card">
                <strong>Explicit evidence</strong>
                <p>
                  Supplied records, reference estimates and missing values carry
                  their own labels.
                </p>
              </div>
              <div className="evidence-card">
                <strong>Saved versions</strong>
                <p>
                  Retain the period, calculation version and assumptions behind
                  a shared report.
                </p>
              </div>
              <div className="evidence-card">
                <strong>Monthly audit workspace</strong>
                <p>
                  Compare spending, contribution, and cost per accepted outcome
                  across compatible months. $349 per company per month.
                </p>
              </div>
            </div>
          </section>
          <footer className="workspace-footnote">
            <span>InfFyn · AI economics, with evidence.</span>
            <Link href={hostedPreview ? "/demo/monthly" : "/login?next=/app/monthly"}>
              Open the company workspace →
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
