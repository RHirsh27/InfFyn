"use client";

import { formatMoney } from "@/lib/audit-v2";
import { PerformanceMonth, Report } from "@/lib/monthly";

const money = (value: string | number | null | undefined) =>
  value == null ? "Unavailable" : formatMoney(String(value));
const count = (value: string | number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    Number(value),
  );
export const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
export function WorkspaceIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    Workloads: "M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4",
    Connections: "M8 3v5 M16 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
    "Monthly Review": "M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12l2 2 5-5 M8 18h7",
    Reports: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8",
    Settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M6 6l1 1 M17 17l1 1 M6 18l1-1 M17 7l1-1",
  };
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.Overview} />
    </svg>
  );
}

export function executiveFindings(report: Report, previous?: PerformanceMonth) {
  const findings: {
    title: string;
    detail: string;
    amount?: string | null;
    tone: string;
    workload?: string;
  }[] = [];
  const r = report.result;
  for (const w of r.workloads) {
    if (w.workload.unallocated) continue;
    const comparison = previous?.comparison.eligible
      ? previous.comparison.workloads.find((x) => x.id === w.workload.id)
      : undefined;
    if (w.summary.contribution != null && Number(w.summary.contribution) < 0)
      findings.push({
        title: `${w.workload.name} has negative contribution`,
        detail:
          "Review pricing, customer mix and included costs before expanding this workload.",
        amount: w.summary.contribution,
        tone: "risk",
        workload: w.workload.id,
      });
    else if (
      comparison?.contribution.amount != null &&
      Number(comparison.contribution.amount) < 0
    )
      findings.push({
        title: `${w.workload.name} contribution declined`,
        detail:
          "Investigate the movement in collections or revenue, volume and delivery cost. This is an association, not proof of cause.",
        amount: comparison.contribution.amount,
        tone: "attention",
        workload: w.workload.id,
      });
    if (w.control_variance != null && Number(w.control_variance) !== 0)
      findings.push({
        title: `Reconcile ${w.workload.name}`,
        detail:
          "Imported cost differs from the independent control. Resolve the discrepancy before relying on the total.",
        amount: w.control_variance,
        tone: "attention",
        workload: w.workload.id,
      });
    if (
      comparison?.unit_cost.percent != null &&
      Number(comparison.unit_cost.percent) < 0
    )
      findings.push({
        title: `${w.workload.name} unit cost improved`,
        detail: `${Math.abs(Number(comparison.unit_cost.percent)).toFixed(1)}% lower cost per ${w.workload.outcome_unit || "accepted outcome"}. Review the volume and quality mix alongside this change.`,
        tone: "neutral",
        workload: w.workload.id,
      });
  }
  if (Number(r.summary.unallocated_cost) !== 0)
    findings.push({
      title: "Shared spend needs a home",
      detail:
        "Assign shared charges to a workload when the evidence supports it. This amount remains included in company spend.",
      amount: r.summary.unallocated_cost,
      tone: "attention",
    });
  if (!r.summary.cost_complete)
    findings.push({
      title: "Cost coverage is incomplete",
      detail:
        "Review missing prices, included supporting costs and company scope. The known total is not a complete company total.",
      tone: "attention",
    });
  const priority: Record<string, number> = {
    risk: 0,
    attention: 1,
    neutral: 2,
  };
  return findings
    .sort(
      (a, b) =>
        priority[a.tone] - priority[b.tone] ||
        Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)),
    )
    .slice(0, 4);
}

