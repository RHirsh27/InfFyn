import Link from "next/link";
import "@/components/audit/workspace.css";
export default function Pricing() {
  return (
    <div className="audit-shell">
      <main
        className="audit-content"
        style={{ maxWidth: 850, margin: "40px auto" }}
      >
        <Link href="/">InfFyn</Link>
        <p className="eyebrow">ONE COMPANY WORKSPACE</p>
        <h1>
          $349 <span className="muted">/ month</span>
        </h1>
        <p>
          Monthly AI economics for revenue-producing products and internal
          tools.
        </p>
        <ul>
          <li>
            Upload real usage, variable costs, revenue and outcome CSV files.
          </li>
          <li>
            Review OpenAI, Anthropic and Stripe imports as each connector is
            activated.
          </li>
          <li>
            Trace customer contribution, feature allocations and cost per
            accepted outcome.
          </li>
          <li>
            Track monthly spending, contribution and cost per accepted outcome.
          </li>
          <li>
            Inspect separate cost, revenue and outcome evidence scores. Save and
            export immutable report versions.
          </li>
        </ul>
        <p>
          Monthly billing. No automatic subscription begins from a free preview
          or a complimentary invitation. Any applicable tax and the final total
          are shown at checkout. Your company owner manages billing.
        </p>
        <Link className="primary link-button" href="/login?next=/app/monthly">
          Open your workspace →
        </Link>
        <p>
          Invited companies receive full complimentary access until revoked,
          with no card required. Revocation does not start billing.
        </p>
        <p className="small muted">
          Live activation depends on the released workspace.{" "}
          <Link href="/privacy">Data retention</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </p>
      </main>
    </div>
  );
}
