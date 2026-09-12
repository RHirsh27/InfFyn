"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BillingState,
  download,
  emptyAudit,
  formatMoney,
  headers,
} from "@/lib/audit-v2";
import {
  Connection,
  EvidenceScore,
  ImportJob,
  MonthlyAudit,
  MonthlyInput,
  PerformanceMonth,
  Report,
  ReportSummary,
  Review,
  Selection,
  Workload,
  WorkloadEvidence,
  CostAssignment,
  InvoiceAllocation,
  MonthlyDraft,
  DraftContent,
  csvFrom,
  errorMessage,
  evidenceFor,
} from "@/lib/monthly";
import "../audit/workspace.css";
import "./workspace.css";
import {
  ExecutiveOverview,
  ExecutiveReport,
  WorkspaceIcon,
  monthLabel,
} from "./executive";
import { WorkloadEditor } from "./workload-editor";
import { ReviewPreparation } from "./review-preparation";
import { ImportReviewPanel } from "./import-review";
import { mergePreparedEvidence } from "./preparation-state";

type Tab =
  | "Overview"
  | "Workloads"
  | "Connections"
  | "Monthly Review"
  | "Reports"
  | "Settings";
const fileNames: Record<keyof typeof headers, string> = {
  usage_csv: "Usage and event costs",
  costs_csv: "Other costs or provider totals",
  rates_csv: "Dated reference prices",
  revenue_csv: "Revenue and adjustments",
  outcomes_csv: "Accepted, rejected, and failed outcomes",
};
const blankWorkload = (): Workload => ({
  id: "",
  name: "",
  kind: "product",
  outcome_unit: "",
  cost_scope: "",
  acceptance_definition: "",
  unallocated: false,
  mappings: {},
});
const num = (v: unknown) =>
  v === null || v === undefined
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
        Number(v),
      );
const pct = (v: unknown) =>
  v === null || v === undefined ? "Unavailable" : `${num(v)}%`;