export function ExecutiveOverview({
  report,
  performance,
  month,
  onReport,
  onReview,
  onWorkloads,
}: {
  report: Report | null;
  performance: PerformanceMonth[];
  month: string;
  onReport: (id: string) => void;
  onReview: () => void;
  onWorkloads: () => void;
}) {
  if (!report)
    return (
      <section className="monthly-panel company-onboarding">
        <span className="eyebrow">A CLEARER VIEW OF YOUR AI INVESTMENT</span>
        <h2>Your first month starts with a workload.</h2>
        <p>
          Bring together provider costs, business outcomes and revenue. InfFyn
          turns them into an explainable monthly record for your company.
        </p>
        <div className="company-start-grid">
          {[
            [
              "01",
              "Define the work",
              "Name the business activity and what a successful outcome looks like.",
            ],
            [
              "02",
              "Bring the evidence",
              "Connect a provider or upload the exports you already have.",
            ],
            [
              "03",
              "Make the decision",
              "Reconcile the month, investigate the findings and share your report.",
            ],
          ].map((x) => (
            <div key={x[0]}>
              <span>{x[0]}</span>
              <h3>{x[1]}</h3>
              <p>{x[2]}</p>
            </div>
          ))}
        </div>
        <button className="primary" onClick={onWorkloads}>
          Define your first workload →
        </button>
      </section>
    );
  const r = report.result;
  const selected = performance.find((x) => x.report.id === report.id);
  const products = r.workloads.filter(
    (w) => w.workload.kind === "product" && !w.workload.unallocated,
  );
  const internal = r.workloads.filter(
    (w) => w.workload.kind === "internal" && !w.workload.unallocated,
  );
  const productComparable =
    products.length > 0 &&
    products.every((w) => w.summary.contribution !== null) &&
    new Set(products.map((w) => w.revenue_basis)).size === 1;
  const productContribution = productComparable
    ? products.reduce((n, w) => n + Number(w.summary.contribution), 0)
    : null;
  const known = Number(r.summary.known_cost);
  const mapped =
    known > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((known - Number(r.summary.unallocated_cost)) / known) * 100,
          ),
        )
      : null;
  const findings = executiveFindings(report, selected);
  const top = [...r.workloads].sort(
    (a, b) => Number(b.summary.known_cost) - Number(a.summary.known_cost),
  );
  const max = Math.max(
    ...performance.map((x) =>
      Math.abs(Number(x.report.result.summary.known_cost)),
    ),
    1,
  );
  return (
    <>
      <div className="company-summary-strip">
        <span>
          <span
            className={`company-status-dot ${r.summary.cost_complete ? "" : "attention"}`}
          />
          {r.summary.cost_complete
            ? "Complete declared cost scope"
            : "Partial cost coverage"}
        </span>
        <span>
          {r.workloads.length} workloads · {monthLabel(report.month)}
        </span>
        <button onClick={() => onReport(report.id)}>
          View executive report ↗
        </button>
      </div>
      <div className="company-kpis">
        <Kpi
          label="Included workload costs"
          value={money(r.summary.known_cost)}
          note={
            r.summary.cost_complete
              ? "Across the declared company scope"
              : "Known costs · coverage incomplete"
          }
          accent
        />
        <Kpi
          label="Month-over-month spend"
          value={
            selected?.comparison.eligible
              ? money(selected.comparison.spend.amount)
              : "Not comparable"
          }
          note={
            selected?.comparison.eligible
              ? `${selected.comparison.spend.percent == null ? "No prior baseline" : `${Number(selected.comparison.spend.percent).toFixed(1)}% versus prior month`} · movement, not savings`
              : selected?.comparison.reasons[0] ||
                "A second comparable month is needed"
          }
        />
        <Kpi
          label="Product contribution"
          value={money(productContribution)}
          note={
            productComparable
              ? `${products[0].revenue_basis === "collections" ? "Collections" : "Revenue"} less included product costs`
              : "Review revenue basis and evidence by workload"
          }
        />
        <Kpi
          label="Spend assigned"
          value={mapped == null ? "Unavailable" : `${mapped.toFixed(1)}%`}
          note={`${money(r.summary.unallocated_cost)} remains unallocated`}
        />
      </div>
      <div className="company-overview-grid">
        <section className="monthly-panel company-attention">
          <div className="monthly-section-head">
            <div>
              <span className="eyebrow">THIS MONTH’S PRIORITIES</span>
              <h2>Where to focus</h2>
            </div>
            <span className="monthly-badge">{findings.length} findings</span>
          </div>
          {findings.length ? (
            findings.map((f, i) => (
              <div
                className={`company-finding ${f.tone}`}
                key={`${f.title}-${i}`}
              >
                <span className="company-finding-marker">
                  {f.tone === "risk" ? "!" : String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.detail}</p>
                </div>
                {f.amount != null && <strong>{money(f.amount)}</strong>}
              </div>
            ))
          ) : (
            <p>
              No material issues were identified by the available checks. Review
              coverage and assumptions before deciding.
            </p>
          )}
          <button className="company-text-button" onClick={onReview}>
            Open monthly review →
          </button>
        </section>
        <section className="monthly-panel company-trend">
          <div className="monthly-section-head">
            <div>
              <span className="eyebrow">MONTHLY PERSPECTIVE</span>
              <h2>AI spending</h2>
            </div>
            <span className="monthly-badge">USD</span>
          </div>
          <div
            className="company-chart"
            role="group"
            aria-label="Included AI spending by month"
          >
            {performance.map((p) => (
              <button
                key={p.report.id}
                title={`${monthLabel(p.report.month)}: ${money(p.report.result.summary.known_cost)}`}
                className={p.report.id === report.id ? "selected" : ""}
                onClick={() => onReport(p.report.id)}
              >
                <strong>{money(p.report.result.summary.known_cost)}</strong>
                <span className="company-bar-track">
                  <span
                    style={{
                      height: `${Math.max(3, (Math.abs(Number(p.report.result.summary.known_cost)) / max) * 100)}%`,
                    }}
                  />
                </span>
                <small>
                  {new Date(
                    `${p.report.month}-01T12:00:00Z`,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  })}
                </small>
              </button>
            ))}
          </div>
          <p className="company-chart-note">
            Selected immutable report versions. Changes in spend may reflect
            volume, rates, mix or coverage.
          </p>
        </section>
      </div>
      <section className="monthly-panel">
        <div className="monthly-section-head">
          <div>
            <span className="eyebrow">BUSINESS ACTIVITY</span>
            <h2>Workload economics</h2>
          </div>
          <button onClick={onWorkloads}>Manage workloads →</button>
        </div>
        <div className="monthly-table-wrap">
          <table className="company-workload-table">
            <thead>
              <tr>
                <th>Workload / team</th>
                <th>Included spend</th>
                <th>Contribution</th>
                <th>Cost / accepted outcome</th>
                <th>Cost evidence</th>
              </tr>
            </thead>
            <tbody>
              {top.map((w) => (
                <tr key={w.workload.id}>
                  <td>
                    <strong>{w.workload.name}</strong>
                    <small>
                      {w.workload.responsible_team ||
                        (w.workload.kind === "product"
                          ? "Revenue-producing product"
                          : "Internal operations")}
                      {w.workload.unallocated ? " · Unallocated" : ""}
                    </small>
                  </td>
                  <td>
                    <strong>{money(w.summary.known_cost)}</strong>
                    <span className="company-spend-track">
                      <span
                        style={{
                          width: `${known > 0 ? Math.max(0, (Number(w.summary.known_cost) / known) * 100) : 0}%`,
                        }}
                      />
                    </span>
                  </td>
                  <td
                    className={
                      Number(w.summary.contribution) < 0 ? "negative" : ""
                    }
                  >
                    {w.workload.kind === "internal" ? (
                      <span className="company-muted">Not applicable</span>
                    ) : (
                      money(w.summary.contribution)
                    )}
                    {w.workload.kind === "product" && (
                      <small>
                        {w.revenue_basis === "collections"
                          ? "Collections basis"
                          : w.revenue_basis === "recognized"
                            ? "Revenue basis"
                            : "Revenue unavailable"}
                      </small>
                    )}
                  </td>
                  <td>
                    {money(w.outcomes.cost_per_accepted_outcome)}
                    <small>
                      {w.workload.outcome_unit || "No outcome unit defined"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`monthly-badge ${w.confidence.cost.state === "ready" ? "trusted" : ""}`}
                    >
                      {w.confidence.cost.score == null
                        ? "N/A"
                        : `${w.confidence.cost.score}/100`}
                    </span>
                    <small>
                      {w.confidence.cost.state.replaceAll("_", " ")}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="monthly-two-col">
        <section className="monthly-panel">
          <span className="eyebrow">INTERNAL OPERATIONS</span>
          <h2>The cost of useful work</h2>
          {internal.length ? (
            internal.map((w) => (
              <div className="company-outcome" key={w.workload.id}>
                <div>
                  <strong>{w.workload.name}</strong>
                  <small>
                    {count(w.outcomes.accepted_quantity)}{" "}
                    {w.workload.outcome_unit || "accepted outcomes"}
                  </small>
                </div>
                <div>
                  <strong>{money(w.outcomes.cost_per_accepted_outcome)}</strong>
                  <small>
                    {w.outcomes.acceptance_rate == null
                      ? "Acceptance rate unavailable"
                      : `${Number(w.outcomes.acceptance_rate).toFixed(1)}% acceptance`}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p>No internal workloads are included in this report.</p>
          )}
          <p className="company-chart-note">
            Rejected and failed work remains in the cost. Modeled capacity is
            reported separately from financial savings.
          </p>
        </section>
        <section className="monthly-panel">
          <span className="eyebrow">REVIEW CONFIDENCE</span>
          <h2>Evidence, made visible</h2>
          {["cost", "revenue", "outcomes"].map((key) => {
            const scores = r.workloads
              .map((w) => w.confidence[key])
              .filter((s) => s?.score != null);
            const ready = scores.filter((s) => s.state === "ready").length;
            return (
              <div className="company-evidence-row" key={key}>
                <span>
                  {key === "cost"
                    ? "Cost"
                    : key === "revenue"
                      ? "Revenue"
                      : "Outcome"}{" "}
                  checks
                </span>
                <strong>
                  {ready} / {scores.length}
                </strong>
                <small>workloads ready</small>
              </div>
            );
          })}
          <p className="company-chart-note">
            Readiness is a checklist score, not statistical certainty. Separate
            checks keep cost, revenue and outcome assumptions visible.
          </p>
          <button
            className="company-text-button"
            onClick={() => onReport(report.id)}
          >
            Inspect the evidence →
          </button>
        </section>
      </div>
      {month !== report.month && (
        <p className="monthly-notice">
          Showing the saved {monthLabel(report.month)} report. The selected
          reporting month is {monthLabel(month)}.
        </p>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <section className={`company-kpi ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}

export function ExecutiveReport({
  report,
  performance,
  company,
}: {
  report: Report;
  performance: PerformanceMonth[];
  company: string;
}) {
  const findings = executiveFindings(
    report,
    performance.find((x) => x.report.id === report.id),
  );
  return (
    <section className="monthly-panel company-report-cover">
      <div className="company-report-wordmark">
        InfFyn <span>MONTHLY ECONOMICS</span>
      </div>
      {report.result.release_context?.stage === "private_alpha" && (
        <p className="company-report-basis">
          <strong>Private alpha report.</strong> This version was calculated in
          the private alpha. Source and financial-provenance labels below
          describe the supplied evidence.
        </p>
      )}
      <p className="eyebrow">
        {company} / {monthLabel(report.month)}
      </p>
      <h2>
        AI investment.
        <br />
        Business perspective.
      </h2>
      <p className="company-report-deck">
        A review of included AI expenditure, product contribution and
        internal-workload efficiency, supported by the evidence available for
        this period.
      </p>
      <div className="company-report-totals">
        <div>
          <span>Included workload costs</span>
          <strong>{money(report.result.summary.known_cost)}</strong>
        </div>
        <div>
          <span>Workloads reviewed</span>
          <strong>{report.result.workloads.length}</strong>
        </div>
        <div>
          <span>Unallocated cost</span>
          <strong>{money(report.result.summary.unallocated_cost)}</strong>
        </div>
      </div>
      <h3>Executive observations</h3>
      {findings.map((f, i) => (
        <div className="company-report-observation" key={f.title}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <div>
            <strong>
              {f.title}
              {f.amount != null ? ` · ${money(f.amount)}` : ""}
            </strong>
            <p>{f.detail}</p>
          </div>
        </div>
      ))}
      {!findings.length && (
        <p>
          No material findings emerged from the available checks. Review the
          scope and evidence appendix before acting.
        </p>
      )}
      <div className="company-report-basis">
        {!!report.result.reviewed_imports?.length && <details>
          <summary>Reviewed import evidence appendix</summary>
          {report.result.reviewed_imports.map(item => <div key={item.confirmation_id}>
            <strong>{item.field.replace("_csv", "")} · Customer supplied, reviewed</strong>
            <p>Confirmed {new Date(item.confirmed_at).toLocaleDateString()} · {item.counts.included || 0} included rows. Exclusions and unknowns remain part of the evidence basis.</p>
            <p>Confirmation: <code>{item.confirmation_id}</code><br/>Dataset fingerprint: <code>{item.canonical_hash}</code></p>
            <p>{item.limitations.join(" ")}</p>
          </div>)}
          <p>Original source rows expire after 90 days. Historical report summaries retain their approved basis; recalculation after source expiry requires a new upload.</p>
        </details>}
        <strong>Read this report with its basis.</strong>
        <p>
          {report.result.company_scope_complete
            ? "Management declared the company scope complete."
            : "This report does not claim complete company coverage."}{" "}
          Contribution uses each workload’s stated revenue or collections basis
          and included costs. Allocated revenue is modeled; associated revenue
          is not proof that AI caused it. Readiness scores express evidence
          checks, not statistical certainty.
        </p>
      </div>
    </section>
  );
}
