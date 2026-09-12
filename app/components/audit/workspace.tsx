"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { browserPreviewRequest } from "@/lib/browser-preview";
import {
  AuditInput,
  AuditKind,
  AuditListItem,
  AuditResult,
  BillingState,
  Preview,
  SavedAudit,
  download,
  emptyAudit,
  formatMoney,
  headers,
  syntheticAudit,
} from "@/lib/audit-v2";
import "./workspace.css";

const dimensions: Record<string, string> = {
  customer_id: "Customers",
  feature: "Features",
  model: "Models",
  customer_segment: "Cohorts",
  workflow: "Workflows",
  team: "Teams",
};
const fileLabels: Record<
  keyof typeof headers,
  { label: string; hint: string }
> = {
  usage_csv: {
    label: "Usage",
    hint: "Required. Provider usage, stable event IDs, customer or workflow tags. Billed costs take precedence over reference rates.",
  },
  costs_csv: {
    label: "Additional costs",
    hint: "Tools, compute and human review. Include failed work and retries. Link each cost to its run and dimensions.",
  },
  rates_csv: {
    label: "Reference rates",
    hint: "Optional fallback for unpriced usage. Dated, source-labeled rates; cached inputs are priced separately.",
  },
  revenue_csv: {
    label: "Revenue",
    hint: "A separate, reviewed file. Direct associations or named allocations; signed refunds are supported.",
  },
  outcomes_csv: {
    label: "Outcomes",
    hint: "One final result per run, including failures. Accepted quantity must use one consistent business unit.",
  },
};

function errorText(data: unknown): string {
  if (typeof data !== "object" || !data)
    return "Unable to complete this action.";
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((x) => `${x.loc?.slice(1).join(" · ") || "Input"}: ${x.msg}`)
      .join(". ");
  if (detail && typeof detail === "object" && "message" in detail)
    return String(detail.message);
  return "Unable to complete this action. Retry or check your evidence files.";
}

