/** Select only validated, synthetic engine facts for the public worked examples. */
export type EvidenceCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  points: number;
  reason: string;
};
export type EvidenceChecklist = {
  version: string;
  score: number | null;
  state: string;
  checks: EvidenceCheck[];
};
export type ExampleWorkload = {
  id: string;
  name: string;
  kind: "product" | "internal";
  unit: string;
  acceptance: string;
  cost: string;
  revenue: string | null;
  contribution: string | null;
  margin: string | null;
  accepted: string;
  unitCost: string | null;
  acceptanceRate: string | null;
  runs: number;
  modeledHours: string | null;
  capacity: string | null;
  control: string | null;
  variance: string | null;
  confidence: Record<"cost" | "revenue" | "outcomes", EvidenceChecklist>;
};
export type MethodologyFacts = {
  company: string;
  month: string;
  scenarioVersion: string;
  calculationVersion: string;
  fingerprint: string;
  total: string;
  inference: string;
  humanReview: string;
  subscription: string;
  unallocated: string;
  workloads: ExampleWorkload[];
  invoice: {
    id: string;
    original: string;
    allocated: string;
    remainder: string;
    portions: {
      workloadId: string;
      name: string;
      amount: string;
      explanation: string;
    }[];
  };
  supportComparison: {
    previousUnitCost: string;
    previousAccepted: string;
    unitCostPercent: string;
    volumePercent: string;
    baselineDifference: string;
  };
};

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected object");
  return value as RecordValue;
}
function list(value: unknown, min = 0, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error("Expected list");
  return value;
}
function text(value: unknown, max = 1000): string {
  if (typeof value !== "string" || !value.length || value.length > max)
    throw new Error("Expected text");
  return value;
}
function decimal(value: unknown): string {
  const n = text(value, 100);
  if (
    !/^-?\d+(\.\d+)?$/.test(n) ||
    !Number.isFinite(Number(n)) ||
    Math.abs(Number(n)) > 1e12
  )
    throw new Error("Expected decimal");
  return n;
}
function optionalDecimal(value: unknown): string | null {
  return value === null ? null : decimal(value);
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Expected count");
  return value;
}
function equalAmount(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 0.005)
    throw new Error("Unreconciled example");
}

function checklist(value: unknown): EvidenceChecklist {
  const source = object(value),
    version = text(source.version, 80),
    state = text(source.state, 40);
  if (source.score === null) {
    if (state !== "not_applicable" || list(source.checks).length)
      throw new Error("Invalid not-applicable score");
    return { version, state, score: null, checks: [] };
  }
  const expected = [
    "sources",
    "coverage",
    "associations",
    "reconciliation",
    "review",
  ];
  const checks = list(source.checks, 5, 5).map((item, i) => {
    const c = object(item);
    const status = text(c.status);
    if (
      c.id !== expected[i] ||
      !["pass", "fail", "unknown"].includes(status) ||
      c.points !== (status === "pass" ? 20 : 0)
    )
      throw new Error("Invalid checklist");
    return {
      id: expected[i],
      label: text(c.label),
      status: status as EvidenceCheck["status"],
      points: integer(c.points),
      reason: text(c.reason, 3000),
    };
  });
  const score = integer(source.score);
  if (
    score !== checks.reduce((n, c) => n + c.points, 0) ||
    state !==
      (score === 100 ? "ready" : score >= 40 ? "partial" : "insufficient")
  )
    throw new Error("Unreconciled score");
  return { version, score, state, checks };
}

