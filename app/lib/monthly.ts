import { AuditInput, AuditResult, emptyAudit } from "./audit-v2";

export type Workload = {
  id: string;
  name: string;
  kind: "product" | "internal";
  outcome_unit: string;
  cost_scope: string;
  acceptance_definition: string;
  unallocated: boolean;
  mappings: Record<string, string[]>;
  purpose?: string;
  responsible_team?: string;
};
export type Review = {
  source_note: string;
  method_reviewed: boolean;
  revenue_scope_complete: boolean;
  outcome_method_reviewed: boolean;
  control_cost: string | null;
  control_source: string;
  control_revenue: string | null;
  revenue_control_source: string;
  expected_runs: number | null;
};
export type MonthlyAudit = AuditInput & {
  cost_basis: "events" | "provider_totals" | "expenses";
};
export type WorkloadEvidence = {
  workload_id: string;
  audit: MonthlyAudit;
  review: Review;
  import_ids?: string[];
  reviewed_imports?: Partial<Record<"usage_csv" | "costs_csv" | "revenue_csv", string>>;
};
export type MonthlyInput = {
  schema_version: "monthly-1.0";
  month: string;
  company_scope_complete: boolean;
  workloads: WorkloadEvidence[];
  invoice_allocations?: InvoiceAllocation[];
  import_ids?: string[];
  cost_assignments?: CostAssignment[];
};

export type CostAssignment = {
  provider: "openai" | "anthropic";
  project_id: string;
  workload_id: string;
};
export type InvoiceAllocation = {
  import_id: string;
  revenue_id: string;
  allocations: { workload_id: string; amount: string; explanation: string }[];
  reviewed: boolean;
};
export type DraftContent = {
  month: string;
  company_scope_complete: boolean;
  workloads: WorkloadEvidence[];
  import_ids: string[];
  cost_assignments: CostAssignment[];
  invoice_allocations: InvoiceAllocation[];
  step?: "import" | "assign" | "reconcile" | "review" | "save";
};
export type MonthlyDraft = {
  id: string;
  month: string;
  revision: number;
  content: DraftContent;
  evidence_expires_at: string;
  updated_at: string;
  invalidations?: string[];
};
export type EvidenceScore = {
  version: string;
  score: number | null;
  state: string;
  meaning: string;
  checks: {
    id: string;
    label: string;
    status: string;
    points: number;
    reason: string;
  }[];
};
export type WorkloadResult = AuditResult & {
  workload: Workload;
  cost_basis: string;
  confidence: Record<string, EvidenceScore>;
  control_cost: string | null;
  control_variance: string | null;
  outcomes: AuditResult["outcomes"] & {
    acceptance_rate: string | null;
    modeled_hours: string | null;
  };
};
export type MonthlyResult = {
  reviewed_imports?: { workload_id: string; field: string; confirmation_id: string; canonical_hash: string; confirmed_at: string; basis: string; counts: Record<string, number>; controls: Record<string, string>; limitations: string[] }[];
  release_context?: { stage: "private_alpha" };
  synthetic?: boolean;
  invoice_allocations?: {
    revenue_id: string;
    original_amount: string;
    allocated_amount: string;
    remainder: string;
    basis: string;
    source_verified: boolean;
    synthetic?: boolean;
    allocations: { workload_id: string; amount: string; explanation: string }[];
  }[];
  month: string;
  period_end: string;
  currency: string;
  calculation_version: string;
  fingerprint: string;
  company_scope_complete: boolean;
  summary: {
    known_cost: string;
    unknown_cost_rows: number;
    cost_complete: boolean;
    unallocated_cost: string;
    imported_collections?: string;
    unassigned_revenue?: string;
  };
  cost_components: Record<string, string>;
  workloads: WorkloadResult[];
  limitations: string[];
};
export type Report = {
  id: string;
  month: string;
  fingerprint: string;
  created_at: string;
  evidence_expires_at: string;
  report_expires_at: string;
  result: MonthlyResult;
};
export type ReportSummary = Omit<Report, "result">;
export type Selection = {
  report_id: string;
  month: string;
  selected_at: string;
};
type Delta = { amount: string | null; percent: string | null };
export type Comparison = {
  eligible: boolean;
  reasons: string[];
  spend: Delta;
  workloads: {
    id: string;
    name: string;
    unit_cost: Delta;
    accepted_volume: Delta;
    contribution: Delta;
    acceptance_rate: Delta;
    volume_adjusted_cost_difference: string | null;
    basis: string;
  }[];
};
export type PerformanceMonth = {
  report: ReportSummary & {
    result: Omit<MonthlyResult, "workloads"> & {
      workloads: Pick<
        WorkloadResult,
        "workload" | "summary" | "outcomes" | "confidence" | "cost_components"
      >[];
    };
  };
  comparison: Comparison;
};
export type Connection = {
  provider: string;
  available: boolean;
  status: string;
  label: string;
  notice: string;
};
export type ImportJob = {
  id: string;
  provider: string;
  month: string;
  state: string;
  step: number;
  error: string | null;
  notice: string;
  counts: Record<string, number>;
  costs_csv?: string;
  revenue_csv?: string;
  evidence?: {
    costs: Record<string, string>[];
    usage: Record<string, unknown>[];
    revenue: Record<string, string>[];
  };
};

export function monthDates(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    period_start: `${month}-01`,
    period_end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}
export function evidenceFor(
  workload: Workload,
  month: string,
): WorkloadEvidence {
  return {
    workload_id: workload.id,
    audit: {
      ...emptyAudit(workload.kind),
      ...monthDates(month),
      title: workload.name,
      cost_basis: "events",
    },
    review: {
      source_note: "",
      method_reviewed: false,
      revenue_scope_complete: false,
      outcome_method_reviewed: false,
      control_cost: null,
      control_source: "",
      control_revenue: null,
      revenue_control_source: "",
      expected_runs: null,
    },
  };
}
export function errorMessage(data: unknown): string {
  const detail =
    data && typeof data === "object" && "detail" in data ? data.detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((x) => `${x.loc?.slice(1).join(" · ")}: ${x.msg}`)
      .join(". ");
  if (detail && typeof detail === "object" && "message" in detail)
    return String(detail.message);
  return "Unable to complete this action. Your saved reports are unchanged.";
}
export function csvFrom(records: Record<string, string>[], columns: string[]) {
  const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [
    columns.join(","),
    ...records.map((r) => columns.map((c) => escape(r[c] || "")).join(",")),
  ].join("\n");
}