export function AuditWorkspace({
  publicPreview = false,
  validation = false,
  hostedPreview = false,
  browserPreview = false,
}: {
  publicPreview?: boolean;
  validation?: boolean;
  hostedPreview?: boolean;
  browserPreview?: boolean;
}) {
  const [input, setInput] = useState<AuditInput>(() => emptyAudit());
  const [sample, setSample] = useState(false);
  const [record, setRecord] = useState<SavedAudit | null>(null);
  const [costPreview, setCostPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<AuditListItem[]>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"evidence" | "results" | "report">("evidence");
  const [dimension, setDimension] = useState("customer_id");
  const [filter, setFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const base = validation ? "/api/validation" : "/api/v2";
  const result =
    record?.access_level === "full" ? (record.result as AuditResult) : null;
  const preview =
    costPreview ||
    (record?.access_level === "preview" ? (record.result as Preview) : null);

  async function api(path: string, method = "GET", body?: unknown) {
    const serialized = body !== undefined ? JSON.stringify(body) : undefined;
    if (serialized && new TextEncoder().encode(serialized).length > 4_000_000)
      throw new Error(
        "Combined audit upload exceeds 4 MB. Reduce the period or aggregate usage while preserving customer and workflow dimensions.",
      );
    if (browserPreview) return browserPreviewRequest(path, method, body);
    const response = await fetch(`${base}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(serialized !== undefined ? { body: serialized } : {}),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(errorText(data));
    return data;
  }
  async function refresh() {
    if (publicPreview) return;
    const [h, b] = await Promise.all([api("audits"), api("billing")]);
    setHistory(h.audits);
    setBilling(b);
  }
  useEffect(() => {
    let active = true;
    if (!publicPreview) {
      Promise.all([api("audits"), api("billing")])
        .then(([h, b]) => {
          if (active) {
            setHistory(h.audits);
            setBilling(b);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, []); // Workspace mode is fixed for this mount.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  async function action(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(null);
    }
  }
  function update<K extends keyof AuditInput>(key: K, value: AuditInput[K]) {
    setInput((p) => ({
      ...p,
      [key]: value,
      ...(key.endsWith("_csv") || key.startsWith("period_")
        ? { cost_scope_complete: false, outcome_cohort_complete: false }
        : {}),
      ...([
        "revenue_csv",
        "period_start",
        "period_end",
        "revenue_basis",
      ].includes(key)
        ? { revenue_reviewed: false }
        : {}),
    }));
  }
  function changeKind(kind: AuditKind) {
    setInput((p) => ({
      ...p,
      kind,
      ...(kind === "internal"
        ? {
            revenue_csv: "",
            revenue_source: "none" as const,
            revenue_basis: "unavailable" as const,
            revenue_reviewed: false,
            feature_allocation: "none" as const,
          }
        : {}),
    }));
    setDimension(kind === "internal" ? "workflow" : "customer_id");
  }
  function loadSample() {
    setInput(syntheticAudit(input.kind));
    setSample(true);
    setRecord(null);
    setCostPreview(null);
    setError(null);
    setNotice(
      "Synthetic evidence loaded. These figures demonstrate the workflow and are not customer results.",
    );
  }
  async function upload(key: keyof typeof headers, file: File | undefined) {
    if (!file) return;
    await action("Reading file", async () => {
      const limit =
        key === "usage_csv"
          ? 4_000_000
          : key === "rates_csv"
            ? 500_000
            : 1_000_000;
      if (file.size > limit)
        throw new Error(
          `${fileLabels[key].label}: file exceeds ${limit / 1_000_000} MB.`,
        );
      const text = await file.text();
      setInput((p) => ({
        ...p,
        [key]: text,
        cost_scope_complete: false,
        outcome_cohort_complete: false,
        ...(key === "revenue_csv"
          ? {
              revenue_source: "reviewed_file",
              revenue_reviewed: false,
              revenue_basis: "recognized",
            }
          : {}),
      }));
    });
  }
  async function run() {
    await action(
      publicPreview ? "Calculating preview" : "Saving audit",
      async () => {
        const data = await api(
          publicPreview ? "preview" : "audits",
          "POST",
          input,
        );
        if (publicPreview) {
          setCostPreview(data.preview);
          setRecord(null);
        } else {
          setRecord(data);
          setCostPreview(null);
          await refresh();
        }
        setTab("results");
      },
    );
  }
  async function openAudit(id: string) {
    await action("Opening audit", async () => {
      setRecord(await api(`audits/${id}`));
      setCostPreview(null);
      setTab("results");
      setDeleteConfirm(false);
    });
  }
  async function billingAction(which: "checkout" | "portal") {
    await action("Opening billing", async () => {
      const data = await api(`billing/${which}`, "POST", {});
      const destination = new URL(data.url);
      if (
        destination.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(
          destination.hostname,
        )
      )
        throw new Error("Unexpected billing destination.");
      window.location.assign(destination.href);
    });
  }
  async function stripeEvidence() {
    await action("Reading Stripe evidence", async () => {
      const evidence = await api("stripe/evidence", "POST", {
        period_start: input.period_start,
        period_end: input.period_end,
      });
      setInput((p) => ({
        ...p,
        revenue_csv: evidence.revenue_csv,
        revenue_source: "stripe_reviewed",
        revenue_basis: "collections",
        revenue_reviewed: false,
      }));
      setNotice(evidence.notice);
    });
  }
  async function connectStripe() {
    await action("Connecting Stripe", async () => {
      const response = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(errorText(data));
      const destination = new URL(data.authorize_url);
      if (
        destination.protocol !== "https:" ||
        destination.hostname !== "marketplace.stripe.com"
      )
        throw new Error("Unexpected connection destination.");
      window.location.assign(destination.href);
    });
  }
  const rows =
    result?.groups[dimension]?.filter((g) =>
      g.name.toLowerCase().includes(filter.toLowerCase()),
    ) || [];

  return (
    <div className="audit-shell">
      <aside className="audit-rail no-print">
        <Link href="/" className="audit-brand">
          Inf<span>Fyn</span>
          <small>ECONOMICS WORKSPACE</small>
        </Link>
        <div className="rail-label">YOUR WORKSPACE</div>
        <button className="rail-active" onClick={() => setTab("evidence")}>
          <span>◈</span> Audit studio
        </button>
        {!publicPreview && (
          <>
            <div className="rail-label">
              SAVED AUDITS <span>{history.length}</span>
            </div>
            <div className="audit-history">
              {history.length === 0 ? (
                <p>Your reviewed periods will appear here.</p>
              ) : (
                history.map((a) => (
                  <button
                    key={a.id}
                    className={record?.id === a.id ? "selected" : ""}
                    onClick={() => openAudit(a.id)}
                    disabled={!!busy}
                  >
                    <strong>{a.title}</strong>
                    <span>
                      {a.kind === "internal"
                        ? "Internal workflow"
                        : "Customer product"}{" "}
                      ·{" "}
                      {new Date(a.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
        <div className="rail-bottom">
          <div className="trust-dot" /> Evidence before conclusions.
          <p>Every result retains its inputs, method and cost basis.</p>
          {!publicPreview && !validation && !hostedPreview && (
            <Link href="/app/dashboard">Historical v1 reports ↗</Link>
          )}
        </div>
      </aside>
      <div className="audit-main">
        <header className="audit-top no-print">
          <span>
            InfFyn <span className="muted">/</span> Audit studio
          </span>
          <div>
            {validation ? (
              <span className="tag caution">LOCAL VALIDATION · SYNTHETIC</span>
            ) : publicPreview ? (
              <Link href="/login?next=/app/audits">Sign in ↗</Link>
            ) : (
              <>
                <span className={`tag ${billing?.entitled ? "trusted" : ""}`}>
                  {billing?.entitled
                    ? billing.access_source === "preview"
                      ? "Review preview"
                      : billing.access_source === "complimentary"
                        ? "Complimentary access"
                        : "Subscription active"
                    : billing?.status || "Checking account"}
                </span>
                {billing?.is_access_admin && (
                  <Link href="/app/admin/access">Manage invitations ↗</Link>
                )}
                {billing?.is_owner && billing.has_customer && (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => billingAction("portal")}
                  >
                    Manage subscription ↗
                  </button>
                )}
              </>
            )}
          </div>
        </header>
        <main className="audit-content">
          {hostedPreview && (
            <div className="notice no-print">
              Founder review preview. Real calculations; Stripe and email are
              disabled. Use sample or anonymized test data.{" "}
              {browserPreview
                ? "Audits save in this browser, up to 20 reports. Export before clearing browser data; cloud storage is not connected yet."
                : "Saved work belongs to this browser’s private preview account."}
            </div>
          )}
          {validation && (
            <div className="notice no-print">
              Local validation environment. Synthetic company and subscription;
              no provider connections, emails or payments. Saved audits persist
              on this computer.
            </div>
          )}
          <div className="audit-heading no-print">
            <div>
              <div className="eyebrow">THE ECONOMICS OF YOUR AI</div>
              <h1>Know what the work costs.</h1>
              <p>
                Bring usage, business context and evidence into one reviewed
                period.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setInput(emptyAudit(input.kind));
                setSample(false);
                setRecord(null);
                setCostPreview(null);
                setTab("evidence");
                setNotice(null);
              }}
            >
              ＋ New audit
            </button>
          </div>
          <div
            className="audit-tabs no-print"
            role="tablist"
            aria-label="Audit steps"
          >
            {(
              [
                ["evidence", "01", "Evidence"],
                ["results", "02", "Economics"],
                ["report", "03", "Executive report"],
              ] as const
            ).map(([key, n, label]) => (
              <button
                role="tab"
                aria-selected={tab === key}
                key={key}
                disabled={key !== "evidence" && !result && !preview}
                onClick={() => setTab(key)}
              >
                <span>{n}</span>
                {label}
                {key === "report" && !result && <small> FULL AUDIT</small>}
              </button>
            ))}
          </div>
          {error && (
            <div className="error no-print" role="alert">
              <strong>We couldn’t complete that step.</strong>
              <p>{error}</p>
              <button className="text-button" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <div className="notice no-print" role="status">
              {notice}
            </div>
          )}
          {busy && (
            <div className="working no-print" role="status">
              {busy}…
            </div>
          )}
          {tab === "evidence" && (
            <div className="audit-editor no-print">
              <section className="paper">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">01 / AUDIT BRIEF</span>
                    <h2>One period. A clear cost boundary.</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={loadSample}
                    disabled={!!busy}
                  >
                    Try synthetic example ↗
                  </button>
                </div>
                {sample && (
                  <div className="notice">
                    This audit contains synthetic sample evidence. Start a new
                    audit before uploading customer data.
                  </div>
                )}
                <div
                  className="kind-selector"
                  role="group"
                  aria-label="Audit type"
                >
                  <button
                    aria-pressed={input.kind === "product"}
                    onClick={() => changeKind("product")}
                  >
                    <strong>Customer product</strong>
                    <span>
                      Cost to serve, revenue associations and contribution.
                    </span>
                  </button>
                  <button
                    aria-pressed={input.kind === "internal"}
                    onClick={() => changeKind("internal")}
                  >
                    <strong>Internal workflow</strong>
                    <span>
                      Complete run costs, accepted outcomes and capacity.
                    </span>
                  </button>
                </div>
                <label className="field">
                  Audit name
                  <input
                    value={input.title}
                    maxLength={120}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </label>
                <div className="field-row">
                  <label className="field">
                    Period starts
                    <input
                      type="date"
                      value={input.period_start}
                      onChange={(e) => update("period_start", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Period ends
                    <input
                      type="date"
                      value={input.period_end}
                      onChange={(e) => update("period_end", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Reporting currency
                    <input
                      value="USD"
                      readOnly
                      aria-describedby="currency-note"
                    />
                  </label>
                </div>
                <p id="currency-note" className="small muted">
                  Dates are inclusive. v1 accepts USD; currency conversion
                  requires a documented, reviewed source file.
                </p>
                <div className="divider" />
                <div className="section-title">
                  <div>
                    <span className="eyebrow">02 / SOURCE EVIDENCE</span>
                    <h2>Start with the records you have.</h2>
                  </div>
                </div>
                {(Object.keys(headers) as (keyof typeof headers)[])
                  .filter(
                    (k) => input.kind !== "internal" || k !== "revenue_csv",
                  )
                  .map((key) => (
                    <details
                      className="evidence-file"
                      key={key}
                      open={key === "usage_csv" || undefined}
                    >
                      <summary>
                        <span>
                          {fileLabels[key].label}
                          {key === "usage_csv" && <small> REQUIRED</small>}
                        </span>
                        <span className={`tag ${input[key] ? "trusted" : ""}`}>
                          {input[key]
                            ? `${Math.max(0, input[key].trim().split("\n").length - 1)} rows supplied`
                            : "No file"}
                        </span>
                      </summary>
                      <div className="evidence-body">
                        <p>{fileLabels[key].hint}</p>
                        <div className="file-actions">
                          <label className="file-button">
                            Choose CSV
                            <input
                              aria-label={`Upload ${fileLabels[key].label} CSV`}
                              type="file"
                              accept=".csv,text/csv"
                              disabled={!!busy}
                              onChange={(e) => upload(key, e.target.files?.[0])}
                            />
                          </label>
                          <button
                            className="text-button"
                            onClick={() =>
                              download(
                                `inffyn-${key.replace("_csv", "")}-template.csv`,
                                headers[key] + "\n",
                                "text/csv",
                              )
                            }
                          >
                            Download template ↓
                          </button>
                          {input[key] && (
                            <button
                              className="text-button"
                              onClick={() => update(key, "")}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <label className="field">
                          Review or paste CSV
                          <textarea
                            spellCheck={false}
                            aria-label={`${fileLabels[key].label} CSV`}
                            value={input[key]}
                            placeholder={headers[key]}
                            onChange={(e) => {
                              update(key, e.target.value);
                              if (key === "revenue_csv")
                                setInput((p) => ({
                                  ...p,
                                  revenue_source: "reviewed_file",
                                  revenue_basis:
                                    p.revenue_basis === "unavailable"
                                      ? "recognized"
                                      : p.revenue_basis,
                                }));
                            }}
                            rows={5}
                          />
                        </label>
                      </div>
                    </details>
                  ))}
                {input.kind === "product" && (
                  <section className="review-block">
                    <h3>Review the revenue association</h3>
                    {!publicPreview && (
                      <div className="file-actions">
                        <button
                          className="secondary"
                          disabled={!!busy || validation || hostedPreview}
                          onClick={connectStripe}
                        >
                          Connect Stripe ↗
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy || validation || hostedPreview}
                          onClick={stripeEvidence}
                        >
                          Read paid-invoice evidence
                        </button>
                      </div>
                    )}
                    <label className="field">
                      Revenue basis
                      <select
                        value={input.revenue_basis}
                        onChange={(e) =>
                          update(
                            "revenue_basis",
                            e.target.value as AuditInput["revenue_basis"],
                          )
                        }
                      >
                        <option value="unavailable">No revenue supplied</option>
                        <option value="recognized">
                          Reviewed recognized revenue
                        </option>
                        <option value="collections">
                          Reviewed billing collections
                        </option>
                      </select>
                    </label>
                    <label className="field">
                      Unmapped feature revenue
                      <select
                        value={input.feature_allocation}
                        onChange={(e) =>
                          update(
                            "feature_allocation",
                            e.target.value as AuditInput["feature_allocation"],
                          )
                        }
                      >
                        <option value="none">Leave unallocated</option>
                        <option value="requests">
                          Model by requests within each customer
                        </option>
                        <option value="equal">
                          Model equally across each customer’s features
                        </option>
                      </select>
                    </label>
                    <p className="small muted">
                      Allocated revenue is labeled Modeled and compared across
                      both methods. Customer association alone does not
                      establish AI-caused revenue.
                    </p>
                    {input.revenue_csv && (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={input.revenue_reviewed}
                          onChange={(e) =>
                            update("revenue_reviewed", e.target.checked)
                          }
                        />
                        <span>
                          I reviewed period, currency, customer mappings,
                          refunds, credits and tax. This is the single revenue
                          source for this audit.
                        </span>
                      </label>
                    )}
                  </section>
                )}
                <div className="review-block">
                  <h3>Declare the evidence boundary</h3>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={input.cost_scope_complete}
                      onChange={(e) =>
                        update("cost_scope_complete", e.target.checked)
                      }
                    />
                    <span>
                      I have included the relevant inference, tools, compute and
                      review costs for this workflow and period.
                    </span>
                  </label>
                  {input.outcomes_csv && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={input.outcome_cohort_complete}
                        onChange={(e) =>
                          update("outcome_cohort_complete", e.target.checked)
                        }
                      />
                      <span>
                        Outcome records cover the complete run cohort, including
                        rejected and failed work, using one accepted-outcome
                        unit.
                      </span>
                    </label>
                  )}
                  <p className="small muted">
                    These are your evidence assertions. InfFyn does not
                    independently certify the completeness of your exports.
                  </p>
                </div>
                <div className="submit-row">
                  <span className="small muted">
                    {publicPreview
                      ? "Anonymous preview expires after one hour."
                      : "A saved version preserves this calculation basis."}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      !!busy || !input.usage_csv.trim() || !input.title.trim()
                    }
                    onClick={run}
                  >
                    {publicPreview
                      ? "Calculate cost preview"
                      : "Run and save audit"}{" "}
                    →
                  </button>
                </div>
              </section>
              <aside className="brief-aside">
                <div className="paper">
                  <span className="eyebrow">WHAT YOU’LL LEARN</span>
                  <h2>
                    {input.kind === "product"
                      ? "Where margin holds. Where it doesn’t."
                      : "What an accepted outcome costs."}
                  </h2>
                  <ol>
                    <li>
                      <strong>Evidence coverage</strong>
                      <p>
                        Which costs are supplied, estimated or still missing.
                      </p>
                    </li>
                    <li>
                      <strong>Economics</strong>
                      <p>
                        {input.kind === "product"
                          ? "Contribution by customer and feature, within the stated cost boundary."
                          : "Inference plus tool, compute and human-review costs across the whole workflow."}
                      </p>
                    </li>
                    <li>
                      <strong>Outcome evidence</strong>
                      <p>
                        Cost per accepted result when both the cost scope and
                        run cohort are complete.
                      </p>
                    </li>
                  </ol>
                </div>
                <div className="aside-note">
                  <span>↳</span>
                  <p>
                    A missing number stays missing. Unknown prices never become
                    zero-cost work.
                  </p>
                </div>
                {!publicPreview && !validation && !hostedPreview && (
                  <button
                    className="secondary claim-button"
                    disabled={!!busy}
                    onClick={() =>
                      action("Claiming preview", async () => {
                        setRecord(await api("previews/claim", "POST", {}));
                        await refresh();
                        setTab("results");
                      })
                    }
                  >
                    Save my anonymous preview
                  </button>
                )}
              </aside>
            </div>
          )}
          {tab === "results" && preview && !result && (
            <section className="paper preview-panel">
              <span className="eyebrow">COST PREVIEW</span>
              <h2>Your first view of the cost boundary.</h2>
              <div className="metric-grid">
                <Metric
                  label="Known included cost"
                  value={formatMoney(preview.known_cost)}
                  note={preview.basis}
                />
                <Metric
                  label="Usage rows"
                  value={String(preview.usage_rows)}
                  note={`${preview.unknown_cost_rows} rows still need a cost`}
                />
                <Metric
                  label="Requests"
                  value={Number(preview.requests).toLocaleString()}
                  note={`${Number(preview.tokens).toLocaleString()} tokens`}
                />
              </div>
              <p>
                {preview.unknown_cost_rows
                  ? "This is a known-cost subtotal. Supply missing prices or billed amounts before using a complete margin."
                  : "The supplied rows are priced. Full audits preserve the cost boundary alongside revenue and outcome evidence."}
              </p>
              {publicPreview ? (
                <Link
                  className="primary link-button"
                  href="/login?next=/app/audits"
                >
                  Sign in to save this preview →
                </Link>
              ) : (
                <div className="upgrade">
                  <h3>Review the full economics.</h3>
                  <p>
                    {billing?.monthly_price_usd
                      ? `The monthly audit workspace is $${billing.monthly_price_usd} per company. It includes recurring audits and executive reports.`
                      : "The audit workspace is $349 per company per month. Subscription activation is pending release."}
                  </p>
                  {billing?.entitled ? (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        action("Creating full report", async () => {
                          const data = await api(
                            `audits/${record!.id}/rerun`,
                            "POST",
                            {},
                          );
                          setRecord(data);
                          setCostPreview(null);
                          await refresh();
                        })
                      }
                    >
                      Create full report →
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !!busy ||
                        !billing?.billing_available ||
                        !billing?.is_owner
                      }
                      onClick={() => billingAction("checkout")}
                    >
                      {billing?.billing_available
                        ? "Subscribe via Stripe →"
                        : "Subscription activation pending"}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {result && (tab === "results" || tab === "report") && (
            <div className={tab === "report" ? "report-view" : "result-view"}>
              <div className="result-title">
                <div>
                  <span className="eyebrow">
                    {tab === "report"
                      ? "INFFYN / EXECUTIVE ECONOMICS REPORT"
                      : "REVIEWED AUDIT"}
                  </span>
                  <h2>{result.title}</h2>
                  <p>
                    {result.period_start} — {result.period_end}{" "}
                    <span className="tag">{result.summary.basis}</span>
                  </p>
                </div>
                <div className="no-print result-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        `inffyn-${record!.id}.json`,
                        JSON.stringify(record, null, 2),
                      )
                    }
                  >
                    Export report JSON ↓
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setTab("report");
                      setTimeout(() => window.print(), 100);
                    }}
                  >
                    Print / PDF ↗
                  </button>
                </div>
              </div>
              <div className="metric-grid">
                <Metric
                  label="Included cost"
                  value={formatMoney(result.summary.known_cost)}
                  note={
                    result.summary.unknown_cost_rows
                      ? `${result.summary.unknown_cost_rows} unpriced rows · subtotal only`
                      : result.evidence.scope
                  }
                />
                {result.kind === "product" ? (
                  <>
                    <Metric
                      label={
                        result.revenue_basis === "collections"
                          ? "Reviewed collections"
                          : "Reviewed revenue"
                      }
                      value={formatMoney(result.summary.revenue)}
                      note="Association does not establish causation"
                    />
                    <Metric
                      label={
                        result.revenue_basis === "collections"
                          ? "Collections less included costs"
                          : "Contribution after included costs"
                      }
                      value={formatMoney(result.summary.contribution)}
                      negative={Number(result.summary.contribution) < 0}
                      note={
                        result.summary.margin_percent === null
                          ? "Complete margin unavailable"
                          : `${Number(result.summary.margin_percent).toFixed(1)}% of ${result.revenue_basis === "collections" ? "collections" : "revenue"}`
                      }
                    />
                  </>
                ) : (
                  <>
                    <Metric
                      label="Accepted outcomes"
                      value={Number(
                        result.outcomes.accepted_quantity,
                      ).toLocaleString()}
                      note={`${result.outcomes.reviewed_runs} reviewed / ${result.outcomes.included_runs} included runs`}
                    />
                    <Metric
                      label="Cost per accepted outcome"
                      value={formatMoney(
                        result.outcomes.cost_per_accepted_outcome,
                      )}
                      note={
                        result.outcomes.cost_per_accepted_outcome === null
                          ? "Requires complete cost scope and outcome cohort"
                          : "Includes costs of failed and rejected work"
                      }
                    />
                  </>
                )}
              </div>
              <div className="evidence-cards">
                <EvidenceCard
                  number="01"
                  title="Evidence coverage"
                  value={`${result.evidence.priced_usage_rows} / ${result.evidence.usage_rows} rows priced`}
                  detail={result.evidence.scope}
                />
                <EvidenceCard
                  number="02"
                  title="Economics basis"
                  value={result.summary.basis}
                  detail={
                    result.kind === "internal"
                      ? "Revenue is not applicable to this internal workflow."
                      : `Revenue basis: ${result.revenue_basis}. ${result.evidence.association}.`
                  }
                />
                <EvidenceCard
                  number="03"
                  title="Outcome evidence"
                  value={
                    result.outcomes.cohort_complete
                      ? "Complete reviewed cohort"
                      : "Partial or unavailable"
                  }
                  detail={`${result.outcomes.reviewed_runs} runs reviewed. ${result.outcomes.capacity_basis}.`}
                />
              </div>
              <div className="result-columns">
                <section className="paper">
                  <span className="eyebrow">COST COMPOSITION</span>
                  <h3>What is included.</h3>
                  {Object.entries(result.cost_components).map(([k, v]) => (
                    <div className="cost-bar-row" key={k}>
                      <div>
                        <span>{k.replaceAll("_", " ")}</span>
                        <strong>{formatMoney(v)}</strong>
                      </div>
                      <div className="cost-track">
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, (Number(v) / Math.max(Number(result.summary.known_cost), 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="small muted">
                    Known costs only. Discounts or credits belong in the
                    reviewed source amounts.
                  </p>
                </section>
                <section className="paper">
                  <span className="eyebrow">FINDINGS TO REVIEW</span>
                  <h3>
                    {result.kind === "internal"
                      ? "Review the outcome evidence."
                      : result.findings.length
                        ? "Start with the material questions."
                        : result.summary.revenue === null
                          ? "Revenue evidence is needed to assess margin."
                          : "No margin drag identified."}
                  </h3>
                  {result.findings.length === 0 ? (
                    <p className="muted">
                      {result.kind === "internal"
                        ? "Review accepted outcome quality and the included cost scope before comparing this workflow with alternatives."
                        : result.summary.revenue === null
                          ? "This audit shows costs only. Supply reviewed revenue and its customer associations before assessing contribution or margin drag."
                          : "No negative contribution was found among mapped, priced groups. Unmapped revenue and omitted costs can still change the picture."}
                    </p>
                  ) : (
                    result.findings.slice(0, 5).map((f, i) => (
                      <div className="finding" key={i}>
                        <div>
                          <span
                            className={f.type === "Margin Drag" ? "loss" : ""}
                          >
                            {f.type}
                          </span>
                          <strong>
                            {f.impact
                              ? formatMoney(f.impact)
                              : f.type === "Accepted outcome cost"
                                ? "Review quality"
                                : "Needs evidence"}
                          </strong>
                        </div>
                        <h4>
                          {f.name ||
                            (result.kind === "internal"
                              ? "Workflow outcomes"
                              : "Cost coverage")}
                          {f.dimension && (
                            <small>
                              {" "}
                              / {dimensions[f.dimension] || f.dimension}
                            </small>
                          )}
                        </h4>
                        <p>{f.detail}</p>
                        {f.basis && <span className="tag">{f.basis}</span>}
                      </div>
                    ))
                  )}
                  <p className="small muted">
                    Findings across dimensions may refer to the same dollars. Do
                    not add their impacts together.
                  </p>
                </section>
              </div>
              {tab === "results" && (
                <section className="paper economics-table">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">DIMENSIONAL ECONOMICS</span>
                      <h3>Follow the cost to its owner.</h3>
                    </div>
                    <input
                      aria-label="Filter economic groups"
                      placeholder="Find a group…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </div>
                  <div
                    className="dimension-tabs"
                    role="tablist"
                    aria-label="Economic dimension"
                  >
                    {Object.entries(dimensions).map(([key, label]) => (
                      <button
                        role="tab"
                        aria-selected={dimension === key}
                        key={key}
                        onClick={() => setDimension(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{dimensions[dimension]}</th>
                          <th>Included cost</th>
                          <th>Revenue / collections</th>
                          <th>Contribution</th>
                          <th>Basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((g) => (
                          <tr key={g.name}>
                            <td>
                              <strong>{g.name}</strong>
                              {g.unknown_cost_rows > 0 && (
                                <small>
                                  {g.unknown_cost_rows} unpriced rows
                                </small>
                              )}
                            </td>
                            <td>{formatMoney(g.known_cost)}</td>
                            <td>{formatMoney(g.revenue)}</td>
                            <td
                              className={
                                Number(g.contribution) < 0 ? "loss" : ""
                              }
                            >
                              {formatMoney(g.contribution)}
                            </td>
                            <td>
                              <span className="tag">{g.basis}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!rows.length && (
                      <p className="muted">No groups match this filter.</p>
                    )}
                  </div>
                  <p className="small muted">
                    {result.mapping_coverage?.[dimension] && (
                      <span>
                        {result.mapping_coverage[dimension]
                          .known_cost_mapped_percent === null
                          ? "Cost mapping percentage unavailable."
                          : `${Number(result.mapping_coverage[dimension].known_cost_mapped_percent).toFixed(1)}% of absolute known cost is mapped.`}{" "}
                        Unmapped revenue / collections:{" "}
                        {formatMoney(
                          result.mapping_coverage[dimension].unmapped_revenue,
                        )}
                        .{" "}
                      </span>
                    )}
                    Each dimension reconciles independently. “Unmapped” keeps
                    unassigned amounts visible. A dash means unavailable or not
                    applicable.
                  </p>
                </section>
              )}
              <section className="paper sensitivity">
                <span className="eyebrow">ASSUMPTIONS & OUTCOME VALUE</span>
                <h3>Keep the conclusion attached to the evidence.</h3>
                <p>{result.sensitivity.detail}</p>
                {result.sensitivity.features && (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Feature</th>
                          <th>Contribution range</th>
                          <th>Method sensitivity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sensitivity.features.map((s) => (
                          <tr key={s.feature}>
                            <td>{s.feature}</td>
                            <td>
                              {formatMoney(s.min_contribution)} to{" "}
                              {formatMoney(s.max_contribution)}
                            </td>
                            <td>{s.classification}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {result.outcomes.modeled_capacity_value !== null && (
                  <p>
                    <strong>
                      {formatMoney(result.outcomes.modeled_capacity_value)}{" "}
                      modeled capacity value.
                    </strong>{" "}
                    Based on supplied before/after effort and loaded labor
                    rates. It is not realized cash savings and is not added to
                    contribution.
                  </p>
                )}
                <p className="small muted">
                  {result.evidence.source_review}. Reference pricing is an
                  estimate; the report does not certify supplier-bill
                  reconciliation.{" "}
                  {result.revenue_basis === "collections" &&
                    "Billing collections are not recognized revenue."}
                </p>
              </section>
              {tab === "results" && (
                <details className="paper trace no-print">
                  <summary>
                    Inspect calculation evidence · {result.trace.length} cost
                    records
                  </summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Category</th>
                          <th>Cost</th>
                          <th>Basis</th>
                          <th>Source</th>
                          <th>Rate version</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trace.map((e, i) => (
                          <tr key={i}>
                            <td>{e.id}</td>
                            <td>{e.category}</td>
                            <td>{formatMoney(e.cost)}</td>
                            <td>{e.basis}</td>
                            <td>{e.source || "Unavailable"}</td>
                            <td>{e.rate_id || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <footer className="report-footer">
                <span>InfFyn · {result.calculation_version}</span>
                <span>
                  Evidence fingerprint: {result.fingerprint.slice(0, 16)}…
                </span>
                <span>
                  Saved {new Date(record!.created_at).toLocaleString()}
                </span>
              </footer>
            </div>
          )}
          {tab === "report" && !result && (
            <section className="paper">
              <h2>An executive report needs a full audit.</h2>
              <p>
                Save the cost preview, then activate the monthly workspace to
                review profitability and outcome evidence.
              </p>
            </section>
          )}
          {record && !publicPreview && (
            <div className="record-actions no-print">
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  action("Loading saved evidence", async () => {
                    const data = await api(`audits/${record.id}/evidence`);
                    setInput(data.payload);
                    setTab("evidence");
                    setNotice(
                      "Loaded the saved evidence. Edits create a new version; this saved report is preserved.",
                    );
                  })
                }
              >
                Edit a new version
              </button>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  action("Exporting evidence", async () => {
                    const data = await api(`audits/${record.id}/evidence`);
                    download(
                      `inffyn-evidence-${record.id}.json`,
                      JSON.stringify(data.payload, null, 2),
                    );
                  })
                }
              >
                Export original evidence ↓
              </button>
              {billing?.is_owner &&
                (deleteConfirm ? (
                  <>
                    <span>Delete this audit and its retained evidence?</span>
                    <button
                      className="danger-button"
                      disabled={!!busy}
                      onClick={() =>
                        action("Deleting audit", async () => {
                          await api(`audits/${record.id}`, "DELETE");
                          setRecord(null);
                          setCostPreview(null);
                          setTab("evidence");
                          setDeleteConfirm(false);
                          await refresh();
                        })
                      }
                    >
                      Confirm deletion
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Keep audit
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button loss"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    Delete audit
                  </button>
                ))}
            </div>
          )}
          <p className="workspace-footnote no-print">
            One company. One reviewed period. No opaque score.{" "}
            <span>
              Provider independent · Explicit evidence · Reproducible results
            </span>
          </p>
        </main>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  negative = false,
}: {
  label: string;
  value: string;
  note: string;
  negative?: boolean;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={negative ? "loss" : ""}>{value}</strong>
      <p>{note}</p>
    </div>
  );
}
function EvidenceCard({
  number,
  title,
  value,
  detail,
}: {
  number: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="evidence-card">
      <span className="eyebrow">
        {number} / {title}
      </span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