function workload(value: unknown): ExampleWorkload {
  const raw = object(value),
    w = object(raw.workload),
    s = object(raw.summary),
    o = object(raw.outcomes),
    c = object(raw.confidence);
  if (
    raw.synthetic !== true ||
    !["product", "internal"].includes(String(w.kind))
  )
    throw new Error("Not a synthetic workload");
  const result: ExampleWorkload = {
    id: text(w.id),
    name: text(w.name),
    kind: w.kind as "product" | "internal",
    unit: typeof w.outcome_unit === "string" ? w.outcome_unit : "",
    acceptance:
      typeof w.acceptance_definition === "string"
        ? w.acceptance_definition
        : "",
    cost: decimal(s.known_cost),
    revenue: optionalDecimal(s.revenue),
    contribution: optionalDecimal(s.contribution),
    margin: optionalDecimal(s.margin_percent),
    accepted: decimal(o.accepted_quantity),
    unitCost: optionalDecimal(o.cost_per_accepted_outcome),
    acceptanceRate: optionalDecimal(o.acceptance_rate),
    runs: integer(o.included_runs),
    modeledHours: optionalDecimal(o.modeled_hours),
    capacity: optionalDecimal(o.modeled_capacity_value),
    control: optionalDecimal(raw.control_cost),
    variance: optionalDecimal(raw.control_variance),
    confidence: {
      cost: checklist(c.cost),
      revenue: checklist(c.revenue),
      outcomes: checklist(c.outcomes),
    },
  };
  if (
    result.kind === "internal" &&
    (result.revenue !== null ||
      result.contribution !== null ||
      result.confidence.revenue.score !== null)
  )
    throw new Error("Internal revenue is not applicable");
  if (result.contribution !== null) {
    if (result.revenue === null) throw new Error("Missing revenue");
    equalAmount(
      Number(result.revenue) - Number(result.cost),
      Number(result.contribution),
    );
  }
  if (result.unitCost !== null) {
    if (Number(result.accepted) <= 0 || o.cohort_complete !== true)
      throw new Error("Incomplete outcome basis");
    equalAmount(
      Number(result.cost) / Number(result.accepted),
      Number(result.unitCost),
    );
  }
  if (result.control !== null && result.variance !== null)
    equalAmount(
      Number(result.cost) - Number(result.control),
      Number(result.variance),
    );
  return result;
}

