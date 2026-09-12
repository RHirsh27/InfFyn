"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { loadMethodologyFacts, type MethodologyFacts } from "./facts";

const EvidenceContext = createContext<{
  facts: MethodologyFacts | null;
  loading: boolean;
  retry: () => void;
}>({ facts: null, loading: true, retry: () => {} });
const money = (value: string | null) =>
  value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        currencySign: "accounting",
      }).format(Number(value));
const number = (value: string | number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(value),
  );

export function MethodologyEvidence({ children }: { children: ReactNode }) {
  const [facts, setFacts] = useState<MethodologyFacts | null>(null),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loadMethodologyFacts().then((result) => {
      if (active) {
        setFacts(result);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <EvidenceContext.Provider
      value={{ facts, loading, retry: () => setAttempt((n) => n + 1) }}
    >
      {children}
    </EvidenceContext.Provider>
  );
}

function Example({
  title,
  children,
}: {
  title: string;
  children: (facts: MethodologyFacts) => ReactNode;
}) {
  const { facts, loading } = useContext(EvidenceContext);
  return (
    <div className="method-example">
      <div className="method-example-heading">
        <span>WORKED EXAMPLE</span>
        <strong>{title}</strong>
        <span className="method-tag">Synthetic · August 2026</span>
      </div>
      {facts ? (
        children(facts)
      ) : (
        <p className="method-example-unavailable" role="status">
          {loading
            ? "Loading the calculated Northstar example…"
            : "The calculated example is unavailable. The methodology above remains readable; no substitute numbers have been inserted."}
        </p>
      )}
    </div>
  );
}

export function ExampleStatus() {
  const { facts, loading, retry } = useContext(EvidenceContext);
  return (
    <div className="method-example-status" role="status">
      <span className={`method-status-dot ${!facts ? "pending" : ""}`} />
      <span>
        {loading
          ? "Loading worked examples from the calculation engine"
          : facts
            ? `${facts.company} · August 2026 · ${facts.calculationVersion}`
            : "Worked examples are temporarily unavailable"}
      </span>
      {!loading && !facts && <button onClick={retry}>Retry examples</button>}
      <span className="method-status-note">
        Synthetic data. No provider or customer verification.
      </span>
    </div>
  );
}

export function CostExample() {
  return (
    <Example title="What is included in company cost?">
      {(f) => (
        <>
          <div className="method-cost-equation">
            <div>
              <span>Inference</span>
              <strong>{money(f.inference)}</strong>
            </div>
            <span>+</span>
            <div>
              <span>Human review</span>
              <strong>{money(f.humanReview)}</strong>
            </div>
            <span>+</span>
            <div>
              <span>Shared subscriptions</span>
              <strong>{money(f.subscription)}</strong>
            </div>
            <span>=</span>
            <div className="method-equation-total">
              <span>Included workload costs</span>
              <strong>{money(f.total)}</strong>
            </div>
          </div>
          <p className="method-caption">
            The provider bill is only part of the cost boundary. The{" "}
            {money(f.unallocated)} shared subscription amount stays included and
            Unallocated; it is not added a second time. Corporate overhead is
            excluded from this synthetic scope.
          </p>
        </>
      )}
    </Example>
  );
}

export function ValueExample() {
  return (
    <Example title="Two workloads, two economic questions">
      {(f) => {
        const product = f.workloads.find(
            (w) => w.name === "Document intelligence",
          )!,
          internal = f.workloads.find((w) => w.name === "Support resolution")!;
        return (
          <div className="method-value-examples">
            <div>
              <span className="method-tag">Revenue-producing product</span>
              <h4>{product.name}</h4>
              <div className="method-math-line">
                <span>Allocated collections</span>
                <strong>{money(product.revenue)}</strong>
              </div>
              <div className="method-math-line">
                <span>Less included costs</span>
                <strong>{money(product.cost)}</strong>
              </div>
              <div className="method-math-line result loss">
                <span>Collections contribution</span>
                <strong>{money(product.contribution)}</strong>
              </div>
              <p>
                Investigate delivery cost, customer mix and pricing. This is
                contribution on a collections basis, not company net profit.
              </p>
            </div>
            <div>
              <span className="method-tag">Internal operation</span>
              <h4>{internal.name}</h4>
              <div className="method-math-line">
                <span>Included costs</span>
                <strong>{money(internal.cost)}</strong>
              </div>
              <div className="method-math-line">
                <span>Accepted resolutions</span>
                <strong>{number(internal.accepted)}</strong>
              </div>
              <div className="method-math-line result">
                <span>Cost per accepted resolution</span>
                <strong>≈ {money(internal.unitCost)}</strong>
              </div>
              <p>
                Review service quality and cost per useful outcome. Revenue and
                contribution are not applicable to this internal workload.
              </p>
            </div>
          </div>
        );
      }}
    </Example>
  );
}

export function InvoiceExample() {
  return (
    <Example title="One bundled invoice, an explicit split">
      {(f) => (
        <>
          <div className="method-invoice-source">
            <div>
              <span>Synthetic paid invoice</span>
              <strong>{money(f.invoice.original)}</strong>
            </div>
            <p>
              Original source preserved
              <br />
              <small>{f.invoice.id}</small>
            </p>
            <span className="method-tag amber">Collections basis</span>
          </div>
          <div className="method-invoice-portions">
            {f.invoice.portions.map((p) => (
              <div key={p.workloadId}>
                <span className="method-branch" aria-hidden="true">
                  ↳
                </span>
                <div>
                  <h4>{p.name}</h4>
                  <p>{p.explanation}</p>
                </div>
                <strong>{money(p.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="method-invoice-remainder">
            <span>Allocated {money(f.invoice.allocated)}</span>
            <span>
              Unassigned remainder <strong>{money(f.invoice.remainder)}</strong>
            </span>
            <span className="method-tag">Modeled allocation</span>
          </div>
          <p className="method-caption">
            Each portion keeps its source invoice, workload and explanation. The
            original invoice cannot also be counted as revenue after its
            allocated portions are included. Matching a source amount never
            turns management’s allocation into measured causal value.
          </p>
        </>
      )}
    </Example>
  );
}

export function ConfidenceExample() {
  const [workloadName, setWorkloadName] = useState("Finance document review"),
    [kind, setKind] = useState<"cost" | "revenue" | "outcomes">("cost");
  return (
    <Example title="Inspect the checks, not just the score">
      {(f) => {
        const w =
            f.workloads.find((x) => x.name === workloadName) || f.workloads[0],
          score = w.confidence[kind];
        return (
          <>
            <div className="method-confidence-controls">
              <label>
                Workload
                <select
                  value={w.name}
                  onChange={(e) => setWorkloadName(e.target.value)}
                >
                  {f.workloads.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="method-segmented"
                role="group"
                aria-label="Evidence checklist"
              >
                {(["cost", "revenue", "outcomes"] as const).map((k) => (
                  <button
                    key={k}
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                  >
                    {k === "cost"
                      ? "Cost"
                      : k === "revenue"
                        ? "Revenue"
                        : "Outcomes"}
                  </button>
                ))}
              </div>
            </div>
            <div className="method-confidence-summary">
              <div>
                <strong>
                  {score.score === null ? "N/A" : score.score}
                  <span>{score.score === null ? "" : " / 100"}</span>
                </strong>
                <span
                  className={`method-tag ${score.state === "partial" ? "amber" : ""}`}
                >
                  {score.state.replaceAll("_", " ")}
                </span>
              </div>
              <p>
                {score.score === null
                  ? "This evidence category does not apply to the workload. No zero score has been invented."
                  : "Five explicit evidence checks. Passing one category does not repair a gap in another."}
              </p>
            </div>
            {score.checks.length > 0 && (
              <div className="method-check-list">
                {score.checks.map((c) => (
                  <details key={c.id}>
                    <summary>
                      <span
                        className={`method-check-symbol ${c.status}`}
                        aria-hidden="true"
                      >
                        {c.status === "pass"
                          ? "✓"
                          : c.status === "fail"
                            ? "!"
                            : "?"}
                      </span>
                      <strong>{c.label}</strong>
                      <span>
                        {c.status} · {c.points}/20
                      </span>
                    </summary>
                    <p>{c.reason}</p>
                  </details>
                ))}
              </div>
            )}
            {w.name === "Finance document review" && kind === "cost" && (
              <div className="method-callout amber">
                <strong>A discrepancy stays visible.</strong>
                <p>
                  {money(w.cost)} included cost − {money(w.control)} independent
                  control = {money(w.variance)}. The reconciliation check fails;
                  the overall cost score remains partial. The fixture supplies
                  both amounts—it does not demonstrate an independent audit.
                </p>
              </div>
            )}
            <p className="method-caption">
              Checklist version {score.version}. Results shown here are
              calculated from synthetic evidence, including simulated reviewer
              confirmations.
            </p>
          </>
        );
      }}
    </Example>
  );
}

export function OutcomeExample() {
  return (
    <Example title="Keep batches, accepted quantity and capacity separate">
      {(f) => {
        const support = f.workloads.find(
            (w) => w.name === "Support resolution",
          )!,
          finance = f.workloads.find(
            (w) => w.name === "Finance document review",
          )!;
        return (
          <>
            <div className="method-three-metrics">
              <div>
                <span>Support delivery batches</span>
                <strong>{number(support.runs)}</strong>
                <small>Distinct runs in the cohort</small>
              </div>
              <div>
                <span>Accepted resolutions</span>
                <strong>{number(support.accepted)}</strong>
                <small>Business units, not batch count</small>
              </div>
              <div>
                <span>Batch acceptance rate</span>
                <strong>
                  {support.acceptanceRate === null
                    ? "Unavailable"
                    : `${number(support.acceptanceRate)}%`}
                </strong>
                <small>Accepted batches ÷ all batches</small>
              </div>
            </div>
            <p className="method-caption">{support.acceptance}</p>
            <div className="method-callout">
              <strong>Modeled capacity is a separate lens.</strong>
              <p>
                Finance document review shows approximately{" "}
                {finance.modeledHours === null
                  ? "unavailable"
                  : number(finance.modeledHours)}{" "}
                modeled hours, worth {money(finance.capacity)} at the supplied
                labor assumptions. The model does not establish reduced payroll,
                avoided hiring or realized cash savings.
              </p>
            </div>
          </>
        );
      }}
    </Example>
  );
}

export function ComparisonExample() {
  return (
    <Example title="Spending can rise while unit economics improve">
      {(f) => {
        const support = f.workloads.find(
            (w) => w.name === "Support resolution",
          )!,
          c = f.supportComparison;
        return (
          <>
            <div className="method-comparison-grid">
              <div>
                <span>July unit cost</span>
                <strong>{money(c.previousUnitCost)}</strong>
                <small>{number(c.previousAccepted)} accepted resolutions</small>
              </div>
              <span className="method-comparison-arrow" aria-hidden="true">
                →
              </span>
              <div>
                <span>August unit cost</span>
                <strong>≈ {money(support.unitCost)}</strong>
                <small>{number(support.accepted)} accepted resolutions</small>
              </div>
              <div className="method-comparison-result">
                <span>Engine comparison</span>
                <strong>{number(c.unitCostPercent)}%</strong>
                <small>
                  Unit cost · volume {number(c.volumePercent)}% higher
                </small>
              </div>
            </div>
            <div className="method-formula">
              <span>Volume-adjusted cost difference</span>
              <strong>
                {money(c.previousUnitCost)} × {number(support.accepted)} −{" "}
                {money(support.cost)} = {money(c.baselineDifference)}
              </strong>
            </div>
            <p className="method-caption">
              The {money(c.baselineDifference)} difference compares August with
              July’s unit-cost baseline at August’s volume. It is not verified
              cash savings or proof that a particular change caused the
              improvement. Displayed unit costs are rounded; the engine uses
              unrounded values.
            </p>
          </>
        );
      }}
    </Example>
  );
}

export function VersionExample() {
  const { facts } = useContext(EvidenceContext);
  return (
    <div className="method-version-record">
      <div>
        <span>Scenario</span>
        <strong>{facts?.scenarioVersion || "Unavailable"}</strong>
      </div>
      <div>
        <span>Calculation version</span>
        <strong>{facts?.calculationVersion || "Unavailable"}</strong>
      </div>
      <div>
        <span>Report fingerprint</span>
        <code>
          {facts?.fingerprint || "Unavailable until the example loads"}
        </code>
      </div>
    </div>
  );
}
