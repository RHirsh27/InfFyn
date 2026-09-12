"use client";

import { useEffect, useState } from "react";
import {
  CostAssignment,
  ImportJob,
  InvoiceAllocation,
  Workload,
} from "@/lib/monthly";
import { formatMoney } from "@/lib/audit-v2";

export const reviewSteps = [
  "Import",
  "Assign",
  "Reconcile",
  "Review",
  "Save report",
];
export function ReviewPreparation({
  month,
  workloads,
  imports,
  importIds,
  costAssignments,
  invoices,
  onImports,
  onAssignments,
  onInvoices,
  onPrepare,
  onConnections,
  api,
  busy,
  step,
  onStep,
  demo = false,
}: {
  month: string;
  workloads: Workload[];
  imports: ImportJob[];
  importIds: string[];
  costAssignments: CostAssignment[];
  invoices: InvoiceAllocation[];
  onImports: (ids: string[]) => void;
  onAssignments: (a: CostAssignment[]) => void;
  onInvoices: (a: InvoiceAllocation[]) => void;
  onPrepare: () => void;
  onConnections: () => void;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  busy: boolean;
  step: number;
  onStep: (step: number) => void;
  demo?: boolean;
}) {
  const [evidence, setEvidence] = useState<Record<string, ImportJob>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    setEvidence({});
    setLoading(true);
    Promise.all(
      importIds.map(
        async (id) =>
          [id, await api(`monthly/imports/${id}/evidence`)] as const,
      ),
    )
      .then((entries) => {
        if (active) setEvidence(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [importIds.join(",")]);
  const groups = Object.entries(evidence).flatMap(([id, job]) => {
    if (job.provider === "stripe") return [];
    const totals = new Map<string, number>();
    for (const row of job.evidence?.costs || [])
      totals.set(
        row.project_id || "",
        (totals.get(row.project_id || "") || 0) + Number(row.amount),
      );
    return [...totals].map(([project, amount]) => ({
      key: `${job.provider}:${project}`,
      provider: job.provider as "openai" | "anthropic",
      project,
      amount,
      importId: id,
    }));
  });
  const invoiceRows = Object.entries(evidence).flatMap(([id, job]) =>
    (job.provider === "stripe" ? job.evidence?.revenue || [] : []).map(
      (row) => ({
        importId: id,
        revenue_id: row.revenue_id,
        amount: row.amount,
        date: row.date,
      }),
    ),
  );
  const unallocatedWorkloads = workloads.filter((w) => w.unallocated);
  const unallocatedId =
    unallocatedWorkloads.length === 1 ? unallocatedWorkloads[0].id : "";
  const productWorkloads = workloads.filter(
    (w) => w.kind === "product" && !w.unallocated,
  );
  function updateInvoice(
    importId: string,
    revenueId: string,
    patch: Partial<InvoiceAllocation>,
  ) {
    const found = invoices.find(
      (x) => x.import_id === importId && x.revenue_id === revenueId,
    ) || {
      import_id: importId,
      revenue_id: revenueId,
      allocations: [],
      reviewed: false,
    };
    onInvoices([
      ...invoices.filter(
        (x) => !(x.import_id === importId && x.revenue_id === revenueId),
      ),
      { ...found, ...patch },
    ]);
  }
  return (
    <section className="monthly-panel company-review-preparation">
      <div className="monthly-section-head">
        <div>
          <span className="eyebrow">THE MONTH-END WORKFLOW</span>
          <h2>Prepare {month}</h2>
        </div>
        <span className="monthly-badge">
          {importIds.length} imports selected
        </span>
      </div>
      <nav
        className="company-review-steps"
        aria-label="Monthly review progress"
      >
        {reviewSteps.map((label, i) => (
          <button
            key={label}
            className={step === i ? "active" : step > i ? "past" : ""}
            aria-current={step === i ? "step" : undefined}
            onClick={() => onStep(i)}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="monthly-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading retained source evidence…</p>}
      {step === 0 && (
        <>
          <div className="company-step-intro">
            <h3>Bring in this month’s evidence</h3>
            <p>
              Import reporting data from a connected provider, or use CSV files
              below. Choose the completed imports to include in this
              preparation.
            </p>
          </div>
          <div className="company-import-options">
            {imports
              .filter((j) => j.month === month)
              .map((j) => (
                <label className="company-import-option" key={j.id}>
                  <input
                    type="checkbox"
                    disabled={j.state !== "complete" || busy || demo}
                    checked={importIds.includes(j.id)}
                    onChange={(e) =>
                      onImports(
                        e.target.checked
                          ? [...importIds, j.id]
                          : importIds.filter((id) => id !== j.id),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {j.provider === "openai"
                        ? "OpenAI"
                        : j.provider === "anthropic"
                          ? "Anthropic"
                          : "Stripe collections"}
                    </strong>
                    <small>
                      {j.month} · {j.state} ·{" "}
                      {Object.values(j.counts).reduce((a, b) => a + b, 0)}{" "}
                      evidence rows
                    </small>
                  </span>
                </label>
              ))}
          </div>
          {!imports.some((j) => j.month === month) && (
            <div className="company-help-panel">
              <strong>No provider imports for this month yet</strong>
              <p>
                Connect an account and import the period, or continue with your
                company’s CSV exports.
              </p>
            </div>
          )}
          <div className="monthly-actions">
            <button onClick={onConnections}>Open connections ↗</button>
            <button
              className="primary"
              onClick={() => onStep(importIds.length ? 1 : 2)}
            >
              {importIds.length
                ? "Assign imported evidence →"
                : "Continue with CSV evidence →"}
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="company-step-intro">
            <h3>Assign spending and collections</h3>
            <p>
              Keep shared costs unallocated until you can support a mapping.
              Reviewed invoice allocations remain modeled, even when the source
              amount is verified.
            </p>
          </div>
          {groups.length > 0 && !workloads.some((w) => w.unallocated) && (
            <div className="company-help-panel">
              <strong>Keep unresolved shared costs visible.</strong>
              <p>
                To include sources left unallocated in a report, add the
                “Unallocated AI spend” example in Workloads. Otherwise the
                report will flag those imported costs as unassigned.
              </p>
            </div>
          )}
          {groups.length > 0 && (
            <div className="monthly-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provider source</th>
                    <th>Included spend</th>
                    <th>Workload assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={`${g.importId}:${g.key}`}>
                      <td>
                        <strong>
                          {g.provider === "openai"
                            ? "OpenAI project"
                            : "Anthropic workspace"}
                        </strong>
                        <small>{g.project}</small>
                      </td>
                      <td>{formatMoney(String(g.amount))}</td>
                      <td>
                        <label
                          className="sr-only"
                          htmlFor={`source-${g.importId}-${g.project}`}
                        >
                          Workload for {g.provider} {g.project}
                        </label>
                        <select
                          id={`source-${g.importId}-${g.project}`}
                          disabled={demo}
                          value={
                            costAssignments.find(
                              (a) =>
                                a.provider === g.provider &&
                                a.project_id === g.project,
                            )?.workload_id ||
                            workloads.find((w) =>
                              w.mappings[g.provider]?.includes(g.project),
                            )?.id ||
                            ""
                          }
                          onChange={(e) =>
                            onAssignments([
                              ...costAssignments.filter(
                                (a) =>
                                  !(
                                    a.provider === g.provider &&
                                    a.project_id === g.project
                                  ),
                              ),
                              ...(e.target.value || unallocatedId
                                ? [
                                    {
                                      provider: g.provider,
                                      project_id: g.project,
                                      workload_id:
                                        e.target.value || unallocatedId,
                                    },
                                  ]
                                : []),
                            ])
                          }
                        >
                          <option
                            value=""
                            disabled={
                              !unallocatedId &&
                              workloads.some((w) =>
                                w.mappings[g.provider]?.includes(g.project),
                              )
                            }
                          >
                            Leave unallocated
                          </option>
                          {workloads.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                              {w.unallocated ? " · Unallocated" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {invoiceRows.map((row) => {
            const revenueId = row.revenue_id;
            const invoice = invoices.find(
              (x) => x.import_id === row.importId && x.revenue_id === revenueId,
            );
            const total = Number(row.amount),
              allocated = (invoice?.allocations || []).reduce(
                (n, a) => n + Number(a.amount || 0),
                0,
              ),
              remaining = total - allocated;
            return (
              <div
                className="company-invoice"
                key={`${row.importId}:${revenueId}`}
              >
                <div className="monthly-section-head">
                  <div>
                    <span className="eyebrow">BUNDLED COLLECTIONS</span>
                    <h3>{revenueId}</h3>
                    <small>{row.date} · Source: retained Stripe import</small>
                  </div>
                  <div className="company-invoice-total">
                    <span>Original invoice amount</span>
                    <strong>{formatMoney(String(total))}</strong>
                  </div>
                </div>
                <div className="company-invoice-allocations">
                  {(invoice?.allocations || []).map((a, i) => (
                    <div className="company-allocation-row" key={i}>
                      <label>
                        Product workload
                        <select
                          disabled={demo}
                          value={a.workload_id}
                          onChange={(e) =>
                            updateInvoice(row.importId, revenueId, {
                              reviewed: false,
                              allocations: invoice!.allocations.map((x, n) =>
                                n === i
                                  ? { ...x, workload_id: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          <option value="">Choose workload</option>
                          {productWorkloads.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Amount (USD)
                        <input
                          disabled={demo}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={a.amount}
                          onChange={(e) =>
                            updateInvoice(row.importId, revenueId, {
                              reviewed: false,
                              allocations: invoice!.allocations.map((x, n) =>
                                n === i ? { ...x, amount: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Allocation explanation
                        <input
                          disabled={demo}
                          maxLength={1000}
                          value={a.explanation}
                          placeholder="e.g. Contract line item reviewed by finance"
                          onChange={(e) =>
                            updateInvoice(row.importId, revenueId, {
                              reviewed: false,
                              allocations: invoice!.allocations.map((x, n) =>
                                n === i
                                  ? { ...x, explanation: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        disabled={demo}
                        aria-label={`Remove allocation ${i + 1}`}
                        onClick={() =>
                          updateInvoice(row.importId, revenueId, {
                            reviewed: false,
                            allocations: invoice!.allocations.filter(
                              (_, n) => n !== i,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="company-allocation-footer">
                  <button
                    disabled={demo || !productWorkloads.length}
                    onClick={() =>
                      updateInvoice(row.importId, revenueId, {
                        reviewed: false,
                        allocations: [
                          ...(invoice?.allocations || []),
                          { workload_id: "", amount: "", explanation: "" },
                        ],
                      })
                    }
                  >
                    + Allocate to a product
                  </button>
                  <span>
                    Assigned <strong>{formatMoney(String(allocated))}</strong>
                  </span>
                  <span className={remaining < 0 ? "negative" : ""}>
                    Remaining <strong>{formatMoney(String(remaining))}</strong>
                  </span>
                </div>
                {remaining < 0 && (
                  <p role="alert" className="monthly-error">
                    Allocations exceed the original amount. Reduce the
                    allocations before preparing.
                  </p>
                )}
                <label className="monthly-checkbox">
                  <input
                    type="checkbox"
                    disabled={
                      demo || !invoice?.allocations.length || remaining < 0
                    }
                    checked={invoice?.reviewed || false}
                    onChange={(e) =>
                      updateInvoice(row.importId, revenueId, {
                        reviewed: e.target.checked,
                      })
                    }
                  />
                  I reviewed these allocations and their explanations.
                  Unassigned collections remain separate.
                </label>
                <small>
                  Management allocation · modeled · collections basis. This does
                  not establish revenue recognition or causal AI value.
                </small>
              </div>
            );
          })}
          {!groups.length && !invoiceRows.length && (
            <div className="company-help-panel">
              <strong>Select completed imports first.</strong>
              <p>
                Source projects and invoices appear here after their evidence is
                loaded.
              </p>
            </div>
          )}
          <div className="monthly-actions">
            <button onClick={() => onStep(0)}>Back</button>
            <button
              className="primary"
              disabled={busy || demo || loading || !importIds.length || !!error}
              onClick={onPrepare}
            >
              Prepare assigned evidence →
            </button>
            <button onClick={() => onStep(2)}>Review CSV evidence</button>
          </div>
        </>
      )}
      {step === 2 && (
        <div className="company-step-intro">
          <h3>Reconcile each workload</h3>
          <p>
            Review the source, compare imported amounts to independent controls,
            and identify incomplete cost, outcome or revenue coverage below.
          </p>
          <button onClick={() => onStep(3)}>Continue to review →</button>
        </div>
      )}
      {step === 3 && (
        <div className="company-step-intro">
          <h3>Review the reporting basis</h3>
          <p>
            Confirm each workload’s scope and assumptions. Unavailable evidence
            remains unavailable. An incomplete review can be saved, with its
            limitations visible.
          </p>
          <button onClick={() => onStep(4)}>Continue to save report →</button>
        </div>
      )}
      {step === 4 && (
        <div className="company-step-intro">
          <h3>Create an immutable monthly record</h3>
          <p>
            Calculate and save below. The report preserves the evidence,
            allocation explanations and calculation version. After inspecting
            it, select the version for monthly history.
          </p>
        </div>
      )}
    </section>
  );
}
