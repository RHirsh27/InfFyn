import Link from "next/link";
import type { ReactNode } from "react";
import {
  ComparisonExample,
  ConfidenceExample,
  CostExample,
  ExampleStatus,
  InvoiceExample,
  MethodologyEvidence,
  OutcomeExample,
  ValueExample,
  VersionExample,
} from "./examples";
import "./methodology.css";

export const metadata = {
  title: "How InfFyn calculates AI economics | Methodology",
  description:
    "Inspect the cost, allocation, evidence and comparison methods behind InfFyn. Worked examples use the same calculation engine as the company demonstration.",
};
const sections = [
  ["costs", "01", "What counts as cost"],
  ["value", "02", "How cost connects to value"],
  ["allocations", "03", "Collections & allocation"],
  ["confidence", "04", "Evidence confidence"],
  ["outcomes", "05", "Accepted outcomes"],
  ["comparisons", "06", "Monthly comparisons"],
  ["record", "07", "Limits & the audit record"],
];

export default function Methodology() {
  const preview = process.env.INFFYN_PREVIEW_MODE === "true";
  return (
    <div className="method-shell">
      <a className="method-skip" href="#method-content">
        Skip to methodology
      </a>
      <header className="method-header">
        <Link href="/" className="method-brand">
          Inf<span>Fyn</span>
          <small>AI ECONOMICS</small>
        </Link>
        <nav aria-label="Product navigation">
          <Link href="/demo/monthly">Company demonstration</Link>
          <Link
            href="/examples/InfFyn-Northstar-August-2026.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            Example report ↗
          </Link>
          <Link
            className="method-button"
            href={preview ? "/demo/monthly" : "/app/monthly"}
          >
            {preview ? "Explore the demo" : "Open workspace"} →
          </Link>
        </nav>
      </header>
      <MethodologyEvidence>
        <div className="method-hero">
          <div>
            <p className="method-eyebrow">THE INFFYN METHODOLOGY</p>
            <h1>
              A financial conclusion
              <br />
              should show its work.
            </h1>
            <p className="method-hero-deck">
              Follow the evidence from an AI charge to a business workload, a
              useful outcome and a monthly decision. Every calculation has a
              boundary. Every assumption keeps its label.
            </p>
            <div className="method-hero-actions">
              <a className="method-button light" href="#costs">
                Follow the calculation ↓
              </a>
              <Link
                href="/examples/InfFyn-Northstar-August-2026.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download the executive example ↗
              </Link>
            </div>
          </div>
          <div className="method-hero-note">
            <span className="method-note-index">THE CORE DISCIPLINE</span>
            <p>
              Cost has a source.
              <br />
              Allocation has a method.
              <br />
              Value needs evidence.
            </p>
            <span>A good score never turns an assumption into a fact.</span>
          </div>
        </div>
        <div className="method-status-wrap">
          <ExampleStatus />
        </div>
        <div className="method-layout">
          <aside className="method-index">
            <span>ON THIS PAGE</span>
            <nav aria-label="Methodology sections">
              {sections.map(([id, n, label]) => (
                <a href={`#${id}`} key={id}>
                  <small>{n}</small>
                  {label}
                </a>
              ))}
            </nav>
            <div className="method-index-note">
              <strong>
                One real engine.
                <br />
                One synthetic company.
              </strong>
              <p>
                The examples load from Northstar Intelligence’s calculated
                August report. They demonstrate behavior without using customer
                records.
              </p>
            </div>
          </aside>
          <main id="method-content" className="method-content">
            <Section
              id="costs"
              n="01"
              eyebrow="START WITH THE ECONOMIC BOUNDARY"
              title="A provider bill is the starting point."
            >
              <p className="method-lead">
                A workload is a repeatable business activity whose economics you
                want to understand. Define its owner, accepted output and
                included cost scope before comparing performance.
              </p>
              <div className="method-pair">
                <div className="method-card">
                  <span className="method-card-index">A</span>
                  <h3>Choose a cost basis</h3>
                  <p>
                    Use detailed events, aggregate provider totals, or other AI
                    expenses. For the same activity, aggregate charges and
                    detailed event costs are alternatives. Adding both would
                    count the same expenditure twice.
                  </p>
                </div>
                <div className="method-card">
                  <span className="method-card-index">B</span>
                  <h3>Include the cost of delivery</h3>
                  <p>
                    Model usage may sit alongside tools, compute, review labor
                    and subscriptions. Failed or rejected work remains in scope.
                    Unresolved shared expenses stay visible as Unallocated.
                  </p>
                </div>
              </div>
              <div className="method-formula">
                <span>Included workload costs</span>
                <strong>
                  Inference + supporting delivery costs + included shared
                  expenses
                </strong>
              </div>
              <CostExample />
              <details className="method-details">
                <summary>How event pricing and unknown costs work</summary>
                <p>
                  A supplied billed amount takes precedence. Otherwise, the
                  engine uses a dated reference rate for the model and usage
                  category. Token rates apply per million tokens, with input,
                  output and cached input handled according to the available
                  rate fields.
                </p>
                <p>
                  A reference-price calculation is an estimate, not a provider
                  invoice. Unknown models or missing rates produce unpriced
                  activity. They are never silently converted to zero. Reports
                  retain their pricing and calculation basis.
                </p>
              </details>
              <div className="method-callout">
                <strong>Scope is part of the number.</strong>
                <p>
                  “Included cost” is not automatically all company cost. A
                  complete declared scope can still exclude overhead, tax or
                  other categories by design. Read the definition and coverage
                  labels together.
                </p>
              </div>
              <div className="method-downloads">
                <div>
                  <strong>Try the evidence files</strong>
                  <p>
                    Exact synthetic August inputs, with field guidance and error
                    examples. The read-only company demo does not accept
                    uploads.
                  </p>
                </div>
                <div>
                  <a
                    href="/examples/InfFyn-normalized-CSV-examples.zip"
                    download
                  >
                    Download sample CSVs ↓
                  </a>
                  <a
                    href="/examples/CSV-IMPORT-GUIDE.txt"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read the import guide ↗
                  </a>
                </div>
              </div>
            </Section>

            <Section
              id="value"
              n="02"
              eyebrow="TWO BUSINESS QUESTIONS"
              title="Products and internal tools need different lenses."
            >
              <div className="method-pair">
                <div className="method-card">
                  <span className="method-tag">
                    Revenue-producing workloads
                  </span>
                  <h3>Does delivery support a contribution?</h3>
                  <p>
                    Associate revenue or collections with the relevant product
                    activity, then subtract its included costs. Show the amount,
                    percentage and allocation basis together.
                  </p>
                  <div className="method-mini-formula">
                    Associated revenue − included costs
                  </div>
                </div>
                <div className="method-card">
                  <span className="method-tag">Internal workloads</span>
                  <h3>What does useful work cost?</h3>
                  <p>
                    Divide full included cost by accepted business output.
                    Review acceptance quality and modeled capacity separately.
                    An internal tool does not acquire invented revenue.
                  </p>
                  <div className="method-mini-formula">
                    Included costs ÷ accepted quantity
                  </div>
                </div>
              </div>
              <ValueExample />
              <p className="method-lead small">
                Neither calculation proves that AI caused incremental revenue or
                cash savings. InfFyn makes economic associations inspectable;
                the customer still evaluates causality and business decisions.
              </p>
              <details className="method-details">
                <summary>Where gross profit per million tokens fits</summary>
                <p>
                  The token-based GPp1M field in the current engine divides
                  associated revenue less included costs by token volume in
                  millions. It can be useful for token-heavy products with
                  comparable workloads. Token counts do not measure quality, and
                  this lens does not replace contribution dollars or outcome
                  economics.
                </p>
                <p>
                  When revenue or supporting costs are not assigned to models,
                  model profitability is unavailable. Unassigned amounts remain
                  visible to reconcile the source totals.
                </p>
              </details>
            </Section>

            <Section
              id="allocations"
              n="03"
              eyebrow="SOURCE AMOUNT ≠ ALLOCATION CERTAINTY"
              title="Preserve the invoice. Explain the split."
            >
              <p className="method-lead">
                Stripe paid-invoice evidence represents collections under the
                selected period rule. It is not automatically recognized
                revenue. Taxes, refunds, credits, standalone charges and scope
                differences require explicit review.
              </p>
              <ol className="method-process">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Retain the original source</strong>
                    <p>
                      Keep the invoice identity, source amount, reporting period
                      and connection evidence.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Review dollar allocations</strong>
                    <p>
                      Assign explicit amounts to product workloads and record an
                      explanation for each portion.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Reconcile the remainder</strong>
                    <p>
                      Portions plus the unassigned remainder must equal the
                      original amount. Over-allocation and duplicate inclusion
                      are rejected.
                    </p>
                  </div>
                </li>
              </ol>
              <InvoiceExample />
              <div className="method-callout amber">
                <strong>Verified source, modeled allocation.</strong>
                <p>
                  A real retained source can support confidence in an invoice
                  amount. Management’s decision to allocate that invoice across
                  products remains modeled. This example uses a synthetic
                  invoice, so even its source is not independently verified.
                </p>
              </div>
            </Section>

            <Section
              id="confidence"
              n="04"
              eyebrow="A CHECKLIST, NOT A PROBABILITY"
              title="Three scores. Five checks in each."
            >
              <p className="method-lead">
                Cost evidence, revenue association and outcomes each receive a
                separate readiness score. A score of 100 means all applicable
                checklist conditions passed. It does not mean 100% certainty, an
                independent audit opinion or excellent business performance.
              </p>
              <div className="method-score-scale">
                <div>
                  <strong>0–20</strong>
                  <span>Insufficient evidence</span>
                </div>
                <div>
                  <strong>40–80</strong>
                  <span>Partial evidence</span>
                </div>
                <div>
                  <strong>100</strong>
                  <span>Ready checklist</span>
                </div>
                <div>
                  <strong>N/A</strong>
                  <span>Not applicable</span>
                </div>
              </div>
              <div className="method-check-definitions">
                {[
                  [
                    "Traceable sources",
                    "Can figures be traced to records and a source/period review note?",
                  ],
                  [
                    "Complete coverage",
                    "Does evidence cover the declared costs, revenue or outcome cohort?",
                  ],
                  [
                    "Valid associations",
                    "Are records connected to the relevant workload, customer or accepted unit?",
                  ],
                  [
                    "Reconciled calculations",
                    "Do independent controls or expected run counts agree on the same basis?",
                  ],
                  [
                    "Reviewed method",
                    "Has a reviewer confirmed the relevant scope, assumptions and method?",
                  ],
                ].map(([title, detail], i) => (
                  <div key={title}>
                    <span>{i + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{detail}</p>
                    </div>
                    <strong>20 pts</strong>
                  </div>
                ))}
              </div>
              <p className="method-caption">
                Each passed check earns 20 points. Failed and unknown checks
                earn zero. Dollar controls use a $0.01 tolerance on the same
                scope, period, basis and currency; run counts must agree
                exactly. A review confirmation is customer-supplied evidence.
              </p>
              <ConfidenceExample />
              <div className="method-callout">
                <strong>A score cannot fill a missing denominator.</strong>
                <p>
                  Missing cost coverage, absent accepted output or unavailable
                  revenue still produces an unavailable metric where required.
                  Readiness never upgrades an estimate, association or modeled
                  allocation to an actual measurement.
                </p>
              </div>
            </Section>

            <Section
              id="outcomes"
              n="05"
              eyebrow="COUNT SUCCESSFUL WORK CONSISTENTLY"
              title="The denominator must mean something."
            >
              <p className="method-lead">
                Define one accepted business unit and the rule for accepting it.
                An output might be a resolved case, accepted document or
                reviewed brief. One run can produce many accepted units; those
                are different counts.
              </p>
              <div className="method-pair">
                <div className="method-formula">
                  <span>Cost per accepted outcome</span>
                  <strong>All included cohort costs ÷ accepted quantity</strong>
                  <small>
                    Requires complete cost coverage and a complete outcome
                    cohort.
                  </small>
                </div>
                <div className="method-formula">
                  <span>Acceptance rate</span>
                  <strong>Accepted runs ÷ all included runs × 100</strong>
                  <small>
                    Rejected and failed runs remain in the denominator.
                  </small>
                </div>
              </div>
              <OutcomeExample />
              <details className="method-details">
                <summary>How modeled capacity differs from savings</summary>
                <p>
                  The capacity model uses supplied baseline and after-process
                  time assumptions with a supplied loaded labor rate. It
                  estimates the value of released time for the included cohort.
                  It cannot establish whether that time was redeployed, payroll
                  was reduced or expenditure was avoided.
                </p>
                <p>
                  Keep measured output, modeled hours, modeled capacity value
                  and verified financial outcomes separate. Lower cost per
                  accepted outcome can also reflect a change in task mix or
                  acceptance standards.
                </p>
              </details>
            </Section>

            <Section
              id="comparisons"
              n="06"
              eyebrow="COMPARE LIKE WITH LIKE"
              title="Change needs a consistent basis."
            >
              <p className="method-lead">
                Monthly comparisons require consecutive, completed calendar
                periods, compatible workload definitions and complete cost
                coverage. The engine checks currency, cost scope, units,
                mappings, revenue basis and calculation version before
                presenting a comparison.
              </p>
              <div className="method-comparison-gates">
                <span>Consecutive months</span>
                <span>Consistent scope & units</span>
                <span>Compatible attribution</span>
                <span>Complete cost coverage</span>
              </div>
              <ComparisonExample />
              <div className="method-callout">
                <strong>When a comparison is not supported, say so.</strong>
                <p>
                  A missing prior month, provisional period, changed definition
                  or incomplete cost boundary produces an explanation instead of
                  a persuasive-looking percentage. Replacing the selected report
                  also changes the comparison basis.
                </p>
              </div>
            </Section>

            <Section
              id="record"
              n="07"
              eyebrow="PRESERVE WHAT WAS KNOWN"
              title="A record of evidence and assumptions."
            >
              <p className="method-lead">
                A saved report keeps its calculation version, workload
                definitions, inputs, allocation explanations and fingerprint. A
                later refresh creates another version. Selecting a version for
                monthly history records a review decision without upgrading its
                provenance.
              </p>
              <VersionExample />
              <div className="method-provenance-list">
                {[
                  [
                    "Provider reported",
                    "A retained reporting source supports the supplied amount. Coverage and allocation still need review.",
                  ],
                  [
                    "Customer supplied",
                    "The customer supplied the amount, outcome, time assumption or confirmation.",
                  ],
                  [
                    "Reference estimated",
                    "Usage was priced using the applicable reference-rate basis.",
                  ],
                  [
                    "Modeled / associated",
                    "An explicit method connects costs, collections or revenue to activity; causality is not established.",
                  ],
                  [
                    "Unknown / unavailable",
                    "The evidence does not support the figure. The gap remains visible.",
                  ],
                  [
                    "Synthetic",
                    "The record was invented to demonstrate behavior. It does not represent customer or provider verification.",
                  ],
                ].map(([label, detail]) => (
                  <div key={label}>
                    <strong>{label}</strong>
                    <p>{detail}</p>
                  </div>
                ))}
              </div>
              <div className="method-pair">
                <div className="method-card">
                  <span className="method-tag">Implemented behavior</span>
                  <h3>Retention and repeatability</h3>
                  <p>
                    The implementation sets raw evidence and imports to expire
                    after 90 days, with draft expiry constrained by referenced
                    evidence. Derived reports and retained traces expire after
                    12 months. Historical export files keep the version that was
                    exported.
                  </p>
                  <p>
                    Expiry checks, cleanup routines and immutable record
                    controls are part of the code. They are not a substitute for
                    operating the configured service.
                  </p>
                </div>
                <div className="method-card">
                  <span className="method-tag amber">
                    Requires release verification
                  </span>
                  <h3>Operational assurance</h3>
                  <p>
                    Hosted tenant isolation, provider authorization, scheduled
                    cleanup, backups, restoration and deletion behavior require
                    verification in the actual deployment. Local tests and
                    synthetic reports do not establish those controls.
                  </p>
                  <p>
                    Read the release’s data-handling policy and verification
                    status before relying on production operation.
                  </p>
                </div>
              </div>
              <p className="method-caption">
                The fixed demonstration has synthetic dates and evidence. It
                does not exercise customer-data retention, live Stripe access or
                independent provider reconciliation.
              </p>
              <div className="method-final-cta">
                <div>
                  <span className="method-eyebrow">INSPECT THE RESULT</span>
                  <h3>See the method in a company’s month.</h3>
                  <p>
                    Explore the same workloads, allocations and evidence checks
                    in the executive workspace.
                  </p>
                </div>
                <div>
                  <Link className="method-button" href="/demo/monthly">
                    Open company demonstration →
                  </Link>
                  <Link
                    href="/examples/InfFyn-Northstar-August-2026.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download the executive report ↗
                  </Link>
                </div>
              </div>
            </Section>
          </main>
        </div>
      </MethodologyEvidence>
      <footer className="method-footer">
        <Link className="method-brand" href="/">
          Inf<span>Fyn</span>
        </Link>
        <p>AI economics, with evidence.</p>
        <nav aria-label="Policy navigation">
          <Link href="/privacy">Privacy & data handling</Link>
          <Link href="/terms">Terms</Link>
          <a href="#">Back to top ↑</a>
        </nav>
      </footer>
    </div>
  );
}

function Section({
  id,
  n,
  eyebrow,
  title,
  children,
}: {
  id: string;
  n: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="method-section" id={id}>
      <div className="method-section-title">
        <span className="method-section-number">{n}</span>
        <div>
          <p className="method-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