export function readMethodologyFacts(value: unknown): MethodologyFacts | null {
  try {
    const data = object(value),
      company = object(data.company);
    if (
      data.synthetic !== true ||
      data.scenario_version !== "northstar-1.0" ||
      company.name !== "Northstar Intelligence"
    )
      return null;
    const reports = list(data.reports, 6, 6).map(object);
    if (new Set(reports.map((r) => r.month)).size !== 6)
      throw new Error("Duplicate periods");
    const report = reports.find((r) => r.month === "2026-08"),
      previous = reports.find((r) => r.month === "2026-07");
    if (!report || !previous) throw new Error("Missing example periods");
    const result = object(report.result),
      summary = object(result.summary),
      components = object(result.cost_components);
    if (
      result.synthetic !== true ||
      result.month !== report.month ||
      result.currency !== "USD"
    )
      throw new Error("Unsupported source basis");
    const workloads = list(result.workloads, 5, 5).map(workload);
    if (new Set(workloads.map((w) => w.id)).size !== workloads.length)
      throw new Error("Duplicate workloads");
    const total = decimal(summary.known_cost);
    equalAmount(
      workloads.reduce((n, w) => n + Number(w.cost), 0),
      Number(total),
    );
    const componentTotal = Object.values(components).reduce<number>(
      (n, v) => n + Number(decimal(v)),
      0,
    );
    equalAmount(componentTotal, Number(total));
    const sourceInvoice = object(list(result.invoice_allocations, 1, 1)[0]);
    if (
      sourceInvoice.synthetic !== true ||
      sourceInvoice.source_verified !== false ||
      sourceInvoice.revenue_basis !== "collections"
    )
      throw new Error("Unexpected invoice provenance");
    const portions = list(sourceInvoice.allocations, 2, 2).map((item) => {
      const p = object(item),
        w = workloads.find((w) => w.id === p.workload_id);
      if (!w || w.kind !== "product") throw new Error("Invalid invoice target");
      const amount = decimal(p.amount);
      equalAmount(Number(amount), Number(w.revenue));
      return {
        workloadId: w.id,
        name: w.name,
        amount,
        explanation: text(p.explanation),
      };
    });
    if (new Set(portions.map((p) => p.workloadId)).size !== portions.length)
      throw new Error("Duplicate invoice target");
    const invoice = {
      id: text(sourceInvoice.revenue_id),
      original: decimal(sourceInvoice.original_amount),
      allocated: decimal(sourceInvoice.allocated_amount),
      remainder: decimal(sourceInvoice.remainder),
      portions,
    };
    equalAmount(
      portions.reduce((n, p) => n + Number(p.amount), 0),
      Number(invoice.allocated),
    );
    equalAmount(
      Number(invoice.allocated) + Number(invoice.remainder),
      Number(invoice.original),
    );
    const support = workloads.find((w) => w.name === "Support resolution"),
      finance = workloads.find((w) => w.name === "Finance document review"),
      documents = workloads.find((w) => w.name === "Document intelligence");
    if (
      !support ||
      !finance ||
      !documents ||
      support.kind !== "internal" ||
      finance.kind !== "internal" ||
      documents.kind !== "product"
    )
      throw new Error("Missing worked-example workloads");
    const previousSupport = list(object(previous.result).workloads, 5, 5)
      .map(workload)
      .find((w) => w.id === support.id);
    const perf = list(data.performance, 6, 6)
      .map(object)
      .find((p) => object(p.report).id === report.id);
    const comparison = object(perf?.comparison);
    if (comparison.eligible !== true || !previousSupport?.unitCost)
      throw new Error("Comparison unavailable");
    const comparisonRow = list(comparison.workloads)
      .map(object)
      .find((w) => w.id === support.id);
    if (!comparisonRow) throw new Error("Missing comparison");
    const unitCostPercent = decimal(object(comparisonRow.unit_cost).percent),
      volumePercent = decimal(object(comparisonRow.accepted_volume).percent),
      baselineDifference = decimal(
        comparisonRow.volume_adjusted_cost_difference,
      );
    if (support.unitCost === null || Number(previousSupport.accepted) <= 0)
      throw new Error("Missing comparable denominator");
    equalAmount(
      ((Number(support.unitCost) - Number(previousSupport.unitCost)) /
        Math.abs(Number(previousSupport.unitCost))) *
        100,
      Number(unitCostPercent),
    );
    equalAmount(
      ((Number(support.accepted) - Number(previousSupport.accepted)) /
        Math.abs(Number(previousSupport.accepted))) *
        100,
      Number(volumePercent),
    );
    equalAmount(
      Number(previousSupport.unitCost) * Number(support.accepted) -
        Number(support.cost),
      Number(baselineDifference),
    );
    return {
      company: text(company.name),
      month: "2026-08",
      scenarioVersion: text(data.scenario_version),
      calculationVersion: text(result.calculation_version, 100),
      fingerprint: text(result.fingerprint, 150),
      total,
      inference: decimal(components.inference),
      humanReview: decimal(components.human_review),
      subscription: decimal(components.subscription),
      unallocated: decimal(summary.unallocated_cost),
      workloads,
      invoice,
      supportComparison: {
        previousUnitCost: previousSupport.unitCost,
        previousAccepted: previousSupport.accepted,
        unitCostPercent,
        volumePercent,
        baselineDifference,
      },
    };
  } catch {
    return null;
  }
}

export async function loadMethodologyFacts(
  fetcher: typeof fetch = fetch,
): Promise<MethodologyFacts | null> {
  try {
    const response = await fetcher("/api/demo/company", {
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (new TextEncoder().encode(body).length > 3_800_000) return null;
    return readMethodologyFacts(JSON.parse(body));
  } catch {
    return null;
  }
}
