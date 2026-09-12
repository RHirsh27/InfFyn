export type AuditKind = "product" | "internal";
export type AuditInput = {
  schema_version: "2.0";
  title: string;
  kind: AuditKind;
  period_start: string;
  period_end: string;
  currency: "USD";
  usage_csv: string;
  costs_csv: string;
  rates_csv: string;
  revenue_csv: string;
  outcomes_csv: string;
  revenue_source: "none" | "reviewed_file" | "stripe_reviewed";
  revenue_basis: "unavailable" | "recognized" | "collections";
  revenue_reviewed: boolean;
  cost_scope_complete: boolean;
  outcome_cohort_complete: boolean;
  feature_allocation: "none" | "requests" | "equal";
};
export type Metric = string | number | null;
export type Group = {
  name: string;
  known_cost: string;
  unknown_cost_rows: number;
  revenue: string | null;
  contribution: string | null;
  margin_percent: string | null;
  basis: string;
  tokens: string;
  requests: string;
};
export type Preview = {
  known_cost: string;
  unknown_cost_rows: number;
  tokens: string;
  requests: string;
  basis: string;
  currency: string;
  kind: AuditKind;
  usage_rows: number;
  cost_components: Record<string, string>;
};
export type AuditResult = {
  title: string;
  kind: AuditKind;
  period_start: string;
  period_end: string;
  calculation_version: string;
  fingerprint: string;
  currency: string;
  revenue_basis: string;
  summary: {
    known_cost: string;
    unknown_cost_rows: number;
    contribution: string | null;
    revenue: string | null;
    margin_percent: string | null;
    tokens: string;
    requests: string;
    gpp1m: string | null;
    basis: string;
    cost_scope_complete: boolean;
  };
  groups: Record<string, Group[]>;
  cost_components: Record<string, string>;
  outcomes: {
    included_runs: number;
    reviewed_runs: number;
    accepted_quantity: string;
    cohort_complete: boolean;
    cost_per_accepted_outcome: string | null;
    modeled_capacity_value: string | null;
    capacity_basis: string;
  };
  evidence: {
    priced_usage_rows: number;
    usage_rows: number;
    source_review: string;
    revenue_reviewed: boolean;
    scope: string;
    association: string;
    allocation: string;
  };
  mapping_coverage?: Record<
    string,
    {
      known_cost_mapped_percent: string | null;
      unmapped_revenue: string | null;
    }
  >;
  findings: {
    type: string;
    detail: string;
    name?: string;
    dimension?: string;
    impact?: string | null;
    basis?: string;
  }[];
  sensitivity: {
    status: string;
    detail: string;
    features?: {
      feature: string;
      min_contribution: string;
      max_contribution: string;
      classification: string;
    }[];
  };
  trace: {
    id: string;
    category: string;
    cost: string | null;
    source: string | null;
    basis: string;
    rate_id: string | null;
    run_id: string;
    model: string;
    feature: string;
    customer_id: string;
  }[];
};
export type SavedAudit = {
  id: string;
  title: string;
  kind: AuditKind;
  access_level: "preview" | "full";
  created_at: string;
  evidence_expires_at: string;
  report_expires_at: string;
  result: AuditResult | Preview;
  report: Record<string, unknown> | null;
};
export type AuditListItem = Omit<SavedAudit, "result" | "report">;
export type BillingState = {
  release_stage?: "private_alpha" | "standard";
  access_source: "subscription" | "complimentary" | "free" | "preview";
  complimentary: boolean;
  is_access_admin: boolean;
  status: string;
  entitled: boolean;
  is_owner: boolean;
  has_customer: boolean;
  available: boolean;
  billing_available: boolean;
  monthly_price_usd: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export const headers = {
  usage_csv:
    "event_id,date,provider,model,input_tokens,output_tokens,requests,customer_id,customer_segment,feature,workflow,team,run_id,billed_cost,cost_source,cached_input_tokens,currency",
  costs_csv:
    "cost_id,date,category,amount,currency,source,customer_id,feature,workflow,team,run_id",
  rates_csv:
    "rate_id,provider,model,effective_from,effective_to,input_per_million,output_per_million,cached_input_per_million,currency,source",
  revenue_csv:
    "revenue_id,date,amount,currency,customer_id,feature,method,allocation_note",
  outcomes_csv:
    "run_id,status,accepted_quantity,baseline_minutes,after_minutes,loaded_hourly_rate",
} as const;

export function emptyAudit(kind: AuditKind = "product"): AuditInput {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return {
    schema_version: "2.0",
    title: "Monthly AI economics",
    kind,
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
    currency: "USD",
    usage_csv: "",
    costs_csv: "",
    rates_csv: "",
    revenue_csv: "",
    outcomes_csv: "",
    revenue_source: "none",
    revenue_basis: "unavailable",
    revenue_reviewed: false,
    cost_scope_complete: false,
    outcome_cohort_complete: false,
    feature_allocation: "none",
  };
}

export function syntheticAudit(kind: AuditKind = "product"): AuditInput {
  return {
    ...emptyAudit(kind),
    title:
      kind === "product"
        ? "August product economics · sample"
        : "Research assistant · sample",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    cost_scope_complete: true,
    outcome_cohort_complete: true,
    usage_csv:
      headers.usage_csv +
      "\n" +
      [
        "u-1,2026-08-02,synthetic,small,1000000,200000,50,c-acme,growth,Research,Research assistant,Product,r-1,12,synthetic provider export,100000,USD",
        "u-2,2026-08-02,synthetic,large,2000000,900000,90,c-beacon,starter,Research,Research assistant,Product,r-2,74,synthetic provider export,200000,USD",
        "u-3,2026-08-03,synthetic,small,500000,200000,30,c-acme,growth,Summary,Research assistant,Product,r-3,8,synthetic provider export,0,USD",
        "u-4,2026-08-03,synthetic,large,100000,80000,10,c-beacon,starter,Research,Research assistant,Product,r-4,6,synthetic failed retries,0,USD",
      ].join("\n"),
    costs_csv:
      headers.costs_csv +
      "\n" +
      [
        "c-1,2026-08-02,tools,10,USD,synthetic search bill,c-acme,Research,Research assistant,Product,r-1",
        "c-2,2026-08-02,human_review,45,USD,synthetic time record,c-beacon,Research,Research assistant,Product,r-2",
        "c-3,2026-08-03,compute,5,USD,synthetic compute bill,c-acme,Summary,Research assistant,Product,r-3",
        "c-4,2026-08-03,human_review,15,USD,synthetic failed review,c-beacon,Research,Research assistant,Product,r-4",
      ].join("\n"),
    revenue_csv:
      kind === "product"
        ? headers.revenue_csv +
          "\nrev-1,2026-08-02,250,USD,c-acme,Research,direct,\nrev-2,2026-08-02,90,USD,c-beacon,Research,direct,\nrev-3,2026-08-03,50,USD,c-acme,Summary,direct,\nrefund-1,2026-08-04,-10,USD,c-beacon,Research,direct,"
        : "",
    revenue_source: kind === "product" ? "reviewed_file" : "none",
    revenue_basis: kind === "product" ? "recognized" : "unavailable",
    revenue_reviewed: kind === "product",
    outcomes_csv:
      headers.outcomes_csv +
      "\nr-1,accepted,1,60,10,60\nr-2,accepted,1,90,45,60\nr-3,accepted,1,30,5,60\nr-4,failed,0,0,15,60",
  };
}

export function formatMoney(value: Metric, currency = "USD") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencySign: "accounting",
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
