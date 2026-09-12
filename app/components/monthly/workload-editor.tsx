"use client";

import { useState } from "react";
import { Workload } from "@/lib/monthly";

const examples: Partial<Workload>[] = [
  {
    name: "Customer research",
    purpose: "Deliver decision-ready research to paying customers.",
    responsible_team: "Product",
    kind: "product",
    outcome_unit: "accepted research brief",
    acceptance_definition:
      "A brief delivered to a customer and passing the editorial quality checklist.",
    cost_scope:
      "Model usage, retrieval, search, compute, failed runs and review labor",
  },
  {
    name: "Support resolution",
    purpose: "Resolve customer issues with consistent service quality.",
    responsible_team: "Customer operations",
    kind: "internal",
    outcome_unit: "support resolution",
    acceptance_definition:
      "A resolved ticket with no reopen within the agreed review window.",
    cost_scope:
      "Model usage, helpdesk automation, failed runs and human review",
  },
  {
    name: "Document processing",
    purpose: "Convert business documents into accepted, structured records.",
    responsible_team: "Operations",
    kind: "internal",
    outcome_unit: "accepted document",
    acceptance_definition:
      "A document passing extraction checks and the human review threshold.",
    cost_scope: "Model usage, OCR, storage, orchestration and review labor",
  },
  {
    name: "Unallocated AI spend",
    purpose:
      "Keep shared costs visible until a supported workload assignment is available.",
    responsible_team: "Finance",
    kind: "internal",
    outcome_unit: "",
    acceptance_definition: "",
    unallocated: true,
    cost_scope:
      "Shared AI provider charges and supporting costs that have not been assigned to a business workload",
  },
];
export function WorkloadEditor({
  workloads,
  editing,
  onChange,
  onSave,
  onNew,
  busy,
  disabled,
}: {
  workloads: Workload[];
  editing: Workload;
  onChange: (w: Workload) => void;
  onSave: () => void;
  onNew: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState("");
  const update = (patch: Partial<Workload>) =>
    onChange({ ...editing, ...patch });
  return (
    <div className="company-workload-layout">
      <section className="monthly-panel company-workload-list">
        <div className="monthly-section-head">
          <div>
            <span className="eyebrow">YOUR BUSINESS ACTIVITIES</span>
            <h2>Workloads</h2>
          </div>
          <span className="monthly-badge">{workloads.length}</span>
        </div>
        <p>
          A repeatable activity whose cost and business value you want to
          understand.
        </p>
        {workloads.map((w) => (
          <button
            className={`monthly-workload ${editing.id === w.id ? "selected" : ""}`}
            key={w.id}
            onClick={() => {
              onChange(w);
              setStep(0);
              setValidation("");
            }}
          >
            <strong>{w.name}</strong>
            <small>
              {w.responsible_team ||
                (w.kind === "product" ? "Product" : "Internal operations")}
            </small>
            <span className="company-workload-kind">
              {w.unallocated
                ? "Unallocated"
                : w.kind === "product"
                  ? "Revenue-producing"
                  : "Internal"}
            </span>
          </button>
        ))}
        <button
          className="company-add-workload"
          onClick={() => {
            onNew();
            setStep(0);
            setValidation("");
          }}
        >
          + Define a workload
        </button>
      </section>
      <form
        className="monthly-panel monthly-form company-workload-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) {
            if (
              !editing.name.trim() ||
              !editing.purpose?.trim() ||
              !editing.responsible_team?.trim()
            ) {
              setValidation(
                "Add a name, business purpose and responsible team to continue.",
              );
              return;
            }
            setValidation("");
            setStep(step + 1);
          } else onSave();
        }}
      >
        <span className="eyebrow">
          {editing.id ? "WORKLOAD DEFINITION" : "NEW WORKLOAD"}
        </span>
        <h2>
          {
            [
              "Start with the business purpose",
              "Define a useful outcome",
              "Set the cost boundary",
            ][step]
          }
        </h2>
        <div className="company-wizard-steps" aria-label="Workload setup steps">
          {["Purpose", "Outcome", "Cost scope"].map((s, i) => (
            <button
              type="button"
              className={step === i ? "active" : ""}
              key={s}
              onClick={() => setStep(i)}
            >
              <span>{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
        {validation && (
          <p role="alert" className="monthly-error">
            {validation}
          </p>
        )}
        {step === 0 && (
          <>
            {!editing.id && (
              <div className="company-template-picker">
                <span>Start from an editable example</span>
                <div>
                  {examples.map((x) => (
                    <button
                      type="button"
                      key={x.name}
                      onClick={() => update(x)}
                    >
                      {x.name} ↗
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label>
              Workload name
              <input
                required
                maxLength={100}
                placeholder="e.g. Customer research"
                value={editing.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              Business purpose
              <textarea
                required
                maxLength={1000}
                placeholder="What business activity does this support?"
                value={editing.purpose || ""}
                onChange={(e) => update({ purpose: e.target.value })}
              />
            </label>
            <div className="monthly-two-col">
              <label>
                Responsible team
                <input
                  required
                  maxLength={100}
                  placeholder="e.g. Product"
                  value={editing.responsible_team || ""}
                  onChange={(e) => update({ responsible_team: e.target.value })}
                />
              </label>
              <label>
                Economic purpose
                <select
                  value={editing.kind}
                  onChange={(e) =>
                    update({ kind: e.target.value as Workload["kind"] })
                  }
                >
                  <option value="product">Revenue-producing product</option>
                  <option value="internal">Internal tool or process</option>
                </select>
              </label>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              Measure successful work, not just tokens. Failed and rejected
              activity remains part of the cost.
            </p>
            <label>
              Accepted business unit
              <input
                maxLength={100}
                placeholder="e.g. accepted research brief"
                value={editing.outcome_unit}
                onChange={(e) => update({ outcome_unit: e.target.value })}
              />
            </label>
            <label>
              Acceptance criteria
              <textarea
                maxLength={1000}
                placeholder="What makes this outcome accepted, and who checks it?"
                value={editing.acceptance_definition}
                onChange={(e) =>
                  update({ acceptance_definition: e.target.value })
                }
              />
            </label>
            <div className="company-help-panel">
              <strong>Still defining the outcome?</strong>
              <p>
                You can track cost first. Cost per accepted outcome remains
                unavailable until you provide an accepted unit and sufficient
                outcome evidence.
              </p>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              Included cost scope
              <textarea
                required
                minLength={3}
                maxLength={1000}
                value={editing.cost_scope}
                onChange={(e) => update({ cost_scope: e.target.value })}
                placeholder="Model usage, retrieval, supporting compute, failed runs and review labor"
              />
            </label>
            <label className="monthly-checkbox">
              <input
                type="checkbox"
                checked={editing.unallocated}
                onChange={(e) => update({ unallocated: e.target.checked })}
              />
              This workload holds shared costs that remain unallocated
            </label>
            <div className="company-help-panel">
              <strong>Connect sources, then assign spend.</strong>
              <p>
                OpenAI projects and Anthropic workspaces are assigned in Monthly
                Review after import. You can review each source’s spending
                before choosing its workload.
              </p>
            </div>
            {Object.values(editing.mappings).some((x) => x.length > 0) && (
              <details>
                <summary>Existing source assignments</summary>
                {Object.entries(editing.mappings).map(([provider, ids]) => (
                  <p key={provider}>
                    {provider}: {ids.join(", ")}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
        <div className="company-form-footer">
          <span>Step {step + 1} of 3</span>
          <div className="monthly-actions">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button className="primary" disabled={busy || disabled}>
              {step === 2 ? "Save workload" : "Continue →"}
            </button>
          </div>
        </div>
        {editing.id && (
          <small>
            Saving a definition does not change earlier report versions.
          </small>
        )}
      </form>
    </div>
  );
}