function stableDraft(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
function clearReview(item: WorkloadEvidence): WorkloadEvidence {
  return {
    ...item,
    audit: {
      ...item.audit,
      revenue_reviewed: false,
      cost_scope_complete: false,
      outcome_cohort_complete: false,
    },
    review: {
      ...item.review,
      method_reviewed: false,
      revenue_scope_complete: false,
      outcome_method_reviewed: false,
    },
  };
}

function Score({ label, value }: { label: string; value: EvidenceScore }) {
  return (
    <details className="monthly-confidence">
      <summary>
        <span>{label}</span>
        <strong>{value.score === null ? "N/A" : `${value.score}/100`}</strong>
        <span
          className={`monthly-badge ${value.state === "ready" ? "trusted" : ""}`}
        >
          {value.state.replaceAll("_", " ")}
        </span>
      </summary>
      <p>{value.meaning}</p>
      {value.checks.map((c) => (
        <div className="monthly-check" key={c.id}>
          <strong>
            {c.status === "pass" ? "✓" : "○"} {c.label}{" "}
            <small>{c.points}/20</small>
          </strong>
          <p>{c.reason}</p>
        </div>
      ))}
      <small>
        Method {value.version}. Source provenance remains unchanged by this
        score.
      </small>
    </details>
  );
}

export function MonthlyWorkspace({
  validation = false,
  demo = false,
  privateAlpha = false,
}: {
  validation?: boolean;
  demo?: boolean;
  privateAlpha?: boolean;
}) {
  const [company, setCompany] = useState("Company workspace");
  const [demoReports, setDemoReports] = useState<Report[]>([]);
  const [revision, setRevision] = useState(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<CostAssignment[]>([]);
  const [invoiceAllocations, setInvoiceAllocations] = useState<
    InvoiceAllocation[]
  >([]);

  const [reviewStep, setReviewStep] = useState(0);
  const lastSaved = useRef("");
  const saveInFlight = useRef(false);
  const revisionRef = useRef(0);
  const latestDraftSignature = useRef("");
  const draftLoadSequence = useRef(0);
  const beforePrint = useRef<() => void>(() => {});
  const restorePrint = useRef<() => void>(() => {});
  const [tab, setTab] = useState<Tab>("Overview");
  const [month, setMonth] = useState(() =>
    emptyAudit().period_start.slice(0, 7),
  );
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [editing, setEditing] = useState<Workload>(blankWorkload);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [legacyAudits, setLegacyAudits] = useState<
    { id: string; title: string; kind: string; access_level: string }[]
  >([]);
  const [adoptAudit, setAdoptAudit] = useState("");
  const [adoptWorkload, setAdoptWorkload] = useState("");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [performance, setPerformance] = useState<PerformanceMonth[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [drafts, setDrafts] = useState<WorkloadEvidence[]>([]);
  const [draft, setDraft] = useState<WorkloadEvidence | null>(null);
  const [scopeComplete, setScopeComplete] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [credentialProvider, setCredentialProvider] = useState("");
  const [credential, setCredential] = useState("");
  const [credentialLabel, setCredentialLabel] = useState("");
  const [selectionReason, setSelectionReason] = useState(
    "Reviewed evidence and reporting basis",
  );
  const [deleteId, setDeleteId] = useState("");
  const mounted = useRef(true);
  const base = validation ? "/api/validation" : "/api/v2";

  async function api(path: string, method = "GET", body?: unknown) {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized && new TextEncoder().encode(serialized).length > 4_000_000)
      throw new Error(
        "Combined evidence exceeds 4 MB. Aggregate your exports while retaining business dimensions.",
      );
    const r = await fetch(`${base}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: serialized,
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(errorMessage(data));
    return data;
  }
  async function refresh() {
    if (demo) return performance;
    const [w, b, r, p, c, i, a] = await Promise.all([
      api("monthly/workloads"),
      api("billing"),
      api("monthly/reports"),
      api("monthly/performance"),
      api("monthly/connections"),
      api("monthly/imports"),
      privateAlpha ? Promise.resolve({ audits: [] }) : api("audits"),
    ]);
    if (!mounted.current) return;
    setWorkloads(w.workloads);
    setBilling(b);
    setReports(r.reports);
    setSelections(r.selections);
    setPerformance(p.months);
    setConnections(c.connections);
    setImports(i.imports);
    setLegacyAudits(
      a.audits.filter(
        (x: { access_level: string }) => x.access_level === "full",
      ),
    );
    return p.months as PerformanceMonth[];
  }
  useEffect(() => {
    mounted.current = true;
    if (demo) {
      fetch("/api/demo/company", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok)
            throw new Error(
              "The demonstration is temporarily unavailable. Please try again.",
            );
          return r.json();
        })
        .then((d) => {
          if (!mounted.current) return;
          setCompany(d.company.name);
          setDemoReports(d.reports);
          setReports(d.reports);
          setWorkloads(d.workloads);
          setSelections(d.selections);
          setPerformance(d.performance);
          setConnections(d.connections);
          const latest = d.reports[0];
          if (latest) {
            setReport(latest);
            setMonth(latest.month);
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
      return () => {
        mounted.current = false;
      };
    }
    refresh()
      .then(async (p) => {
        if (mounted.current && p?.length) {
          const selected = await api(
            `monthly/reports/${p[p.length - 1].report.id}`,
          );
          if (mounted.current) {
            setReport(selected);
            setMonth(selected.month);
          }
        }
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let originalStates: Map<HTMLDetailsElement, boolean> | null = null;
    const before = () => {
      // Chrome may dispatch beforeprint more than once for one dialog.
      // Keep the first snapshot so cancellation restores the original view.
      if (originalStates) return;
      originalStates = new Map(
        Array.from(
          document.querySelectorAll<HTMLDetailsElement>(
            ".monthly-report details",
          ),
        ).map((element) => [element, element.open]),
      );
      originalStates.forEach((_open, element) => {
        element.open = true;
      });
    };
    const after = () => {
      originalStates?.forEach((open, element) => {
        element.open = open;
      });
      originalStates = null;
    };
    beforePrint.current = before;
    restorePrint.current = after;
    const media = window.matchMedia("print");
    const changed = (event: MediaQueryListEvent) =>
      event.matches ? before() : after();
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    media.addEventListener("change", changed);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      media.removeEventListener("change", changed);
      after();
      beforePrint.current = () => {};
      restorePrint.current = () => {};
    };
  }, []);
  function printReport() {
    beforePrint.current();
    try {
      window.print();
    } finally {
      // The button path also restores state when a browser omits afterprint.
      restorePrint.current();
    }
  }
  function assembledDraft(): DraftContent {
    return {
      month,
      company_scope_complete: scopeComplete,
      workloads: draft
        ? [...drafts.filter((x) => x.workload_id !== draft.workload_id), draft]
        : drafts,
      import_ids: selectedImports,
      cost_assignments: assignments,
      invoice_allocations: invoiceAllocations,
      step: (["import", "assign", "reconcile", "review", "save"] as const)[
        reviewStep
      ],
    };
  }
  async function loadDraft(target = month) {
    const loadSequence = ++draftLoadSequence.current;
    const response = await api(`monthly/drafts/${target}`);
    if (loadSequence !== draftLoadSequence.current || !mounted.current) return;
    const stored: MonthlyDraft | null = response.draft;
    const content: DraftContent = stored?.content || {
      month: target,
      company_scope_complete: false,
      workloads: [],
      import_ids: [],
      cost_assignments: [],
      invoice_allocations: [],
    };
    setDrafts(content.workloads);
    setDraft(null);
    setScopeComplete(content.company_scope_complete);
    setSelectedImports(content.import_ids);
    setAssignments(content.cost_assignments);
    setInvoiceAllocations(content.invoice_allocations);
    setReviewStep(
      Math.max(
        0,
        ["import", "assign", "reconcile", "review", "save"].indexOf(
          content.step || "import",
        ),
      ),
    );
    setRevision(stored?.revision || 0);
    revisionRef.current = stored?.revision || 0;
    setDraftSavedAt(stored?.updated_at || "");
    setDraftConflict(false);
    lastSaved.current = stableDraft(content);
    setDraftLoaded(true);
    if (stored?.invalidations?.length)
      setNotice(
        "Evidence or definitions changed. Review confirmations have been cleared for affected workloads.",
      );
  }
  async function saveDraft() {
    if (demo || !draftLoaded || draftConflict) return;
    if (saveInFlight.current)
      throw new Error(
        "Progress is currently saving. Your edits are retained; try again once the save finishes.",
      );
    const content = assembledDraft(),
      signature = stableDraft(content);
    if (signature === lastSaved.current) return;
    saveInFlight.current = true;
    try {
      const response = await api(`monthly/drafts/${month}`, "PUT", {
        expected_revision: revision,
        content,
      });
      const stored: MonthlyDraft = response.draft;
      setRevision(stored.revision);
      revisionRef.current = stored.revision;
      setDraftSavedAt(stored.updated_at);
      const canonical = stored.content;
      if (latestDraftSignature.current === signature) {
        setDrafts(canonical.workloads);
        setDraft((d) =>
          d
            ? canonical.workloads.find(
                (x) => x.workload_id === d.workload_id,
              ) || null
            : null,
        );
        setScopeComplete(canonical.company_scope_complete);
        setSelectedImports(canonical.import_ids);
        setAssignments(canonical.cost_assignments);
        setInvoiceAllocations(canonical.invoice_allocations);
        lastSaved.current = stableDraft(canonical);
      } else lastSaved.current = signature;
      if (stored.invalidations?.length) {
        const affected = new Set(stored.invalidations);
        setDrafts((items) =>
          items.map((item) =>
            affected.has(item.workload_id) ? clearReview(item) : item,
          ),
        );
        setDraft((item) =>
          item && affected.has(item.workload_id) ? clearReview(item) : item,
        );
        setScopeComplete(false);
        setNotice(
          "Changes to evidence or assignments cleared the affected review confirmations. Review them before saving a report.",
        );
      }
    } catch (e) {
      setDraftConflict(true);
      setError(
        e instanceof Error
          ? e.message
          : "Draft could not be saved. Your edits remain in this tab.",
      );
      throw e;
    } finally {
      saveInFlight.current = false;
    }
  }
  useEffect(() => {
    if (demo || loading) return;
    setDraftLoaded(false);
    loadDraft(month).catch((e) => setError(e.message));
  }, [month, loading, demo]);
  const draftSignature = stableDraft(assembledDraft());
  latestDraftSignature.current = draftSignature;
  useEffect(() => {
    if (!draftLoaded || draftConflict || demo || loading) return;
    const timer = window.setTimeout(() => {
      if (!saveInFlight.current) saveDraft().catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draftSignature, draftLoaded, draftConflict, revision, demo, loading]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!demo && draftLoaded && draftSignature !== lastSaved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftSignature, draftLoaded, demo]);
  async function prepare() {
    const current = assembledDraft().workloads;
    const previousIds = [
      ...new Set(current.flatMap((x) => x.import_ids || [])),
    ];
    const priorImports: ImportJob[] = await Promise.all(
      previousIds.map((id) => api(`monthly/imports/${id}/evidence`)),
    );
    const costIds = new Set(
      priorImports.flatMap(
        (job) => job.evidence?.costs.map((row) => row.cost_id) || [],
      ),
    );
    const response = await api("monthly/prepare", "POST", {
      month,
      import_ids: selectedImports,
      cost_assignments: assignments,
      invoice_allocations: invoiceAllocations,
    });
    const merged = mergePreparedEvidence(
      current,
      response.workloads,
      workloads,
      month,
      costIds,
      selectedImports,
    );
    setSelectedImports(response.import_ids);
    setDrafts(merged);
    setDraft(merged[0] || null);
    setScopeComplete(false);
    setReviewStep(2);
    setNotice(
      `Imported evidence prepared. ${formatMoney(String(response.unallocated_cost || "0"))} in unallocated cost and ${formatMoney(String(response.unassigned_revenue || "0"))} in unassigned collections remain visible. Review each workload before saving.`,
    );
  }
  async function action(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy("");
    }
  }
  function changeMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    action("Opening reporting month", async () => {
      if (!demo) await saveDraft();
      if (draftConflict)
        throw new Error(
          "Save or export your current edits before changing months.",
        );
      setDraftLoaded(false);
      setMonth(value);
      const selectedMonth = performance.find((p) => p.report.month === value);
      if (selectedMonth) {
        const r = demo
          ? demoReports.find((x) => x.id === selectedMonth.report.id)
          : await api(`monthly/reports/${selectedMonth.report.id}`);
        setReport(r || null);
      } else setReport(null);
    });
  }
  function chooseWorkload(id: string) {
    const w = workloads.find((x) => x.id === id);
    if (!w) return;
    if (draft)
      setDrafts((prev) => [
        ...prev.filter((x) => x.workload_id !== draft.workload_id),
        draft,
      ]);
    setDraft(drafts.find((x) => x.workload_id === id) || evidenceFor(w, month));
  }
  function updateAudit<K extends keyof MonthlyAudit>(
    key: K,
    value: MonthlyAudit[K],
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            reviewed_imports: key.endsWith("_csv")
              ? Object.fromEntries(Object.entries(d.reviewed_imports || {}).filter(([field]) => field !== key))
              : d.reviewed_imports,
            audit: {
              ...d.audit,
              [key]: value,
              ...(key.endsWith("_csv")
                ? { cost_scope_complete: false, outcome_cohort_complete: false }
                : {}),
              ...(["revenue_csv", "revenue_basis"].includes(key)
                ? { revenue_reviewed: false }
                : {}),
            },
            review: key.endsWith("_csv")
              ? {
                  ...d.review,
                  method_reviewed: false,
                  outcome_method_reviewed: false,
                }
              : d.review,
          }
        : d,
    );
  }
  function updateReview<K extends keyof Review>(key: K, value: Review[K]) {
    setDraft((d) => (d ? { ...d, review: { ...d.review, [key]: value } } : d));
  }
  async function file(key: keyof typeof headers, input: HTMLInputElement) {
    const selected = input.files?.[0];
    if (!selected) return;
    if (selected.size > 4_000_000) {
      setError("The file exceeds 4 MB.");
      return;
    }
    updateAudit(key, await selected.text());
    input.value = "";
  }
  async function calculate() {
    if (!draft && !drafts.length)
      throw new Error("Choose a workload and add evidence first.");
    if (draftConflict)
      throw new Error(
        "Resolve the draft save conflict before creating a report.",
      );
    if (saveInFlight.current)
      throw new Error(
        "Draft progress is saving. Wait for the save to finish before creating a report.",
      );
    const submittedSignature = latestDraftSignature.current;
    await saveDraft();
    const retained = await api(`monthly/drafts/${month}`);
    const content: DraftContent | undefined = retained.draft?.content;
    if (!content)
      throw new Error("Save the preparation before creating a report.");
    if (
      retained.draft.revision !== revisionRef.current ||
      stableDraft(content) !== lastSaved.current
    ) {
      setDraftConflict(true);
      throw new Error(
        "The company draft changed since your review. Your edits are retained. Reload the saved version and review it before creating a report.",
      );
    }
    if (latestDraftSignature.current !== submittedSignature)
      throw new Error(
        "Review the updated draft confirmations before creating the report.",
      );
    const all = content.workloads;
    const input: MonthlyInput = {
      schema_version: "monthly-1.0",
      month,
      company_scope_complete: content.company_scope_complete,
      workloads: all,
      invoice_allocations: content.invoice_allocations,
      import_ids: content.import_ids,
      cost_assignments: content.cost_assignments,
    };
    const saved = await api("monthly/reports", "POST", input);
    setDrafts(all);
    setReport(saved);
    await refresh();
    setTab("Reports");
    setNotice(
      "Calculation saved as an immutable report version. Select it for monthly history after review.",
    );
  }
  async function loadReport(id: string, edit = false) {
    if (demo) {
      setReport(demoReports.find((r) => r.id === id) || null);
      setTab("Reports");
      return;
    }
    const r = await api(`monthly/reports/${id}`);
    setReport(r);
    if (edit) {
      await saveDraft();
      const existing = await api(`monthly/drafts/${r.month}`);
      if (existing.draft?.content.workloads.length)
        throw new Error(
          "This month already has saved preparation. Open Monthly Review to continue it; export that draft before replacing evidence.",
        );
      const d = await api(`monthly/reports/${id}/evidence`);
      const content: DraftContent = {
        month: d.payload.month,
        company_scope_complete: d.payload.company_scope_complete,
        workloads: d.payload.workloads,
        import_ids: d.payload.import_ids || [],
        cost_assignments: d.payload.cost_assignments || [],
        invoice_allocations: d.payload.invoice_allocations || [],
        step: "reconcile",
      };
      await api(`monthly/drafts/${r.month}`, "PUT", {
        expected_revision: existing.draft?.revision || 0,
        content,
      });
      setMonth(d.payload.month);
      await loadDraft(d.payload.month);
      setReviewStep(2);
      setTab("Monthly Review");
    } else setTab("Reports");
  }
  async function runImport(job: ImportJob) {
    let current = job;
    for (let n = 0; n < 200 && mounted.current; n++) {
      if (current.state === "complete") break;
      current = await api(`monthly/imports/${job.id}/advance`, "POST", {});
      setBusy(`Importing ${job.provider} · page ${current.step}`);
      setImports((prev) => [current, ...prev.filter((x) => x.id !== job.id)]);
      if (current.state === "failed")
        throw new Error(
          current.error || "Import failed. Resume when the issue is resolved.",
        );
    }
    await refresh();
    setNotice(
      current.state === "complete"
        ? "Import complete. Review its coverage before adding it to a report."
        : "Import progress saved. Resume from Data when ready.",
    );
  }
  async function applyImport(job: ImportJob) {
    if (job.month !== month)
      throw new Error(
        "Select the import's reporting month before adding it to preparation.",
      );
    setSelectedImports((ids) => [...new Set([...ids, job.id])]);
    setReviewStep(1);
    setTab("Monthly Review");
    setNotice(
      "Import selected. Review the source assignments before preparing workload evidence.",
    );
  }

  const current = report?.result;
  const selected = report && selections.find((x) => x.month === report.month);
  const currentPerformance =
    report && performance.find((x) => x.report.id === report.id);
  const selectedWorkload =
    draft && workloads.find((x) => x.id === draft.workload_id);
  const entitled = demo || !!billing?.entitled;

  return (
    <div className="audit-shell monthly-shell">
      <aside className="audit-rail">
        <Link className="audit-brand" href="/">
          Inf<span>Fyn</span>
          <small>AI ECONOMICS</small>
        </Link>
        <div className="company-identity">
          <span className="company-avatar">{demo ? "N" : "C"}</span>
          <div>
            <strong>{company}</strong>
            <small>
              {demo
                ? "Synthetic demonstration"
                : privateAlpha
                  ? "Private alpha"
                  : "Independent company"}
            </small>
          </div>
        </div>
        <span className="rail-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          {(
            [
              "Overview",
              "Workloads",
              "Connections",
              "Monthly Review",
              "Reports",
              "Settings",
            ] as Tab[]
          ).map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              <WorkspaceIcon name={t} />
              <span>{t}</span>
            </button>
          ))}
        </nav>
        <div className="monthly-rail-footer">
          <span className="monthly-badge">
            {demo
              ? "Synthetic demonstration"
              : validation
                ? "Local validation"
                : privateAlpha
                  ? "Private alpha"
                  : billing?.access_source || "Secure workspace"}
          </span>
          <p>
            Every number has a basis.
            <br />
            Every month keeps its history.
          </p>
          {!privateAlpha && <Link href="/app/audits">Earlier audits →</Link>}
          <Link href="/methodology">How the numbers work →</Link>
          {!demo && !validation && (
            <form
              action="/auth/signout"
              method="post"
              onSubmit={(event) => {
                if (
                  saveInFlight.current ||
                  draftConflict ||
                  (draftLoaded && draftSignature !== lastSaved.current)
                ) {
                  event.preventDefault();
                  setError(
                    "Wait for preparation to save or resolve its conflict before signing out.",
                  );
                }
              }}
            >
              <button type="submit" className="monthly-signout">
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>
      <main className="monthly-main">
        <header className="monthly-topline">
          <span>
            Workspace <span className="company-breadcrumb">/ {tab}</span>
          </span>
          <span className="company-top-context">
            USD <span>·</span>{" "}
            {demo
              ? "Synthetic demonstration"
              : privateAlpha
                ? "Private alpha · Company workspace"
                : "Company workspace"}
          </span>
        </header>
        {demo && (
          <div className="company-demo-banner">
            <span>
              <strong>Northstar Intelligence</strong> · Synthetic company
              demonstration. All figures are generated by the real calculation
              engine.
            </span>
            <Link href="/methodology">How the numbers work ↗</Link>
          </div>
        )}
        {validation && (
          <div className="monthly-notice">
            Local validation environment. Provider connections, payments, and
            email are disabled.
          </div>
        )}
        {privateAlpha && !demo && (
          <div className="monthly-notice">
            <strong>Private alpha.</strong> Use your company CSV evidence to
            prepare and save monthly reports. Provider connections and paid
            billing are deferred. Review scope and evidence limitations before
            acting on a result.
          </div>
        )}
        <div className="monthly-heading">
          <div>
            <span className="eyebrow">
              {tab === "Overview"
                ? "THE ECONOMICS OF YOUR AI"
                : tab.toUpperCase()}
            </span>
            <h1>
              {tab === "Overview"
                ? "Your AI investment, in perspective."
                : tab === "Workloads"
                  ? "Define the work. Understand its value."
                  : tab === "Connections"
                    ? "Bring your evidence together."
                    : tab === "Monthly Review"
                      ? "A clear path through the month."
                      : tab === "Reports"
                        ? "A report built for the decision."
                        : "Your company. Your workspace."}
            </h1>
            <p>
              {tab === "Overview"
                ? "Understand spending, contribution, and the cost of useful work—month after month."
                : tab === "Monthly Review"
                  ? "Import a period, review its coverage, and build a traceable monthly report."
                  : "Independent AI economics, with the detail behind every result."}
            </p>
          </div>
          <label className="monthly-period">
            REPORTING MONTH
            <input
              type="month"
              value={month}
              max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => changeMonth(e.target.value)}
              disabled={!!busy}
            />
          </label>
        </div>
        {error && (
          <div className="monthly-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="monthly-notice" role="status">
            {notice}
          </div>
        )}
        {busy && (
          <div className="monthly-progress" role="status">
            {busy}…
          </div>
        )}
        {loading ? (
          <div className="monthly-empty">Loading your company workspace…</div>
        ) : (
          <>
            {!entitled && privateAlpha && (
              <div className="monthly-notice">
                <strong>Workspace access is awaiting activation.</strong> Your
                named account needs a complimentary company access grant before
                you can save financial evidence. No payment is required.
              </div>
            )}
            {!entitled && !privateAlpha && (
              <div className="monthly-notice">
                <strong>Start your monthly economics workspace.</strong> $349
                per company per month includes product and internal workloads,
                reports, and monthly history.{" "}
                <button
                  disabled={
                    !!busy || !billing?.billing_available || !billing?.is_owner
                  }
                  onClick={() =>
                    action("Opening checkout", async () => {
                      const r = await api("billing/checkout", "POST", {});
                      window.location.assign(r.url);
                    })
                  }
                >
                  {billing?.billing_available
                    ? "Subscribe"
                    : "Checkout awaiting activation"}
                </button>
              </div>
            )}
            {tab === "Overview" && (
              <ExecutiveOverview
                report={report}
                performance={performance}
                month={month}
                onReport={(id) =>
                  action("Opening report", () => loadReport(id))
                }
                onReview={() => setTab("Monthly Review")}
                onWorkloads={() => setTab("Workloads")}
              />
            )}
            {tab === "Workloads" && (
              <WorkloadEditor
                workloads={workloads}
                editing={editing}
                onChange={setEditing}
                onNew={() => setEditing(blankWorkload())}
                busy={!!busy}
                disabled={!entitled || demo}
                onSave={() =>
                  action("Saving workload", async () => {
                    const r = await api(
                      `monthly/workloads/${editing.id || crypto.randomUUID()}`,
                      "POST",
                      Object.fromEntries(
                        Object.entries(editing).filter(([k]) => k !== "id"),
                      ),
                    );
                    setEditing(r);
                    await refresh();
                    setNotice(
                      "Workload saved. Assign provider sources during the monthly review.",
                    );
                  })
                }
              />
            )}
            {(tab === "Connections" || tab === "Monthly Review") && (
              <>
                {tab === "Connections" && (
                  <section className="monthly-panel">
                    <div className="monthly-section-head">
                      <div>
                        <span className="eyebrow">YOUR SOURCE SYSTEMS</span>
                        <h2>Connect the evidence</h2>
                      </div>
                      <button onClick={() => setTab("Monthly Review")}>
                        Prepare the month →
                      </button>
                    </div>
                    <p>
                      {privateAlpha
                        ? "CSV evidence is available in Monthly Review. OpenAI, Anthropic and Stripe connections are deferred during the private alpha."
                        : "Read-only reporting access. Import a specific month, then review where its costs and collections belong."}
                    </p>
                    <div className="monthly-connector-grid">
                      {connections.map((c) => (
                        <div className="monthly-connector" key={c.provider}>
                          <div className="monthly-section-head">
                            <h3>
                              {c.provider === "openai"
                                ? "OpenAI"
                                : c.provider === "anthropic"
                                  ? "Anthropic"
                                  : "Stripe revenue"}
                            </h3>
                            <span className="monthly-badge">
                              {privateAlpha
                                ? "Deferred in private alpha"
                                : c.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <p>{c.notice}</p>
                          <div className="monthly-actions">
                            <button
                              disabled={
                                privateAlpha ||
                                !c.available ||
                                !billing?.is_owner ||
                                !!busy ||
                                !entitled
                              }
                              onClick={() => {
                                if (c.provider === "stripe")
                                  action(
                                    "Opening Stripe authorization",
                                    async () => {
                                      const r = await fetch(
                                        "/api/stripe/connect",
                                        { method: "POST" },
                                      );
                                      const d = await r.json();
                                      if (!r.ok)
                                        throw new Error(errorMessage(d));
                                      window.location.assign(d.authorize_url);
                                    },
                                  );
                                else {
                                  setCredentialProvider(c.provider);
                                  setCredentialLabel(c.label);
                                  setCredential("");
                                }
                              }}
                            >
                              {privateAlpha
                                ? "Deferred"
                                : c.available
                                  ? "Connect / replace"
                                  : "Awaiting activation"}
                            </button>
                            <button
                              disabled={
                                privateAlpha ||
                                !c.available ||
                                !!busy ||
                                !entitled
                              }
                              onClick={() =>
                                action(
                                  `Starting ${c.provider} import`,
                                  async () => {
                                    const job = await api(
                                      `monthly/imports/${c.provider}`,
                                      "POST",
                                      {
                                        month,
                                        request_id: crypto.randomUUID(),
                                      },
                                    );
                                    await runImport(job);
                                  },
                                )
                              }
                            >
                              Import month
                            </button>
                            {!privateAlpha &&
                              c.status !== "not_connected" &&
                              c.status !== "unavailable" && (
                                <button
                                  disabled={
                                    !!busy || !billing?.is_owner || demo
                                  }
                                  onClick={() =>
                                    action("Disconnecting", async () => {
                                      const r = await api(
                                        `monthly/connections/${c.provider}`,
                                        "DELETE",
                                      );
                                      await refresh();
                                      setNotice(r.notice);
                                    })
                                  }
                                >
                                  Disconnect
                                </button>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {credentialProvider && (
                      <form
                        className="monthly-credential monthly-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const secret = credential;
                          setCredential("");
                          action("Saving encrypted credential", async () => {
                            await api(
                              `monthly/connections/${credentialProvider}`,
                              "POST",
                              { credential: secret, label: credentialLabel },
                            );
                            setCredentialProvider("");
                            await refresh();
                            setNotice(
                              "Credential stored. Import a period to verify provider permissions.",
                            );
                          });
                        }}
                      >
                        <h3>Connect {credentialProvider}</h3>
                        <p>
                          Use an organization credential authorized for usage
                          and costs. These providers may require administrative
                          access. InfFyn only calls the documented reporting
                          endpoints.
                        </p>
                        <label>
                          Connection label
                          <input
                            required
                            value={credentialLabel}
                            onChange={(e) => setCredentialLabel(e.target.value)}
                          />
                        </label>
                        <label>
                          Credential
                          <input
                            type="password"
                            autoComplete="off"
                            required
                            minLength={20}
                            value={credential}
                            onChange={(e) => setCredential(e.target.value)}
                          />
                        </label>
                        <div className="monthly-actions">
                          <button disabled={!!busy} className="primary">
                            Store securely
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCredentialProvider("");
                              setCredential("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                    {!!imports.length && (
                      <div className="monthly-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Import</th>
                              <th>Status</th>
                              <th>Evidence rows</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {imports.map((j) => (
                              <tr key={j.id}>
                                <td>
                                  {j.provider} · {j.month}
                                </td>
                                <td>
                                  {j.state}
                                  <small>{j.error}</small>
                                </td>
                                <td>
                                  {Object.entries(j.counts)
                                    .map(([k, v]) => `${v} ${k}`)
                                    .join(" · ")}
                                </td>
                                <td>
                                  <div className="monthly-actions">
                                    {j.state !== "complete" ? (
                                      <button
                                        disabled={!!busy || !entitled || demo}
                                        onClick={() =>
                                          action("Resuming import", () =>
                                            runImport(j),
                                          )
                                        }
                                      >
                                        Resume
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          disabled={!!busy}
                                          onClick={() =>
                                            action(
                                              "Applying reviewed mappings",
                                              () => applyImport(j),
                                            )
                                          }
                                        >
                                          Use evidence
                                        </button>
                                        <button
                                          disabled={!!busy}
                                          onClick={() =>
                                            action(
                                              "Preparing export",
                                              async () => {
                                                const r = await api(
                                                  `monthly/imports/${j.id}/evidence`,
                                                );
                                                download(
                                                  `${j.provider}-${j.month}-evidence.json`,
                                                  JSON.stringify(r, null, 2),
                                                  "application/json",
                                                );
                                              },
                                            )
                                          }
                                        >
                                          Inspect / export
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
                {tab === "Monthly Review" && (
                  <>
                    {demo ? (
                      <section className="monthly-panel">
                        <h2>A reviewable monthly record</h2>
                        <p>
                          This demonstration contains six calculated company
                          reports. Customer preparation, source credentials and
                          draft changes stay in your own authenticated
                          workspace.
                        </p>
                        <button onClick={() => setTab("Reports")}>
                          Inspect the sample report →
                        </button>
                        <Link className="primary" href="/methodology">
                          Read the methodology ↗
                        </Link>
                        <Link href="/demo/reviewed-import">See the reviewed-import walkthrough →</Link>
                      </section>
                    ) : (
                      <>
                        <ImportReviewPanel
                          month={month}
                          workloads={workloads}
                          api={api}
                          disabled={!!busy || !draftLoaded || draftConflict}
                          attach={async (confirmation, workload) => {
                            await saveDraft();
                            if (saveInFlight.current) throw new Error("Wait for the current draft save to finish.");
                            saveInFlight.current = true;
                            setBusy("Assigning reviewed evidence");
                            try {
                              await api(`monthly/drafts/${month}/attach-reviewed-import`, "POST", {
                                confirmation_id: confirmation,
                                workload_id: workload,
                                expected_revision: revisionRef.current,
                              });
                              await loadDraft();
                            } finally {
                              saveInFlight.current = false;
                              setBusy("");
                            }
                          }}
                        />
                        <div className="company-draft-status">
                          <span>
                            {draftConflict
                              ? "Draft needs attention · local edits retained"
                              : draftSignature !== lastSaved.current
                                ? "Unsaved changes · saving shortly"
                                : draftSavedAt
                                  ? `Progress saved · ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                  : "Preparation saves to your company workspace"}
                          </span>
                          <div className="monthly-actions">
                            <button
                              disabled={!!busy || !draftLoaded || draftConflict}
                              onClick={() =>
                                action("Saving progress", saveDraft)
                              }
                            >
                              Save progress
                            </button>
                            {draftConflict && (
                              <>
                                <button
                                  onClick={() =>
                                    download(
                                      `inffyn-${month}-draft.json`,
                                      JSON.stringify(assembledDraft(), null, 2),
                                      "application/json",
                                    )
                                  }
                                >
                                  Export my edits
                                </button>
                                <button
                                  onClick={() =>
                                    action("Reloading company draft", () =>
                                      loadDraft(),
                                    )
                                  }
                                >
                                  Reload saved version
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {!draftLoaded ? (
                          <div className="monthly-panel" role="status">
                            Loading saved preparation…
                          </div>
                        ) : (
                          <>
                            <ReviewPreparation
                              month={month}
                              workloads={workloads}
                              imports={imports}
                              importIds={selectedImports}
                              costAssignments={assignments}
                              invoices={invoiceAllocations}
                              onImports={(ids) => {
                                setSelectedImports(ids);
                                setInvoiceAllocations((items) =>
                                  items.filter((item) =>
                                    ids.includes(item.import_id),
                                  ),
                                );
                                setScopeComplete(false);
                                setDrafts((items) => items.map(clearReview));
                                setDraft((item) =>
                                  item ? clearReview(item) : item,
                                );
                              }}
                              onAssignments={setAssignments}
                              onInvoices={setInvoiceAllocations}
                              onPrepare={() =>
                                action("Preparing assigned evidence", prepare)
                              }
                              onConnections={() => setTab("Connections")}
                              api={api}
                              busy={!!busy}
                              step={reviewStep}
                              onStep={setReviewStep}
                            />
                            <section
                              className="monthly-panel monthly-form"
                              hidden={reviewStep < 2}
                            >
                              <div className="monthly-section-head">
                                <h2>Workload evidence and controls</h2>
                                <span className="monthly-badge">
                                  {
                                    new Set([
                                      ...drafts.map((d) => d.workload_id),
                                      ...(draft ? [draft.workload_id] : []),
                                    ]).size
                                  }{" "}
                                  workloads included
                                </span>
                              </div>
                              <label>
                                Workload
                                <select
                                  value={draft?.workload_id || ""}
                                  onChange={(e) =>
                                    chooseWorkload(e.target.value)
                                  }
                                >
                                  <option value="">Choose a workload</option>
                                  {workloads.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {!workloads.length && (
                                <button onClick={() => setTab("Workloads")}>
                                  Create a workload first →
                                </button>
                              )}
                              {draft && (
                                <>
                                  <p>{selectedWorkload?.cost_scope}</p>
                                  <label>
                                    Cost basis
                                    <select
                                      value={draft.audit.cost_basis}
                                      onChange={(e) => {
                                        updateAudit(
                                          "cost_basis",
                                          e.target
                                            .value as MonthlyAudit["cost_basis"],
                                        );
                                      }}
                                    >
                                      <option value="events">
                                        Detailed usage and event costs
                                      </option>
                                      <option value="provider_totals">
                                        Aggregate provider totals
                                      </option>
                                      <option value="expenses">
                                        Other AI expenses / subscriptions
                                      </option>
                                    </select>
                                  </label>
                                  <small>
                                    Choose aggregate costs or detailed event
                                    costs for the same activity. The engine
                                    rejects adding both in one workload.
                                  </small>
                                  <div className="monthly-files">
                                    {(
                                      Object.keys(
                                        headers,
                                      ) as (keyof typeof headers)[]
                                    )
                                      .filter(
                                        (k) =>
                                          !(
                                            draft.audit.kind === "internal" &&
                                            k === "revenue_csv"
                                          ) &&
                                          !(
                                            draft.audit.cost_basis !==
                                              "events" &&
                                            (k === "usage_csv" ||
                                              k === "rates_csv") &&
                                            !draft.audit[k].trim()
                                          ),
                                      )
                                      .map((k) => (
                                        <details
                                          key={k}
                                          className="monthly-file"
                                        >
                                          <summary>
                                            <strong>{fileNames[k]}</strong>
                                            <small>
                                              {draft.audit[k].trim()
                                                ? `${num(draft.audit[k].length)} characters loaded`
                                                : "No file loaded"}
                                            </small>
                                          </summary>
                                          <div className="monthly-actions">
                                            <label>
                                              Upload CSV
                                              <input
                                                type="file"
                                                accept=".csv,text/csv"
                                                disabled={!!busy}
                                                onChange={(e) => {
                                                  const el = e.currentTarget;
                                                  action("Reading file", () =>
                                                    file(k, el),
                                                  );
                                                }}
                                              />
                                            </label>
                                            <button
                                              onClick={() =>
                                                download(
                                                  `${k}.csv`,
                                                  headers[k] + "\n",
                                                  "text/csv",
                                                )
                                              }
                                            >
                                              Template
                                            </button>
                                          </div>
                                          <label>
                                            CSV evidence
                                            <textarea
                                              className="monthly-csv"
                                              spellCheck={false}
                                              value={draft.audit[k]}
                                              onChange={(e) =>
                                                updateAudit(k, e.target.value)
                                              }
                                            />
                                          </label>
                                        </details>
                                      ))}
                                  </div>
                                  <div className="monthly-two-col">
                                    <div>
                                      <h3>Cost validation</h3>
                                      <label>
                                        Source and period note
                                        <textarea
                                          value={draft.review.source_note}
                                          onChange={(e) =>
                                            updateReview(
                                              "source_note",
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <label>
                                        Independent cost control total (USD)
                                        <input
                                          type="number"
                                          step="any"
                                          value={
                                            draft.review.control_cost ?? ""
                                          }
                                          onChange={(e) =>
                                            updateReview(
                                              "control_cost",
                                              e.target.value || null,
                                            )
                                          }
                                        />
                                      </label>
                                      <label>
                                        Control source / basis
                                        <input
                                          value={draft.review.control_source}
                                          placeholder="e.g. Supplier invoice total excluding tax, same project scope"
                                          onChange={(e) =>
                                            updateReview(
                                              "control_source",
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </label>
                                      <Check
                                        checked={
                                          draft.audit.cost_scope_complete
                                        }
                                        onChange={(v) =>
                                          updateAudit("cost_scope_complete", v)
                                        }
                                      >
                                        Included cost scope is complete,
                                        including failed work and necessary
                                        supporting costs.
                                      </Check>
                                      <Check
                                        checked={draft.review.method_reviewed}
                                        onChange={(v) =>
                                          updateReview("method_reviewed", v)
                                        }
                                      >
                                        I reviewed sources, cost basis,
                                        mappings, and assumptions.
                                      </Check>
                                    </div>
                                    <div>
                                      <h3>Outcome validation</h3>
                                      <p>
                                        {selectedWorkload?.outcome_unit
                                          ? `Unit: ${selectedWorkload.outcome_unit}`
                                          : "Define an accepted business unit in Workloads to calculate cost per outcome."}
                                      </p>
                                      <label>
                                        Expected distinct runs
                                        <input
                                          type="number"
                                          min={0}
                                          step={1}
                                          value={
                                            draft.review.expected_runs ?? ""
                                          }
                                          onChange={(e) =>
                                            updateReview(
                                              "expected_runs",
                                              e.target.value === ""
                                                ? null
                                                : Number(e.target.value),
                                            )
                                          }
                                        />
                                      </label>
                                      <Check
                                        checked={
                                          draft.audit.outcome_cohort_complete
                                        }
                                        onChange={(v) =>
                                          updateAudit(
                                            "outcome_cohort_complete",
                                            v,
                                          )
                                        }
                                      >
                                        All accepted, rejected, and failed runs
                                        are included.
                                      </Check>
                                      <Check
                                        checked={
                                          draft.review.outcome_method_reviewed
                                        }
                                        onChange={(v) =>
                                          updateReview(
                                            "outcome_method_reviewed",
                                            v,
                                          )
                                        }
                                      >
                                        I reviewed acceptance criteria and
                                        time/capacity assumptions.
                                      </Check>
                                      <small>
                                        Time multiplied by a loaded rate is
                                        modeled capacity, not money saved.
                                      </small>
                                    </div>
                                  </div>
                                  {draft.audit.kind === "product" && (
                                    <div className="monthly-two-col">
                                      <div>
                                        <h3>Revenue validation</h3>
                                        <label>
                                          Source
                                          <select
                                            value={draft.audit.revenue_source}
                                            onChange={(e) =>
                                              updateAudit(
                                                "revenue_source",
                                                e.target
                                                  .value as MonthlyAudit["revenue_source"],
                                              )
                                            }
                                          >
                                            <option value="none">
                                              Unavailable
                                            </option>
                                            <option value="reviewed_file">
                                              Reviewed file
                                            </option>
                                            <option value="stripe_reviewed">
                                              Reviewed Stripe evidence
                                            </option>
                                          </select>
                                        </label>
                                        <label>
                                          Basis
                                          <select
                                            value={draft.audit.revenue_basis}
                                            onChange={(e) =>
                                              updateAudit(
                                                "revenue_basis",
                                                e.target
                                                  .value as MonthlyAudit["revenue_basis"],
                                              )
                                            }
                                          >
                                            <option value="unavailable">
                                              Unavailable
                                            </option>
                                            <option value="recognized">
                                              Recognized revenue
                                            </option>
                                            <option value="collections">
                                              Collections
                                            </option>
                                          </select>
                                        </label>
                                        <label>
                                          Feature allocation
                                          <select
                                            value={
                                              draft.audit.feature_allocation
                                            }
                                            onChange={(e) =>
                                              updateAudit(
                                                "feature_allocation",
                                                e.target
                                                  .value as MonthlyAudit["feature_allocation"],
                                              )
                                            }
                                          >
                                            <option value="none">
                                              Direct / leave unallocated
                                            </option>
                                            <option value="requests">
                                              By requests within the same
                                              customer
                                            </option>
                                            <option value="equal">
                                              Equally within the same customer
                                            </option>
                                          </select>
                                        </label>
                                      </div>
                                      <div>
                                        <label>
                                          Independent revenue control (USD)
                                          <input
                                            type="number"
                                            step="any"
                                            value={
                                              draft.review.control_revenue ?? ""
                                            }
                                            onChange={(e) =>
                                              updateReview(
                                                "control_revenue",
                                                e.target.value || null,
                                              )
                                            }
                                          />
                                        </label>
                                        <label>
                                          Revenue control source
                                          <input
                                            value={
                                              draft.review
                                                .revenue_control_source
                                            }
                                            onChange={(e) =>
                                              updateReview(
                                                "revenue_control_source",
                                                e.target.value,
                                              )
                                            }
                                          />
                                        </label>
                                        <Check
                                          checked={draft.audit.revenue_reviewed}
                                          onChange={(v) =>
                                            updateAudit("revenue_reviewed", v)
                                          }
                                        >
                                          Revenue period, taxes, refunds,
                                          credits, and basis have been reviewed.
                                        </Check>
                                        <Check
                                          checked={
                                            draft.review.revenue_scope_complete
                                          }
                                          onChange={(v) =>
                                            updateReview(
                                              "revenue_scope_complete",
                                              v,
                                            )
                                          }
                                        >
                                          The revenue scope for this workload is
                                          complete.
                                        </Check>
                                      </div>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      setDrafts((prev) => [
                                        ...prev.filter(
                                          (x) =>
                                            x.workload_id !== draft.workload_id,
                                        ),
                                        draft,
                                      ]);
                                      setDraft(null);
                                      setNotice(
                                        "Workload added. Progress saves automatically to your company draft.",
                                      );
                                    }}
                                  >
                                    Add workload to this draft
                                  </button>
                                </>
                              )}
                              {!!drafts.length && (
                                <div className="monthly-draft-list">
                                  {drafts.map((d) => (
                                    <div key={d.workload_id}>
                                      <span>
                                        {workloads.find(
                                          (w) => w.id === d.workload_id,
                                        )?.name || d.audit.title}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setDrafts((prev) =>
                                            prev.filter(
                                              (x) =>
                                                x.workload_id !== d.workload_id,
                                            ),
                                          );
                                          if (
                                            draft?.workload_id === d.workload_id
                                          )
                                            setDraft(null);
                                        }}
                                      >
                                        Remove from draft
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <Check
                                checked={scopeComplete}
                                onChange={setScopeComplete}
                              >
                                This report covers the company AI spend scope
                                for the month. Unresolved shared costs are
                                included as Unallocated.
                              </Check>
                              <div className="monthly-actions">
                                <button
                                  className="primary"
                                  disabled={
                                    !!busy ||
                                    !entitled ||
                                    (!draft && !drafts.length)
                                  }
                                  onClick={() =>
                                    action(
                                      "Calculating and saving report",
                                      calculate,
                                    )
                                  }
                                >
                                  Calculate & save report →
                                </button>
                                <small>
                                  Draft progress saves to your company
                                  workspace. Reports preserve an immutable
                                  version of reviewed evidence.
                                </small>
                              </div>
                            </section>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {tab === "Reports" && (
              <>
                <section className="monthly-panel">
                  <div className="monthly-section-head">
                    <h2>Report history</h2>
                    <small>
                      {demo
                        ? "Six fixed synthetic months · March–August 2026"
                        : "Latest 100 versions · 12-month retention"}
                    </small>
                  </div>
                  {!reports.length ? (
                    <p>
                      No report versions saved yet. Add evidence to create your
                      first report.
                    </p>
                  ) : (
                    <div className="monthly-report-list">
                      {reports.map((r) => (
                        <button
                          key={r.id}
                          className={report?.id === r.id ? "selected" : ""}
                          disabled={!!busy}
                          onClick={() =>
                            action("Opening report", () => loadReport(r.id))
                          }
                        >
                          <strong>{r.month}</strong>
                          <span>
                            {demo
                              ? "Synthetic scenario version"
                              : new Date(r.created_at).toLocaleString()}
                          </span>
                          <small>
                            {selections.some((s) => s.report_id === r.id)
                              ? "Selected for history"
                              : "Saved version"}
                          </small>
                          <code>{r.fingerprint.slice(0, 10)}</code>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                {!!legacyAudits.length && (
                  <details className="monthly-panel monthly-form">
                    <summary>
                      Adopt an earlier audit into monthly reporting
                    </summary>
                    <p>
                      The original audit stays unchanged. Adoption creates a new
                      version for a complete calendar month and requires a fresh
                      review.
                    </p>
                    <label>
                      Earlier audit
                      <select
                        value={adoptAudit}
                        onChange={(e) => setAdoptAudit(e.target.value)}
                      >
                        <option value="">Choose an audit</option>
                        {legacyAudits.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title} · {a.kind}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Workload
                      <select
                        value={adoptWorkload}
                        onChange={(e) => setAdoptWorkload(e.target.value)}
                      >
                        <option value="">Choose its workload</option>
                        {workloads.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={
                        !!busy || !entitled || !adoptAudit || !adoptWorkload
                      }
                      onClick={() =>
                        action("Adopting retained audit evidence", async () => {
                          const r = await api("monthly/adopt", "POST", {
                            audit_id: adoptAudit,
                            workload_id: adoptWorkload,
                          });
                          setReport(r);
                          await refresh();
                          setNotice(
                            "Earlier evidence adopted into a new monthly report. Review it before selecting for history.",
                          );
                        })
                      }
                    >
                      Create monthly version
                    </button>
                  </details>
                )}
                {current && report && (
                  <article className="monthly-report">
                    {current.synthetic && (
                      <p className="monthly-notice">
                        <strong>Synthetic company demonstration.</strong> No
                        customer or provider data was used. Readiness checks
                        describe the fixture, not independent verification.
                      </p>
                    )}
                    <ExecutiveReport
                      report={report}
                      performance={performance}
                      company={company}
                    />
                    {!!current.invoice_allocations?.length && (
                      <section className="monthly-panel">
                        <span className="eyebrow">
                          REVENUE ALLOCATION RECORD
                        </span>
                        <h2>Collections, assigned with context</h2>
                        <p>
                          Original invoice amounts and their reviewed portions
                          reconcile to the retained source. Management
                          allocation remains modeled.
                        </p>
                        {current.invoice_allocations.map((invoice) => (
                          <details
                            className="company-invoice"
                            key={invoice.revenue_id}
                          >
                            <summary>
                              <strong>{invoice.revenue_id}</strong>
                              <span>
                                {" "}
                                · {formatMoney(invoice.original_amount)}{" "}
                                original · {formatMoney(invoice.remainder)}{" "}
                                unassigned
                              </span>
                            </summary>
                            <div className="monthly-table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Product workload</th>
                                    <th>Allocated collections</th>
                                    <th>Explanation</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoice.allocations.map((a) => (
                                    <tr key={a.workload_id}>
                                      <td>
                                        {current.workloads.find(
                                          (w) =>
                                            w.workload.id === a.workload_id,
                                        )?.workload.name || "Workload"}
                                      </td>
                                      <td>{formatMoney(a.amount)}</td>
                                      <td>{a.explanation}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <small>
                              {invoice.synthetic || current.synthetic
                                ? "Synthetic source · no independent provider verification"
                                : invoice.source_verified
                                  ? "Retained provider source verified"
                                  : "Source not verified"}{" "}
                              · {invoice.basis} · collections basis
                            </small>
                          </details>
                        ))}
                      </section>
                    )}
                    <div className="monthly-section-head">
                      <div>
                        <span className="eyebrow">MONTHLY AI ECONOMICS</span>
                        <h2>{current.month} · Evidence and economics</h2>
                        <small>
                          {current.calculation_version} ·{" "}
                          {report.fingerprint.slice(0, 16)}
                        </small>
                      </div>
                      <div className="monthly-actions">
                        <button
                          onClick={() =>
                            download(
                              `inffyn-${report.month}-${report.fingerprint.slice(0, 8)}.json`,
                              JSON.stringify(report, null, 2),
                              "application/json",
                            )
                          }
                        >
                          Export full report
                        </button>
                        <button onClick={printReport}>Print / save PDF</button>
                        <button
                          disabled={!!busy || !entitled || demo}
                          onClick={() =>
                            action("Loading retained evidence", () =>
                              loadReport(report.id, true),
                            )
                          }
                        >
                          Revise evidence
                        </button>
                      </div>
                    </div>
                    <div className="monthly-metrics">
                      <Metric
                        label="Included workload costs"
                        value={formatMoney(current.summary.known_cost)}
                        note={
                          current.summary.cost_complete
                            ? "Scope confirmed complete"
                            : "Partial scope"
                        }
                      />
                      <Metric
                        label="Unpriced activity"
                        value={String(current.summary.unknown_cost_rows)}
                        note="Missing prices are not zero cost"
                      />
                      <Metric
                        label="Unallocated spend"
                        value={formatMoney(current.summary.unallocated_cost)}
                        note="Unresolved shared costs"
                      />
                      <Metric
                        label="Workloads"
                        value={String(current.workloads.length)}
                        note="One cost owner per record"
                      />
                    </div>
                    {current.workloads.map((w) => (
                      <section className="monthly-panel" key={w.workload.id}>
                        <div className="monthly-section-head">
                          <div>
                            <span className="eyebrow">
                              {w.kind === "product"
                                ? "REVENUE-PRODUCING"
                                : "INTERNAL"}
                            </span>
                            <h2>{w.workload.name}</h2>
                          </div>
                          <span className="monthly-badge">
                            {w.summary.basis}
                          </span>
                        </div>
                        <p>{w.workload.cost_scope}</p>
                        <div className="monthly-metrics">
                          <Metric
                            label="Included costs"
                            value={formatMoney(w.summary.known_cost)}
                            note={`${w.cost_basis.replaceAll("_", " ")} · ${w.summary.unknown_cost_rows} unpriced rows`}
                          />
                          {w.kind === "product" ? (
                            <>
                              <Metric
                                label={
                                  w.revenue_basis === "collections"
                                    ? "Collections"
                                    : "Associated revenue"
                                }
                                value={formatMoney(w.summary.revenue)}
                                note="Association does not establish AI causality"
                              />
                              <Metric
                                label={
                                  w.revenue_basis === "collections"
                                    ? "Collections less included costs"
                                    : "Contribution"
                                }
                                value={formatMoney(w.summary.contribution)}
                                note="After included costs"
                              />
                              <Metric
                                label="Contribution percentage"
                                value={pct(w.summary.margin_percent)}
                                note="Based on the stated revenue basis"
                              />
                            </>
                          ) : (
                            <>
                              <Metric
                                label="Accepted outcomes"
                                value={num(w.outcomes.accepted_quantity)}
                                note={
                                  w.workload.outcome_unit || "Unit not defined"
                                }
                              />
                              <Metric
                                label="Acceptance rate"
                                value={pct(w.outcomes.acceptance_rate)}
                                note="Accepted runs / all reviewed runs"
                              />
                              <Metric
                                label="Cost / accepted outcome"
                                value={formatMoney(
                                  w.outcomes.cost_per_accepted_outcome,
                                )}
                                note="Includes failed and rejected work"
                              />
                            </>
                          )}
                        </div>
                        {w.kind === "product" &&
                          (w.workload.outcome_unit ||
                            w.outcomes.reviewed_runs > 0) && (
                            <div className="monthly-metrics">
                              <Metric
                                label="Accepted outcomes"
                                value={num(w.outcomes.accepted_quantity)}
                                note={
                                  w.workload.outcome_unit || "Unit not defined"
                                }
                              />
                              <Metric
                                label="Acceptance rate"
                                value={pct(w.outcomes.acceptance_rate)}
                                note="Accepted runs / all reviewed runs"
                              />
                              <Metric
                                label="Cost / accepted outcome"
                                value={formatMoney(
                                  w.outcomes.cost_per_accepted_outcome,
                                )}
                                note="Includes failed and rejected work"
                              />
                              <Metric
                                label="Reviewed runs"
                                value={num(w.outcomes.reviewed_runs)}
                                note={
                                  w.outcomes.cohort_complete
                                    ? "Complete outcome cohort"
                                    : "Incomplete outcome cohort"
                                }
                              />
                            </div>
                          )}
                        <div className="monthly-scores">
                          <Score
                            label="Cost evidence"
                            value={w.confidence.cost}
                          />
                          <Score
                            label="Revenue association"
                            value={w.confidence.revenue}
                          />
                          <Score
                            label="Outcome evidence"
                            value={w.confidence.outcomes}
                          />
                        </div>
                        <div className="monthly-two-col">
                          <div>
                            <h3>Validation</h3>
                            <p>
                              Cost control: {formatMoney(w.control_cost)} ·
                              Variance: {formatMoney(w.control_variance)}
                            </p>
                            <p>
                              {w.sensitivity.detail ===
                              "No feature revenue allocation selected."
                                ? "No additional allocation between features within this workload is selected. Reviewed invoice-to-workload allocations are recorded separately above."
                                : w.sensitivity.detail}
                            </p>
                            {w.sensitivity.features?.map((s) => (
                              <p key={s.feature}>
                                {s.feature}: {s.classification} ·{" "}
                                {formatMoney(s.min_contribution)} to{" "}
                                {formatMoney(s.max_contribution)}
                              </p>
                            ))}
                          </div>
                          <div>
                            <h3>Modeled capacity</h3>
                            <p>
                              {num(w.outcomes.modeled_hours)} hours ·{" "}
                              {formatMoney(w.outcomes.modeled_capacity_value)}
                            </p>
                            <small>
                              Baseline assumptions applied to the supplied
                              cohort. These values are not realized cash
                              savings.
                            </small>
                          </div>
                        </div>
                        {w.findings.map((f, i) => (
                          <div className="monthly-finding" key={i}>
                            <strong>
                              {f.type}
                              {f.name ? `: ${f.name}` : ""}
                            </strong>
                            <p>{f.detail}</p>
                          </div>
                        ))}
                        <details>
                          <summary>
                            Inspect customer, feature, and model breakdowns
                          </summary>
                          {["customer_id", "feature", "model"].map((dim) => (
                            <div key={dim}>
                              <h3>{dim.replaceAll("_", " ")}</h3>
                              {dim === "model" &&
                                w.groups[dim]?.some(
                                  (g) => g.name.toLowerCase() === "unmapped",
                                ) && (
                                  <p className="company-chart-note">
                                    Revenue and supporting costs are not
                                    assigned to models; model profitability is
                                    unavailable. Amounts remain here to
                                    reconcile source totals.
                                  </p>
                                )}
                              <div className="monthly-table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Group</th>
                                      <th>Cost</th>
                                      <th>Revenue</th>
                                      <th>Contribution</th>
                                      <th>Basis</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {w.groups[dim]?.map((g) => (
                                      <tr key={g.name}>
                                        <td>
                                          {dim === "model" &&
                                          g.name.toLowerCase() === "unmapped"
                                            ? "Unassigned to a model"
                                            : g.name}
                                        </td>
                                        <td>{formatMoney(g.known_cost)}</td>
                                        <td>{formatMoney(g.revenue)}</td>
                                        <td>
                                          {dim === "model" &&
                                          g.name.toLowerCase() === "unmapped"
                                            ? "Unavailable"
                                            : formatMoney(g.contribution)}
                                        </td>
                                        <td>
                                          {dim === "model" &&
                                          g.name.toLowerCase() === "unmapped"
                                            ? "Unassigned amounts retained for reconciliation"
                                            : g.basis}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </details>
                        <details>
                          <summary>
                            Inspect economic trace ({w.trace.length} records)
                          </summary>
                          <p>
                            The full report export contains every trace record.
                            Showing the first 100 here.
                          </p>
                          <div className="monthly-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Record</th>
                                  <th>Category</th>
                                  <th>Cost</th>
                                  <th>Source</th>
                                  <th>Basis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {w.trace.slice(0, 100).map((t, i) => (
                                  <tr key={`${t.id}-${i}`}>
                                    <td>{t.id}</td>
                                    <td>{t.category}</td>
                                    <td>{formatMoney(t.cost)}</td>
                                    <td>{t.source || "Unavailable"}</td>
                                    <td>{t.basis}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </section>
                    ))}
                    <section className="monthly-panel monthly-form monthly-no-print">
                      <h3>
                        {selected?.report_id === report.id
                          ? "Selected for monthly history"
                          : "Select this reporting version"}
                      </h3>
                      <p>
                        Selection records your review decision. It does not
                        upgrade source provenance or alter earlier reports.
                      </p>
                      <label>
                        Review / replacement reason
                        <input
                          minLength={3}
                          maxLength={500}
                          value={selectionReason}
                          onChange={(e) => setSelectionReason(e.target.value)}
                        />
                      </label>
                      <button
                        className="primary"
                        disabled={
                          !!busy ||
                          !entitled ||
                          demo ||
                          selected?.report_id === report.id ||
                          selectionReason.trim().length < 3
                        }
                        onClick={() =>
                          action("Selecting monthly version", async () => {
                            await api("monthly/selection", "POST", {
                              report_id: report.id,
                              expected_report_id: selected?.report_id || null,
                              reason: selectionReason,
                            });
                            await refresh();
                            setNotice(
                              "Monthly history now uses this version. The selection is recorded.",
                            );
                          })
                        }
                      >
                        Use in monthly history
                      </button>
                      <div>
                        <button
                          disabled={!!busy || !billing?.is_owner || demo}
                          onClick={() => setDeleteId(report.id)}
                        >
                          Delete this report…
                        </button>
                        {deleteId === report.id && (
                          <div className="monthly-error">
                            Delete this report and its history selection? This
                            cannot be undone.
                            <div className="monthly-actions">
                              <button
                                disabled={!!busy}
                                onClick={() =>
                                  action("Deleting report", async () => {
                                    await api(
                                      `monthly/reports/${report.id}`,
                                      "DELETE",
                                    );
                                    setReport(null);
                                    setDeleteId("");
                                    await refresh();
                                    setNotice("Report deleted.");
                                  })
                                }
                              >
                                Confirm deletion
                              </button>
                              <button onClick={() => setDeleteId("")}>
                                Keep report
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                    <footer className="monthly-report-footer">
                      <p>{current.limitations.join(" ")}</p>
                      {demo ? (
                        <p>
                          Fixed synthetic scenario: March–August 2026.
                          Demonstration reports do not represent customer data
                          retention or provider verification.
                        </p>
                      ) : (
                        <p>
                          Raw evidence expires{" "}
                          {new Date(
                            report.evidence_expires_at,
                          ).toLocaleDateString()}
                          . Report expires{" "}
                          {new Date(
                            report.report_expires_at,
                          ).toLocaleDateString()}
                          . Historical trace details are retained as report
                          data.
                        </p>
                      )}
                    </footer>
                  </article>
                )}
              </>
            )}
            {tab === "Settings" && (
              <div className="monthly-two-col">
                <section className="monthly-panel">
                  <h2>
                    {privateAlpha ? "Private alpha access" : "Subscription"}
                  </h2>
                  {!privateAlpha && (
                    <p className="monthly-price">
                      $349 <small>/ company / month</small>
                    </p>
                  )}
                  <p>
                    {privateAlpha
                      ? "Complimentary access for named participants. CSV preparation, monthly reports and company history are available when your access grant is active. Paid billing and provider connections are deferred."
                      : "Product and internal workloads, monthly reporting, evidence confidence, and supported imports."}
                  </p>
                  <p>
                    Status: <strong>{billing?.status}</strong> · Access:{" "}
                    {billing?.access_source}
                  </p>
                  <p>
                    {billing?.cancel_at_period_end
                      ? "Cancels at the end of the current billing period."
                      : billing?.current_period_end
                        ? `Current period ends ${new Date(billing.current_period_end).toLocaleDateString()}.`
                        : ""}
                  </p>
                  <button
                    disabled={
                      privateAlpha ||
                      !!busy ||
                      !billing?.billing_available ||
                      !billing?.is_owner
                    }
                    onClick={() =>
                      action("Opening billing", async () => {
                        const r = await api(
                          `billing/${billing?.has_customer ? "portal" : "checkout"}`,
                          "POST",
                          {},
                        );
                        window.location.assign(r.url);
                      })
                    }
                  >
                    {privateAlpha
                      ? "Billing deferred"
                      : billing?.billing_available
                        ? "Manage subscription"
                        : "Billing awaiting activation"}
                  </button>
                </section>
                <section className="monthly-panel">
                  <h2>Data and trust</h2>
                  <p>
                    Raw evidence: 90 days. Derived report and trace history: 12
                    months. USD reporting only.
                  </p>
                  {privateAlpha && (
                    <p>
                      Temporary recovery uses encrypted, operator-run backups
                      retained for seven days. Deletion from the active
                      workspace may remain in those backups until expiry.
                    </p>
                  )}
                  <p>
                    Your company owns this workspace. No FynScale OS account is
                    required. Provider credentials are server-only and never
                    included in report exports.
                  </p>
                  <Link href="/methodology">
                    Read the calculation and confidence methodology →
                  </Link>
                  <p>
                    <Link href="/privacy">Privacy and retention →</Link>
                  </p>
                  <p>
                    <Link href="/terms">Service terms →</Link>
                  </p>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="monthly-metric">
      <span>{label}</span>
      <strong className={value.startsWith("(") ? "loss" : ""}>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="monthly-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
